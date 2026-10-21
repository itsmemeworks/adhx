import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, type TestDbInstance } from './setup'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/analytics/record', () => ({ recordAnalytic: vi.fn() }))
vi.mock('@/emails/magic-link', () => ({ MagicLinkEmail: () => null }))
vi.mock('react-email', () => ({
  render: async () => '<p>Sign in</p>',
  toPlainText: () => 'Sign in',
}))

const sendMail = vi.fn(async (_message: unknown) => ({}))
const createTransport = vi.fn((_options: unknown) => ({ sendMail, close: vi.fn() }))
vi.mock('nodemailer', () => ({ default: { createTransport }, createTransport }))

const request = (email: string) =>
  new NextRequest('http://localhost:3000/api/auth/email/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })

async function ask(email: string) {
  const { POST } = await import('@/app/api/auth/email/request/route')
  const res = await POST(request(email))
  return { status: res.status, body: await res.json() }
}

async function open(url: string) {
  const { POST } = await import('@/app/api/auth/email/callback/route')
  return POST(
    new NextRequest('http://localhost:3000/api/auth/email/callback', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: new URL(url).searchParams.get('token')! }),
    }),
  )
}

const roleOf = (email: string) =>
  (
    testInstance.sqlite
      .prepare(
        `SELECT u.role FROM users u JOIN user_identities i ON i.user_id = u.id WHERE i.provider = 'email' AND i.provider_id = ?`,
      )
      .get(email) as { role: string } | undefined
  )?.role

function makeAdmin(email: string) {
  testInstance.sqlite
    .prepare(`INSERT INTO users (id, username, role, email) VALUES ('admin1', 'owner', 'admin', ?)`)
    .run(email)
  testInstance.sqlite
    .prepare(
      `INSERT INTO user_identities (provider, provider_id, user_id) VALUES ('email', ?, 'admin1')`,
    )
    .run(email)
}

