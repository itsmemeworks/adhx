import { describe, it, expect } from 'vitest'
import {
  feedItemToTheaterItem,
  inferCollectionContentType,
  theaterItemsFromFeed,
} from '@/components/theater/collection-item'
import { theaterItemKey } from '@/components/theater/types'
import type { FeedItem } from '@/components/feed/types'

/**
 * `feedItemToTheaterItem` / `inferCollectionContentType` matrix — mirrors the
 * priority order `getTrendingItems()`'s `typeOf()` uses for saved bookmarks
 * (single-format platforms are always video; otherwise
 * article > video > photo > text), so the Collection theater's stage
 * dispatch agrees with the public theater's.
 */

const base: FeedItem = {
  id: '123',
  platform: 'twitter',
  author: 'jack',
  authorName: 'Jack',
  authorProfileImageUrl: 'https://pbs.twimg.com/avatar.jpg',
  text: 'hello world',
  tweetUrl: 'https://x.com/jack/status/123',
  createdAt: '2026-06-08T00:00:00Z',
  processedAt: '2026-06-08T00:00:00Z',
  isArchived: false,
  media: null,
  links: null,
  tags: [],
}

const item = (over: Partial<FeedItem>): FeedItem => ({ ...base, ...over })

describe('feedItemToTheaterItem', () => {
  it('never carries a userId key (anonymity-safe shape)', () => {
    const t = feedItemToTheaterItem(item({}))
    expect('userId' in t).toBe(false)
  })

  it('defaults platform to twitter and carries the core fields through', () => {
    const t = feedItemToTheaterItem(item({ platform: undefined }))
    expect(t.platform).toBe('twitter')
    expect(t.bookmarkId).toBe('123')
    expect(t.author).toBe('jack')
    expect(t.authorName).toBe('Jack')
    expect(t.authorAvatarUrl).toBe('https://pbs.twimg.com/avatar.jpg')
    expect(t.text).toBe('hello world')
    expect(t.url).toBe('https://x.com/jack/status/123')
    expect(t.createdAt).toBe('2026-06-08T00:00:00Z')
  })

  it('falls back to processedAt when createdAt is missing', () => {
    const t = feedItemToTheaterItem(item({ createdAt: null }))
    expect(t.createdAt).toBe('2026-06-08T00:00:00Z')
  })

  /**
   * Owner report: the collection theater showed "56y" for a saved TikTok
   * with no stored `createdAt`. `addedAt` is the display-only field the
   * chromes render instead: when the post was saved to ADHX (`processedAt`)
   * — deliberately never the source platform's own publish date, for any
   * platform.
   */
  describe('addedAt (display-only "first saved to ADHX" time)', () => {
    it('is the item processedAt, regardless of platform or whether createdAt is known', () => {
      const t = feedItemToTheaterItem(item({ createdAt: '2026-06-08T00:00:00Z' }))
      expect(t.addedAt).toBe('2026-06-08T00:00:00Z')
    })

    it('is still processedAt even for a TikTok item with a real createdAt — never the source date', () => {
      const t = feedItemToTheaterItem(
        item({
          id: '7673414867981831440',
          platform: 'tiktok',
          createdAt: '2020-01-01T00:00:00Z',
          processedAt: '2026-06-08T00:00:00Z',
        }),
      )
      expect(t.addedAt).toBe('2026-06-08T00:00:00Z')
    })

    it('is null when processedAt is null/empty (nothing to show)', () => {
      const t = feedItemToTheaterItem(
        item({ platform: 'instagram', createdAt: null, processedAt: null as unknown as string }),
      )
      expect(t.addedAt).toBe(null)
    })
  })

  describe('inferCollectionContentType', () => {
    it('keeps TikTok/YouTube video-only and lets Instagram use its saved category', () => {
      expect(inferCollectionContentType(item({ platform: 'tiktok', media: null }))).toBe('video')
      expect(inferCollectionContentType(item({ platform: 'youtube', media: null }))).toBe('video')
      expect(
        inferCollectionContentType(item({ platform: 'instagram', category: 'video', media: null })),
      ).toBe('video')
      expect(
        inferCollectionContentType(item({ platform: 'instagram', category: 'photo', media: null })),
      ).toBe('photo')
    })

    it('an X Article is "article" even when it has a cover image', () => {
      const t = item({
        isXArticle: true,
        media: [
          {
            id: 'm1',
            mediaType: 'photo',
            url: 'https://pbs.twimg.com/cover.jpg',
            thumbnailUrl: 'https://pbs.twimg.com/cover.jpg',
            shareUrl: 'https://pbs.twimg.com/cover.jpg',
          },
        ],
      })
      expect(inferCollectionContentType(t)).toBe('article')
    })

    it('a link-preview-only post (no first-class media) infers article from title/description', () => {
      const t = item({ articlePreview: { title: 'A title', url: 'https://example.com' } })
      expect(inferCollectionContentType(t)).toBe('article')
    })

    it('a twitter video (media[0].mediaType video) is "video"', () => {
      const t = item({
        media: [
          {
            id: 'm1',
            mediaType: 'video',
            url: 'x',
            thumbnailUrl: 'x',
            shareUrl: 'x',
          },
        ],
      })
      expect(inferCollectionContentType(t)).toBe('video')
    })

    it('an animated_gif counts as video', () => {
      const t = item({
        media: [
          { id: 'm1', mediaType: 'animated_gif', url: 'x', thumbnailUrl: 'x', shareUrl: 'x' },
        ],
      })
      expect(inferCollectionContentType(t)).toBe('video')
    })

    it('a photo post is "photo"', () => {
      const t = item({
        media: [{ id: 'm1', mediaType: 'photo', url: 'x', thumbnailUrl: 'x', shareUrl: 'x' }],
      })
      expect(inferCollectionContentType(t)).toBe('photo')
    })

    it('a quote tweet with no first-class media is "text" (quote is not a type)', () => {
      const t = item({
        isQuote: true,
        quoteContext: { tweetId: '9', author: 'bob', text: 'quoted text' },
      })
      expect(inferCollectionContentType(t)).toBe('text')
    })

    it('a photo tweet that quotes another post is "photo"', () => {
      const t = item({
        isQuote: true,
        quoteContext: { tweetId: '9', author: 'bob', text: 'quoted text' },
        media: [{ id: 'm1', mediaType: 'photo', url: 'x', thumbnailUrl: 'x', shareUrl: 'x' }],
      })
      expect(inferCollectionContentType(t)).toBe('photo')
    })

    it('plain text (no media, no quote, no article signals) is "text"', () => {
      expect(inferCollectionContentType(item({}))).toBe('text')
    })
  })
})

