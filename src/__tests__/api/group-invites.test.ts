import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { installAccountWriteGuards } from '@/lib/db/account-invariants'
import { __resetRateLimitState } from '@/lib/rate-limit'
import { createTestDb, type TestDbInstance } from './setup'

/**
 * Group links: one link an admin drops into a group chat. Many people join
 * with it, each waits for an admin, and it stops at its cap, when cancelled,
 * when it expires, or when its maker stops being an admin.
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

vi.mock('@/lib/email/magic-link', () => ({
  sendMagicLinkEmail: vi.fn(() => Promise.resolve({ ok: true })),
  signInDelivery: () => 'email',
  pendingAdminSignInLinks: () => [],
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

async function makeGroupLink(asUser = ADMIN) {
  mockUserId = asUser
  const { POST } = await import('@/app/api/invites/route')
  const res = await POST(
    new NextRequest(`${BASE}/api/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: true }),
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

async function join(token: string, username: string) {
  const { POST } = await import('@/app/invite/[token]/route')
  return POST(
    new NextRequest(`${BASE}/invite/${token}`, {
      method: 'POST',
      headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username }),
    }),
    ctx(token),
  )
}

function link(id: string) {
  return testInstance.db.select().from(schema.invites).where(eq(schema.invites.id, id)).get()!
}

function user(username: string) {
  return testInstance.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .get()
}

describe('group links', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    installAccountWriteGuards(testInstance.sqlite)
    mockUserId = null
    __resetRateLimitState()
    vi.stubEnv('INVITES', '')
    seedUser(ADMIN, 'ana', 'admin', 'Ana')
    seedUser(MEMBER, 'ben')
  })

  afterEach(() => {
    testInstance.close()
  })

  it('lets an admin make one, and nobody else, whoever may invite', async () => {
    const { res, body } = await makeGroupLink()
    expect(res.status).toBe(201)
    expect(link(body.id)).toMatchObject({ maxUses: 25, uses: 0, usedAt: null, nameHint: null })

    vi.stubEnv('INVITES', 'members')
    const member = await makeGroupLink(MEMBER)
    expect(member.res.status).toBe(403)
    expect(member.body.error).toMatch(/Only admins/)
  })

  it('shows a group invite page that opening never spends', async () => {
    const { body, token } = await makeGroupLink()
    for (let i = 0; i < 3; i++) {
      const page = await openInvite(token, i === 2 ? 'HEAD' : 'GET')
      expect(page.status).toBe(200)
    }
    const html = await (await openInvite(token)).text()
    expect(html).toContain('Group invite')
    expect(html).toContain('Ana lets you in')
    expect(html).not.toContain('<script')
    expect(link(body.id).uses).toBe(0)
  })

  it('lets many people in, each waiting for an admin, with their own join row', async () => {
    const { body, token } = await makeGroupLink()
    for (const name of ['cleo', 'dev', 'eve']) {
      const res = await join(token, name)
      expect(res.status).toBe(303)
      expect(res.headers.get('location')).toBe(`${BASE}/invite/waiting`)
      expect(user(name)?.approval).toBe('pending')
    }
    expect(link(body.id)).toMatchObject({ uses: 3, usedAt: null })

    const joins = testInstance.db
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.groupId, body.id))
      .all()
    expect(joins).toHaveLength(3)
    expect(joins.every((j) => j.createdBy === ADMIN && j.usedAt && j.usedBy)).toBe(true)

    const { listJoinRequests, decideJoinRequest } = await import('@/lib/auth/approval')
    const requests = listJoinRequests()
    expect(requests.map((r) => r.username).sort()).toEqual(['cleo', 'dev', 'eve'])
    expect(requests.every((r) => r.viaGroupLink && r.invitedBy?.username === 'ana')).toBe(true)

    const cleo = requests.find((r) => r.username === 'cleo')!
    expect(decideJoinRequest(cleo.id, 'approve', ADMIN)).toEqual({ ok: true, approval: 'approved' })
    expect(user('cleo')?.approval).toBe('approved')
    expect(user('dev')?.approval).toBe('pending')

    // Still listed for the admin, with how many joined; never its link.
    mockUserId = ADMIN
    const { GET } = await import('@/app/api/invites/route')
    const listed = (await (await GET()).json()).invites
    expect(listed).toEqual([
      expect.objectContaining({ id: body.id, group: true, uses: 3, maxUses: 25 }),
    ])
    expect(JSON.stringify(listed)).not.toContain(token)
  })

  it('keeps its place when a name is taken or bad', async () => {
    const { body, token } = await makeGroupLink()
    expect((await join(token, 'ben')).status).toBe(409)
    expect((await join(token, 'x')).status).toBe(400)
    expect(link(body.id).uses).toBe(0)
    expect((await join(token, 'cleo')).status).toBe(303)
    expect(link(body.id).uses).toBe(1)
  })

  it('stops at its cap and says it’s full', async () => {
    const { body, token } = await makeGroupLink()
    testInstance.db
      .update(schema.invites)
      .set({ maxUses: 2 })
      .where(eq(schema.invites.id, body.id))
      .run()
    expect((await join(token, 'cleo')).status).toBe(303)
    expect((await join(token, 'dev')).status).toBe(303)
    const full = await join(token, 'eve')
    expect(full.status).toBe(410)
    expect(await full.text()).toContain('Everyone this link was for has joined')
    expect(user('eve')).toBeUndefined()
    expect((await openInvite(token)).status).toBe(410)
  })

  it('stops when cancelled or expired, and those already waiting keep waiting', async () => {
    const first = await makeGroupLink()
    expect((await join(first.token, 'cleo')).status).toBe(303)
    mockUserId = ADMIN
    const { DELETE } = await import('@/app/api/invites/[id]/route')
    const cancelled = await DELETE(new NextRequest(`${BASE}/api/invites/${first.body.id}`), {
      params: Promise.resolve({ id: first.body.id }),
    })
    expect(cancelled.status).toBe(200)
    expect((await join(first.token, 'dev')).status).toBe(410)
    expect(user('cleo')?.approval).toBe('pending')

    const second = await makeGroupLink()
    testInstance.db
      .update(schema.invites)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(schema.invites.id, second.body.id))
      .run()
    expect((await join(second.token, 'dev')).status).toBe(410)
    expect(user('dev')).toBeUndefined()
  })

  it('stops when its maker is no longer an admin or is banned', async () => {
    const { token } = await makeGroupLink()
    testInstance.db
      .update(schema.users)
      .set({ role: 'user' })
      .where(eq(schema.users.id, ADMIN))
      .run()
    expect((await openInvite(token)).status).toBe(410)
    expect((await join(token, 'cleo')).status).toBe(410)

    testInstance.db
      .update(schema.users)
      .set({ role: 'admin' })
      .where(eq(schema.users.id, ADMIN))
      .run()
    testInstance.db
      .insert(schema.userBans)
      .values({ userId: ADMIN, createdBy: ADMIN, createdAt: new Date().toISOString() })
      .run()
    expect((await join(token, 'cleo')).status).toBe(410)
    expect(user('cleo')).toBeUndefined()
  })

  it('slows a leaked link down: 20 joins an hour from one address', async () => {
    const { token } = await makeGroupLink()
    for (let i = 0; i < 20; i++) {
      expect((await join(token, `friend${i}`)).status).toBe(303)
    }
    const limited = await join(token, 'friend20')
    expect(limited.status).toBe(429)
    expect(user('friend20')).toBeUndefined()
  })

  it('shows on the admin Invites page as one row with its count', async () => {
    const { body, token } = await makeGroupLink()
    await join(token, 'cleo')
    await join(token, 'dev')
    const { invitesBoard } = await import('@/lib/admin/boards/moderation')
    const board = invitesBoard()
    expect(board.links).toEqual([
      expect.objectContaining({
        id: body.id,
        state: 'waiting',
        group: { joined: 2, maxUses: 25, joinedWaiting: 2 },
      }),
    ])
    expect(board.groupMaxUses).toBe(25)
    expect(board.requests).toHaveLength(2)
  })
})
