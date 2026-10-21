import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
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

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(async () => 'user-1'),
}))

vi.mock('@/lib/auth/oauth', () => ({
  hasExistingTokens: vi.fn(async () => true),
}))

vi.mock('@/lib/twitter/client', () => ({
  fetchBookmarks: vi.fn(),
}))

vi.mock('@/lib/sync/save-bookmark', () => ({
  saveBookmark: vi.fn(),
}))

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  metrics: {
    syncStarted: vi.fn(),
    syncCompleted: vi.fn(),
    syncFailed: vi.fn(),
    trackUser: vi.fn(),
  },
}))

vi.mock('@/lib/activity/record', () => ({
  recordActivity: vi.fn(),
  previewPath: vi.fn(() => '/alice/status/x'),
}))

vi.mock('@/lib/analytics/record', () => ({
  recordAnalytic: vi.fn(),
}))

vi.mock('@/lib/semantic', () => ({
  noteSaved: vi.fn(),
  PRIORITY: { sync: 1 },
}))

const HOUR = 60 * 60 * 1000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const tweet = (id: string) => ({ id, text: `post ${id}`, authorId: 'alice' })

function connect(userId: string, lastSyncAgoMs: number, status = 'completed', trigger = 'manual') {
  testInstance.sqlite
    .prepare(
      `INSERT INTO oauth_tokens (user_id, access_token, refresh_token, expires_at) VALUES (?, 'a', 'r', 0)`,
    )
    .run(userId)
  testInstance.sqlite
    .prepare(
      `INSERT INTO sync_logs (id, user_id, started_at, completed_at, status, trigger_type) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(`log-${userId}`, userId, ago(lastSyncAgoMs), ago(lastSyncAgoMs), status, trigger)
}

function saved(userId: string, id: string) {
  testInstance.sqlite
    .prepare(
      `INSERT INTO bookmarks (id, user_id, platform, author, text, tweet_url, processed_at) VALUES (?, ?, 'twitter', 'alice', 'x', 'u', ?)`,
    )
    .run(id, userId, ago(0))
}

async function mockSave() {
  const { saveBookmark } = await import('@/lib/sync/save-bookmark')
  vi.mocked(saveBookmark).mockImplementation(async (t) => ({
    inserted: true,
    bookmark: {
      id: t.id,
      author: 'alice',
      authorName: 'Alice',
      authorProfileImageUrl: null,
      text: t.text,
      tweetUrl: `https://x.com/alice/status/${t.id}`,
      createdAt: null,
      processedAt: new Date().toISOString(),
      category: 'tweet',
      isArchived: false,
      isQuote: false,
      isRetweet: false,
      media: null,
      articlePreview: null,
      tags: [],
    },
  }))
  return saveBookmark
}

