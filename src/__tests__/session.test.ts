import { describe, it, expect, vi, beforeEach } from 'vitest'

const liveUserIds = new Set<string>()
/** Accounts that joined from a member's invite and are waiting (or were declined). */
const waitingUserIds = new Map<string, 'pending' | 'declined'>()
const bannedUserIds = new Set<string>()
let moderationReadable = true

// Mock jose module
vi.mock('jose', () => ({
  // A function, not an arrow: the session module constructs it with `new`.
  SignJWT: vi.fn().mockImplementation(function () {
    return {
      setProtectedHeader: vi.fn().mockReturnThis(),
      setIssuedAt: vi.fn().mockReturnThis(),
      setExpirationTime: vi.fn().mockReturnThis(),
      sign: vi.fn().mockResolvedValue('mock-jwt-token'),
    }
  }),
  jwtVerify: vi.fn(),
}))

// Mock next/headers cookies
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}))

vi.mock('@/lib/admin/moderation', () => ({
  readUserBan: (userId: string) =>
    moderationReadable
      ? { ok: true as const, value: bannedUserIds.has(userId) }
      : { ok: false as const, error: new Error('moderation unavailable') },
}))

vi.mock('@/lib/auth/account-state', () => ({
  hasLiveAccount: vi.fn((userId: string) => Promise.resolve(liveUserIds.has(userId))),
  accountApproval: vi.fn((userId: string) =>
    Promise.resolve(liveUserIds.has(userId) ? (waitingUserIds.get(userId) ?? 'approved') : null),
  ),
}))

