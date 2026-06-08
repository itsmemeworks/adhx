import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTestDb, type TestDbInstance, USER_A, USER_B } from './api/setup'
import * as schema from '@/lib/db/schema'

/**
 * Tests for the single dynamic sitemap served at /sitemap.xml.
 *
 * One sitemap covers: the hubs (homepage + /trending + per-lens hubs), public
 * tag-collection pages, and every saved + preview-only content preview URL
 * across platforms (de-duped by preview path). Private tag PAGES are excluded,
 * but saved CONTENT is indexed regardless of tag visibility, and no userId is
 * ever exposed.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

// homepage + /trending + 5 per-lens hubs (latest/videos/photos/text/articles)
const HUB_COUNT = 7

describe('Dynamic Sitemap', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    vi.clearAllMocks()
  })

  afterEach(() => {
    testInstance.close()
  })

  it('returns just the static hubs when there is no content', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    expect(entries).toHaveLength(HUB_COUNT)
    expect(entries[0].url).toBe('https://adhx.com')
    expect(entries[0].priority).toBe(1)
    expect(entries.find((e) => e.url === 'https://adhx.com/trending')).toBeDefined()
    expect(entries.find((e) => e.url === 'https://adhx.com/trending/videos')).toBeDefined()
    // No tag pages
    expect(entries.find((e) => e.url.includes('/t/'))).toBeUndefined()
  })

  it('includes the homepage + cross-network + per-lens trending hubs', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    expect(entries.find((e) => e.url === 'https://adhx.com')).toBeDefined()
    expect(entries.find((e) => e.url === 'https://adhx.com/trending')).toBeDefined()
    // "latest" is the bare /trending hub now; "popular" is the ranked sub-path.
    for (const slug of ['popular', 'videos', 'photos', 'text', 'articles']) {
      expect(entries.find((e) => e.url === `https://adhx.com/trending/${slug}`)).toBeDefined()
    }
  })

  it('includes tag page URLs for public tags', async () => {
    testInstance.db
      .insert(schema.oauthTokens)
      .values({
        userId: USER_A,
        username: 'alice',
        accessToken: 'enc_token',
        refreshToken: 'enc_refresh',
        expiresAt: Date.now() + 3600000,
      })
      .run()

    testInstance.db
      .insert(schema.tagShares)
      .values({ userId: USER_A, tag: 'ai-tools', shareCode: 'share-1', isPublic: true })
      .run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    const tagEntry = entries.find((e) => e.url.includes('/t/alice/ai-tools'))
    expect(tagEntry).toBeDefined()
    expect(tagEntry!.changeFrequency).toBe('daily')
    expect(tagEntry!.priority).toBe(0.7)
  })

  it('includes saved tweet preview URLs', async () => {
    testInstance.db
      .insert(schema.bookmarks)
      .values({
        id: 'tweet-1',
        userId: USER_A,
        author: 'tweetauthor',
        text: 'A tweet about AI',
        tweetUrl: 'https://x.com/tweetauthor/status/tweet-1',
        processedAt: new Date().toISOString(),
      })
      .run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    const tweetEntry = entries.find((e) => e.url.includes('/tweetauthor/status/tweet-1'))
    expect(tweetEntry).toBeDefined()
    expect(tweetEntry!.changeFrequency).toBe('weekly')
    expect(tweetEntry!.priority).toBe(0.5)
  })

  it('deduplicates the same tweet saved by multiple users', async () => {
    testInstance.db
      .insert(schema.bookmarks)
      .values([
        {
          id: 'tweet-1',
          userId: USER_A,
          author: 'author1',
          text: 'Shared tweet',
          tweetUrl: 'https://x.com/author1/status/tweet-1',
          processedAt: new Date().toISOString(),
        },
        {
          id: 'tweet-1',
          userId: USER_B,
          author: 'author1',
          text: 'Shared tweet',
          tweetUrl: 'https://x.com/author1/status/tweet-1',
          processedAt: new Date().toISOString(),
        },
      ])
      .run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    expect(entries.filter((e) => e.url.includes('/author1/status/tweet-1'))).toHaveLength(1)
  })

  it('excludes private tag pages', async () => {
    testInstance.db
      .insert(schema.oauthTokens)
      .values({
        userId: USER_A,
        username: 'alice',
        accessToken: 'enc_token',
        refreshToken: 'enc_refresh',
        expiresAt: Date.now() + 3600000,
      })
      .run()

    testInstance.db
      .insert(schema.tagShares)
      .values({ userId: USER_A, tag: 'private-stuff', shareCode: 'share-private', isPublic: false })
      .run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    expect(entries.find((e) => e.url.includes('private-stuff'))).toBeUndefined()
    expect(entries.find((e) => e.url.includes('/t/'))).toBeUndefined()
  })

  it('handles multiple users with public tags', async () => {
    testInstance.db
      .insert(schema.oauthTokens)
      .values([
        {
          userId: USER_A,
          username: 'alice',
          accessToken: 'enc_a',
          refreshToken: 'enc_ra',
          expiresAt: Date.now() + 3600000,
        },
        {
          userId: USER_B,
          username: 'bob',
          accessToken: 'enc_b',
          refreshToken: 'enc_rb',
          expiresAt: Date.now() + 3600000,
        },
      ])
      .run()

    testInstance.db
      .insert(schema.tagShares)
      .values([
        { userId: USER_A, tag: 'alice-tag', shareCode: 'share-a', isPublic: true },
        { userId: USER_B, tag: 'bob-tag', shareCode: 'share-b', isPublic: true },
      ])
      .run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    expect(entries.find((e) => e.url.includes('/t/alice/alice-tag'))).toBeDefined()
    expect(entries.find((e) => e.url.includes('/t/bob/bob-tag'))).toBeDefined()
  })

  it('indexes saved content under a PRIVATE tag, but not the private tag page', async () => {
    testInstance.db
      .insert(schema.oauthTokens)
      .values({
        userId: USER_A,
        username: 'alice',
        accessToken: 'enc_token',
        refreshToken: 'enc_refresh',
        expiresAt: Date.now() + 3600000,
      })
      .run()

    testInstance.db
      .insert(schema.bookmarks)
      .values({
        id: 'private-tweet-1',
        userId: USER_A,
        author: 'privauthor',
        text: 'A privately-tagged tweet',
        tweetUrl: 'https://x.com/privauthor/status/private-tweet-1',
        processedAt: new Date().toISOString(),
      })
      .run()

    testInstance.db
      .insert(schema.bookmarkTags)
      .values({ userId: USER_A, bookmarkId: 'private-tweet-1', tag: 'secret' })
      .run()

    testInstance.db
      .insert(schema.tagShares)
      .values({ userId: USER_A, tag: 'secret', shareCode: 'share-secret', isPublic: false })
      .run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    // The preview URL IS emitted — saved content is indexed regardless of
    // whether its tags are public.
    const previewEntry = entries.find((e) => e.url.includes('/privauthor/status/private-tweet-1'))
    expect(previewEntry).toBeDefined()
    expect(previewEntry!.url).toBe('https://adhx.com/privauthor/status/private-tweet-1')

    // ...but the private TAG PAGE is never emitted.
    expect(entries.find((e) => e.url.includes('/t/alice/secret'))).toBeUndefined()
    expect(entries.find((e) => e.url.includes('secret'))).toBeUndefined()
  })

  it('indexes saved content that has NO tag at all', async () => {
    testInstance.db
      .insert(schema.bookmarks)
      .values({
        id: 'untagged-tweet-1',
        userId: USER_A,
        author: 'loneauthor',
        text: 'An untagged tweet',
        tweetUrl: 'https://x.com/loneauthor/status/untagged-tweet-1',
        processedAt: new Date().toISOString(),
      })
      .run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    expect(
      entries.find((e) => e.url === 'https://adhx.com/loneauthor/status/untagged-tweet-1'),
    ).toBeDefined()
  })

  it('includes preview-only activity items, de-duped against saved content', async () => {
    testInstance.db
      .insert(schema.bookmarks)
      .values({
        id: 'saved-1',
        userId: USER_A,
        author: 'savedauthor',
        text: 'A saved tweet',
        tweetUrl: 'https://x.com/savedauthor/status/saved-1',
        processedAt: new Date().toISOString(),
      })
      .run()

    // One preview-only activity row (never saved), and one that duplicates the
    // saved tweet (must be de-duped against the saved set).
    testInstance.db
      .insert(schema.activity)
      .values([
        {
          action: 'preview',
          platform: 'twitter',
          bookmarkId: 'preview-only-1',
          author: 'previewauthor',
          url: 'https://x.com/previewauthor/status/preview-only-1',
          createdAt: new Date().toISOString(),
        },
        {
          action: 'preview',
          platform: 'twitter',
          bookmarkId: 'saved-1',
          author: 'savedauthor',
          url: 'https://x.com/savedauthor/status/saved-1',
          createdAt: new Date().toISOString(),
        },
      ])
      .run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    expect(
      entries.find((e) => e.url === 'https://adhx.com/previewauthor/status/preview-only-1'),
    ).toBeDefined()
    const savedEntries = entries.filter((e) => e.url.includes('/savedauthor/status/saved-1'))
    expect(savedEntries).toHaveLength(1)
  })

  it('never exposes a userId — entries are built from previewPath, not user ids', async () => {
    testInstance.db
      .insert(schema.oauthTokens)
      .values({
        userId: USER_A,
        username: 'alice',
        accessToken: 'enc_token',
        refreshToken: 'enc_refresh',
        expiresAt: Date.now() + 3600000,
      })
      .run()

    testInstance.db
      .insert(schema.tagShares)
      .values({ userId: USER_A, tag: 'public-tag', shareCode: 'share-pub', isPublic: true })
      .run()

    testInstance.db
      .insert(schema.bookmarks)
      .values([
        {
          id: 'tw-1',
          userId: USER_A,
          author: 'twhandle',
          text: 'tweet',
          tweetUrl: 'https://x.com/twhandle/status/tw-1',
          processedAt: new Date().toISOString(),
        },
        {
          id: 'tk-1',
          userId: USER_B,
          platform: 'tiktok',
          author: '@tkhandle',
          text: 'tiktok',
          tweetUrl: 'https://www.tiktok.com/@tkhandle/video/tk-1',
          processedAt: new Date().toISOString(),
        },
      ])
      .run()

    testInstance.db
      .insert(schema.activity)
      .values({
        action: 'preview',
        platform: 'instagram',
        bookmarkId: 'ig-1',
        author: 'ighandle',
        url: 'https://www.instagram.com/reels/ig-1',
        userId: USER_B,
        createdAt: new Date().toISOString(),
      })
      .run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap()

    for (const entry of entries) {
      expect(entry.url).not.toContain(USER_A)
      expect(entry.url).not.toContain(USER_B)
      expect(entry).not.toHaveProperty('userId')
      expect(entry).not.toHaveProperty('user_id')
    }

    // The URLs we emit are exactly the previewPath shapes (handle/id), proving
    // they're keyed on public content, not the owning user id.
    expect(entries.find((e) => e.url === 'https://adhx.com/twhandle/status/tw-1')).toBeDefined()
    expect(entries.find((e) => e.url === 'https://adhx.com/@tkhandle/video/tk-1')).toBeDefined()
    expect(entries.find((e) => e.url === 'https://adhx.com/reels/ig-1')).toBeDefined()
  })
})
