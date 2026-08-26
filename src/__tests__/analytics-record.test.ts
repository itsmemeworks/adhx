import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from './api/setup'
import { analyticsEvents } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

vi.mock('@/lib/sentry', () => ({
  metricCount: vi.fn(),
}))

import { recordAnalytic, recordPostAnalytic } from '@/lib/analytics/record'
import { getAnalyticsSummary } from '@/lib/analytics/query'
import { recordActivity } from '@/lib/activity/record'

const rows = () =>
  testInstance.db.select().from(analyticsEvents).orderBy(desc(analyticsEvents.id)).all()

describe('recordAnalytic', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('appends an allowlisted event and never stores a free-form name', () => {
    recordAnalytic({
      name: 'post.save',
      platform: 'tiktok',
      contentType: 'video',
      source: 'manual',
      bookmarkId: 'vid1',
      userId: 'user-a',
    })
    const all = rows()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({
      name: 'post.save',
      platform: 'tiktok',
      contentType: 'video',
      source: 'manual',
      bookmarkId: 'vid1',
      userId: 'user-a',
    })
  })

  it('drops unknown dimensions from non-post events', () => {
    recordAnalytic({
      name: 'theater.open',
      platform: 'myspace',
      contentType: 'slideshow',
      source: 'telepathy',
    })
    expect(rows()[0]).toMatchObject({
      name: 'theater.open',
      platform: null,
      contentType: null,
      source: null,
    })
  })

  it('does not persist identity-free or invalid post events', () => {
    recordAnalytic({ name: 'post.copy' })
    recordAnalytic({ name: 'post.copy', platform: 'twitter' })
    recordAnalytic({ name: 'post.copy', platform: 'myspace', bookmarkId: '1' })
    recordAnalytic({
      name: 'post.copy',
      platform: 'twitter',
      bookmarkId: 'x'.repeat(81),
    })

    expect(rows()).toHaveLength(0)
  })

  it('dedupes the same user+post+name inside 60s', () => {
    recordPostAnalytic('post.tag', {
      userId: 'u1',
      platform: 'twitter',
      bookmarkId: '1',
      tag: 'cats',
    })
    recordPostAnalytic('post.tag', {
      userId: 'u1',
      platform: 'twitter',
      bookmarkId: '1',
      tag: 'cats',
    })
    expect(rows()).toHaveLength(1)
  })

  it('dedupes anonymous post events using platform and id', () => {
    recordPostAnalytic('post.open', {
      platform: 'twitter',
      bookmarkId: 'anonymous-post',
    })
    recordPostAnalytic('post.open', {
      platform: 'twitter',
      bookmarkId: 'anonymous-post',
    })
    expect(rows()).toHaveLength(1)
  })

  it('does not let an authenticated event suppress a later anonymous event', () => {
    recordPostAnalytic('post.open', {
      userId: 'user-1',
      platform: 'twitter',
      bookmarkId: 'mixed-auth-first',
    })
    recordPostAnalytic('post.open', {
      platform: 'twitter',
      bookmarkId: 'mixed-auth-first',
    })
    expect(rows()).toHaveLength(2)
  })

  it('does not let an anonymous event suppress a later authenticated event', () => {
    recordPostAnalytic('post.open', {
      platform: 'twitter',
      bookmarkId: 'mixed-anonymous-first',
    })
    recordPostAnalytic('post.open', {
      userId: 'user-1',
      platform: 'twitter',
      bookmarkId: 'mixed-anonymous-first',
    })
    expect(rows()).toHaveLength(2)
  })

  it('does not collapse anonymous theater opens', () => {
    recordAnalytic({ name: 'theater.open', surface: 'live' })
    recordAnalytic({ name: 'theater.open', surface: 'live' })
    expect(rows()).toHaveLength(2)
  })

  it('never throws on a failed write', () => {
    testInstance.close()
    expect(() => recordAnalytic({ name: 'theater.open' })).not.toThrow()
    testInstance = createTestDb()
  })
})

describe('recordActivity dual-write', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('writes post.save into the growth log with platform and type', () => {
    recordActivity({
      action: 'save',
      platform: 'youtube',
      bookmarkId: 'dQw4w9wgXcQ',
      author: 'rick',
      text: 'never',
      url: '/shorts/dQw4w9wgXcQ',
      contentType: 'video',
      userId: 'u1',
      source: 'url_prefix',
    })
    const growth = rows()
    expect(growth).toHaveLength(1)
    expect(growth[0]).toMatchObject({
      name: 'post.save',
      platform: 'youtube',
      contentType: 'video',
      source: 'url_prefix',
      bookmarkId: 'dQw4w9wgXcQ',
    })
  })
})

describe('getAnalyticsSummary', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('rolls up totals, platform, type, and top posts without userId', () => {
    recordAnalytic({
      name: 'post.save',
      platform: 'twitter',
      contentType: 'video',
      bookmarkId: 'a',
      userId: 'secret-user',
    })
    recordAnalytic({
      name: 'post.view',
      platform: 'twitter',
      contentType: 'video',
      bookmarkId: 'a',
    })
    recordAnalytic({
      name: 'post.share',
      platform: 'instagram',
      contentType: 'video',
      bookmarkId: 'b',
    })

    const summary = getAnalyticsSummary('week')
    expect(summary.totals['post.save']).toBe(1)
    expect(summary.totals['post.view']).toBe(1)
    expect(summary.byPlatform.twitter['post.save']).toBe(1)
    expect(summary.byContentType.video['post.save']).toBe(1)
    expect(JSON.stringify(summary)).not.toContain('secret-user')
    expect(summary.topPosts[0]).toMatchObject({ platform: 'twitter', bookmarkId: 'a' })
    expect(summary.topPosts[0].score).toBeGreaterThan(summary.topPosts[1].score)
  })
})
