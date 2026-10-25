import { describe, it, expect } from 'vitest'
import { theaterItemToFeedItem } from '@/components/theater/collection-item'
import { nextPostKind } from '@/components/next/post'
import type { TheaterItem } from '@/components/theater/types'

const base: TheaterItem = {
  action: 'preview',
  platform: 'twitter',
  bookmarkId: '42',
  author: 'alice',
  authorName: 'Alice',
  text: 'hello',
  url: 'https://x.com/alice/status/42',
  createdAt: '2026-10-16T09:00:00.000Z',
}

describe('theaterItemToFeedItem (shared previews in the new theater)', () => {
  it('keeps a video as a video, one media item per clip', () => {
    const post = theaterItemToFeedItem({
      ...base,
      contentType: 'video',
      thumbnailUrl: 'https://pbs.twimg.com/v.jpg',
      videoCount: 2,
      videoPosters: ['a.jpg', 'b.jpg'],
    })
    expect(nextPostKind(post)).toBe('video')
    expect(post.media?.map((m) => m.thumbnailUrl)).toEqual(['a.jpg', 'b.jpg'])
    expect(post.media?.map((m) => m.url)).toEqual([
      '/api/files/twitter/42/video-1?a=alice&v=2',
      '/api/files/twitter/42/video-2?a=alice&v=2',
    ])
  })

  it('keeps a photo album as photos', () => {
    const post = theaterItemToFeedItem({
      ...base,
      contentType: 'photo',
      thumbnailUrl: 'p.jpg',
      photoCount: 3,
    })
    expect(nextPostKind(post)).toBe('photo')
    expect(post.media).toHaveLength(3)
  })

  it('reads an X article in full (it links to the article like a saved one)', () => {
    const post = theaterItemToFeedItem({
      ...base,
      contentType: 'article',
      text: 'Big essay',
      thumbnailUrl: 'c.jpg',
    })
    expect(post.articlePreview).toMatchObject({
      title: 'Big essay',
      url: 'https://x.com/alice/article/42',
    })
    expect(nextPostKind(post)).toBe('article')
  })

  it('carries link cards, short links and quotes for the word stages', () => {
    const post = theaterItemToFeedItem({
      ...base,
      contentType: 'text',
      textLinks: [{ shortUrl: 'https://t.co/x', expandedUrl: 'https://example.com/a' }],
      linkPreview: { url: 'https://example.com/a', title: 'A page', imageUrl: 'i.jpg' },
      quote: { author: 'bob', text: 'quoted words', bookmarkId: '7' },
    })
    expect(post.links?.[0]).toMatchObject({
      originalUrl: 'https://t.co/x',
      expandedUrl: 'https://example.com/a',
    })
    expect(post.articlePreview?.title).toBe('A page')
    expect(post.isQuote).toBe(true)
    expect(post.quoteContext).toMatchObject({ author: 'bob', text: 'quoted words', tweetId: '7' })
  })
})