describe('Session Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    liveUserIds.clear()
    waitingUserIds.clear()
    bannedUserIds.clear()
    moderationReadable = true
    liveUserIds.add('user-456')
    liveUserIds.add('user-789')
  })

  describe('getSession', () => {
    it('should return null when no session cookie exists', async () => {
      mockCookieStore.get.mockReturnValue(undefined)

      const { getSession } = await import('@/lib/auth/session')
      const session = await getSession()

      expect(session).toBeNull()
    })

    it('should return null when cookie value is empty', async () => {
      mockCookieStore.get.mockReturnValue({ value: '' })

      const { getSession } = await import('@/lib/auth/session')
      const session = await getSession()

      expect(session).toBeNull()
    })

    it('should return session data when valid JWT exists', async () => {
      const { jwtVerify } = await import('jose')
      const mockJwtVerify = jwtVerify as ReturnType<typeof vi.fn>

      mockCookieStore.get.mockReturnValue({ value: 'valid-jwt-token' })
      mockJwtVerify.mockResolvedValue({
        payload: {
          userId: 'user-123',
          username: 'testuser',
        },
      })

      const { getSession } = await import('@/lib/auth/session')
      const session = await getSession()

      expect(session).toEqual({
        userId: 'user-123',
        username: 'testuser',
      })
    })

    it('should return null when JWT verification fails', async () => {
      const { jwtVerify } = await import('jose')
      const mockJwtVerify = jwtVerify as ReturnType<typeof vi.fn>

      mockCookieStore.get.mockReturnValue({ value: 'invalid-jwt-token' })
      mockJwtVerify.mockRejectedValue(new Error('Invalid signature'))

      const { getSession } = await import('@/lib/auth/session')
      const session = await getSession()

      expect(session).toBeNull()
    })

    it('should return null when payload is missing userId', async () => {
      const { jwtVerify } = await import('jose')
      const mockJwtVerify = jwtVerify as ReturnType<typeof vi.fn>

      mockCookieStore.get.mockReturnValue({ value: 'jwt-without-userid' })
      mockJwtVerify.mockResolvedValue({
        payload: {
          username: 'testuser',
        },
      })

      const { getSession } = await import('@/lib/auth/session')
      const session = await getSession()

      expect(session).toBeNull()
    })
  })

  describe('getCurrentUserId', () => {
    it('should return userId when session exists', async () => {
      const { jwtVerify } = await import('jose')
      const mockJwtVerify = jwtVerify as ReturnType<typeof vi.fn>

      mockCookieStore.get.mockReturnValue({ value: 'valid-jwt' })
      mockJwtVerify.mockResolvedValue({
        payload: { userId: 'user-456', username: 'anotheruser' },
      })

      const { getCurrentUserId } = await import('@/lib/auth/session')
      const userId = await getCurrentUserId()

      expect(userId).toBe('user-456')
    })

    it('should return null when no session exists', async () => {
      mockCookieStore.get.mockReturnValue(undefined)

      const { getCurrentUserId } = await import('@/lib/auth/session')
      const userId = await getCurrentUserId()

      expect(userId).toBeNull()
    })

    it('rejects a valid stale JWT after its account row is deleted', async () => {
      const { jwtVerify } = await import('jose')
      const mockJwtVerify = jwtVerify as ReturnType<typeof vi.fn>

      mockCookieStore.get.mockReturnValue({ value: 'stale-jwt' })
      mockJwtVerify.mockResolvedValue({
        payload: { userId: 'deleted-user', username: 'former-user' },
      })

      const { getCurrentUserId } = await import('@/lib/auth/session')
      expect(await getCurrentUserId()).toBeNull()
    })

    it('still rejects a banned account that has a live users row', async () => {
      const { jwtVerify } = await import('jose')
      const mockJwtVerify = jwtVerify as ReturnType<typeof vi.fn>
      liveUserIds.add('banned-user')
      bannedUserIds.add('banned-user')
      mockCookieStore.get.mockReturnValue({ value: 'banned-jwt' })
      mockJwtVerify.mockResolvedValue({
        payload: { userId: 'banned-user', username: 'spammer' },
      })

      const { getCurrentUserId } = await import('@/lib/auth/session')
      expect(await getCurrentUserId()).toBeNull()
    })

    it('treats an account waiting to be let in as signed out', async () => {
      const { jwtVerify } = await import('jose')
      liveUserIds.add('waiting-user')
      waitingUserIds.set('waiting-user', 'pending')
      mockCookieStore.get.mockReturnValue({ value: 'valid-jwt' })
      ;(jwtVerify as ReturnType<typeof vi.fn>).mockResolvedValue({
        payload: { userId: 'waiting-user', username: 'ben' },
      })

      const { getCurrentUserId, getWaitingAccount } = await import('@/lib/auth/session')
      expect(await getCurrentUserId()).toBeNull()
      expect(await getWaitingAccount()).toEqual({ userId: 'waiting-user', approval: 'pending' })

      waitingUserIds.set('waiting-user', 'declined')
      expect(await getCurrentUserId()).toBeNull()
      expect(await getWaitingAccount()).toEqual({ userId: 'waiting-user', approval: 'declined' })

      waitingUserIds.delete('waiting-user')
      expect(await getCurrentUserId()).toBe('waiting-user')
      expect(await getWaitingAccount()).toBeNull()
    })

    it('never gives a banned waiting account the waiting page either', async () => {
      const { jwtVerify } = await import('jose')
      liveUserIds.add('waiting-banned')
      waitingUserIds.set('waiting-banned', 'pending')
      bannedUserIds.add('waiting-banned')
      mockCookieStore.get.mockReturnValue({ value: 'valid-jwt' })
      ;(jwtVerify as ReturnType<typeof vi.fn>).mockResolvedValue({
        payload: { userId: 'waiting-banned', username: 'ben' },
      })
      const { getWaitingAccount } = await import('@/lib/auth/session')
      expect(await getWaitingAccount()).toBeNull()
    })

    it('rejects a valid session when the moderation store is unreadable', async () => {
      const { jwtVerify } = await import('jose')
      const mockJwtVerify = jwtVerify as ReturnType<typeof vi.fn>
      moderationReadable = false
      mockCookieStore.get.mockReturnValue({ value: 'valid-jwt' })
      mockJwtVerify.mockResolvedValue({
        payload: { userId: 'user-456', username: 'anotheruser' },
      })

      const { getCurrentUserId } = await import('@/lib/auth/session')
      expect(await getCurrentUserId()).toBeNull()
    })
  })

  describe('renewSessionCookie', () => {
    const response = () => ({ cookies: { set: vi.fn() } })

    it('re-signs a session issued more than a day ago', async () => {
      const { jwtVerify } = await import('jose')
      mockCookieStore.get.mockReturnValue({ value: 'old-jwt' })
      ;(jwtVerify as ReturnType<typeof vi.fn>).mockResolvedValue({
        payload: { userId: 'user-456', username: 'ben', iat: Date.now() / 1000 - 2 * 86400 },
      })
      const res = response()
      const { renewSessionCookie } = await import('@/lib/auth/session')
      expect(await renewSessionCookie(res as never)).toBe(true)
      expect(res.cookies.set).toHaveBeenCalledWith(
        'adhx_session',
        'mock-jwt-token',
        expect.objectContaining({ maxAge: 30 * 24 * 60 * 60, httpOnly: true }),
      )
    })

    it('leaves a fresh session alone', async () => {
      const { jwtVerify } = await import('jose')
      mockCookieStore.get.mockReturnValue({ value: 'new-jwt' })
      ;(jwtVerify as ReturnType<typeof vi.fn>).mockResolvedValue({
        payload: { userId: 'user-456', username: 'ben', iat: Date.now() / 1000 - 60 },
      })
      const res = response()
      const { renewSessionCookie } = await import('@/lib/auth/session')
      expect(await renewSessionCookie(res as never)).toBe(false)
      expect(res.cookies.set).not.toHaveBeenCalled()
    })

    it('never renews an invalid token', async () => {
      const { jwtVerify } = await import('jose')
      mockCookieStore.get.mockReturnValue({ value: 'forged' })
      ;(jwtVerify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bad signature'))
      const res = response()
      const { renewSessionCookie } = await import('@/lib/auth/session')
      expect(await renewSessionCookie(res as never)).toBe(false)
      expect(res.cookies.set).not.toHaveBeenCalled()
    })
  })

  describe('withAuth integration', () => {
    it('passes a validated live userId to an authenticated route', async () => {
      const { jwtVerify } = await import('jose')
      const mockJwtVerify = jwtVerify as ReturnType<typeof vi.fn>

      mockCookieStore.get.mockReturnValue({ value: 'valid-jwt' })
      mockJwtVerify.mockResolvedValue({
        payload: { userId: 'user-789', username: 'authuser' },
      })

      const { withAuth } = await import('@/lib/api/with-auth')
      const handler = vi.fn((_request: unknown, userId: string) =>
        Response.json({ userId }, { status: 200 }),
      )
      const response = await withAuth(handler)()

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ userId: 'user-789' })
      expect(handler).toHaveBeenCalledOnce()
    })

    it('returns 401 without invoking the route when unauthenticated', async () => {
      mockCookieStore.get.mockReturnValue(undefined)

      const { withAuth } = await import('@/lib/api/with-auth')
      const handler = vi.fn(() => new Response(null, { status: 204 }))
      const response = await withAuth(handler)()

      expect(response.status).toBe(401)
      expect(handler).not.toHaveBeenCalled()
    })

    it('prevents a stale deleted-account session from reaching an authenticated route', async () => {
      const { jwtVerify } = await import('jose')
      const mockJwtVerify = jwtVerify as ReturnType<typeof vi.fn>
      mockCookieStore.get.mockReturnValue({ value: 'stale-jwt' })
      mockJwtVerify.mockResolvedValue({
        payload: { userId: 'deleted-user', username: 'former-user' },
      })

      const { withAuth } = await import('@/lib/api/with-auth')
      const handler = vi.fn(() => new Response(null, { status: 204 }))
      const response = await withAuth(handler)()

      expect(response.status).toBe(401)
      expect(handler).not.toHaveBeenCalled()
    })
  })
})
