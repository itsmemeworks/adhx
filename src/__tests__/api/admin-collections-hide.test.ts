import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, USER_A, USER_B, type TestDbInstance } from './setup'
import {
  collectionAggregates,
  collectionEvents,
  users,
  type NewCollectionEvent,
} from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

/**
 * POST /api/admin/collections/hide — content-level moderation lever for the
 * Discovery leaderboards (docs/specs/discovery-leaderboards.md §8).
 *
 * Verifies:
 *  - unauthenticated → 401
 *  - authenticated without the admin role → 403
 *  - the persisted role remains authoritative when the legacy env is absent
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
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
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
  testInstance.db
    .insert(collectionAggregates)
    .values({
      ownerUserId: row.ownerUserId,
      tag: row.tag,
      viewCount: row.action === 'view' ? 1 : 0,
      cloneCount: row.action === 'clone' ? 1 : 0,
      lastEventAt: row.createdAt,
      hidden: row.hidden ?? 0,
    })
    .onConflictDoUpdate({
      target: [collectionAggregates.ownerUserId, collectionAggregates.tag],
      set: {
        viewCount: sql`${collectionAggregates.viewCount} + excluded.view_count`,
        cloneCount: sql`${collectionAggregates.cloneCount} + excluded.clone_count`,
        lastEventAt: sql`max(${collectionAggregates.lastEventAt}, excluded.last_event_at)`,
        hidden: sql`max(${collectionAggregates.hidden}, excluded.hidden)`,
      },
    })
    .run()
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
      { id: USER_A, username: 'admin-user', role: 'admin' },
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

  it('403s a signed-in user without the admin role', async () => {
    mockUserId = USER_B // 'curator-user'
    process.env.ADMIN_USERNAMES = 'admin-user'

    const res = await POST(createRequest({ username: 'curator-user', tag: 'memes' }))
    expect(res.status).toBe(403)
  })

  it('keeps the stored admin role when ADMIN_USERNAMES is unset', async () => {
    delete process.env.ADMIN_USERNAMES
    mockUserId = USER_A // 'admin-user'

    const res = await POST(createRequest({ username: 'curator-user', tag: 'memes' }))
    expect(res.status).toBe(200)
  })

  it('keeps the stored admin role when ADMIN_USERNAMES is empty', async () => {
    process.env.ADMIN_USERNAMES = ''
    mockUserId = USER_A

    const res = await POST(createRequest({ username: 'curator-user', tag: 'memes' }))
    expect(res.status).toBe(200)
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
    const aggregates = testInstance.db.select().from(collectionAggregates).all()
    expect(aggregates.find((row) => row.tag === 'spam-tag')?.hidden).toBe(1)
    expect(aggregates.find((row) => row.tag === 'other-tag')?.hidden).toBe(0)
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

  it('persists aggregate moderation before a playlist has any events', async () => {
    process.env.ADMIN_USERNAMES = 'admin-user'
    mockUserId = USER_A

    const res = await POST(createRequest({ username: 'curator-user', tag: 'quiet-playlist' }))
    expect(res.status).toBe(200)
    expect(testInstance.db.select().from(collectionEvents).all()).toHaveLength(0)
    expect(
      testInstance.db
        .select()
        .from(collectionAggregates)
        .where(eq(collectionAggregates.tag, 'quiet-playlist'))
        .all()[0],
    ).toEqual(
      expect.objectContaining({
        ownerUserId: USER_B,
        tag: 'quiet-playlist',
        viewCount: 0,
        cloneCount: 0,
        lastEventAt: null,
        hidden: 1,
      }),
    )
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
    const [aggregate] = testInstance.db
      .select()
      .from(collectionAggregates)
      .where(eq(collectionAggregates.tag, 'reinstated'))
      .all()
    expect(aggregate.hidden).toBe(0)
  })

  it('rolls raw and aggregate visibility back when the audit write fails', async () => {
    process.env.ADMIN_USERNAMES = 'admin-user'
    mockUserId = USER_A
    seed({ tag: 'atomic-hide', createdAt: '2026-06-06T10:00:00Z' })
    testInstance.sqlite.exec(`
      CREATE TRIGGER fail_playlist_audit
      BEFORE INSERT ON admin_audit
      BEGIN
        SELECT RAISE(ABORT, 'injected audit failure');
      END;
    `)

    const res = await POST(createRequest({ username: 'curator-user', tag: 'atomic-hide' }))
    expect(res.status).toBe(500)
    expect(
      testInstance.db
        .select()
        .from(collectionEvents)
        .where(eq(collectionEvents.tag, 'atomic-hide'))
        .all()[0].hidden,
    ).toBe(0)
    expect(
      testInstance.db
        .select()
        .from(collectionAggregates)
        .where(eq(collectionAggregates.tag, 'atomic-hide'))
        .all()[0].hidden,
    ).toBe(0)
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
