import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/auth/username
 *
 * The one-shot username claim (POST) shown on /welcome after a new email
 * signup, and its live availability check (GET). Covers grammar/sanitize
 * rules, the taken/already_chosen/invalid error paths, and that a
 * successful claim re-issues the session cookie with the new username.
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

    it('claims the username, sets usernameChosen, and re-issues the session cookie', async () => {
      await testInstance.db.insert(schema.users).values({ id: 'user-1', username: 'j0hn-abc12' })
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/username/route')
      const response = await POST(postRequest('/api/auth/username', { username: 'John Doe!' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({ ok: true, username: 'johndoe' })

      const cookies = response.headers.getSetCookie()
      expect(cookies.some((c) => c.includes('adhx_session'))).toBe(true)

      const [user] = await testInstance.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 'user-1'))
      expect(user.username).toBe('johndoe')
      expect(user.usernameChosen).toBe(true)
    })

    it('403s when the user has already spent their one-shot choice', async () => {
      await testInstance.db
        .insert(schema.users)
        .values({ id: 'user-1', username: 'already', usernameChosen: true })
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/username/route')
      const response = await POST(postRequest('/api/auth/username', { username: 'newname' }))
      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('already_chosen')

      const [user] = await testInstance.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 'user-1'))
      expect(user.username).toBe('already') // untouched
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
        postRequest('/api/auth/username', { username: 'a-very-long-username-indeed' }),
      )
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.username).toHaveLength(15)
      expect(data.username).toBe('a-very-long-use')
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
        { id: 'user-2', username: 'taken-name' },
      ])
      mockUserId = 'user-1'

      const { GET } = await import('@/app/api/auth/username/route')
      const response = await GET(getRequest('/api/auth/username?check=taken-name'))
      expect((await response.json()).available).toBe(false)
    })

    it('reports available: true when the check matches the caller’s own username', async () => {
      await testInstance.db.insert(schema.users).values({ id: 'user-1', username: 'reader1' })
      mockUserId = 'user-1'

      const { GET } = await import('@/app/api/auth/username/route')
      const response = await GET(getRequest('/api/auth/username?check=reader1'))
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
