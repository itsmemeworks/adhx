import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTestDb, type TestDbInstance, USER_A, USER_B } from './api/setup'
import * as schema from '@/lib/db/schema'

/**
 * Tests for the sharded dynamic sitemap.
 *
 * The sitemap is now a sharded index: a `hubs` shard (homepage + /trending hubs
 * + public tag-collection pages) and one shard per content platform (every saved
 * preview URL + preview-only pulse items). The default export takes `{ id }`.
 *
 * Validates that public tag pages live in the hubs shard, private tag *pages* are
 * excluded, saved-content preview URLs live in their platform shard and are
 * deduplicated by preview path.
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

  it('hubs shard returns the static hubs (homepage + trending) when no public tags exist', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap({ id: 'hubs' })

    // homepage + /trending + 5 per-lens /trending hubs = 7 static entries
    expect(entries).toHaveLength(7)
    expect(entries[0].url).toBe('https://adhx.com')
    expect(entries[0].priority).toBe(1)
    expect(entries.find((e) => e.url === 'https://adhx.com/trending')).toBeDefined()
    expect(entries.find((e) => e.url === 'https://adhx.com/trending/videos')).toBeDefined()
    // No tag pages
    expect(entries.find((e) => e.url.includes('/t/'))).toBeUndefined()
  })

  it('hubs shard includes tag page URLs for public tags', async () => {
    // Setup: user with username + public tag
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
      .values({
        userId: USER_A,
        tag: 'ai-tools',
        shareCode: 'share-1',
        isPublic: true,
      })
      .run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap({ id: 'hubs' })

    const tagEntry = entries.find((e) => e.url.includes('/t/alice/ai-tools'))
    expect(tagEntry).toBeDefined()
    expect(tagEntry!.changeFrequency).toBe('daily')
    expect(tagEntry!.priority).toBe(0.7)
  })

  it('twitter shard includes saved tweet preview URLs', async () => {
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
    const entries = sitemap({ id: 'twitter' })

    const tweetEntry = entries.find((e) => e.url.includes('/tweetauthor/status/tweet-1'))
    expect(tweetEntry).toBeDefined()
    expect(tweetEntry!.changeFrequency).toBe('weekly')
    expect(tweetEntry!.priority).toBe(0.5)
  })

  it('twitter shard deduplicates the same tweet saved by multiple users', async () => {
    // Same tweet id saved by two different users (multi-user composite key)
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
    const entries = sitemap({ id: 'twitter' })

    const tweetEntries = entries.filter((e) => e.url.includes('/author1/status/tweet-1'))
    expect(tweetEntries).toHaveLength(1)
  })

  it('hubs shard excludes private tag pages', async () => {
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

    // Private tag (isPublic = false)
    testInstance.db
      .insert(schema.tagShares)
      .values({
        userId: USER_A,
        tag: 'private-stuff',
        shareCode: 'share-private',
        isPublic: false,
      })
      .run()

    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap({ id: 'hubs' })

    // Only the static hubs — no private tag page
    expect(entries.find((e) => e.url.includes('private-stuff'))).toBeUndefined()
    expect(entries.find((e) => e.url.includes('/t/'))).toBeUndefined()
  })

  it('hubs shard handles multiple users with public tags', async () => {
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
    const entries = sitemap({ id: 'hubs' })

    expect(entries.find((e) => e.url.includes('/t/alice/alice-tag'))).toBeDefined()
    expect(entries.find((e) => e.url.includes('/t/bob/bob-tag'))).toBeDefined()
  })

  it('hubs shard includes the static hubs (homepage + cross-network + per-platform trending)', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap({ id: 'hubs' })

    // homepage
    expect(entries.find((e) => e.url === 'https://adhx.com')).toBeDefined()
    // cross-network trending hub
    expect(entries.find((e) => e.url === 'https://adhx.com/trending')).toBeDefined()
    // the five per-lens trending hubs
    expect(entries.find((e) => e.url === 'https://adhx.com/trending/just-saved')).toBeDefined()
    expect(entries.find((e) => e.url === 'https://adhx.com/trending/videos')).toBeDefined()
    expect(entries.find((e) => e.url === 'https://adhx.com/trending/photos')).toBeDefined()
    expect(entries.find((e) => e.url === 'https://adhx.com/trending/text')).toBeDefined()
    expect(entries.find((e) => e.url === 'https://adhx.com/trending/articles')).toBeDefined()
  })

  it('platform shard indexes saved content under a PRIVATE tag (saved content is indexed regardless of tag visibility)', async () => {
    // A tweet saved by alice, tagged with a tag she has NOT made public.
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

    // The tweet is tagged with a tag that is NOT public.
    testInstance.db
      .insert(schema.bookmarkTags)
      .values({
        userId: USER_A,
        bookmarkId: 'private-tweet-1',
        tag: 'secret',
      })
      .run()

    testInstance.db
      .insert(schema.tagShares)
      .values({
        userId: USER_A,
        tag: 'secret',
        shareCode: 'share-secret',
        isPublic: false,
      })
      .run()

    const { default: sitemap } = await import('@/app/sitemap')

    // The preview URL IS emitted in the platform shard — saved content is
    // indexed regardless of whether its tags are public.
    const twitterEntries = sitemap({ id: 'twitter' })
    const previewEntry = twitterEntries.find((e) =>
      e.url.includes('/privauthor/status/private-tweet-1'),
    )
    expect(previewEntry).toBeDefined()
    expect(previewEntry!.url).toBe('https://adhx.com/privauthor/status/private-tweet-1')

    // ...but the private TAG PAGE is never in the hubs shard.
    const hubEntries = sitemap({ id: 'hubs' })
    expect(hubEntries.find((e) => e.url.includes('/t/alice/secret'))).toBeUndefined()
    expect(hubEntries.find((e) => e.url.includes('secret'))).toBeUndefined()
  })

  it('platform shard indexes saved content that has NO tag at all', async () => {
    // Untagged tweet — never shared, never tagged — still gets a preview URL.
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
    const entries = sitemap({ id: 'twitter' })

    expect(
      entries.find((e) => e.url === 'https://adhx.com/loneauthor/status/untagged-tweet-1'),
    ).toBeDefined()
  })

  it('platform shard includes preview-only activity items, de-duped against saved content', async () => {
    // One saved tweet...
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

    // ...plus two activity rows: one preview-only (never saved), and one that
    // duplicates the saved tweet (must be de-duped against the saved set).
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
    const entries = sitemap({ id: 'twitter' })

    // The preview-only item is indexed.
    expect(
      entries.find((e) => e.url === 'https://adhx.com/previewauthor/status/preview-only-1'),
    ).toBeDefined()

    // The saved tweet appears exactly once, despite also having an activity row.
    const savedEntries = entries.filter((e) => e.url.includes('/savedauthor/status/saved-1'))
    expect(savedEntries).toHaveLength(1)
  })

  it('never exposes a userId — all entries are built from previewPath (platform/handle/id), not user ids', async () => {
    // Seed every shard with content owned by USER_A / USER_B, plus a tweet
    // whose author handle differs from the owning user id, so a leak would be
    // distinguishable from the (legitimate) handle in the URL.
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
    const allEntries = [
      ...sitemap({ id: 'hubs' }),
      ...sitemap({ id: 'twitter' }),
      ...sitemap({ id: 'instagram' }),
      ...sitemap({ id: 'tiktok' }),
      ...sitemap({ id: 'youtube' }),
    ]

    // No entry's url contains either raw user id anywhere.
    for (const entry of allEntries) {
      expect(entry.url).not.toContain(USER_A)
      expect(entry.url).not.toContain(USER_B)
      // No entry should expose a `userId`/`user_id` field either.
      expect(entry).not.toHaveProperty('userId')
      expect(entry).not.toHaveProperty('user_id')
    }

    // Confirm the URLs we DO emit are exactly the previewPath shapes (handle/id),
    // proving they're keyed on public content, not on the owning user id.
    expect(allEntries.find((e) => e.url === 'https://adhx.com/twhandle/status/tw-1')).toBeDefined()
    expect(allEntries.find((e) => e.url === 'https://adhx.com/@tkhandle/video/tk-1')).toBeDefined()
    expect(allEntries.find((e) => e.url === 'https://adhx.com/reels/ig-1')).toBeDefined()
  })

  it('unknown shard id degrades to homepage-only', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = sitemap({ id: 'nonsense' })

    expect(entries).toHaveLength(1)
    expect(entries[0].url).toBe('https://adhx.com')
  })
})
