import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'
import { SYNC_IN_PROGRESS_MESSAGE } from '@/lib/sync/messages'

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
  previewPath: vi.fn(() => '/alice/status/tweet-1'),
}))

vi.mock('@/lib/analytics/record', () => ({
  recordAnalytic: vi.fn(),
}))

describe('GET /api/sync locking', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    testInstance.sqlite.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS sync_logs_one_running_per_user_idx
      ON sync_logs(user_id)
      WHERE status = 'running'
    `)
    vi.clearAllMocks()
  })

  afterEach(() => {
    testInstance.close()
  })

  it('returns a terminal SSE error when this user has a fresh running sync', async () => {
    const startedAt = new Date().toISOString()
    await testInstance.db.insert(schema.syncLogs).values({
      id: 'active-sync',
      userId: 'user-1',
      startedAt,
      status: 'running',
      triggerType: 'manual',
    })

    const { GET } = await import('@/app/api/sync/route')
    const response = await GET(new NextRequest('https://adhx.test/api/sync'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const body = await response.text()
    expect(body).toContain('event: error')
    expect(body).toContain(`"message":"${SYNC_IN_PROGRESS_MESSAGE}"`)
    expect(body).toContain('"code":"in_progress"')

    const { fetchBookmarks } = await import('@/lib/twitter/client')
    expect(fetchBookmarks).not.toHaveBeenCalled()
  })

  it('does not complete or overwrite state after heartbeat renewal loses ownership', async () => {
    vi.useFakeTimers()
    try {
      let resolveFetch!: (value: { bookmarks: []; resultCount: number }) => void
      let markFetchStarted!: () => void
      const fetchStarted = new Promise<void>((resolve) => {
        markFetchStarted = resolve
      })
      const pendingFetch = new Promise<{ bookmarks: []; resultCount: number }>((resolve) => {
        resolveFetch = resolve
      })
      const { fetchBookmarks } = await import('@/lib/twitter/client')
      vi.mocked(fetchBookmarks).mockImplementation(() => {
        markFetchStarted()
        return pendingFetch
      })

      const { GET } = await import('@/app/api/sync/route')
      const response = await GET(new NextRequest('https://adhx.test/api/sync'))
      await fetchStarted

      const [claimed] = await testInstance.db
        .select()
        .from(schema.syncLogs)
        .where(eq(schema.syncLogs.status, 'running'))
      expect(claimed).toBeDefined()

      await testInstance.db
        .update(schema.syncLogs)
        .set({ status: 'failed', errorMessage: 'Lease reaped by replacement' })
        .where(eq(schema.syncLogs.id, claimed.id))

      await vi.advanceTimersByTimeAsync(10_000)
      resolveFetch({ bookmarks: [], resultCount: 0 })
      const body = await response.text()

      expect(body).toContain('"code":"in_progress"')
      expect(body).not.toContain('event: complete')

      const [row] = await testInstance.db
        .select()
        .from(schema.syncLogs)
        .where(eq(schema.syncLogs.id, claimed.id))
      expect(row).toMatchObject({
        status: 'failed',
        errorMessage: 'Lease reaped by replacement',
        completedAt: null,
      })

      const { metrics } = await import('@/lib/sentry')
      expect(metrics.syncCompleted).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('counts an insert conflict as duplicate and emits no save pulse', async () => {
    const tweet = {
      id: 'tweet-1',
      text: 'Race loser',
      authorId: 'author-1',
      author: { id: 'author-1', username: 'alice', name: 'Alice' },
    }
    const { fetchBookmarks } = await import('@/lib/twitter/client')
    vi.mocked(fetchBookmarks).mockResolvedValue({
      bookmarks: [tweet],
      resultCount: 1,
    })
    const { saveBookmark } = await import('@/lib/sync/save-bookmark')
    vi.mocked(saveBookmark).mockResolvedValue({
      inserted: false,
      bookmark: {
        id: 'tweet-1',
        author: 'alice',
        authorName: 'Alice',
        authorProfileImageUrl: null,
        text: 'Race loser',
        tweetUrl: 'https://x.com/alice/status/tweet-1',
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
    })

    const { GET } = await import('@/app/api/sync/route')
    const response = await GET(new NextRequest('https://adhx.test/api/sync'))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('event: duplicate')
    expect(body).toContain('"new":0')
    expect(body).toContain('"duplicates":1')

    const { recordActivity } = await import('@/lib/activity/record')
    expect(recordActivity).not.toHaveBeenCalled()

    const [log] = await testInstance.db.select().from(schema.syncLogs)
    expect(log).toMatchObject({
      status: 'completed',
      totalFetched: 1,
      newBookmarks: 0,
      duplicatesSkipped: 1,
    })
  })
})
