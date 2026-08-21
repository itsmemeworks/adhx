import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, USER_A, USER_B, type TestDbInstance } from './setup'
import { activity, users, type NewActivity } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * POST /api/admin/activity/hide — content-level moderation lever for the
 * public trending/pulse feed.
 *
 * Verifies:
 *  - unauthenticated → 401
 *  - authenticated but not in ADMIN_USERNAMES → 403
 *  - ADMIN_USERNAMES unset/empty → 403 even for a real admin username (safe default)
 *  - admin hides ALL activity rows for a (platform, bookmarkId), regardless of action
 *  - unhide (hidden: false) flips it back
 *  - the response never exposes a userId
 */

let mockUserId: string | null = USER_A
let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
}))

import { POST } from '@/app/api/admin/activity/hide/route'

function seed(overrides: Partial<NewActivity> & { createdAt: string; bookmarkId: string }) {
  const row: NewActivity = {
    action: 'save',
    platform: 'twitter',
    author: 'someauthor',
    url: `/someauthor/status/${overrides.bookmarkId}`,
    ...overrides,
  }
  testInstance.db.insert(activity).values(row).run()
}

function createRequest(body?: object): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/activity/hide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const ORIGINAL_ADMIN_USERNAMES = process.env.ADMIN_USERNAMES

describe('POST /api/admin/activity/hide', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    mockUserId = USER_A
    vi.clearAllMocks()

    await testInstance.db.insert(users).values([
      { id: USER_A, username: 'admin-user' },
      { id: USER_B, username: 'regular-user' },
    ])
  })

  afterEach(() => {
    testInstance.close()
    if (ORIGINAL_ADMIN_USERNAMES === undefined) {
      delete process.env.ADMIN_USERNAMES
    } else {
      process.env.ADMIN_USERNAMES = ORIGINAL_ADMIN_USERNAMES
    }
  })

  it('401s when not signed in', async () => {
    mockUserId = null
    process.env.ADMIN_USERNAMES = 'admin-user'

    const res = await POST(createRequest({ platform: 'twitter', id: '1' }))
    expect(res.status).toBe(401)
  })

  it('403s a signed-in user whose username is not in ADMIN_USERNAMES', async () => {
    mockUserId = USER_B // 'regular-user'
    process.env.ADMIN_USERNAMES = 'admin-user'

    const res = await POST(createRequest({ platform: 'twitter', id: '1' }))
    expect(res.status).toBe(403)
  })

  it('403s everyone (even a real admin username) when ADMIN_USERNAMES is unset', async () => {
    delete process.env.ADMIN_USERNAMES
    mockUserId = USER_A // 'admin-user'

    const res = await POST(createRequest({ platform: 'twitter', id: '1' }))
    expect(res.status).toBe(403)
  })

  it('403s everyone when ADMIN_USERNAMES is an empty string', async () => {
    process.env.ADMIN_USERNAMES = ''
    mockUserId = USER_A

    const res = await POST(createRequest({ platform: 'twitter', id: '1' }))
    expect(res.status).toBe(403)
  })

  it('admin hides ALL activity rows for a (platform, bookmarkId), across actions', async () => {
    process.env.ADMIN_USERNAMES = 'admin-user'
    mockUserId = USER_A

    seed({ bookmarkId: 'spam-1', action: 'preview', createdAt: '2026-06-06T10:00:00Z' })
    seed({ bookmarkId: 'spam-1', action: 'save', createdAt: '2026-06-06T10:01:00Z' })
    seed({ bookmarkId: 'spam-1', action: 'share', createdAt: '2026-06-06T10:02:00Z' })
    // A different post must be untouched.
    seed({ bookmarkId: 'other', action: 'save', createdAt: '2026-06-06T10:03:00Z' })

    const res = await POST(createRequest({ platform: 'twitter', id: 'spam-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(3)
    expect(body.hidden).toBe(true)
    expect(body).not.toHaveProperty('userId')
    expect(JSON.stringify(body)).not.toContain(USER_A)

    const rows = testInstance.db.select().from(activity).all()
    const spamRows = rows.filter((r) => r.bookmarkId === 'spam-1')
    const otherRows = rows.filter((r) => r.bookmarkId === 'other')
    expect(spamRows.every((r) => r.hidden === 1)).toBe(true)
    expect(otherRows.every((r) => r.hidden === 0)).toBe(true)
  })

  it('defaults hidden to true when omitted from the body', async () => {
    process.env.ADMIN_USERNAMES = 'admin-user'
    mockUserId = USER_A

    seed({ bookmarkId: 'spam-2', createdAt: '2026-06-06T10:00:00Z' })

    const res = await POST(createRequest({ platform: 'twitter', id: 'spam-2' }))
    const body = await res.json()
    expect(body.hidden).toBe(true)

    const [row] = testInstance.db
      .select()
      .from(activity)
      .where(eq(activity.bookmarkId, 'spam-2'))
      .all()
    expect(row.hidden).toBe(1)
  })

  it('unhides a previously hidden post via hidden: false', async () => {
    process.env.ADMIN_USERNAMES = 'admin-user'
    mockUserId = USER_A

    seed({ bookmarkId: 'reinstated', createdAt: '2026-06-06T10:00:00Z', hidden: 1 })

    const res = await POST(createRequest({ platform: 'twitter', id: 'reinstated', hidden: false }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hidden).toBe(false)

    const [row] = testInstance.db
      .select()
      .from(activity)
      .where(eq(activity.bookmarkId, 'reinstated'))
      .all()
    expect(row.hidden).toBe(0)
  })

  it('does not affect rows for the same bookmarkId on a different platform', async () => {
    process.env.ADMIN_USERNAMES = 'admin-user'
    mockUserId = USER_A

    seed({ bookmarkId: 'shared-id', platform: 'twitter', createdAt: '2026-06-06T10:00:00Z' })
    seed({
      bookmarkId: 'shared-id',
      platform: 'tiktok',
      author: 'tkuser',
      url: '/@tkuser/video/shared-id',
      createdAt: '2026-06-06T10:01:00Z',
    })

    await POST(createRequest({ platform: 'twitter', id: 'shared-id' }))

    const rows = testInstance.db.select().from(activity).all()
    const twitterRow = rows.find((r) => r.platform === 'twitter')
    const tiktokRow = rows.find((r) => r.platform === 'tiktok')
    expect(twitterRow?.hidden).toBe(1)
    expect(tiktokRow?.hidden).toBe(0)
  })

  it('400s when platform or id is missing', async () => {
    process.env.ADMIN_USERNAMES = 'admin-user'
    mockUserId = USER_A

    const res = await POST(createRequest({ platform: 'twitter' }))
    expect(res.status).toBe(400)
  })
})
