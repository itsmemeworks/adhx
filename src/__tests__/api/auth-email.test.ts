import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/auth/email/request, /api/auth/email/callback,
 * /api/auth/email/change
 *
 * Tests the email magic-link sign-in flow: token creation + rate-limiting,
 * consuming a token (new account / existing account / expired / used /
 * garbage), returnTo sanitization, and the authed email-change flow
 * (including the "someone claimed it first" race).
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

// getCurrentUserId (used by withAuth on the /change route) reads the session
// via cookies() from next/headers, which throws outside a real request scope
// in this test harness. Mock just that; setSessionCookie/clearSessionCookie
// are kept real (they only touch NextResponse.cookies).
vi.mock('@/lib/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/session')>('@/lib/auth/session')
  return {
    ...actual,
    getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
  }
})

type SendMagicLinkArgs = { email: string; url: string; intent: string }
const mockSendMagicLinkEmail = vi.fn((_args: SendMagicLinkArgs) => Promise.resolve({ ok: true }))
vi.mock('@/lib/email/magic-link', () => ({
  sendMagicLinkEmail: (args: SendMagicLinkArgs) => mockSendMagicLinkEmail(args),
}))

vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')

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

/** Runs /api/auth/email/request and returns the raw token from the emailed URL. */
async function requestToken(email: string, returnTo?: string): Promise<string> {
  const { POST } = await import('@/app/api/auth/email/request/route')
  const response = await POST(postRequest('/api/auth/email/request', { email, returnTo }))
  expect(response.status).toBe(200)
  const call = mockSendMagicLinkEmail.mock.calls.at(-1)![0] as { url: string }
  return new URL(call.url).searchParams.get('token')!
}

