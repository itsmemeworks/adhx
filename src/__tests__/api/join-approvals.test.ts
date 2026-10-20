import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { installAccountWriteGuards } from '@/lib/db/account-invariants'
import { __resetRateLimitState } from '@/lib/rate-limit'
import { createTestDb, type TestDbInstance } from './setup'

/**
 * "Who can invite" and join approvals. With "Anyone, I approve", someone a
 * member invites joins as `pending`: signed in to the waiting page and its
 * status endpoint, signed out everywhere else, until an admin approves. Uses
 * the real session code (signed cookies), so the gate itself is under test.
 */

let testInstance: TestDbInstance
/** The browser's session cookie. */
let cookie: string | null = null

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'adhx_session' && cookie ? { value: cookie } : undefined),
  }),
}))
vi.mock('@/lib/sentry', () => ({
  metrics: new Proxy({}, { get: () => vi.fn() }),
  captureException: vi.fn(),
  metricCount: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
}))
vi.mock('@/lib/email/magic-link', () => ({
  sendMagicLinkEmail: vi.fn(async () => ({ ok: true })),
  signInDelivery: () => 'email',
  pendingAdminSignInLinks: () => [],
}))

const BASE = 'http://localhost:3000'
vi.stubEnv('NEXT_PUBLIC_APP_URL', BASE)

const ADMIN = 'u_admin'
const MEMBER = 'u_member'

async function signInAs(userId: string, username: string) {
  const { setSessionCookie } = await import('@/lib/auth/session')
  const res = (await import('next/server')).NextResponse.json({})
  await setSessionCookie(res, { userId, username })
  cookie = res.cookies.get('adhx_session')!.value
}

async function makeInvite(asUser: string, username: string) {
  await signInAs(asUser, username)
  const { POST } = await import('@/app/api/invites/route')
  const res = await POST(
    new NextRequest(`${BASE}/api/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
  )
  const body = await res.json()
  cookie = null
  return {
    status: res.status,
    id: body.id as string,
    token: String(body.url ?? '').split('/invite/')[1],
  }
}

/** Join with the invite like a browser: the redirect, and the cookie it sets. */
async function join(token: string, username: string) {
  const { POST } = await import('@/app/invite/[token]/route')
  const res = await POST(
    new NextRequest(`${BASE}/invite/${token}`, {
      method: 'POST',
      headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username }),
    }),
    { params: Promise.resolve({ token }) },
  )
  cookie = res.cookies.get('adhx_session')?.value ?? null
  return { status: res.status, location: res.headers.get('location') }
}

async function setMode(mode: string, asUser = ADMIN, username = 'ana') {
  await signInAs(asUser, username)
  const { PATCH } = await import('@/app/api/people/route')
  const res = await PATCH(
    new NextRequest(`${BASE}/api/people`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteMode: mode }),
    }),
  )
  cookie = null
  return res.status
}

async function decide(requestId: string, decision: string, asUser = ADMIN, username = 'ana') {
  const saved = cookie
  await signInAs(asUser, username)
  const { POST } = await import('@/app/api/people/requests/[id]/route')
  const res = await POST(
    new NextRequest(`${BASE}/api/people/requests/${requestId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    }),
    { params: Promise.resolve({ id: requestId }) },
  )
  cookie = saved
  return { status: res.status, body: await res.json() }
}

async function approvalStatus() {
  const { GET } = await import('@/app/api/auth/approval/route')
  const res = await GET()
  return { status: res.status, body: await res.json() }
}

const approvalOf = (username: string) =>
  testInstance.db.select().from(schema.users).where(eq(schema.users.username, username)).get()
    ?.approval

beforeEach(() => {
  testInstance = createTestDb()
  installAccountWriteGuards(testInstance.sqlite)
  __resetRateLimitState()
  cookie = null
  vi.stubEnv('INVITES', '')
  testInstance.db
    .insert(schema.users)
    .values([
      { id: ADMIN, username: 'ana', role: 'admin', displayName: 'Ana', usernameChosen: true },
      { id: MEMBER, username: 'jo', displayName: 'Jo', usernameChosen: true },
    ])
    .run()
})

afterEach(() => {
  testInstance.close()
})

