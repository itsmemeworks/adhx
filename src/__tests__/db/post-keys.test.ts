import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestBookmark, createTestDb, type TestDbInstance } from '../api/setup'
import {
  ownedPostKeyBatches,
  ownedPostKeyWhere,
  postKeyBatches,
  postKeyWhere,
} from '@/lib/db/post-keys'

let instance: TestDbInstance
vi.mock('@/lib/db', () => ({
  get db() {
    return instance.db
  },
}))
import { closenessFor } from '@/lib/feed/blend-db'

beforeEach(() => {
  instance = createTestDb()
  for (const id of ['a', 'b', 'c', 'banned'])
    instance.db.insert(schema.users).values({ id, username: id }).run()
})
afterEach(() => instance.close())

function save(
  userId: string,
  platform: string,
  id: string,
  extra: Partial<schema.NewBookmark> = {},
) {
  instance.db
    .insert(schema.bookmarks)
    .values(
      createTestBookmark(userId, id, {
        platform,
        processedAt: '2026-10-22T09:00:00.000Z',
        ...extra,
      }),
    )
    .run()
}

describe('composite post-key predicates', () => {
  it('keeps requested platform/id pairs, including colon-bearing ids, rather than their cross product', () => {
    for (const platform of ['twitter', 'bluesky'])
      for (const id of ['same', 'did:plc:abc']) save('a', platform, id)
    const refs = [
      { platform: 'twitter', id: 'same' },
      { platform: 'bluesky', id: 'did:plc:abc' },
    ]
    const rows = instance.db
      .select({ platform: schema.bookmarks.platform, id: schema.bookmarks.id })
      .from(schema.bookmarks)
      .where(postKeyWhere(schema.bookmarks.platform, schema.bookmarks.id, refs))
      .all()
    expect(rows.map((r) => `${r.platform}:${r.id}`).sort()).toEqual([
      'bluesky:did:plc:abc',
      'twitter:same',
    ])
    expect(
      postKeyBatches(['bluesky:did:plc:abc', 'bluesky:did:plc:abc', 'invalid']).flat(),
    ).toEqual([{ platform: 'bluesky', id: 'did:plc:abc' }])
  })
  it('keeps owner identity attached to its platform/id pair', () => {
    for (const user of ['a', 'b'])
      for (const platform of ['twitter', 'instagram']) save(user, platform, 'same')
    const refs = [
      { userId: 'a', platform: 'twitter', id: 'same' },
      { userId: 'b', platform: 'instagram', id: 'same' },
    ]
    const rows = instance.db
      .select()
      .from(schema.bookmarks)
      .where(
        ownedPostKeyWhere(
          schema.bookmarks.userId,
          schema.bookmarks.platform,
          schema.bookmarks.id,
          refs,
        ),
      )
      .all()
    expect(rows.map((r) => `${r.userId}:${r.platform}`).sort()).toEqual([
      'a:twitter',
      'b:instagram',
    ])
  })
  it('never turns empty input into an unrestricted select', () => {
    save('a', 'twitter', 'same')
    expect(
      instance.db
        .select()
        .from(schema.bookmarks)
        .where(postKeyWhere(schema.bookmarks.platform, schema.bookmarks.id, []))
        .all(),
    ).toEqual([])
    expect(
      instance.db
        .select()
        .from(schema.bookmarks)
        .where(
          ownedPostKeyWhere(
            schema.bookmarks.userId,
            schema.bookmarks.platform,
            schema.bookmarks.id,
            [],
          ),
        )
        .all(),
    ).toEqual([])
  })
  it('executes large mixed-platform and mixed-owner batches below 999 parameters', () => {
    const refs = Array.from({ length: 1200 }, (_, i) => ({
      userId: `u${i}`,
      platform: `network${i}`,
      id: `post:${i}`,
    }))
    for (const part of postKeyBatches(refs)) {
      const query = instance.db
        .select()
        .from(schema.bookmarks)
        .where(postKeyWhere(schema.bookmarks.platform, schema.bookmarks.id, part))
      expect(query.toSQL().params.length).toBeLessThan(999)
      expect(query.all()).toEqual([])
    }
    for (const part of ownedPostKeyBatches(refs)) {
      const query = instance.db
        .select()
        .from(schema.bookmarks)
        .where(
          ownedPostKeyWhere(
            schema.bookmarks.userId,
            schema.bookmarks.platform,
            schema.bookmarks.id,
            part,
          ),
        )
      expect(query.toSQL().params.length).toBeLessThan(999)
      expect(query.all()).toEqual([])
    }
  })
})

it('set-based closeness matches the old correlated calculation for shared/private/quoted/banned and cross-network posts', () => {
  const now = Date.parse('2026-10-22T10:00:00.000Z'),
    since = new Date(now - 180 * 86400000).toISOString()
  for (let i = 0; i < 80; i++) {
    const user = ['a', 'b', 'c', 'banned'][i % 4],
      platform = i % 3 ? 'twitter' : 'instagram',
      id = `p${Math.floor(i / 4)}`
    save(user, platform, id, { isPrivate: i % 7 === 0, source: i % 11 === 0 ? 'quoted' : 'manual' })
    if (i % 3 === 0)
      instance.db
        .insert(schema.postViews)
        .values({ userId: 'a', platform, postId: id, seenAt: '2026-10-22T09:30:00.000Z' })
        .onConflictDoNothing()
        .run()
  }
  instance.db
    .insert(schema.userBans)
    .values({ userId: 'banned', createdBy: 'a', createdAt: '2026-10-22T09:00:00.000Z' })
    .run()
  const old = instance.db.all<{
    user_id: string
    total: number
    hits: number
  }>(sql`SELECT b.user_id,COUNT(*) total,
 SUM(CASE WHEN EXISTS(SELECT 1 FROM post_views v WHERE v.user_id='a' AND v.platform=b.platform AND v.post_id=b.id)
 OR EXISTS(SELECT 1 FROM bookmarks m WHERE m.user_id='a' AND m.platform=b.platform AND m.id=b.id) THEN 1 ELSE 0 END) hits
 FROM bookmarks b WHERE b.is_private=0 AND COALESCE(b.source,'')!='quoted' AND b.user_id!='a' AND b.processed_at>=${since}
 AND NOT EXISTS(SELECT 1 FROM user_bans ub WHERE ub.user_id=b.user_id) GROUP BY b.user_id`)
  expect([...closenessFor('a', now)].sort()).toEqual(
    old.map((r) => [r.user_id, r.hits / (r.total + 4)]).sort(),
  )
})
