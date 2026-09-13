import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
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
    vi.useRealTimers()
    testInstance.close()
  })

  it.each(['', '?all=false&maxPages=1', '?all=true&maxPages=20'])(
    'imports older bookmarks past 50 saved items and the old page cap (%s)',
    async (query) => {
      const existing = Array.from({ length: 50 }, (_, i) => ({
        id: `existing-${i}`,
        text: 'Already saved',
        authorId: 'alice',
      }))
      await testInstance.db.insert(schema.bookmarks).values(
        existing.map((tweet) => ({
          id: tweet.id,
          userId: 'user-1',
          platform: 'twitter',
          author: 'alice',
          text: tweet.text,
          tweetUrl: `https://x.com/alice/status/${tweet.id}`,
          processedAt: new Date().toISOString(),
        })),
      )
      const older = { id: 'older', text: 'Older bookmark', authorId: 'alice' }
      const { fetchBookmarks } = await import('@/lib/twitter/client')
      vi.mocked(fetchBookmarks).mockReset()
      vi.mocked(fetchBookmarks).mockResolvedValueOnce({
        bookmarks: existing,
        resultCount: 50,
        nextToken: 'page-2',
      })
      // Short and empty pages with a cursor still lead to older history.
      for (let page = 2; page <= 20; page++) {
        vi.mocked(fetchBookmarks).mockResolvedValueOnce({
          bookmarks: [],
          resultCount: 0,
          nextToken: `page-${page + 1}`,
        })
      }
      vi.mocked(fetchBookmarks).mockResolvedValueOnce({ bookmarks: [older], resultCount: 1 })
      const { saveBookmark } = await import('@/lib/sync/save-bookmark')
      vi.mocked(saveBookmark).mockResolvedValue({
        inserted: true,
        bookmark: {
          id: older.id,
          author: 'alice',
          authorName: 'Alice',
          authorProfileImageUrl: null,
          text: older.text,
          tweetUrl: 'https://x.com/alice/status/older',
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
      const response = await GET(new NextRequest(`https://adhx.test/api/sync${query}`))
      const body = await response.text()
      expect(fetchBookmarks).toHaveBeenCalledTimes(21)
      expect(fetchBookmarks).toHaveBeenNthCalledWith(1, 'user-1', {
        maxResults: 100,
        paginationToken: undefined,
      })
      expect(fetchBookmarks).toHaveBeenLastCalledWith('user-1', {
        maxResults: 100,
        paginationToken: 'page-21',
      })
      expect(saveBookmark).toHaveBeenCalledTimes(1)
      expect(saveBookmark).toHaveBeenCalledWith(
        older,
        'user-1',
        expect.any(Set),
        expect.any(String),
      )
      expect(body).toContain('event: complete')
      expect(body).toContain('"total":51,"new":1,"duplicates":50')
      expect((await testInstance.db.select().from(schema.syncLogs))[0]).toMatchObject({
        status: 'completed',
        totalFetched: 51,
        newBookmarks: 1,
        duplicatesSkipped: 50,
      })
    },
  )

  it('fails rather than looping or claiming completion when X repeats a cursor', async () => {
    const { fetchBookmarks } = await import('@/lib/twitter/client')
    vi.mocked(fetchBookmarks).mockReset().mockResolvedValue({
      bookmarks: [],
      resultCount: 0,
      nextToken: 'repeated-page',
    })
    const { GET } = await import('@/app/api/sync/route')
    const response = await GET(new NextRequest('https://adhx.test/api/sync'))
    const body = await response.text()
    expect(fetchBookmarks).toHaveBeenCalledTimes(2)
    expect(body).toContain('X repeated a bookmark page')
    expect(body).not.toContain('event: complete')
    expect((await testInstance.db.select().from(schema.syncLogs))[0].status).toBe('failed')
  })

  it('does not claim completion when a later X page fails', async () => {
    const { fetchBookmarks } = await import('@/lib/twitter/client')
    vi.mocked(fetchBookmarks)
      .mockReset()
      .mockResolvedValueOnce({ bookmarks: [], resultCount: 0, nextToken: 'page-2' })
      .mockRejectedValueOnce(new Error('X is unavailable'))
    const { GET } = await import('@/app/api/sync/route')
    const response = await GET(new NextRequest('https://adhx.test/api/sync'))
    const body = await response.text()
    expect(body).toContain('event: error')
    expect(body).not.toContain('event: complete')
    expect((await testInstance.db.select().from(schema.syncLogs))[0].status).toBe('failed')
  })

  it('observes live counts and completion without starting a second X fetch', async () => {
    vi.useFakeTimers()
    const startedAt = new Date().toISOString()
    await testInstance.db.insert(schema.syncLogs).values({
      id: 'active-sync',
      userId: 'user-1',
      startedAt,
      status: 'running',
      triggerType: 'manual',
      totalFetched: 10,
      newBookmarks: 2,
      duplicatesSkipped: 1,
    })

    const { GET } = await import('@/app/api/sync/route')
    const response = await GET(new NextRequest('https://adhx.test/api/sync'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reader = response.body!.getReader()
    const decode = async () => new TextDecoder().decode((await reader.read()).value)
    expect(await decode()).toContain('event: progress\ndata: {"total":10,"new":2,"duplicates":1')
    await testInstance.db
      .update(schema.syncLogs)
      .set({ newBookmarks: 5 })
      .where(eq(schema.syncLogs.id, 'active-sync'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(await decode()).toContain('"new":5')
    await testInstance.db
      .update(schema.syncLogs)
      .set({ status: 'completed', duplicatesSkipped: 5 })
      .where(eq(schema.syncLogs.id, 'active-sync'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(await decode()).toContain('event: complete')
    expect((await reader.read()).done).toBe(true)

    const { fetchBookmarks } = await import('@/lib/twitter/client')
    expect(fetchBookmarks).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('does not expose another account’s sync and does not cancel the owner when an observer leaves', async () => {
    await testInstance.db.insert(schema.syncLogs).values({
      id: 'active-sync',
      userId: 'user-2',
      startedAt: new Date().toISOString(),
      status: 'running',
      newBookmarks: 7,
    })
    const { observeSync } = await import('@/lib/sync/observe')
    const foreign = observeSync('user-1', 'active-sync', new AbortController().signal)
    expect(await foreign.text()).not.toContain('"new":7')
    const controller = new AbortController()
    const owned = observeSync('user-2', 'active-sync', controller.signal)
    const reader = owned.body!.getReader()
    await reader.read()
    controller.abort()
    expect((await reader.read()).done).toBe(true)
    expect((await testInstance.db.select().from(schema.syncLogs))[0].status).toBe('running')
  })

  it.each(['failed', 'stale'] as const)(
    'closes an observer when its run is %s',
    async (outcome) => {
      await testInstance.db.insert(schema.syncLogs).values({
        id: 'stopped-sync',
        userId: 'user-1',
        startedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
        status: outcome === 'failed' ? 'failed' : 'running',
        errorMessage: outcome === 'failed' ? 'X is temporarily unavailable' : null,
      })
      const { observeSync } = await import('@/lib/sync/observe')
      const response = observeSync('user-1', 'stopped-sync', new AbortController().signal)
      const body = await response.text()
      expect(body).toContain('event: error')
      expect(body).toContain(
        outcome === 'failed' ? 'X is temporarily unavailable' : 'Sync timed out',
      )
      expect(body).not.toContain('event: complete')
    },
  )

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