describe('who can invite', () => {
  it('defaults from INVITES, then the stored choice wins', async () => {
    const { inviteMode } = await import('@/lib/auth/invites')
    expect(inviteMode()).toBe('admin')
    vi.stubEnv('INVITES', 'members')
    expect(inviteMode()).toBe('anyone')
    expect(await setMode('admin')).toBe(200)
    expect(inviteMode()).toBe('admin')
  })

  it('only an admin can change it, to one of the three', async () => {
    expect(await setMode('anyone', MEMBER, 'jo')).toBe(403)
    expect(await setMode('everyone')).toBe(400)
    cookie = null
    const { PATCH } = await import('@/app/api/people/route')
    const res = await PATCH(new NextRequest(`${BASE}/api/people`, { method: 'PATCH', body: '{}' }))
    expect(res.status).toBe(401)
  })

  it('Only me: members can’t make invites, and theirs stop working', async () => {
    await setMode('anyone')
    const before = await makeInvite(MEMBER, 'jo')
    expect(before.status).toBe(201)
    await setMode('admin')
    expect((await makeInvite(MEMBER, 'jo')).status).toBe(403)
    expect((await join(before.token, 'cleo')).status).toBe(410)
  })

  it('Anyone: a member’s invite lets people straight in', async () => {
    await setMode('anyone')
    const inv = await makeInvite(MEMBER, 'jo')
    const res = await join(inv.token, 'cleo')
    expect(res.location).toBe(`${BASE}/invite/done`)
    expect(approvalOf('cleo')).toBe('approved')
  })

  it('Anyone, I approve: an admin’s own invite still lets people straight in', async () => {
    await setMode('approve')
    const inv = await makeInvite(ADMIN, 'ana')
    await join(inv.token, 'dev')
    expect(approvalOf('dev')).toBe('approved')
  })
})

describe('Anyone, I approve', () => {
  async function pendingJoiner() {
    await setMode('approve')
    const inv = await makeInvite(MEMBER, 'jo')
    expect(inv.status).toBe(201)
    const res = await join(inv.token, 'ben')
    return { inv, res }
  }

  it('a member’s invite makes a pending account that lands on the waiting page', async () => {
    const { res } = await pendingJoiner()
    expect(res.status).toBe(303)
    expect(res.location).toBe(`${BASE}/invite/waiting`)
    expect(approvalOf('ben')).toBe('pending')
    expect(await approvalStatus()).toEqual({
      status: 200,
      body: { approval: 'pending', username: 'ben', admin: 'Ana', inviter: 'Jo' },
    })
  })

  it('a pending account is signed out everywhere else', async () => {
    await pendingJoiner()
    const { getCurrentUserId } = await import('@/lib/auth/session')
    expect(await getCurrentUserId()).toBeNull()

    const me = await (await import('@/app/api/auth/me/route')).GET()
    expect((await me.json()).authenticated).toBe(false)

    const prefs = await (await import('@/app/api/preferences/route')).GET()
    expect(prefs.status).toBe(401)
    const people = await (await import('@/app/api/people/route')).GET()
    expect(people.status).toBe(401)
    const invites = await (await import('@/app/api/invites/route')).GET()
    expect(invites.status).toBe(401)
    const doing = await (
      await import('@/app/api/activity/processing/route')
    ).GET(new NextRequest(`${BASE}/api/activity/processing`))
    expect(doing.status).toBe(401)
    const pairing = await (
      await import('@/app/api/app/pairing/route')
    ).POST(new NextRequest(`${BASE}/api/app/pairing`, { method: 'POST' }))
    expect(pairing.status).toBe(401)
    const save = await (
      await import('@/app/api/bookmarks/add/route')
    ).POST(
      new NextRequest(`${BASE}/api/bookmarks/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://x.com/a/status/1' }),
      }),
    )
    expect(save.status).toBe(401)
    // The done page (phone pairing) sends them away; the waiting page renders.
    const done = (await import('@/app/invite/done/page')).default
    await expect(done()).rejects.toThrow('NEXT_REDIRECT /')
    const waiting = (await import('@/app/invite/waiting/page')).default
    await expect(waiting()).resolves.toBeTruthy()
  })

  it('a phone key for a pending account is refused', async () => {
    await pendingJoiner()
    const ben = testInstance.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, 'ben'))
      .get()!
    const { createAccessKey } = await import('@/lib/auth/access-keys')
    const { key } = createAccessKey(ben.id, 'iPhone', 'phone')!
    const { GET } = await import('@/app/api/app/people/route')
    const res = await GET(
      new Request(`${BASE}/api/app/people`, { headers: { authorization: `Bearer ${key}` } }),
    )
    expect(res.status).toBe(401)
  })

  it('only admins see and answer the queue', async () => {
    const { inv } = await pendingJoiner()
    const asMember = await decide(inv.id, 'approve', MEMBER, 'jo')
    expect(asMember.status).toBe(403)
    expect(approvalOf('ben')).toBe('pending')

    await signInAs(MEMBER, 'jo')
    const { GET: list } = await import('@/app/api/people/requests/route')
    expect((await list()).status).toBe(403)
    const view = await (await (await import('@/app/api/people/route')).GET()).json()
    expect(view.requests).toBeUndefined()

    await signInAs(ADMIN, 'ana')
    const adminView = await (await (await import('@/app/api/people/route')).GET()).json()
    expect(adminView.requests).toEqual([
      expect.objectContaining({
        id: inv.id,
        username: 'ben',
        invitedBy: { username: 'jo', name: 'Jo' },
      }),
    ])
    // Waiting people aren't members yet.
    expect(adminView.members.map((m: { username: string }) => m.username)).not.toContain('ben')
  })

  it('approve lets them in everywhere', async () => {
    const { inv } = await pendingJoiner()
    const res = await decide(inv.id, 'approve')
    expect(res).toEqual({ status: 200, body: { approval: 'approved' } })
    const { getCurrentUserId } = await import('@/lib/auth/session')
    expect(await getCurrentUserId()).toMatch(/^u_/)
    expect((await approvalStatus()).body).toEqual({ approval: 'approved' })
    // Deciding again finds nobody waiting.
    expect((await decide(inv.id, 'decline')).status).toBe(404)
  })

  it('decline keeps them out and the waiting page says so', async () => {
    const { inv } = await pendingJoiner()
    expect((await decide(inv.id, 'decline')).body).toEqual({ approval: 'declined' })
    const { getCurrentUserId } = await import('@/lib/auth/session')
    expect(await getCurrentUserId()).toBeNull()
    expect((await approvalStatus()).body.approval).toBe('declined')
  })

  it('not now leaves them waiting and hides the card for a while', async () => {
    const { inv } = await pendingJoiner()
    expect((await decide(inv.id, 'not_now')).body).toEqual({ approval: 'pending' })
    const { listJoinRequests } = await import('@/lib/auth/approval')
    expect(listJoinRequests()).toEqual([])
    expect(listJoinRequests({ includeSnoozed: true })).toHaveLength(1)
    expect(listJoinRequests({}, Date.now() + 4 * 86_400_000)).toHaveLength(1)
    expect(approvalOf('ben')).toBe('pending')
  })

  it('rejects a decision it doesn’t know', async () => {
    const { inv } = await pendingJoiner()
    expect((await decide(inv.id, 'maybe')).status).toBe(400)
  })

  it('the phone answers the queue the same way', async () => {
    const { inv } = await pendingJoiner()
    const { createAccessKey } = await import('@/lib/auth/access-keys')
    const { key } = createAccessKey(ADMIN, 'iPhone', 'phone')!
    const { GET } = await import('@/app/api/app/people/route')
    const view = await (
      await GET(
        new Request(`${BASE}/api/app/people`, { headers: { authorization: `Bearer ${key}` } }),
      )
    ).json()
    expect(view.requests).toHaveLength(1)
    const { POST } = await import('@/app/api/app/people/requests/[id]/route')
    const res = await POST(
      new Request(`${BASE}/api/app/people/requests/${inv.id}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approve' }),
      }),
      { params: Promise.resolve({ id: inv.id }) },
    )
    expect(await res.json()).toEqual({ approval: 'approved' })
    expect(approvalOf('ben')).toBe('approved')
  })
})