describe('API: /api/auth/email/*', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = null
    mockSendMagicLinkEmail.mockClear()
    mockSendMagicLinkEmail.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('POST /api/auth/email/request', () => {
    it('creates a login token row and emails the magic link', async () => {
      const { POST } = await import('@/app/api/auth/email/request/route')
      const response = await POST(
        postRequest('/api/auth/email/request', { email: 'Reader@Example.com' }),
      )

      expect(response.status).toBe(200)
      expect((await response.json()).ok).toBe(true)

      expect(mockSendMagicLinkEmail).toHaveBeenCalledTimes(1)
      const call = mockSendMagicLinkEmail.mock.calls[0][0] as {
        email: string
        intent: string
        url: string
      }
      expect(call.email).toBe('reader@example.com') // lowercased
      expect(call.intent).toBe('signin')
      expect(call.url).toContain('/api/auth/email/callback?token=')

      const rows = await testInstance.db.select().from(schema.loginTokens)
      expect(rows).toHaveLength(1)
      expect(rows[0].email).toBe('reader@example.com')
      expect(rows[0].intent).toBe('signin')
      expect(rows[0].usedAt).toBeNull()
    })

    it('rejects a malformed email with 400', async () => {
      const { POST } = await import('@/app/api/auth/email/request/route')
      const response = await POST(postRequest('/api/auth/email/request', { email: 'not-an-email' }))
      expect(response.status).toBe(400)
      expect(mockSendMagicLinkEmail).not.toHaveBeenCalled()
    })

    it('rate-limits a second request for the same email within 60s', async () => {
      const { POST } = await import('@/app/api/auth/email/request/route')
      await POST(postRequest('/api/auth/email/request', { email: 'reader@example.com' }))
      const response = await POST(
        postRequest('/api/auth/email/request', { email: 'reader@example.com' }),
      )
      expect(response.status).toBe(429)
      expect(mockSendMagicLinkEmail).toHaveBeenCalledTimes(1)

      const rows = await testInstance.db.select().from(schema.loginTokens)
      expect(rows).toHaveLength(1) // second request never created a token
    })

    it('releases the rate limit when the email fails to send (503 is retryable)', async () => {
      mockSendMagicLinkEmail.mockResolvedValueOnce({ ok: false })
      const { POST } = await import('@/app/api/auth/email/request/route')
      const first = await POST(
        postRequest('/api/auth/email/request', { email: 'retry@example.com' }),
      )
      expect(first.status).toBe(503)
      // The failed attempt's token is deleted so the 60s hold doesn't apply…
      const rows = await testInstance.db.select().from(schema.loginTokens)
      expect(rows).toHaveLength(0)
      // …and an immediate retry succeeds instead of 429ing.
      const second = await POST(
        postRequest('/api/auth/email/request', { email: 'retry@example.com' }),
      )
      expect(second.status).toBe(200)
    })

    it('drops an open-redirect returnTo (https://evil.com)', async () => {
      const { POST } = await import('@/app/api/auth/email/request/route')
      await POST(
        postRequest('/api/auth/email/request', {
          email: 'reader@example.com',
          returnTo: 'https://evil.com',
        }),
      )
      const rows = await testInstance.db.select().from(schema.loginTokens)
      expect(rows[0].returnTo).toBeNull()
    })

    it('drops a protocol-relative returnTo (//evil.com)', async () => {
      const { POST } = await import('@/app/api/auth/email/request/route')
      await POST(
        postRequest('/api/auth/email/request', {
          email: 'reader@example.com',
          returnTo: '//evil.com',
        }),
      )
      const rows = await testInstance.db.select().from(schema.loginTokens)
      expect(rows[0].returnTo).toBeNull()
    })

    it('keeps a legit same-origin returnTo', async () => {
      const { POST } = await import('@/app/api/auth/email/request/route')
      await POST(
        postRequest('/api/auth/email/request', { email: 'reader@example.com', returnTo: '/feed' }),
      )
      const rows = await testInstance.db.select().from(schema.loginTokens)
      expect(rows[0].returnTo).toBe('/feed')
    })
  })

  describe('GET /api/auth/email/callback (signin)', () => {
    it('creates a new user + email identity + session on first sign-in', async () => {
      const token = await requestToken('newreader@example.com')

      const { GET } = await import('@/app/api/auth/email/callback/route')
      const response = await GET(getRequest(`/api/auth/email/callback?token=${token}`))

      expect(response.status).toBe(307)
      // New account -> one-shot username prompt before landing at the
      // original destination.
      expect(response.headers.get('location')).toBe('http://localhost:3000/welcome?returnTo=%2F')
      const cookies = response.headers.getSetCookie()
      expect(cookies.some((c) => c.includes('adhx_session'))).toBe(true)

      const userRows = await testInstance.db.select().from(schema.users)
      expect(userRows).toHaveLength(1)
      expect(userRows[0].email).toBe('newreader@example.com')

      const identityRows = await testInstance.db.select().from(schema.userIdentities)
      expect(identityRows).toHaveLength(1)
      expect(identityRows[0].provider).toBe('email')
      expect(identityRows[0].providerId).toBe('newreader@example.com')
      expect(identityRows[0].userId).toBe(userRows[0].id)
    })

    it('redirects to /welcome carrying a safe returnTo for a new account', async () => {
      const token = await requestToken('returner@example.com', '/feed')
      const { GET } = await import('@/app/api/auth/email/callback/route')
      const response = await GET(getRequest(`/api/auth/email/callback?token=${token}`))
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/welcome?returnTo=%2Ffeed',
      )
    })

    it('reuses the existing account on a second sign-in for the same email, redirecting directly (no /welcome)', async () => {
      const { GET } = await import('@/app/api/auth/email/callback/route')

      const token1 = await requestToken('again@example.com')
      await GET(getRequest(`/api/auth/email/callback?token=${token1}`))

      const token2 = await requestToken('again@example.com')
      const second = await GET(getRequest(`/api/auth/email/callback?token=${token2}`))
      expect(second.headers.get('location')).toBe('http://localhost:3000/')

      const userRows = await testInstance.db.select().from(schema.users)
      expect(userRows).toHaveLength(1)
      const identityRows = await testInstance.db.select().from(schema.userIdentities)
      expect(identityRows).toHaveLength(1)
    })

    it('rejects a garbage/unknown token', async () => {
      const { GET } = await import('@/app/api/auth/email/callback/route')
      const response = await GET(getRequest('/api/auth/email/callback?token=garbage-token'))
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('auth_error=invalid_link')
    })

    it('rejects a token missing entirely', async () => {
      const { GET } = await import('@/app/api/auth/email/callback/route')
      const response = await GET(getRequest('/api/auth/email/callback'))
      expect(response.headers.get('location')).toContain('auth_error=invalid_link')
    })

    it('rejects a used token (single-use)', async () => {
      const token = await requestToken('oneshot@example.com')
      const { GET } = await import('@/app/api/auth/email/callback/route')
      await GET(getRequest(`/api/auth/email/callback?token=${token}`))
      const second = await GET(getRequest(`/api/auth/email/callback?token=${token}`))
      expect(second.headers.get('location')).toContain('auth_error=invalid_link')
    })

    it('rejects an expired token', async () => {
      const token = await requestToken('expired@example.com')
      await testInstance.db.update(schema.loginTokens).set({ expiresAt: Date.now() - 1_000 })

      const { GET } = await import('@/app/api/auth/email/callback/route')
      const response = await GET(getRequest(`/api/auth/email/callback?token=${token}`))
      expect(response.headers.get('location')).toContain('auth_error=invalid_link')
    })
  })

  describe('POST /api/auth/email/change (authed)', () => {
    it('401s when unauthenticated', async () => {
      mockUserId = null
      const { POST } = await import('@/app/api/auth/email/change/route')
      const response = await POST(postRequest('/api/auth/email/change', { email: 'x@example.com' }))
      expect(response.status).toBe(401)
    })

    it('sends a change token and links the new email on confirm', async () => {
      await testInstance.db.insert(schema.users).values({ id: 'user-1', username: 'user1' })
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/email/change/route')
      const response = await POST(
        postRequest('/api/auth/email/change', { email: 'new@example.com' }),
      )
      expect(response.status).toBe(200)

      const call = mockSendMagicLinkEmail.mock.calls.at(-1)![0] as { url: string; intent: string }
      expect(call.intent).toBe('change')
      const token = new URL(call.url).searchParams.get('token')!

      const { GET } = await import('@/app/api/auth/email/callback/route')
      const callbackResponse = await GET(getRequest(`/api/auth/email/callback?token=${token}`))
      expect(callbackResponse.headers.get('location')).toBe(
        'http://localhost:3000/settings?email_changed=1',
      )
      // Confirming an email change must not touch the session.
      expect(callbackResponse.headers.getSetCookie()).toHaveLength(0)

      const [user] = await testInstance.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 'user-1'))
      expect(user.email).toBe('new@example.com')
    })

    it('409s immediately when the email is already on another account', async () => {
      await testInstance.db.insert(schema.users).values([
        { id: 'user-1', username: 'user1' },
        { id: 'user-2', username: 'user2', email: 'taken@example.com' },
      ])
      await testInstance.db.insert(schema.userIdentities).values({
        provider: 'email',
        providerId: 'taken@example.com',
        userId: 'user-2',
      })
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/email/change/route')
      const response = await POST(
        postRequest('/api/auth/email/change', { email: 'taken@example.com' }),
      )
      expect(response.status).toBe(409)
      expect(mockSendMagicLinkEmail).not.toHaveBeenCalled()
    })

    it('redirects with auth_error=email_in_use if the email is claimed between request and confirm', async () => {
      await testInstance.db.insert(schema.users).values([
        { id: 'user-1', username: 'user1' },
        { id: 'user-2', username: 'user2' },
      ])
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/email/change/route')
      await POST(postRequest('/api/auth/email/change', { email: 'race@example.com' }))
      const call = mockSendMagicLinkEmail.mock.calls.at(-1)![0] as { url: string }
      const token = new URL(call.url).searchParams.get('token')!

      // Someone else claims the email before the link is clicked.
      await testInstance.db.insert(schema.userIdentities).values({
        provider: 'email',
        providerId: 'race@example.com',
        userId: 'user-2',
      })

      const { GET } = await import('@/app/api/auth/email/callback/route')
      const response = await GET(getRequest(`/api/auth/email/callback?token=${token}`))
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/settings?auth_error=email_in_use',
      )
    })
  })
})
