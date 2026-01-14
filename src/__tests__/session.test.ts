import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock jose module
vi.mock('jose', () => ({
  SignJWT: vi.fn().mockImplementation(() => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue('mock-jwt-token'),
  })),
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

describe('Session Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  describe('requireAuth', () => {
    it('should return userId when authenticated', async () => {
      const { jwtVerify } = await import('jose')
      const mockJwtVerify = jwtVerify as ReturnType<typeof vi.fn>

      mockCookieStore.get.mockReturnValue({ value: 'valid-jwt' })
      mockJwtVerify.mockResolvedValue({
        payload: { userId: 'user-789', username: 'authuser' },
      })

      const { requireAuth } = await import('@/lib/auth/session')
      const userId = await requireAuth()

      expect(userId).toBe('user-789')
    })

    it('should throw when not authenticated', async () => {
      mockCookieStore.get.mockReturnValue(undefined)

      const { requireAuth } = await import('@/lib/auth/session')

      await expect(requireAuth()).rejects.toThrow('Unauthorized')
    })
  })
})
