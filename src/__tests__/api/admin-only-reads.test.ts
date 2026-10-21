import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, type TestDbInstance } from './setup'
import * as schema from '@/lib/db/schema'

let testInstance: TestDbInstance
let viewer: string | null = null

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  getCurrentUserId: async () => viewer,
}))

const ROUTES = [
  ['/api/activity', () => import('@/app/api/activity/route')],
  ['/api/trending', () => import('@/app/api/trending/route')],
  ['/api/analytics', () => import('@/app/api/analytics/route')],
] as const

async function get(path: string, load: () => Promise<{ GET: (r: NextRequest) => unknown }>) {
  const { GET } = await load()
  return (await GET(new NextRequest(`http://localhost${path}`))) as Response
}

describe('activity, trending and analytics reads are for admins only', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    testInstance.db
      .insert(schema.users)
      .values([
        { id: 'u-admin', username: 'pete', role: 'admin' },
        { id: 'u-member', username: 'ana' },
      ])
      .run()
  })

  afterEach(() => {
    viewer = null
    testInstance.close()
  })

  for (const [path, load] of ROUTES) {
    it(`${path}: 401 signed out, 403 for a member, 200 for an admin`, async () => {
      viewer = null
      const out = await get(path, load)
      expect(out.status).toBe(401)
      expect(out.headers.get('Cache-Control')).toBe('no-store')

      viewer = 'u-member'
      expect((await get(path, load)).status).toBe(403)

      viewer = 'u-admin'
      expect((await get(path, load)).status).toBe(200)
    })
  }
})