describe('getting sign-in links to people without Resend', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
    vi.stubEnv('RESEND_API_KEY', '')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    testInstance.close()
  })

  describe('SMTP', () => {
    it('reads smtp:// and smtps:// addresses', async () => {
      const { smtpOptions } = await import('@/lib/email/magic-link')
      expect(smtpOptions('smtps://me%40home.example:p%40ss@mail.example.com')).toMatchObject({
        host: 'mail.example.com',
        port: 465,
        secure: true,
        auth: { user: 'me@home.example', pass: 'p@ss' },
      })
      expect(smtpOptions('smtp://mail.example.com:2525')).toMatchObject({
        port: 2525,
        secure: false,
        auth: undefined,
      })
      expect(() => smtpOptions('https://mail.example.com')).toThrow()
    })

    it('emails the link through your own mail server', async () => {
      vi.stubEnv('SMTP_URL', 'smtp://user:pass@mail.example.com:587')
      vi.stubEnv('EMAIL_FROM', 'ADHX <adhx@home.example>')
      const { status, body } = await ask('friend@example.com')
      expect(status).toBe(200)
      expect(body).toEqual({ ok: true, delivery: 'email' })
      expect(createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'mail.example.com', port: 587 }),
      )
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'friend@example.com',
          from: 'ADHX <adhx@home.example>',
          subject: 'Your ADHX sign-in link',
        }),
      )
    })

    it('says so when the mail server fails, and lets them try again at once', async () => {
      vi.stubEnv('SMTP_URL', 'smtp://mail.example.com')
      sendMail.mockRejectedValueOnce(new Error('connection refused'))
      expect((await ask('friend@example.com')).status).toBe(503)
      sendMail.mockResolvedValueOnce({})
      expect((await ask('friend@example.com')).status).toBe(200)
    })
  })

  describe('links handed over by an admin', () => {
    beforeEach(() => {
      vi.stubEnv('EMAIL_LINKS_TO_ADMIN', '1')
    })

    it('keeps admin-held links usable for 60 minutes without extending the resend cooldown', async () => {
      makeAdmin('owner@home.example')
      vi.stubEnv('ALLOWED_EMAILS', '@friends.example')
      const now = Date.now()
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
      await ask('longhand@friends.example')
      const { pendingAdminSignInLinks } = await import('@/lib/email/magic-link')
      const [held] = pendingAdminSignInLinks()
      expect(held.expiresAt).toBe(now + 60 * 60_000)
      expect((await ask('longhand@friends.example')).status).toBe(429)
      clock.mockReturnValue(now + 61_000)
      expect((await ask('longhand@friends.example')).status).toBe(200)
      clock.mockReturnValue(now + 59 * 60_000)
      const { GET } = await import('@/app/api/auth/email/callback/route')
      expect((await GET(new NextRequest(held.url))).status).toBe(200)
      expect(pendingAdminSignInLinks()).toHaveLength(2)
      expect((await open(held.url)).status).toBe(303)
      expect(pendingAdminSignInLinks()).toHaveLength(1)
      clock.mockReturnValue(now + 62 * 60_000)
      expect(pendingAdminSignInLinks()).toHaveLength(0)
    })

    it('handles legacy SQLite UTC creation timestamps with the one-minute resend cooldown', async () => {
      makeAdmin('owner@home.example')
      vi.stubEnv('ALLOWED_EMAILS', '@friends.example')
      const now = Date.now()
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
      await ask('legacy@friends.example')
      testInstance.sqlite
        .prepare('UPDATE login_tokens SET created_at = ?')
        .run(new Date(now).toISOString().slice(0, 19).replace('T', ' '))
      expect((await ask('legacy@friends.example')).status).toBe(429)
      clock.mockReturnValue(now + 61_000)
      expect((await ask('legacy@friends.example')).status).toBe(200)
    })

    it('holds the owner’s first link and prints it in the server log', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { body } = await ask('owner@home.example')
      expect(body).toEqual({ ok: true, delivery: 'admin', setup: true })
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('owner@home.example'))
      const { pendingAdminSignInLinks } = await import('@/lib/email/magic-link')
      const [held] = pendingAdminSignInLinks()
      expect(held).toMatchObject({ email: 'owner@home.example', intent: 'signin' })
      expect(held.url).toMatch(/^http:\/\/localhost:3000\/api\/auth\/email\/callback\?token=/)
      warn.mockRestore()
    })

    it('lets the owner in before there’s an admin, even off the invite list, and makes them the admin', async () => {
      vi.stubEnv('ALLOWED_EMAILS', '@friends.example')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect((await ask('owner@home.example')).body).toEqual({
        ok: true,
        delivery: 'admin',
        setup: true,
      })
      expect((await ask('sam@friends.example')).body.delivery).toBe('admin')
      const { pendingAdminSignInLinks } = await import('@/lib/email/magic-link')
      const links = pendingAdminSignInLinks()
      const link = (email: string) => links.find((l) => l.email === email)!.url

      const res = await open(link('owner@home.example'))
      expect(res.headers.get('location')).toContain('/welcome')
      expect(roleOf('owner@home.example')).toBe('admin')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('is now the admin'))

      // The next person in is a friend, not a second admin.
      await open(link('sam@friends.example'))
      expect(roleOf('sam@friends.example')).toBe('user')
      // And with an admin, the invite list applies again.
      expect((await ask('someone@home.example')).status).toBe(403)
      warn.mockRestore()
    })

    it('makes nobody admin when links are emailed', async () => {
      vi.stubEnv('EMAIL_LINKS_TO_ADMIN', '')
      vi.stubEnv('SMTP_URL', 'smtp://mail.example.com')
      const { createLoginToken } = await import('@/lib/auth/account')
      const token = await createLoginToken({ email: 'first@home.example', intent: 'signin' })
      await open(`http://localhost:3000/api/auth/email/callback?token=${token}`)
      expect(roleOf('first@home.example')).toBe('user')
    })

    it('once there’s an admin, holds links for invited people without logging them', async () => {
      makeAdmin('owner@home.example')
      vi.stubEnv('ALLOWED_EMAILS', '@friends.example')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect((await ask('sam@friends.example')).body).toEqual({ ok: true, delivery: 'admin' })
      expect(warn).not.toHaveBeenCalled()
      warn.mockRestore()
    })

    it('turns away strangers instead of filling the admin page', async () => {
      makeAdmin('owner@home.example')
      const { status } = await ask('stranger@elsewhere.example')
      expect(status).toBe(403)
      const { pendingAdminSignInLinks } = await import('@/lib/email/magic-link')
      expect(pendingAdminSignInLinks()).toEqual([])
    })

    it('drops a link from the list once it has been used, or removed', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      await ask('owner@home.example')
      const { pendingAdminSignInLinks, discardAdminSignInLink } =
        await import('@/lib/email/magic-link')
      const [held] = pendingAdminSignInLinks()
      testInstance.sqlite
        .prepare(`UPDATE login_tokens SET used_at = ? WHERE token_hash = ?`)
        .run(new Date().toISOString(), held.tokenHash)
      expect(pendingAdminSignInLinks()).toEqual([])
      expect(discardAdminSignInLink(held.tokenHash)).toBe(true)
      expect(discardAdminSignInLink(held.tokenHash)).toBe(false)
    })
  })

  it('still expires emailed links after 15 minutes', async () => {
    vi.stubEnv('SMTP_URL', 'smtp://mail.example.com')
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    await ask('emailed@example.com')
    const token = testInstance.sqlite.prepare('SELECT expires_at FROM login_tokens').get() as {
      expires_at: number
    }
    expect(token.expires_at).toBe(now + 15 * 60_000)
    clock.mockReturnValue(now + 16 * 60_000)
    const { hasRecentLoginToken } = await import('@/lib/auth/account')
    expect(await hasRecentLoginToken('emailed@example.com')).toBe(false)
  })

  it('refuses in production with no way to deliver links', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { signInDelivery } = await import('@/lib/email/magic-link')
    expect(signInDelivery()).toBeNull()
    expect((await ask('friend@example.com')).status).toBe(503)
  })
})
