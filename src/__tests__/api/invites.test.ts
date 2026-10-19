import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { installAccountWriteGuards } from '@/lib/db/account-invariants'
import { __resetRateLimitState } from '@/lib/rate-limit'
import { createTestDb, type TestDbInstance } from './setup'

/**
 * Invite links: /api/invites (make, list, revoke) and /invite/<token> (the
 * script-free join page and its POST). Covers single use under concurrency,
 * expiry and revoke, bad names leaving the invite unspent, the email
 * allowlist, banned inviters, account deletion, previews never spending an
 * invite, and cross-origin posts.
 */

let testInstance: TestDbInstance
let mockUserId: string | null = null

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

vi.mock('@/lib/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/session')>('@/lib/auth/session')
  return { ...actual, getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)) }
})

type SendArgs = { email: string; url: string; intent: string }
const mockSend = vi.fn((_args: SendArgs) => Promise.resolve({ ok: true }))
vi.mock('@/lib/email/magic-link', () => ({
  sendMagicLinkEmail: (args: SendArgs) => mockSend(args),
  signInDelivery: () => 'email',
}))

vi.mock('@/lib/sentry', () => ({
  metrics: { accountDeleted: vi.fn(), accountCleared: vi.fn(), dataCleared: vi.fn() },
  captureException: vi.fn(),
  metricCount: vi.fn(),
}))

const BASE = 'http://localhost:3000'
vi.stubEnv('NEXT_PUBLIC_APP_URL', BASE)

const ADMIN = 'u_admin'
const MEMBER = 'u_member'

function seedUser(id: string, username: string, role = 'user', displayName: string | null = null) {
  testInstance.db
    .insert(schema.users)
    .values({ id, username, role, displayName, usernameChosen: true })
    .run()
}

