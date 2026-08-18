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
 * article > video > photo > quote > text), so the Collection theater's stage
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
  isRead: false,
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

  describe('inferCollectionContentType', () => {
    it('tiktok/youtube/instagram are always video, even with no media row', () => {
      expect(inferCollectionContentType(item({ platform: 'tiktok', media: null }))).toBe('video')
      expect(inferCollectionContentType(item({ platform: 'youtube', media: null }))).toBe('video')
      expect(inferCollectionContentType(item({ platform: 'instagram', media: null }))).toBe('video')
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

    it('a quote tweet with no first-class media is "quote"', () => {
      const t = item({
        isQuote: true,
        quoteContext: { tweetId: '9', author: 'bob', text: 'quoted text' },
      })
      expect(inferCollectionContentType(t)).toBe('quote')
    })

    it('a quote tweet resolved via a full quotedTweet FeedItem is also "quote"', () => {
      const t = item({ isQuote: true, quotedTweet: item({ id: '9', author: 'bob' }) })
      expect(inferCollectionContentType(t)).toBe('quote')
    })

    it('plain text (no media, no quote, no article signals) is "text"', () => {
      expect(inferCollectionContentType(item({}))).toBe('text')
    })
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