describe('hourly X bookmark sync', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    ;(globalThis as { __adhxAutoSync?: unknown }).__adhxAutoSync = undefined
  })

  afterEach(() => {
    testInstance.close()
  })

  it('picks people whose last sync started 50+ minutes ago, longest wait first', async () => {
    connect('fresh', 10 * 60 * 1000)
    connect('due', HOUR)
    connect('overdue', 5 * HOUR)
    connect('never-finished', 2 * HOUR, 'failed')
    connect('opted-out', 2 * HOUR)
    testInstance.sqlite
      .prepare(
        `INSERT INTO user_preferences (user_id, key, value) VALUES ('opted-out', 'autoSync', 'false')`,
      )
      .run()
    connect('banned', 2 * HOUR)
    testInstance.sqlite
      .prepare(
        `INSERT INTO user_bans (user_id, created_at, created_by) VALUES ('banned', ?, 'admin')`,
      )
      .run(ago(0))
    // Synced once but X is no longer connected.
    testInstance.sqlite
      .prepare(
        `INSERT INTO sync_logs (id, user_id, started_at, status) VALUES ('d', 'disconnected', ?, 'completed')`,
      )
      .run(ago(2 * HOUR))

    const { dueForAutoSync } = await import('@/lib/sync/auto')
    expect(dueForAutoSync()).toEqual(['overdue', 'due'])
  })

  it('can be turned off with AUTO_SYNC_EVERY_MINUTES=0', async () => {
    vi.stubEnv('AUTO_SYNC_EVERY_MINUTES', '0')
    connect('due', 2 * HOUR)
    const { dueForAutoSync } = await import('@/lib/sync/auto')
    expect(dueForAutoSync()).toEqual([])
  })

  it('brings in only the newest bookmarks, stopping after the first page holding one already saved', async () => {
    connect('user-1', 2 * HOUR)
    saved('user-1', 'old-1')
    const { fetchBookmarks } = await import('@/lib/twitter/client')
    vi.mocked(fetchBookmarks)
      .mockResolvedValueOnce({
        bookmarks: [tweet('new-1'), tweet('new-2')],
        resultCount: 2,
        nextToken: 'page-2',
      })
      .mockResolvedValueOnce({
        bookmarks: [tweet('new-3'), tweet('old-1'), tweet('new-4')],
        resultCount: 3,
        nextToken: 'page-3',
      })
    const saveBookmark = await mockSave()

    const { autoSyncTick } = await import('@/lib/sync/auto')
    const result = await autoSyncTick()

    expect(result).toEqual({ synced: 1, added: 4 })
    expect(fetchBookmarks).toHaveBeenCalledTimes(2)
    expect(fetchBookmarks).toHaveBeenNthCalledWith(1, 'user-1', {
      maxResults: 50,
      paginationToken: undefined,
    })
    expect(saveBookmark).toHaveBeenCalledTimes(4)
    const logs = await testInstance.db.select().from(schema.syncLogs)
    expect(logs.find((l) => l.triggerType === 'auto')).toMatchObject({
      status: 'completed',
      newBookmarks: 4,
      duplicatesSkipped: 1,
    })
  })

  it('keeps going through all-new pages until X has no more (its newest 800)', async () => {
    connect('user-1', 2 * HOUR)
    saved('user-1', 'old-1')
    const { fetchBookmarks } = await import('@/lib/twitter/client')
    for (let page = 1; page <= 8; page++) {
      vi.mocked(fetchBookmarks).mockResolvedValueOnce({
        bookmarks: [tweet(`p${page}-a`), tweet(`p${page}-b`)],
        resultCount: 2,
        nextToken: page < 8 ? `page-${page + 1}` : undefined,
      })
    }
    await mockSave()

    const { autoSyncTick } = await import('@/lib/sync/auto')
    expect(await autoSyncTick()).toEqual({ synced: 1, added: 16 })
    expect(fetchBookmarks).toHaveBeenCalledTimes(8)
  })

  it('skips anyone with a sync already running', async () => {
    connect('user-1', 2 * HOUR)
    testInstance.sqlite
      .prepare(
        `INSERT INTO sync_logs (id, user_id, started_at, heartbeat_at, status, trigger_type) VALUES ('live', 'user-1', ?, ?, 'running', 'manual')`,
      )
      .run(ago(2 * HOUR), ago(0))
    // The running row started long ago, but its heartbeat is fresh.
    const { fetchBookmarks } = await import('@/lib/twitter/client')
    const { autoSyncTick } = await import('@/lib/sync/auto')
    expect(await autoSyncTick()).toEqual({ synced: 0, added: 0 })
    expect(fetchBookmarks).not.toHaveBeenCalled()
  })

  it('stops for a while when X has no API credits left', async () => {
    connect('a', 3 * HOUR)
    connect('b', 2 * HOUR)
    const { fetchBookmarks } = await import('@/lib/twitter/client')
    const { TwitterCallError } = await import('@/lib/twitter/errors')
    vi.mocked(fetchBookmarks).mockRejectedValue(
      new TwitterCallError('No credits', 'unavailable', 402),
    )
    const { autoSyncTick } = await import('@/lib/sync/auto')
    expect(await autoSyncTick()).toEqual({ synced: 1, added: 0 })
    expect(await autoSyncTick()).toEqual({ synced: 0, added: 0 })
    expect(fetchBookmarks).toHaveBeenCalledTimes(1)
  })

  it('does not count automatic syncs toward the once-an-hour Sync button', async () => {
    testInstance.sqlite
      .prepare(
        `INSERT INTO sync_logs (id, user_id, started_at, completed_at, status, trigger_type) VALUES ('a', 'user-1', ?, ?, 'completed', 'auto')`,
      )
      .run(ago(5 * 60 * 1000), ago(5 * 60 * 1000))
    const { GET } = await import('@/app/api/sync/cooldown/route')
    const body = await (await GET(new NextRequest('https://adhx.test/api/sync/cooldown'))).json()
    expect(body.canSync).toBe(true)
  })
})
