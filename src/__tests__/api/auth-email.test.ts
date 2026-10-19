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
  signInDelivery: () => 'email',
}))

vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')

function postRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function confirmRequest(path: string): NextRequest {
  const token = new URL(path, 'http://localhost:3000').searchParams.get('token')
  return new NextRequest('http://localhost:3000/api/auth/email/callback', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:3000',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(token ? { token } : {}),
  })
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

  describe('safe link confirmation', () => {
    it('keeps repeated GET and HEAD previews from consuming a link or creating a session', async () => {
      const token = await requestToken('preview@example.com', '/channels')
      const { GET, POST } = await import('@/app/api/auth/email/callback/route')
      for (const method of ['GET', 'HEAD', 'GET']) {
        const response = await GET(
          new NextRequest(`http://localhost:3000/api/auth/email/callback?token=${token}`, {
            method,
          }),
        )
        expect(response.status).toBe(200)
        expect(response.headers.getSetCookie()).toHaveLength(0)
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('referrer-policy')).toBe('same-origin')
        expect(response.headers.get('content-security-policy')).toContain("form-action 'self'")
        const html = await response.text()
        expect(html).toContain('method="post"')
        expect(html).not.toContain('<script')
      }
      expect(await testInstance.db.select().from(schema.users)).toHaveLength(0)
      expect((await testInstance.db.select().from(schema.loginTokens))[0].usedAt).toBeNull()
      const signedIn = await POST(confirmRequest(`/api/auth/email/callback?token=${token}`))
      expect(signedIn.status).toBe(303)
      expect(signedIn.headers.getSetCookie().join(';')).toContain('adhx_session=')
      expect(signedIn.headers.get('location')).toContain('/welcome?returnTo=%2Fchannels')
      const reused = await GET(
        new NextRequest(`http://localhost:3000/api/auth/email/callback?token=${token}`),
      )
      expect(reused.status).toBe(410)
      expect(await reused.text()).toContain('Get a new sign-in link')
    })

    it('rejects cross-origin confirmation without consuming the link', async () => {
      const token = await requestToken('csrf@example.com')
      const { POST } = await import('@/app/api/auth/email/callback/route')
      const origins: Record<string, string>[] = [
        { Origin: 'https://evil.example' },
        {},
        { Origin: 'http://localhost:3000', 'Sec-Fetch-Site': 'cross-site' },
      ]
      for (const headers of origins) {
        const response = await POST(
          new NextRequest('http://localhost:3000/api/auth/email/callback', {
            method: 'POST',
            headers,
            body: new URLSearchParams({ token }),
          }),
        )
        expect(response.status).toBe(403)
        expect((await testInstance.db.select().from(schema.loginTokens))[0].usedAt).toBeNull()
      }
      expect((await POST(confirmRequest(`/api/auth/email/callback?token=${token}`))).status).toBe(
        303,
      )
    })

    it('shows an actionable error for an invalid GET rather than silently returning home', async () => {
      const { GET } = await import('@/app/api/auth/email/callback/route')
      const response = await GET(
        new NextRequest('http://localhost:3000/api/auth/email/callback?token=%22%3E%3Cscript%3E'),
      )
      expect(response.status).toBe(410)
      const html = await response.text()
      expect(html).toContain('expired or has already been used')
      expect(html).not.toContain('<script>')
      expect(response.headers.get('location')).toBeNull()
    })

    it('resumes username setup after an earlier sign-in did not finish onboarding', async () => {
      const { POST } = await import('@/app/api/auth/email/callback/route')
      const first = await requestToken('unfinished@example.com')
      await POST(confirmRequest(`/api/auth/email/callback?token=${first}`))
      const second = await requestToken('unfinished@example.com')
      const response = await POST(confirmRequest(`/api/auth/email/callback?token=${second}`))
      expect(response.headers.get('location')).toContain('/welcome?')
      expect(await testInstance.db.select().from(schema.users)).toHaveLength(1)
    })

    it('rejects oversized or non-form submissions without consuming their token', async () => {
      const token = await requestToken('bounded@example.com')
      const { POST } = await import('@/app/api/auth/email/callback/route')
      for (const [type, body] of [
        ['application/json', JSON.stringify({ token })],
        ['application/x-www-form-urlencoded', `padding=${'x'.repeat(1024)}&token=${token}`],
      ]) {
        const response = await POST(
          new NextRequest('http://localhost:3000/api/auth/email/callback', {
            method: 'POST',
            headers: { Origin: 'http://localhost:3000', 'Content-Type': type },
            body,
          }),
        )
        expect(response.status).toBe(410)
        expect((await testInstance.db.select().from(schema.loginTokens))[0].usedAt).toBeNull()
      }
    })

    it('keeps production session-cookie protections on successful confirmation', async () => {
      const token = await requestToken('cookie@example.com')
      const { POST } = await import('@/app/api/auth/email/callback/route')
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('SESSION_SECRET', 'isolated-production-cookie-test')
      try {
        const response = await POST(confirmRequest(`/api/auth/email/callback?token=${token}`))
        const cookie = response.headers.getSetCookie().join(';')
        for (const flag of ['HttpOnly', 'Secure', 'SameSite=lax', 'Path=/'])
          expect(cookie).toContain(flag)
      } finally {
        vi.unstubAllEnvs()
      }
    })
  })

  describe('POST /api/auth/email/callback (signin)', () => {
    it('creates a new user + email identity + session on first sign-in', async () => {
      const token = await requestToken('newreader@example.com')

      const { POST: confirm } = await import('@/app/api/auth/email/callback/route')
      const response = await confirm(confirmRequest(`/api/auth/email/callback?token=${token}`))

      expect(response.status).toBe(303)
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
      const { POST: confirm } = await import('@/app/api/auth/email/callback/route')
      const response = await confirm(confirmRequest(`/api/auth/email/callback?token=${token}`))
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/welcome?returnTo=%2Ffeed',
      )
    })

    it('reuses the existing account on a second sign-in for the same email, redirecting directly (no /welcome)', async () => {
      const { POST: confirm } = await import('@/app/api/auth/email/callback/route')

      const token1 = await requestToken('again@example.com')
      await confirm(confirmRequest(`/api/auth/email/callback?token=${token1}`))
      await testInstance.db.update(schema.users).set({ usernameChosen: true })

      const token2 = await requestToken('again@example.com')
      const second = await confirm(confirmRequest(`/api/auth/email/callback?token=${token2}`))
      expect(second.headers.get('location')).toBe('http://localhost:3000/')

      const userRows = await testInstance.db.select().from(schema.users)
      expect(userRows).toHaveLength(1)
      const identityRows = await testInstance.db.select().from(schema.userIdentities)
      expect(identityRows).toHaveLength(1)
    })

    it('rejects a garbage/unknown token', async () => {
      const { POST: confirm } = await import('@/app/api/auth/email/callback/route')
      const response = await confirm(confirmRequest('/api/auth/email/callback?token=garbage-token'))
      expect(response.status).toBe(410)
      expect(await response.text()).toContain('expired or has already been used')
    })

    it('rejects a token missing entirely', async () => {
      const { POST: confirm } = await import('@/app/api/auth/email/callback/route')
      const response = await confirm(confirmRequest('/api/auth/email/callback'))
      expect(response.status).toBe(410)
    })

    it('rejects a used token (single-use)', async () => {
      const token = await requestToken('oneshot@example.com')
      const { POST: confirm } = await import('@/app/api/auth/email/callback/route')
      await confirm(confirmRequest(`/api/auth/email/callback?token=${token}`))
      const second = await confirm(confirmRequest(`/api/auth/email/callback?token=${token}`))
      expect(second.status).toBe(410)
    })

    it('allows only one of two concurrent callbacks to consume a sign-in token', async () => {
      const token = await requestToken('parallel@example.com')
      const { POST: confirm } = await import('@/app/api/auth/email/callback/route')

      const responses = await Promise.all([
        confirm(confirmRequest(`/api/auth/email/callback?token=${token}`)),
        confirm(confirmRequest(`/api/auth/email/callback?token=${token}`)),
      ])
      const locations = responses.map((response) => response.headers.get('location'))

      expect(locations.filter((location) => location?.includes('/welcome?'))).toHaveLength(1)
      expect(responses.filter((response) => response.status === 410)).toHaveLength(1)
      expect(await testInstance.db.select().from(schema.users)).toHaveLength(1)
      expect(await testInstance.db.select().from(schema.userIdentities)).toHaveLength(1)
    })

    it('resolves two distinct concurrent sign-in links for one email to one account', async () => {
      const { createLoginToken } = await import('@/lib/auth/account')
      const [firstToken, secondToken] = await Promise.all([
        createLoginToken({ email: 'distinct@example.com', intent: 'signin' }),
        createLoginToken({ email: 'distinct@example.com', intent: 'signin' }),
      ])
      const { POST: confirm } = await import('@/app/api/auth/email/callback/route')

      const responses = await Promise.all([
        confirm(confirmRequest(`/api/auth/email/callback?token=${firstToken}`)),
        confirm(confirmRequest(`/api/auth/email/callback?token=${secondToken}`)),
      ])
      expect(
        responses.every((response) => !response.headers.get('location')?.includes('auth_error')),
      ).toBe(true)
      expect(
        responses.every((response) =>
          response.headers.getSetCookie().some((cookie) => cookie.includes('adhx_session')),
        ),
      ).toBe(true)
      expect(await testInstance.db.select().from(schema.users)).toHaveLength(1)
      expect(await testInstance.db.select().from(schema.userIdentities)).toEqual([
        expect.objectContaining({
          provider: 'email',
          providerId: 'distinct@example.com',
        }),
      ])
    })

    it('rejects an expired token', async () => {
      const token = await requestToken('expired@example.com')
      await testInstance.db.update(schema.loginTokens).set({ expiresAt: Date.now() - 1_000 })

      const { POST: confirm } = await import('@/app/api/auth/email/callback/route')
      const response = await confirm(confirmRequest(`/api/auth/email/callback?token=${token}`))
      expect(response.status).toBe(410)
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

      const { POST: confirm } = await import('@/app/api/auth/email/callback/route')
      const callbackResponse = await confirm(
        confirmRequest(`/api/auth/email/callback?token=${token}`),
      )
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

    it('allows only one of two concurrent callbacks to consume an email-change token', async () => {
      await testInstance.db.insert(schema.users).values({ id: 'user-1', username: 'user1' })
      mockUserId = 'user-1'

      const { POST } = await import('@/app/api/auth/email/change/route')
      await POST(postRequest('/api/auth/email/change', { email: 'parallel-change@example.com' }))
      const call = mockSendMagicLinkEmail.mock.calls.at(-1)![0] as { url: string }
      const token = new URL(call.url).searchParams.get('token')!
      const { POST: confirm } = await import('@/app/api/auth/email/callback/route')

      const responses = await Promise.all([
        confirm(confirmRequest(`/api/auth/email/callback?token=${token}`)),
        confirm(confirmRequest(`/api/auth/email/callback?token=${token}`)),
      ])
      const locations = responses.map((response) => response.headers.get('location'))

      expect(
        locations.filter((location) => location?.includes('/settings?email_changed=1')),
      ).toHaveLength(1)
      expect(responses.filter((response) => response.status === 410)).toHaveLength(1)
      const [user] = await testInstance.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 'user-1'))
      expect(user.email).toBe('parallel-change@example.com')
      expect(await testInstance.db.select().from(schema.userIdentities)).toHaveLength(1)
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

      const { POST: confirm } = await import('@/app/api/auth/email/callback/route')
      const response = await confirm(confirmRequest(`/api/auth/email/callback?token=${token}`))
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/settings?auth_error=email_in_use',
      )
    })
  })
})
