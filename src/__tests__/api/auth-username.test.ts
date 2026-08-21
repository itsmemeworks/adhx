import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/auth/username
 *
 * The username claim/change endpoint (POST) — the free first claim shown on
 * /welcome (and for pre-existing accounts from Settings), plus up to
 * MAX_USERNAME_CHANGES (2) further changes — and its live availability
 * check (GET). Covers grammar/sanitize rules, the taken/change_limit_reached
 * /invalid error paths, that a successful claim re-issues the session
 * cookie with the new username, and that changes past the first record a
 * redirect alias (`username_aliases`) for the old name.
 *
 * The core change/alias/cap logic itself (chooseUsername/isUsernameTaken) is
 * unit-tested directly against an in-memory DB in
 * `src/__tests__/account-username.test.ts` — this file focuses on the HTTP
 * layer (status codes, response shape, session cookie).
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
  return {
    ...actual,
    getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
  }
})

function postRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function getRequest(path: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`))
}

describe('API: /api/auth/username', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = null
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('POST /api/auth/username', () => {
    it('401s when unauthenticated', async () => {
      const { POST } = await import('@/app/api/auth/username/route')
      const response = await POST(postRequest('/api/auth/username', { username: 'reader' }))
      expect(response.status).toBe(401)
    })

    it('claims the username (first claim, free), sets usernameChosen, and re-issues the session cookie', async () => {
      await testInstance.db.insert(schema.users).values({ id: 'user-1', username: 'j0hn-abc12' })
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/username/route')
      const response = await POST(postRequest('/api/auth/username', { username: 'John Doe!' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({ ok: true, username: 'johndoe', changesRemaining: 2 })

      const cookies = response.headers.getSetCookie()
      expect(cookies.some((c) => c.includes('adhx_session'))).toBe(true)

      const [user] = await testInstance.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 'user-1'))
      expect(user.username).toBe('johndoe')
      expect(user.usernameChosen).toBe(true)
      expect(user.usernameChangeCount).toBe(0) // first claim never counts

      // Even the free first claim aliases the old name — auto-derived
      // usernames can already live in shared /t/... URLs, and those links
      // must keep redirecting after the claim.
      const aliases = await testInstance.db.select().from(schema.usernameAliases)
      expect(aliases).toHaveLength(1)
      expect(aliases[0].userId).toBe('user-1')
    })

    it('a second change (after the first claim) costs a change and aliases the old name', async () => {
      await testInstance.db
        .insert(schema.users)
        .values({ id: 'user-1', username: 'already', usernameChosen: true })
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/username/route')
      const response = await POST(postRequest('/api/auth/username', { username: 'newname' }))
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({ ok: true, username: 'newname', changesRemaining: 1 })

      const [user] = await testInstance.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 'user-1'))
      expect(user.username).toBe('newname')
      expect(user.usernameChangeCount).toBe(1)

      const [alias] = await testInstance.db
        .select()
        .from(schema.usernameAliases)
        .where(eq(schema.usernameAliases.username, 'already'))
      expect(alias.userId).toBe('user-1')
    })

    it('409s with change_limit_reached once both changes are spent', async () => {
      await testInstance.db.insert(schema.users).values({
        id: 'user-1',
        username: 'current',
        usernameChosen: true,
        usernameChangeCount: 2,
      })
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/username/route')
      const response = await POST(postRequest('/api/auth/username', { username: 'onemore' }))
      expect(response.status).toBe(409)
      const data = await response.json()
      expect(data.error).toBe('change_limit_reached')

      const [user] = await testInstance.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 'user-1'))
      expect(user.username).toBe('current') // untouched
    })

    it('resubmitting the current username is a free no-op, even after the cap is spent', async () => {
      await testInstance.db.insert(schema.users).values({
        id: 'user-1',
        username: 'current',
        usernameChosen: true,
        usernameChangeCount: 2,
      })
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/username/route')
      const response = await POST(postRequest('/api/auth/username', { username: 'Current' }))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, username: 'current', changesRemaining: 0 })
    })

    it('blocks a username currently aliased to someone else', async () => {
      await testInstance.db.insert(schema.users).values([
        { id: 'user-1', username: 'me', usernameChosen: true },
        { id: 'user-2', username: 'someone-else' },
      ])
      await testInstance.db
        .insert(schema.usernameAliases)
        .values({ username: 'former', userId: 'user-2', createdAt: Date.now() })
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/username/route')
      const response = await POST(postRequest('/api/auth/username', { username: 'former' }))
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe('taken')
    })

    it('lets a user reclaim their own past username, freeing the alias', async () => {
      await testInstance.db
        .insert(schema.users)
        .values({ id: 'user-1', username: 'current', usernameChosen: true, usernameChangeCount: 1 })
      await testInstance.db
        .insert(schema.usernameAliases)
        .values({ username: 'oldname', userId: 'user-1', createdAt: Date.now() })
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/username/route')
      const response = await POST(postRequest('/api/auth/username', { username: 'oldname' }))
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({ ok: true, username: 'oldname', changesRemaining: 0 })

      // The reclaimed alias is gone, and the name just vacated ("current")
      // is now the alias, still owned by user-1.
      const aliases = await testInstance.db.select().from(schema.usernameAliases)
      expect(aliases.map((a) => a.username)).toEqual(['current'])
      expect(aliases[0].userId).toBe('user-1')
    })

    it('409s when the sanitized username is already taken by another account', async () => {
      await testInstance.db.insert(schema.users).values([
        { id: 'user-1', username: 'reader1' },
        { id: 'user-2', username: 'popular' },
      ])
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/username/route')
      const response = await POST(postRequest('/api/auth/username', { username: 'popular' }))
      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe('taken')
    })

    it('allows re-claiming a username that sanitizes to the same value the user already has', async () => {
      await testInstance.db.insert(schema.users).values({ id: 'user-1', username: 'reader1' })
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/username/route')
      const response = await POST(postRequest('/api/auth/username', { username: 'Reader1' }))
      expect(response.status).toBe(200)
    })

    it('400s on a too-short sanitized username', async () => {
      await testInstance.db.insert(schema.users).values({ id: 'user-1', username: 'reader1' })
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/username/route')
      const response = await POST(postRequest('/api/auth/username', { username: '--!!' }))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('invalid')
    })

    it('truncates a too-long username to 15 chars', async () => {
      await testInstance.db.insert(schema.users).values({ id: 'user-1', username: 'reader1' })
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/username/route')
      const response = await POST(
        postRequest('/api/auth/username', { username: 'a_very_long_username_indeed' }),
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.username).toHaveLength(15)
      expect(data.username).toBe('a_very_long_use')
    })
  })

  describe('GET /api/auth/username?check=', () => {
    it('401s when unauthenticated', async () => {
      const { GET } = await import('@/app/api/auth/username/route')
      const response = await GET(getRequest('/api/auth/username?check=reader'))
      expect(response.status).toBe(401)
    })

    it('reports available: true for an unused, valid username', async () => {
      await testInstance.db.insert(schema.users).values({ id: 'user-1', username: 'reader1' })
      mockUserId = 'user-1'

      const { GET } = await import('@/app/api/auth/username/route')
      const response = await GET(getRequest('/api/auth/username?check=freshname'))
      const data = await response.json()
      expect(data).toEqual({ available: true, sanitized: 'freshname' })
    })

    it('reports available: false when another account already has it', async () => {
      await testInstance.db.insert(schema.users).values([
        { id: 'user-1', username: 'reader1' },
        { id: 'user-2', username: 'taken_name' },
      ])
      mockUserId = 'user-1'

      const { GET } = await import('@/app/api/auth/username/route')
      const response = await GET(getRequest('/api/auth/username?check=taken_name'))
      expect((await response.json()).available).toBe(false)
    })

    it('reports available: true when the check matches the caller’s own username', async () => {
      await testInstance.db.insert(schema.users).values({ id: 'user-1', username: 'reader1' })
      mockUserId = 'user-1'

      const { GET } = await import('@/app/api/auth/username/route')
      const response = await GET(getRequest('/api/auth/username?check=reader1'))
      expect((await response.json()).available).toBe(true)
    })

    it('reports available: false for a name aliased to another account', async () => {
      await testInstance.db.insert(schema.users).values([
        { id: 'user-1', username: 'reader1' },
        { id: 'user-2', username: 'someone-else' },
      ])
      await testInstance.db
        .insert(schema.usernameAliases)
        .values({ username: 'formerly', userId: 'user-2', createdAt: Date.now() })
      mockUserId = 'user-1'

      const { GET } = await import('@/app/api/auth/username/route')
      const response = await GET(getRequest('/api/auth/username?check=formerly'))
      expect((await response.json()).available).toBe(false)
    })

    it('reports available: true for the caller’s own alias (reclaimable)', async () => {
      await testInstance.db.insert(schema.users).values({ id: 'user-1', username: 'reader1' })
      await testInstance.db
        .insert(schema.usernameAliases)
        .values({ username: 'myoldname', userId: 'user-1', createdAt: Date.now() })
      mockUserId = 'user-1'

      const { GET } = await import('@/app/api/auth/username/route')
      const response = await GET(getRequest('/api/auth/username?check=myoldname'))
      expect((await response.json()).available).toBe(true)
    })

    it('reports available: false for a too-short sanitized query without hitting the DB', async () => {
      await testInstance.db.insert(schema.users).values({ id: 'user-1', username: 'reader1' })
      mockUserId = 'user-1'

      const { GET } = await import('@/app/api/auth/username/route')
      const response = await GET(getRequest('/api/auth/username?check=a'))
      const data = await response.json()
      expect(data).toEqual({ available: false, sanitized: 'a' })
    })
  })
})