async function makeInvite(asUser = ADMIN, nameHint?: string) {
  mockUserId = asUser
  const { POST } = await import('@/app/api/invites/route')
  const res = await POST(
    new NextRequest(`${BASE}/api/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nameHint ? { nameHint } : {}),
    }),
  )
  const body = await res.json()
  mockUserId = null
  return { res, body, token: typeof body.url === 'string' ? body.url.split('/invite/')[1] : '' }
}

const ctx = (token: string) => ({ params: Promise.resolve({ token }) })

async function openInvite(token: string, method: 'GET' | 'HEAD' = 'GET') {
  const { GET } = await import('@/app/invite/[token]/route')
  return GET(new NextRequest(`${BASE}/invite/${token}`, { method }), ctx(token))
}

function joinRequest(token: string, username: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${BASE}/invite/${token}`, {
    method: 'POST',
    headers: {
      Origin: BASE,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body: new URLSearchParams({ username }),
  })
}

async function join(token: string, username: string, headers?: Record<string, string>) {
  const { POST } = await import('@/app/invite/[token]/route')
  return POST(joinRequest(token, username, headers), ctx(token))
}

function inviteRows() {
  return testInstance.db.select().from(schema.invites).all()
}

function userCount() {
  return testInstance.db.select().from(schema.users).all().length
}

describe('invites', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    installAccountWriteGuards(testInstance.sqlite)
    mockUserId = null
    __resetRateLimitState()
    vi.stubEnv('INVITES', '')
    vi.stubEnv('ALLOWED_EMAILS', '')
    seedUser(ADMIN, 'ana', 'admin', 'Ana')
    seedUser(MEMBER, 'ben')
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('POST /api/invites', () => {
    it('lets an admin make an invite and stores only the token hash', async () => {
      const { res, body, token } = await makeInvite(ADMIN, 'Cleo')
      expect(res.status).toBe(201)
      expect(body.url).toMatch(/^http:\/\/localhost:3000\/invite\/[A-Za-z0-9_-]{43}$/)
      expect(typeof body.id).toBe('string')
      const expires = Date.parse(body.expiresAt) - Date.now()
      expect(expires).toBeGreaterThan(7 * 86_400_000 - 60_000)
      expect(expires).toBeLessThanOrEqual(7 * 86_400_000)

      const [row] = inviteRows()
      expect(row.createdBy).toBe(ADMIN)
      expect(row.nameHint).toBe('Cleo')
      expect(JSON.stringify(row)).not.toContain(token)
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('refuses members unless INVITES=members', async () => {
      expect((await makeInvite(MEMBER)).res.status).toBe(403)
      vi.stubEnv('INVITES', 'members')
      expect((await makeInvite(MEMBER)).res.status).toBe(201)
    })

    it('requires sign-in', async () => {
      const { POST } = await import('@/app/api/invites/route')
      const res = await POST(new NextRequest(`${BASE}/api/invites`, { method: 'POST' }))
      expect(res.status).toBe(401)
    })

    it('caps how many invites can wait at once', async () => {
      for (let i = 0; i < 20; i++) expect((await makeInvite()).res.status).toBe(201)
      const { res } = await makeInvite()
      expect(res.status).toBe(409)
      expect(inviteRows()).toHaveLength(20)
    })

    it('rate-limits making invites', async () => {
      for (let i = 0; i < 30; i++) {
        const { res } = await makeInvite()
        expect(res.status).toBe(201)
        // Spent invites don't count towards the waiting cap.
        testInstance.sqlite.prepare(`UPDATE invites SET revoked_at = 'x'`).run()
      }
      const { res } = await makeInvite()
      expect(res.status).toBe(429)
      expect(res.headers.get('Retry-After')).toBeTruthy()
      expect(inviteRows()).toHaveLength(30)
    })
  })

  describe('GET /api/invites', () => {
    async function list(asUser: string) {
      mockUserId = asUser
      const { GET } = await import('@/app/api/invites/route')
      const res = await GET()
      mockUserId = null
      return res.json()
    }

    it('lists your own working invites, without their links', async () => {
      vi.stubEnv('INVITES', 'members')
      const mine = await makeInvite(MEMBER, 'Dev')
      await makeInvite(ADMIN)
      const used = await makeInvite(MEMBER)
      await join(used.token, 'usedup')
      const expired = await makeInvite(MEMBER)
      testInstance.sqlite
        .prepare('UPDATE invites SET expires_at = ? WHERE id = ?')
        .run(Date.now() - 1, expired.body.id)

      const data = await list(MEMBER)
      expect(data.canInvite).toBe(true)
      expect(data.invites).toHaveLength(1)
      expect(data.invites[0]).toMatchObject({
        id: mine.body.id,
        nameHint: 'Dev',
        createdBy: 'ben',
        mine: true,
      })
      const text = JSON.stringify(data)
      expect(text).not.toContain(mine.token)
      expect(text).not.toContain('tokenHash')
      expect(text).not.toContain('/invite/')
    })

    it('lists everyone’s for an admin', async () => {
      vi.stubEnv('INVITES', 'members')
      await makeInvite(MEMBER)
      await makeInvite(ADMIN)
      const data = await list(ADMIN)
      expect(data.invites).toHaveLength(2)
      expect(data.invites.map((i: { createdBy: string }) => i.createdBy).sort()).toEqual([
        'ana',
        'ben',
      ])
    })

    it('says a member can’t invite when invites are admin-only', async () => {
      const data = await list(MEMBER)
      expect(data).toEqual({ canInvite: false, invites: [] })
    })
  })

  describe('DELETE /api/invites/[id]', () => {
    async function revoke(asUser: string, id: string) {
      mockUserId = asUser
      const { DELETE } = await import('@/app/api/invites/[id]/route')
      const res = await DELETE(new NextRequest(`${BASE}/api/invites/${id}`, { method: 'DELETE' }), {
        params: Promise.resolve({ id }),
      })
      mockUserId = null
      return res
    }

    it('revokes your own invite, and the link then says so', async () => {
      vi.stubEnv('INVITES', 'members')
      const { body, token } = await makeInvite(MEMBER)
      expect((await revoke(MEMBER, body.id)).status).toBe(200)
      expect((await revoke(MEMBER, body.id)).status).toBe(404)

      const page = await openInvite(token)
      expect(page.status).toBe(410)
      expect(await page.text()).toContain('This invite was cancelled.')
      const res = await join(token, 'cleo')
      expect(res.status).toBe(410)
      expect(userCount()).toBe(2)
    })

    it('won’t let a member revoke someone else’s, but an admin can', async () => {
      vi.stubEnv('INVITES', 'members')
      const admins = await makeInvite(ADMIN)
      const members = await makeInvite(MEMBER)
      expect((await revoke(MEMBER, admins.body.id)).status).toBe(404)
      expect((await revoke(ADMIN, members.body.id)).status).toBe(200)
      expect(inviteRows().find((r) => r.id === admins.body.id)?.revokedAt).toBeNull()
    })
  })

  describe('GET /invite/<token>', () => {
    it('shows who invited you, a name field and Join, with no scripts', async () => {
      const { token } = await makeInvite(ADMIN, 'Cleo')
      const res = await openInvite(token)
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('Ana wants you in.')
      expect(html).toContain('Pick a name.')
      expect(html).toContain(`action="/invite/${token}" method="post"`)
      expect(html).toContain('name="username" value="cleo"')
      expect(html).toContain('>Join</button>')
      expect(html).not.toMatch(/<script/i)
      expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
      expect(res.headers.get('cache-control')).toBe('no-store')
    })

    it('never spends the invite, however often it is opened', async () => {
      const { token } = await makeInvite()
      for (let i = 0; i < 3; i++) await openInvite(token)
      await openInvite(token, 'HEAD')
      const [row] = inviteRows()
      expect(row.usedAt).toBeNull()
      expect(row.usedBy).toBeNull()
      expect(userCount()).toBe(2)
      expect((await join(token, 'cleo')).status).toBe(303)
    })

    it('escapes the inviter’s name', async () => {
      testInstance.sqlite
        .prepare('UPDATE users SET display_name = ? WHERE id = ?')
        .run('<b>Ana</b>', ADMIN)
      const { token } = await makeInvite()
      const html = await (await openInvite(token)).text()
      expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt; wants you in.')
      expect(html).not.toContain('<b>Ana</b>')
    })

    it('says plainly when a link is bad, used or expired', async () => {
      const bad = await openInvite('not-a-real-token')
      expect(bad.status).toBe(404)
      expect(await bad.text()).toContain('This invite link doesn’t work.')

      const unknown = await openInvite('A'.repeat(43))
      expect(unknown.status).toBe(404)

      const used = await makeInvite()
      await join(used.token, 'cleo')
      const usedPage = await openInvite(used.token)
      expect(usedPage.status).toBe(410)
      expect(await usedPage.text()).toContain('This invite has already been used.')

      const expired = await makeInvite()
      testInstance.sqlite
        .prepare('UPDATE invites SET expires_at = ? WHERE id = ?')
        .run(Date.now() - 1, expired.body.id)
      const expiredPage = await openInvite(expired.token)
      expect(expiredPage.status).toBe(410)
      expect(await expiredPage.text()).toContain('This invite has expired.')
      expect((await join(expired.token, 'dana')).status).toBe(410)
      expect(userCount()).toBe(3)
    })

    it('mentions which account this browser is already signed in to', async () => {
      const { token } = await makeInvite()
      mockUserId = MEMBER
      const html = await (await openInvite(token)).text()
      expect(html).toContain('You’re signed in here as @ben.')
    })
  })

  describe('POST /invite/<token>', () => {
    it('makes an account with no email, signs it in and goes to /invite/done', async () => {
      const { token, body } = await makeInvite()
      const res = await join(token, 'Cleo')
      expect(res.status).toBe(303)
      expect(res.headers.get('location')).toBe(`${BASE}/invite/done`)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.headers.get('referrer-policy')).toBe('no-referrer')
      const cookie = res.headers.get('set-cookie') ?? ''
      expect(cookie).toContain('adhx_session=')
      expect(cookie.toLowerCase()).toContain('httponly')
      expect(cookie.toLowerCase()).toContain('samesite=lax')

      const user = testInstance.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, 'cleo'))
        .get()!
      expect(user.email).toBeNull()
      expect(user.usernameChosen).toBe(true)
      expect(user.role).toBe('user')
      const identities = testInstance.db
        .select()
        .from(schema.userIdentities)
        .where(eq(schema.userIdentities.userId, user.id))
        .all()
      expect(identities).toEqual([
        expect.objectContaining({ provider: 'invite', providerId: body.id }),
      ])
      const [row] = inviteRows()
      expect(row.usedBy).toBe(user.id)
      expect(row.usedAt).toBeTruthy()
    })

    it('has exactly one winner when the same invite is posted at once', async () => {
      const { token } = await makeInvite()
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) => join(token, `racer${i}`)),
      )
      const statuses = results.map((r) => r.status)
      expect(statuses.filter((s) => s === 303)).toHaveLength(1)
      expect(statuses.filter((s) => s === 410)).toHaveLength(11)
      const bodies = await Promise.all(results.filter((r) => r.status === 410).map((r) => r.text()))
      for (const body of bodies) expect(body).toContain('This invite has already been used.')
      expect(userCount()).toBe(3)
      expect(
        testInstance.db
          .select()
          .from(schema.userIdentities)
          .where(eq(schema.userIdentities.provider, 'invite'))
          .all(),
      ).toHaveLength(1)
    })

    it('has exactly one winner when racers pick the same name', async () => {
      const { token } = await makeInvite()
      const results = await Promise.all(Array.from({ length: 6 }, () => join(token, 'samename')))
      expect(results.filter((r) => r.status === 303)).toHaveLength(1)
      expect(userCount()).toBe(3)
    })

    it('keeps the invite unused when the name is bad or taken', async () => {
      testInstance.db
        .insert(schema.usernameAliases)
        .values({ username: 'oldben', userId: MEMBER, createdAt: Date.now() })
        .run()
      const { token } = await makeInvite()

      const short = await join(token, 'x!')
      expect(short.status).toBe(400)
      expect(await short.text()).toContain('Names are 3 to 15 letters, numbers or underscores.')

      const taken = await join(token, 'Ben')
      expect(taken.status).toBe(409)
      const html = await taken.text()
      expect(html).toContain('@ben is taken. Try another.')
      expect(html).toContain('Ana wants you in.')
      expect(html).toContain('value="ben"')

      expect((await join(token, 'oldben')).status).toBe(409)

      const [row] = inviteRows()
      expect(row.usedAt).toBeNull()
      expect(row.usedBy).toBeNull()
      expect(userCount()).toBe(2)

      expect((await join(token, 'cleo')).status).toBe(303)
    })

    it('works when ALLOWED_EMAILS limits who can sign up', async () => {
      vi.stubEnv('ALLOWED_EMAILS', 'friend@example.com, @family.example')
      const { token } = await makeInvite()
      expect((await join(token, 'cleo')).status).toBe(303)
      expect(
        testInstance.db.select().from(schema.users).where(eq(schema.users.username, 'cleo')).get(),
      ).toBeTruthy()
    })

    it('rejects a cross-origin post without spending the invite', async () => {
      const { token } = await makeInvite()
      const foreign = await join(token, 'cleo', { Origin: 'https://evil.example' })
      expect(foreign.status).toBe(403)
      const crossSite = await join(token, 'cleo', { 'Sec-Fetch-Site': 'cross-site' })
      expect(crossSite.status).toBe(403)
      const { POST } = await import('@/app/invite/[token]/route')
      const noOrigin = await POST(
        new NextRequest(`${BASE}/invite/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ username: 'cleo' }),
        }),
        ctx(token),
      )
      expect(noOrigin.status).toBe(403)
      expect(foreign.headers.get('set-cookie')).toBeNull()
      expect(inviteRows()[0].usedAt).toBeNull()
      expect(userCount()).toBe(2)
    })

    it('rejects a body that isn’t a small form', async () => {
      const { token } = await makeInvite()
      const { POST } = await import('@/app/invite/[token]/route')
      const big = await POST(
        new NextRequest(`${BASE}/invite/${token}`, {
          method: 'POST',
          headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ username: 'cleo', pad: 'x'.repeat(2000) }),
        }),
        ctx(token),
      )
      expect(big.status).toBe(400)
      expect(inviteRows()[0].usedAt).toBeNull()
    })
  })

  describe('invites that stop working', () => {
    it('kills a banned inviter’s invites', async () => {
      vi.stubEnv('INVITES', 'members')
      const { token } = await makeInvite(MEMBER)
      testInstance.db
        .insert(schema.userBans)
        .values({ userId: MEMBER, createdBy: ADMIN, createdAt: new Date().toISOString() })
        .run()

      const page = await openInvite(token)
      expect(page.status).toBe(410)
      expect(await page.text()).toContain('This invite doesn’t work any more.')
      expect((await join(token, 'cleo')).status).toBe(410)
      expect(userCount()).toBe(2)

      mockUserId = ADMIN
      const { GET } = await import('@/app/api/invites/route')
      expect((await (await GET()).json()).invites).toEqual([])
    })

    it('kills members’ invites when INVITES=members is turned off', async () => {
      vi.stubEnv('INVITES', 'members')
      const { token } = await makeInvite(MEMBER)
      vi.stubEnv('INVITES', '')
      expect((await join(token, 'cleo')).status).toBe(410)
      vi.stubEnv('INVITES', 'members')
      expect((await join(token, 'cleo')).status).toBe(303)
    })
  })

  describe('account deletion', () => {
    async function deleteAccount(userId: string) {
      mockUserId = userId
      const { DELETE } = await import('@/app/api/account/route')
      const res = await DELETE()
      mockUserId = null
      return res
    }

    it('removes the invites someone made, and the one they joined with', async () => {
      vi.stubEnv('INVITES', 'members')
      const pending = await makeInvite(MEMBER)
      const used = await makeInvite(MEMBER)
      await makeInvite(ADMIN)
      await join(used.token, 'cleo')
      const cleo = testInstance.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, 'cleo'))
        .get()!

      expect((await deleteAccount(MEMBER)).status).toBe(200)
      expect(inviteRows().map((r) => r.createdBy)).toEqual([ADMIN])
      expect((await join(pending.token, 'dana')).status).toBe(404)

      // The deleted account can't make new invites, even below the API.
      expect(() =>
        testInstance.sqlite
          .prepare(
            `INSERT INTO invites (id, token_hash, created_by, created_at, expires_at)
             VALUES ('late', 'h', ?, 'now', ?)`,
          )
          .run(MEMBER, Date.now() + 1000),
      ).toThrow(/account reference does not exist/)

      const other = await makeInvite(ADMIN)
      await join(other.token, 'dana')
      expect((await deleteAccount(cleo.id)).status).toBe(200)
      const dana = testInstance.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, 'dana'))
        .get()!
      expect((await deleteAccount(dana.id)).status).toBe(200)
      expect(inviteRows().filter((r) => r.usedBy)).toEqual([])
      expect(
        testInstance.db
          .select()
          .from(schema.userIdentities)
          .where(eq(schema.userIdentities.provider, 'invite'))
          .all(),
      ).toEqual([])
    })
  })

  describe('adding an email later', () => {
    it('works for an account that joined by invite', async () => {
      const { token } = await makeInvite()
      await join(token, 'cleo')
      const cleo = testInstance.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, 'cleo'))
        .get()!

      mockUserId = cleo.id
      const change = await import('@/app/api/auth/email/change/route')
      const res = await change.POST(
        new NextRequest(`${BASE}/api/auth/email/change`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'Cleo@Example.com' }),
        }),
      )
      expect(res.status).toBe(200)
      const link = new URL(mockSend.mock.calls.at(-1)![0].url)

      const callback = await import('@/app/api/auth/email/callback/route')
      const confirmed = await callback.POST(
        new NextRequest(`${BASE}/api/auth/email/callback`, {
          method: 'POST',
          headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: link.searchParams.get('token')! }),
        }),
      )
      expect(confirmed.status).toBe(303)
      expect(confirmed.headers.get('location')).toBe(`${BASE}/settings?email_changed=1`)

      const after = testInstance.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, cleo.id))
        .get()!
      expect(after.email).toBe('cleo@example.com')
      const providers = testInstance.db
        .select({ provider: schema.userIdentities.provider })
        .from(schema.userIdentities)
        .where(eq(schema.userIdentities.userId, cleo.id))
        .all()
        .map((r) => r.provider)
        .sort()
      expect(providers).toEqual(['email', 'invite'])
    })
  })
})
