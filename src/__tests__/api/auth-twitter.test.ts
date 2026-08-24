import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, type TestDbInstance } from './setup'

/**
 * API Route Tests: GET /api/auth/twitter
 *
 * X OAuth starts a Settings *link* for bookmark sync. It is not a sign-in
 * method — unsigned visitors bounce home.
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

vi.mock('@/lib/sentry', () => ({
  metrics: {
    authStarted: vi.fn(),
    authFailed: vi.fn(),
  },
}))

vi.mock('@/lib/analytics/record', () => ({
  recordAnalytic: vi.fn(),
}))

vi.stubEnv('TWITTER_CLIENT_ID', 'test-client-id')
vi.stubEnv('TWITTER_CLIENT_SECRET', 'test-client-secret')
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')

describe('API: GET /api/auth/twitter', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = null
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    testInstance.close()
  })

  it('bounces unsigned visitors — X is not a sign-in method', async () => {
    const { GET } = await import('@/app/api/auth/twitter/route')
    const response = await GET(new NextRequest('http://localhost:3000/api/auth/twitter'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost:3000/?auth_error=x_link_only')
  })

  it('starts OAuth when a session is present', async () => {
    mockUserId = 'u_email'
    const { GET } = await import('@/app/api/auth/twitter/route')
    const response = await GET(new NextRequest('http://localhost:3000/api/auth/twitter'))

    expect(response.status).toBe(307)
    const location = response.headers.get('location')
    expect(location).toMatch(/twitter\.com|x\.com/)
    expect(location).toContain('client_id=test-client-id')
  })
})