describe('invite rows', () => {
  it('show a short code from the invite id, and a fresh link replaces the old one', async () => {
    const inv = await makeInvite(ADMIN, 'ana')
    await signInAs(ADMIN, 'ana')
    const { GET } = await import('@/app/api/invites/route')
    const { invites } = await (await GET()).json()
    const { inviteCode } = await import('@/lib/auth/invites')
    expect(invites[0].code).toBe(inviteCode(inv.id))
    expect(invites[0].code).toMatch(/^[A-Z0-9]{4}$/)
    expect(inv.token.toUpperCase().startsWith(invites[0].code)).toBe(false)

    const { POST } = await import('@/app/api/invites/[id]/link/route')
    const res = await POST(
      new NextRequest(`${BASE}/api/invites/${inv.id}/link`, { method: 'POST' }),
      {
        params: Promise.resolve({ id: inv.id }),
      },
    )
    const fresh = await res.json()
    expect(fresh.id).toBe(inv.id)
    const newToken = fresh.url.split('/invite/')[1]
    expect(newToken).not.toBe(inv.token)
    cookie = null
    expect((await join(inv.token, 'olduser')).status).toBe(404)
    expect((await join(newToken, 'newuser')).status).toBe(303)
  })

  it('a member can’t get a new link for someone else’s invite', async () => {
    const inv = await makeInvite(ADMIN, 'ana')
    await setMode('anyone')
    await signInAs(MEMBER, 'jo')
    const { POST } = await import('@/app/api/invites/[id]/link/route')
    const res = await POST(
      new NextRequest(`${BASE}/api/invites/${inv.id}/link`, { method: 'POST' }),
      {
        params: Promise.resolve({ id: inv.id }),
      },
    )
    expect(res.status).toBe(404)
  })
})