describe('feedItemToTheaterItem video album', () => {
  it('maps a Twitter video album onto videoCount + posters', () => {
    const t = feedItemToTheaterItem(
      item({
        media: [
          {
            id: 'm1',
            mediaType: 'video',
            url: 'a',
            thumbnailUrl: 'https://example.com/a.jpg',
            shareUrl: 'a',
          },
          {
            id: 'm2',
            mediaType: 'video',
            url: 'b',
            thumbnailUrl: 'https://example.com/b.jpg',
            shareUrl: 'b',
          },
        ],
      }),
    )
    expect(t.videoCount).toBe(2)
    expect(t.videoPosters).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg'])
  })

  it('maps a Twitter photo album onto photoCount', () => {
    const t = feedItemToTheaterItem(
      item({
        media: [
          {
            id: 'm1',
            mediaType: 'photo',
            url: 'a',
            thumbnailUrl: 'https://example.com/a.jpg',
            shareUrl: 'a',
          },
          {
            id: 'm2',
            mediaType: 'photo',
            url: 'b',
            thumbnailUrl: 'https://example.com/b.jpg',
            shareUrl: 'b',
          },
        ],
      }),
    )
    expect(t.photoCount).toBe(2)
    expect(t.videoCount).toBeUndefined()
  })

  it('keeps every ordered Instagram carousel slide, including video posters', () => {
    const t = feedItemToTheaterItem(
      item({
        platform: 'instagram',
        category: 'photo',
        media: [
          { id: 'm1', mediaType: 'photo', url: 'a', thumbnailUrl: 'a', shareUrl: 'a' },
          { id: 'm2', mediaType: 'video', url: 'b', thumbnailUrl: 'b', shareUrl: 'b' },
          { id: 'm3', mediaType: 'photo', url: 'c', thumbnailUrl: 'c', shareUrl: 'c' },
        ],
      }),
    )

    expect(t.contentType).toBe('photo')
    expect(t.photoCount).toBe(3)
    expect(t.videoCount).toBeUndefined()
  })

  it('omits photoCount for a single Twitter photo', () => {
    const t = feedItemToTheaterItem(
      item({
        media: [
          {
            id: 'm1',
            mediaType: 'photo',
            url: 'a',
            thumbnailUrl: 'https://example.com/a.jpg',
            shareUrl: 'a',
          },
        ],
      }),
    )
    expect(t.photoCount).toBeUndefined()
  })

  it('omits videoCount for a single Twitter video', () => {
    const t = feedItemToTheaterItem(
      item({
        media: [
          {
            id: 'm1',
            mediaType: 'video',
            url: 'a',
            thumbnailUrl: 'https://example.com/a.jpg',
            shareUrl: 'a',
          },
        ],
      }),
    )
    expect(t.videoCount).toBeUndefined()
  })
})

