import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

const PLATFORM_URLS = [
  'NEXT_PUBLIC_APP_URL',
  'APP_URL',
  'RENDER_EXTERNAL_URL',
  'RAILWAY_PUBLIC_DOMAIN',
  'FLY_APP_NAME',
  'COOLIFY_URL',
]

function clearAddresses() {
  for (const name of PLATFORM_URLS) vi.stubEnv(name, '')
}

async function claim(
  body: { code: string; email: string },
  headers: Record<string, string> = { Origin: 'http://192.168.1.10:3000' },
) {
  const { POST } = await import('@/app/api/setup/route')
  const res = await POST(
    new NextRequest('http://192.168.1.10:3000/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie') }
}

const roles = () =>
  testInstance.sqlite.prepare(`SELECT role, approval FROM users`).all() as Array<{
    role: string
    approval: string
  }>

describe('the secret a one-click install makes for itself', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-secret-'))
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('is made once, private, and read back after a restart', async () => {
    const { readOrMakeSecret } = await import('@/lib/auth/server-secret')
    const file = path.join(dir, 'data', 'session-secret')
    const first = readOrMakeSecret(file)
    expect(first.length).toBeGreaterThanOrEqual(32)
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
    expect(readOrMakeSecret(file)).toBe(first)
    expect(fs.readdirSync(path.dirname(file))).toEqual(['session-secret'])
  })

  it('refuses a damaged secret instead of signing with it', async () => {
    const { readOrMakeSecret } = await import('@/lib/auth/server-secret')
    const file = path.join(dir, 'session-secret')
    fs.writeFileSync(file, 'short')
    expect(() => readOrMakeSecret(file)).toThrow(/SESSION_SECRET/)
  })

  it('lets SESSION_SECRET win', async () => {
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(40))
    const { serverSecret } = await import('@/lib/auth/server-secret')
    expect(serverSecret()).toBe('x'.repeat(40))
  })
})

describe('this ADHX’s own address', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    clearAddresses()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('comes from the environment first, then the host', async () => {
    const { appUrl } = await import('@/lib/routes/app-url')
    vi.stubEnv('FLY_APP_NAME', 'my-adhx')
    expect(appUrl()).toBe('https://my-adhx.fly.dev')
    vi.stubEnv('RAILWAY_PUBLIC_DOMAIN', 'adhx-production.up.railway.app')
    expect(appUrl()).toBe('https://adhx-production.up.railway.app')
    vi.stubEnv('RENDER_EXTERNAL_URL', 'https://adhx.onrender.com')
    expect(appUrl()).toBe('https://adhx.onrender.com')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://adhx.example.com/')
    expect(appUrl()).toBe('https://adhx.example.com')
  })

  it('takes the first Coolify domain', async () => {
    const { appUrl } = await import('@/lib/routes/app-url')
    vi.stubEnv('COOLIFY_URL', 'https://adhx.example.net,https://www.adhx.example.net')
    expect(appUrl()).toBe('https://adhx.example.net')
  })

  it('remembers the setup address only when nothing names one', async () => {
    const { appUrl, rememberAppUrl } = await import('@/lib/routes/app-url')
    expect(appUrl()).toBe('http://localhost:3000')
    expect(rememberAppUrl('http://192.168.1.10:3000')).toBe(true)
    expect(appUrl()).toBe('http://192.168.1.10:3000')
    vi.stubEnv('APP_URL', 'https://adhx.example.com')
    expect(rememberAppUrl('http://elsewhere:3000')).toBe(false)
    expect(appUrl()).toBe('https://adhx.example.com')
  })
})

describe('POST /api/setup: making a fresh ADHX yours', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    vi.resetModules()
    clearAddresses()
    vi.stubEnv('SETUP_CODE', 'abcd-efgh-jkmn')
    const { __resetRateLimitState } = await import('@/lib/rate-limit')
    __resetRateLimitState()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('makes the person with the code the owner and signs them in', async () => {
    const res = await claim({ code: 'ABCD EFGH JKMN', email: 'Owner@Example.com' })
    expect(res.status).toBe(200)
    expect(res.body.next).toBe('/welcome?returnTo=%2Fnow')
    expect(res.cookie).toContain('adhx_session=')
    expect(roles()).toEqual([{ role: 'admin', approval: 'approved' }])
    const { appUrl } = await import('@/lib/routes/app-url')
    expect(appUrl()).toBe('http://192.168.1.10:3000')
  })

  it('keeps out anyone without the code', async () => {
    const res = await claim({ code: 'WRNG-CODE-HERE', email: 'stranger@example.com' })
    expect(res.status).toBe(403)
    expect(roles()).toEqual([])
  })

  it('works only once', async () => {
    expect((await claim({ code: 'ABCD-EFGH-JKMN', email: 'owner@example.com' })).status).toBe(200)
    const again = await claim({ code: 'ABCD-EFGH-JKMN', email: 'late@example.com' })
    expect(again.status).toBe(409)
    expect(roles().filter((r) => r.role === 'admin')).toHaveLength(1)
  })

  it('refuses another site’s form', async () => {
    const res = await claim(
      { code: 'ABCD-EFGH-JKMN', email: 'owner@example.com' },
      { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' },
    )
    expect(res.status).toBe(403)
    expect(roles()).toEqual([])
  })

  it('needs the configured address when there is one', async () => {
    vi.stubEnv('APP_URL', 'https://adhx.example.com')
    const res = await claim({ code: 'ABCD-EFGH-JKMN', email: 'owner@example.com' })
    expect(res.status).toBe(403)
  })

  it('slows down guessing', async () => {
    for (let i = 0; i < 10; i++) await claim({ code: `GUES-S000-000${i}`, email: 'x@example.com' })
    const res = await claim({ code: 'ABCD-EFGH-JKMN', email: 'owner@example.com' })
    expect(res.status).toBe(429)
  })
})

describe('the setup code', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is stable for a server and reads cleanly', async () => {
    vi.stubEnv('SETUP_CODE', '')
    vi.stubEnv('SESSION_SECRET', 's'.repeat(40))
    const { setupCode, matchesSetupCode, setupAnnouncement } = await import('@/lib/auth/setup-code')
    const code = setupCode()
    expect(code).toMatch(/^[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}$/)
    expect(setupCode()).toBe(code)
    expect(matchesSetupCode(code.toLowerCase())).toBe(true)
    expect(matchesSetupCode('')).toBe(false)
    expect(setupAnnouncement('https://adhx.example.com')[1]).toContain(
      `https://adhx.example.com/setup?code=${code}`,
    )
  })
})
