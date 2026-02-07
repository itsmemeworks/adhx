import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTestDb, type TestDbInstance, USER_A, USER_B } from './api/setup'
import * as schema from '@/lib/db/schema'

/**
 * Tests for dynamic sitemap generation.
 *
 * Validates that public tag pages and tweet preview URLs are included,
 * private tags are excluded, and tweet URLs are deduplicated.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

describe('Dynamic Sitemap', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    vi.clearAllMocks()
  })

  afterEach(() => {
    testInstance.close()
  })

  it('returns just homepage when no public tags exist', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    expect(entries).toHaveLength(1)
    expect(entries[0].url).toBe('https://adhx.com')
    expect(entries[0].priority).toBe(1)
  })

  it('includes tag page URLs for public tags', async () => {
    // Setup: user with username + public tag
    testInstance.db.insert(schema.oauthTokens).values({
      userId: USER_A,
      username: 'alice',
      accessToken: 'enc_token',
      refreshToken: 'enc_refresh',
      expiresAt: Date.now() + 3600000,
    }).run()

    testInstance.db.insert(schema.tagShares).values({
      userId: USER_A,
      tag: 'ai-tools',
      shareCode: 'share-1',
      isPublic: true,
    }).run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    const tagEntry = entries.find((e) => e.url.includes('/t/alice/ai-tools'))
    expect(tagEntry).toBeDefined()
    expect(tagEntry!.changeFrequency).toBe('daily')
    expect(tagEntry!.priority).toBe(0.7)
  })

  it('includes tweet URLs from public tags', async () => {
    testInstance.db.insert(schema.oauthTokens).values({
      userId: USER_A,
      username: 'alice',
      accessToken: 'enc_token',
      refreshToken: 'enc_refresh',
      expiresAt: Date.now() + 3600000,
    }).run()

    testInstance.db.insert(schema.tagShares).values({
      userId: USER_A,
      tag: 'ai-tools',
      shareCode: 'share-1',
      isPublic: true,
    }).run()

    testInstance.db.insert(schema.bookmarks).values({
      id: 'tweet-1',
      userId: USER_A,
      author: 'tweetauthor',
      text: 'A tweet about AI',
      tweetUrl: 'https://x.com/tweetauthor/status/tweet-1',
      processedAt: new Date().toISOString(),
    }).run()

    testInstance.db.insert(schema.bookmarkTags).values({
      userId: USER_A,
      bookmarkId: 'tweet-1',
      tag: 'ai-tools',
    }).run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    const tweetEntry = entries.find((e) => e.url.includes('/tweetauthor/status/tweet-1'))
    expect(tweetEntry).toBeDefined()
    expect(tweetEntry!.changeFrequency).toBe('weekly')
    expect(tweetEntry!.priority).toBe(0.5)
  })

  it('deduplicates tweet URLs across multiple public tags', async () => {
    testInstance.db.insert(schema.oauthTokens).values({
      userId: USER_A,
      username: 'alice',
      accessToken: 'enc_token',
      refreshToken: 'enc_refresh',
      expiresAt: Date.now() + 3600000,
    }).run()

    // Two public tags
    testInstance.db.insert(schema.tagShares).values([
      { userId: USER_A, tag: 'ai-tools', shareCode: 'share-1', isPublic: true },
      { userId: USER_A, tag: 'favorites', shareCode: 'share-2', isPublic: true },
    ]).run()

    // Same tweet in both tags
    testInstance.db.insert(schema.bookmarks).values({
      id: 'tweet-1',
      userId: USER_A,
      author: 'author1',
      text: 'Shared tweet',
      tweetUrl: 'https://x.com/author1/status/tweet-1',
      processedAt: new Date().toISOString(),
    }).run()

    testInstance.db.insert(schema.bookmarkTags).values([
      { userId: USER_A, bookmarkId: 'tweet-1', tag: 'ai-tools' },
      { userId: USER_A, bookmarkId: 'tweet-1', tag: 'favorites' },
    ]).run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    const tweetEntries = entries.filter((e) => e.url.includes('/author1/status/tweet-1'))
    expect(tweetEntries).toHaveLength(1)

    // But both tag pages should appear
    const tagEntries = entries.filter((e) => e.url.includes('/t/alice/'))
    expect(tagEntries).toHaveLength(2)
  })

  it('excludes private tags', async () => {
    testInstance.db.insert(schema.oauthTokens).values({
      userId: USER_A,
      username: 'alice',
      accessToken: 'enc_token',
      refreshToken: 'enc_refresh',
      expiresAt: Date.now() + 3600000,
    }).run()

    // Private tag (isPublic defaults to false)
    testInstance.db.insert(schema.tagShares).values({
      userId: USER_A,
      tag: 'private-stuff',
      shareCode: 'share-private',
      isPublic: false,
    }).run()

    testInstance.db.insert(schema.bookmarks).values({
      id: 'tweet-private',
      userId: USER_A,
      author: 'secretauthor',
      text: 'Private tweet',
      tweetUrl: 'https://x.com/secretauthor/status/tweet-private',
      processedAt: new Date().toISOString(),
    }).run()

    testInstance.db.insert(schema.bookmarkTags).values({
      userId: USER_A,
      bookmarkId: 'tweet-private',
      tag: 'private-stuff',
    }).run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    // Only homepage
    expect(entries).toHaveLength(1)
    expect(entries.find((e) => e.url.includes('private-stuff'))).toBeUndefined()
    expect(entries.find((e) => e.url.includes('secretauthor'))).toBeUndefined()
  })

  it('handles multiple users with public tags', async () => {
    // User A
    testInstance.db.insert(schema.oauthTokens).values([
      { userId: USER_A, username: 'alice', accessToken: 'enc_a', refreshToken: 'enc_ra', expiresAt: Date.now() + 3600000 },
      { userId: USER_B, username: 'bob', accessToken: 'enc_b', refreshToken: 'enc_rb', expiresAt: Date.now() + 3600000 },
    ]).run()

    testInstance.db.insert(schema.tagShares).values([
      { userId: USER_A, tag: 'alice-tag', shareCode: 'share-a', isPublic: true },
      { userId: USER_B, tag: 'bob-tag', shareCode: 'share-b', isPublic: true },
    ]).run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    expect(entries.find((e) => e.url.includes('/t/alice/alice-tag'))).toBeDefined()
    expect(entries.find((e) => e.url.includes('/t/bob/bob-tag'))).toBeDefined()
  })
})
