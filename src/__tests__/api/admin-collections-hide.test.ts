import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, USER_A, USER_B, type TestDbInstance } from './setup'
import { collectionEvents, users, type NewCollectionEvent } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * POST /api/admin/collections/hide — content-level moderation lever for the
 * Discovery leaderboards (docs/specs/discovery-leaderboards.md §8).
 *
 * Verifies:
 *  - unauthenticated → 401
 *  - authenticated but not in ADMIN_USERNAMES → 403
 *  - ADMIN_USERNAMES unset/empty → 403 even for a real admin username (safe default)
 *  - 404 for an unknown owner username
 *  - admin hides ALL collection_events rows for an (ownerUserId, tag), across actions
 *  - unhide (hidden: false) flips it back
 *  - the response never exposes a viewerId/ownerUserId
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

import { POST } from '@/app/api/admin/collections/hide/route'

function seed(overrides: Partial<NewCollectionEvent> & { createdAt: string; tag: string }) {
  const row: NewCollectionEvent = {
    action: 'view',
    ownerUserId: USER_B,
    ...overrides,
  }
  testInstance.db.insert(collectionEvents).values(row).run()
}

function createRequest(body?: object): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/collections/hide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const ORIGINAL_ADMIN_USERNAMES = process.env.ADMIN_USERNAMES

describe('POST /api/admin/collections/hide', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    mockUserId = USER_A
    vi.clearAllMocks()

    await testInstance.db.insert(users).values([
      { id: USER_A, username: 'admin-user' },
      { id: USER_B, username: 'curator-user' },
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

    const res = await POST(createRequest({ username: 'curator-user', tag: 'memes' }))
    expect(res.status).toBe(401)
  })

  it('403s a signed-in user whose username is not in ADMIN_USERNAMES', async () => {
    mockUserId = USER_B // 'curator-user'
    process.env.ADMIN_USERNAMES = 'admin-user'

    const res = await POST(createRequest({ username: 'curator-user', tag: 'memes' }))
    expect(res.status).toBe(403)
  })

  it('403s everyone (even a real admin username) when ADMIN_USERNAMES is unset', async () => {
    delete process.env.ADMIN_USERNAMES
    mockUserId = USER_A // 'admin-user'

    const res = await POST(createRequest({ username: 'curator-user', tag: 'memes' }))
    expect(res.status).toBe(403)
  })

  it('403s everyone when ADMIN_USERNAMES is an empty string', async () => {
    process.env.ADMIN_USERNAMES = ''
    mockUserId = USER_A

    const res = await POST(createRequest({ username: 'curator-user', tag: 'memes' }))
    expect(res.status).toBe(403)
  })

  it('400s when username or tag is missing', async () => {
    process.env.ADMIN_USERNAMES = 'admin-user'
    mockUserId = USER_A

    const res = await POST(createRequest({ username: 'curator-user' }))
    expect(res.status).toBe(400)
  })

  it('404s for an unknown owner username', async () => {
    process.env.ADMIN_USERNAMES = 'admin-user'
    mockUserId = USER_A

    const res = await POST(createRequest({ username: 'nobody', tag: 'memes' }))
    expect(res.status).toBe(404)
  })

  it('admin hides ALL collection_events rows for (ownerUserId, tag), across actions', async () => {
    process.env.ADMIN_USERNAMES = 'admin-user'
    mockUserId = USER_A

    seed({ tag: 'spam-tag', action: 'view', createdAt: '2026-06-06T10:00:00Z' })
    seed({ tag: 'spam-tag', action: 'view', createdAt: '2026-06-06T10:01:00Z' })
    seed({ tag: 'spam-tag', action: 'clone', createdAt: '2026-06-06T10:02:00Z' })
    // A different tag from the same owner must be untouched.
    seed({ tag: 'other-tag', action: 'view', createdAt: '2026-06-06T10:03:00Z' })

    const res = await POST(createRequest({ username: 'curator-user', tag: 'spam-tag' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(3)
    expect(body.hidden).toBe(true)
    expect(body).not.toHaveProperty('ownerUserId')
    expect(body).not.toHaveProperty('viewerId')
    expect(JSON.stringify(body)).not.toContain(USER_B)

    const rows = testInstance.db.select().from(collectionEvents).all()
    const spamRows = rows.filter((r) => r.tag === 'spam-tag')
    const otherRows = rows.filter((r) => r.tag === 'other-tag')
    expect(spamRows.every((r) => r.hidden === 1)).toBe(true)
    expect(otherRows.every((r) => r.hidden === 0)).toBe(true)
  })

  it('defaults hidden to true when omitted from the body', async () => {
    process.env.ADMIN_USERNAMES = 'admin-user'
    mockUserId = USER_A

    seed({ tag: 'spam-2', createdAt: '2026-06-06T10:00:00Z' })

    const res = await POST(createRequest({ username: 'curator-user', tag: 'spam-2' }))
    const body = await res.json()
    expect(body.hidden).toBe(true)

    const [row] = testInstance.db
      .select()
      .from(collectionEvents)
      .where(eq(collectionEvents.tag, 'spam-2'))
      .all()
    expect(row.hidden).toBe(1)
  })

  it('unhides a previously hidden collection via hidden: false', async () => {
    process.env.ADMIN_USERNAMES = 'admin-user'
    mockUserId = USER_A

    seed({ tag: 'reinstated', createdAt: '2026-06-06T10:00:00Z', hidden: 1 })

    const res = await POST(
      createRequest({ username: 'curator-user', tag: 'reinstated', hidden: false }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hidden).toBe(false)

    const [row] = testInstance.db
      .select()
      .from(collectionEvents)
      .where(eq(collectionEvents.tag, 'reinstated'))
      .all()
    expect(row.hidden).toBe(0)
  })

  it('does not affect the same tag owned by a different user', async () => {
    process.env.ADMIN_USERNAMES = 'admin-user'
    mockUserId = USER_A

    await testInstance.db.insert(users).values({ id: 'user-c-789', username: 'other-curator' })

    seed({ tag: 'shared-tag', ownerUserId: USER_B, createdAt: '2026-06-06T10:00:00Z' })
    seed({ tag: 'shared-tag', ownerUserId: 'user-c-789', createdAt: '2026-06-06T10:01:00Z' })

    await POST(createRequest({ username: 'curator-user', tag: 'shared-tag' }))

    const rows = testInstance.db.select().from(collectionEvents).all()
    const targetRow = rows.find((r) => r.ownerUserId === USER_B)
    const otherOwnerRow = rows.find((r) => r.ownerUserId === 'user-c-789')
    expect(targetRow?.hidden).toBe(1)
    expect(otherOwnerRow?.hidden).toBe(0)
  })
})
