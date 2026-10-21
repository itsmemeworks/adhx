import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fork } from 'node:child_process'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from '../api/setup'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction: <R>(fn: () => R): R => testInstance.sqlite.transaction(fn)(),
}))

// Use the actual supervisor and production configuration. A child would load
// the model, so fail loudly if turning semantic search off ever starts one.
vi.mock('node:child_process', () => ({
  fork: vi.fn(() => {
    throw new Error('Keyword-only search must never start a model process')
  }),
}))

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn(), initSentry: vi.fn() }))
vi.mock('@/lib/sync/auto', () => ({ startAutoSync: vi.fn() }))
vi.mock('@/lib/keep/worker', () => ({ startKeeping: vi.fn() }))

import { register } from '@/instrumentation'
import { noteSaved } from '@/lib/semantic'
import { semanticEnabled } from '@/lib/semantic/config'
import {
  backfillKeywordIndex,
  hasPostText,
  indexPostText,
  keywordSearch,
} from '@/lib/semantic/keywords'
import { searchPosts, type SearchScope } from '@/lib/semantic/search'
import { __resetVectorIndex } from '@/lib/semantic/vector-index'
import { captureException } from '@/lib/sentry'

const startup = globalThis as unknown as { __adhxKeywordBackfill?: Promise<void> }

function save(userId: string, id: string, overrides: Partial<schema.NewBookmark> = {}) {
  testInstance.db
    .insert(schema.bookmarks)
    .values(createTestBookmark(userId, id, { text: 'lunar otter waffles', ...overrides }))
    .run()
}

async function search(userId: string, scope: SearchScope = 'mine', q = 'waffles ') {
  return searchPosts({ q, userId, scope, type: 'all', wordsOnly: false, limit: 20, offset: 0 })
}

beforeEach(() => {
  testInstance = createTestDb()
  startup.__adhxKeywordBackfill = undefined
  __resetVectorIndex()
  vi.clearAllMocks()
  // Do not rely on semanticEnabled's Vitest/test-environment shortcut.
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VITEST', undefined)
  vi.stubEnv('SEMANTIC_SEARCH', 'off')
  vi.stubEnv('NEXT_RUNTIME', 'nodejs')
})

afterEach(async () => {
  await startup.__adhxKeywordBackfill
  startup.__adhxKeywordBackfill = undefined
  expect(fork).not.toHaveBeenCalled()
  testInstance.close()
  vi.unstubAllEnvs()
})

describe('production keyword search with the model disabled', () => {
  it.each(['off', '0', 'false'])('indexes a fresh save with SEMANTIC_SEARCH=%s', async (flag) => {
    vi.stubEnv('SEMANTIC_SEARCH', flag)
    expect(semanticEnabled()).toBe(false)
    save(USER_A, 'fresh')

    noteSaved([{ platform: 'twitter', postId: 'fresh' }])
    await vi.waitFor(() => expect(hasPostText('twitter', 'fresh')).toBe(true))

    const result = await search(USER_A)
    expect(result.understood).toBe(false)
    expect(result.hits.map((hit) => hit.key)).toEqual(['twitter:fresh'])
    expect(testInstance.db.select().from(schema.understandingQueue).all()).toEqual([])
    expect(testInstance.db.select().from(schema.postEmbeddings).all()).toEqual([])
  })

  it('keeps platform/account isolation and excludes private tags and summaries', async () => {
    save(USER_A, 'same-id', { platform: 'reddit', summary: 'secret-summary-phrase' })
    save(USER_B, 'same-id', { platform: 'twitter' })
    testInstance.db
      .insert(schema.bookmarkTags)
      .values({ userId: USER_A, platform: 'reddit', bookmarkId: 'same-id', tag: 'secret-tag' })
      .run()

    noteSaved([
      { platform: 'reddit', postId: 'same-id' },
      { platform: 'twitter', postId: 'same-id' },
    ])
    await vi.waitFor(() => expect(keywordSearch('waffles ', 10)).toHaveLength(2))

    expect((await search(USER_A)).hits.map((hit) => hit.key)).toEqual(['reddit:same-id'])
    expect((await search(USER_B)).hits.map((hit) => hit.key)).toEqual(['twitter:same-id'])
    expect(keywordSearch('secret ', 10)).toEqual([])
  })

  it('fills old and model-off saves at web startup, then indexes later ingestion', async () => {
    save(USER_A, 'legacy')
    save(USER_B, 'legacy')
    save(USER_A, 'never-embedded', { platform: 'youtube' })
    save(USER_A, 'already-indexed')
    indexPostText('twitter', 'already-indexed', 'existing richer keyword document')

    await register()
    await startup.__adhxKeywordBackfill

    expect(
      keywordSearch('waffles ', 10)
        .map((hit) => hit.key)
        .sort(),
    ).toEqual(['twitter:legacy', 'youtube:never-embedded'])
    expect(keywordSearch('richer ', 10).map((hit) => hit.key)).toEqual(['twitter:already-indexed'])
    expect(await backfillKeywordIndex()).toBe(0)

    save(USER_A, 'next-sync')
    noteSaved([{ platform: 'twitter', postId: 'next-sync' }])
    await vi.waitFor(() => expect(hasPostText('twitter', 'next-sync')).toBe(true))
    expect((await search(USER_A)).hits).toHaveLength(3)
    expect(testInstance.db.select().from(schema.understandingQueue).all()).toEqual([])
  })

  it('preserves the public ban/moderation rules for newly indexed posts', async () => {
    save(USER_A, 'public')
    save('banned-user', 'banned-only')
    save(USER_B, 'hidden')
    testInstance.db
      .insert(schema.userBans)
      .values({ userId: 'banned-user', createdAt: new Date().toISOString(), createdBy: 'admin' })
      .run()
    testInstance.db
      .insert(schema.moderatedPosts)
      .values({
        platform: 'twitter',
        bookmarkId: 'hidden',
        hidden: 1,
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
      })
      .run()

    await backfillKeywordIndex()

    expect((await search(USER_A, 'everyone')).hits.map((hit) => hit.key)).toEqual([
      'twitter:public',
    ])
    // The owner can still search their own hidden post, as with semantic search.
    expect((await search(USER_B)).hits.map((hit) => hit.key)).toEqual(['twitter:hidden'])
  })

  it('refreshes changed shared content, deduplicates notifications and ignores missing posts', async () => {
    save(USER_A, 'updated')
    indexPostText('twitter', 'updated', 'outdated words')
    testInstance.db
      .update(schema.bookmarks)
      .set({ text: 'fresh papaya description' })
      .where(eq(schema.bookmarks.id, 'updated'))
      .run()

    noteSaved([
      { platform: 'twitter', postId: 'updated' },
      { platform: 'twitter', postId: 'updated' },
      { platform: 'twitter', postId: 'missing' },
    ])
    await vi.waitFor(() => expect(keywordSearch('papaya ', 10)).toHaveLength(1))
    expect(keywordSearch('outdated ', 10)).toEqual([])
    expect(hasPostText('twitter', 'missing')).toBe(false)
  })

  it('reports keyword startup failures and allows a later registration to retry', async () => {
    save(USER_A, 'catch-up')
    const all = vi.spyOn(testInstance.db, 'all').mockImplementationOnce(() => {
      throw new Error('temporary SQLite read failure')
    })

    await register()
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledOnce())
    expect(startup.__adhxKeywordBackfill).toBeUndefined()
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      endpoint: 'semantic.keywordBackfill',
    })
    all.mockRestore()

    await register()
    await startup.__adhxKeywordBackfill
    expect(hasPostText('twitter', 'catch-up')).toBe(true)
  })
})