describe('feedItemToTheaterItem textLinks (spec §6b)', () => {
  it('maps FeedItem.links to textLinks, tolerating a null originalUrl', () => {
    const t = feedItemToTheaterItem(
      item({
        links: [
          {
            id: 1,
            bookmarkId: '123',
            originalUrl: null,
            expandedUrl: 'https://example.com/a',
            linkType: 'link',
          },
        ],
      }),
    )
    expect(t.textLinks).toEqual([
      { shortUrl: null, expandedUrl: 'https://example.com/a', linkType: 'link' },
    ])
  })

  it('dedupes by expandedUrl and caps at 8', () => {
    const links = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      bookmarkId: '123',
      originalUrl: `https://t.co/${i}`,
      expandedUrl: i < 2 ? 'https://example.com/dup' : `https://example.com/${i}`,
      linkType: 'link',
    }))
    const t = feedItemToTheaterItem(item({ links }))
    expect(t.textLinks).toHaveLength(8)
    const expandedUrls = t.textLinks!.map((l) => l.expandedUrl)
    expect(new Set(expandedUrls).size).toBe(expandedUrls.length)
  })

  it('is absent (undefined) when the item has no links', () => {
    expect(feedItemToTheaterItem(item({ links: null })).textLinks).toBeUndefined()
    expect(feedItemToTheaterItem(item({ links: [] })).textLinks).toBeUndefined()
  })
})

describe('feedItemToTheaterItem linkPreview', () => {
  it('keeps the tweet body and attaches an off-site OG card', () => {
    const t = feedItemToTheaterItem(
      item({
        text: '👀 https://example.com/post',
        articlePreview: {
          url: 'https://example.com/post',
          title: 'A title',
          description: 'A desc',
          imageUrl: 'https://example.com/og.jpg',
          domain: 'example.com',
        },
      }),
    )
    expect(t.contentType).toBe('article')
    expect(t.text).toBe('👀 https://example.com/post')
    expect(t.linkPreview).toMatchObject({
      url: 'https://example.com/post',
      title: 'A title',
      domain: 'example.com',
    })
  })

  it('does not card-ify an X Article URL', () => {
    const t = feedItemToTheaterItem(
      item({
        isXArticle: true,
        text: 'wrapper t.co',
        articlePreview: {
          url: 'https://x.com/foo/article/1',
          title: 'Army of AI Influencers',
        },
      }),
    )
    expect(t.linkPreview).toBeUndefined()
    expect(t.text).toBe('Army of AI Influencers')
  })
})

describe('theaterItemsFromFeed', () => {
  it('converts a queue and keeps a reverse lookup back to the original FeedItems', () => {
    const items = [item({ id: '1' }), item({ id: '2', platform: 'tiktok' })]
    const { theaterItems, byKey } = theaterItemsFromFeed(items)

    expect(theaterItems).toHaveLength(2)
    const key0 = theaterItemKey(theaterItems[0])
    const key1 = theaterItemKey(theaterItems[1])
    expect(byKey.get(key0)).toBe(items[0])
    expect(byKey.get(key1)).toBe(items[1])
    // Different platforms/ids never collide on the same key.
    expect(key0).not.toBe(key1)
  })
})
