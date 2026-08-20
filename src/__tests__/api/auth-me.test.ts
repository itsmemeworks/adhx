import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/auth/me
 *
 * The account-aware read of auth state: unauthenticated shape, X-only user,
 * email-only user, and a user with both identities linked.
 */

let testInstance: TestDbInstance
let mockSession: { userId: string; username: string } | null = null

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(() => Promise.resolve(mockSession)),
}))

describe('API: /api/auth/me', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockSession = null
  })

  afterEach(() => {
    testInstance.close()
  })

  it('returns the unauthenticated shape when there is no session', async () => {
    const { GET } = await import('@/app/api/auth/me/route')
    const response = await GET()
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toEqual({
      authenticated: false,
      user: null,
      identities: { x: null, email: null },
      xConnected: false,
    })
  })

  it('reports an X-only user with xConnected: true', async () => {
    await testInstance.db.insert(schema.users).values({
      id: 'x-user-1',
      username: 'xuser',
      displayName: 'X User',
      avatarUrl: 'https://example.com/avatar.jpg',
    })
    await testInstance.db.insert(schema.userIdentities).values({
      provider: 'x',
      providerId: 'x-user-1',
      userId: 'x-user-1',
    })
    await testInstance.db.insert(schema.oauthTokens).values({
      userId: 'x-user-1',
      username: 'xuser',
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    })
    mockSession = { userId: 'x-user-1', username: 'xuser' }

    const { GET } = await import('@/app/api/auth/me/route')
    const response = await GET()
    const data = await response.json()

    expect(data.authenticated).toBe(true)
    expect(data.user).toEqual({
      id: 'x-user-1',
      username: 'xuser',
      displayName: 'X User',
      avatarUrl: 'https://example.com/avatar.jpg',
    })
    expect(data.identities.x).toEqual({ providerId: 'x-user-1', username: 'xuser' })
    expect(data.identities.email).toBeNull()
    expect(data.xConnected).toBe(true)
  })

  it('reports an email-only user with xConnected: false', async () => {
    await testInstance.db.insert(schema.users).values({
      id: 'u_abc123',
      username: 'reader',
      email: 'reader@example.com',
    })
    await testInstance.db.insert(schema.userIdentities).values({
      provider: 'email',
      providerId: 'reader@example.com',
      userId: 'u_abc123',
    })
    mockSession = { userId: 'u_abc123', username: 'reader' }

    const { GET } = await import('@/app/api/auth/me/route')
    const response = await GET()
    const data = await response.json()

    expect(data.authenticated).toBe(true)
    expect(data.user.id).toBe('u_abc123')
    expect(data.identities.x).toBeNull()
    expect(data.identities.email).toEqual({ email: 'reader@example.com' })
    expect(data.xConnected).toBe(false)
  })

  it('reports both identities for a user who linked email + X', async () => {
    await testInstance.db.insert(schema.users).values({
      id: 'u_both1',
      username: 'bothuser',
      email: 'both@example.com',
    })
    await testInstance.db.insert(schema.userIdentities).values([
      { provider: 'email', providerId: 'both@example.com', userId: 'u_both1' },
      { provider: 'x', providerId: 'x-999', userId: 'u_both1' },
    ])
    await testInstance.db.insert(schema.oauthTokens).values({
      userId: 'u_both1',
      username: 'xhandle',
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    })
    mockSession = { userId: 'u_both1', username: 'bothuser' }

    const { GET } = await import('@/app/api/auth/me/route')
    const response = await GET()
    const data = await response.json()

    expect(data.authenticated).toBe(true)
    expect(data.identities.x).toEqual({ providerId: 'x-999', username: 'xhandle' })
    expect(data.identities.email).toEqual({ email: 'both@example.com' })
    expect(data.xConnected).toBe(true)
  })

  it('lazily creates a users row for a pre-migration session and returns it', async () => {
    // Simulate an old session whose users row doesn't exist yet (no
    // migration backfill has run against this in-memory test DB).
    mockSession = { userId: 'legacy-user', username: 'legacyuser' }

    const { GET } = await import('@/app/api/auth/me/route')
    const response = await GET()
    const data = await response.json()

    expect(data.authenticated).toBe(true)
    expect(data.user.id).toBe('legacy-user')
    expect(data.user.username).toBe('legacyuser')
    expect(data.identities).toEqual({ x: null, email: null })
    expect(data.xConnected).toBe(false)

    const rows = await testInstance.db.select().from(schema.users)
    expect(rows).toHaveLength(1)
  })
})
