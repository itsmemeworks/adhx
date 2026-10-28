import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const cookieStore = { get: vi.fn(() => undefined), set: vi.fn() }
vi.mock('next/headers', () => ({ cookies: vi.fn(() => Promise.resolve(cookieStore)) }))

describe('the demo gate', () => {
  it('lets reading through and refuses every change', async () => {
    const { demoRefuses } = await import('@/lib/demo/mode')
    expect(demoRefuses('GET', '/now')).toBe(false)
    expect(demoRefuses('GET', '/api/feed')).toBe(false)
    expect(demoRefuses('HEAD', '/api/files/youtube/x/video-1')).toBe(false)
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
      expect(demoRefuses(method, '/api/bookmarks/add')).toBe(true)
    expect(demoRefuses('post', '/api/setup')).toBe(true)
  })

  it('refuses the reads that would start something', async () => {
    const { demoRefuses } = await import('@/lib/demo/mode')
    expect(demoRefuses('GET', '/api/auth/twitter')).toBe(true)
    expect(demoRefuses('GET', '/api/auth/twitter/callback')).toBe(true)
    expect(demoRefuses('GET', '/api/sync')).toBe(true)
    expect(demoRefuses('GET', '/invite/abc')).toBe(true)
    expect(demoRefuses('GET', '/api/auth/twitter-status')).toBe(false)
  })
})

describe('demo visitors', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    vi.resetModules()
    testInstance.sqlite
      .prepare(`INSERT INTO users (id, username, role) VALUES ('u_demo_sam', 'sam', 'admin')`)
      .run()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('are the demo person when the demo is on', async () => {
    vi.stubEnv('DEMO_MODE', '1')
    const { getCurrentUserId } = await import('@/lib/auth/session')
    expect(await getCurrentUserId()).toBe('u_demo_sam')
  })

  it('stay signed out everywhere else', async () => {
    vi.stubEnv('DEMO_MODE', '')
    const { getCurrentUserId } = await import('@/lib/auth/session')
    expect(await getCurrentUserId()).toBeNull()
  })

  it('are nobody when the demo person is missing', async () => {
    vi.stubEnv('DEMO_MODE', '1')
    vi.stubEnv('DEMO_USER', 'nobody')
    const { getCurrentUserId } = await import('@/lib/auth/session')
    expect(await getCurrentUserId()).toBeNull()
  })
})
