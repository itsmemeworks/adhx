import { describe, it, expect } from 'vitest'
import {
  streamedBookmarkToFeedItem,
  type StreamedBookmark,
  FILTER_OPTIONS,
} from '@/components/feed/types'

describe('Feed Types', () => {
  describe('FILTER_OPTIONS', () => {
    it('should have all expected filter options', () => {
      expect(FILTER_OPTIONS).toHaveLength(6)
      expect(FILTER_OPTIONS.map(o => o.value)).toEqual([
        'all',
        'photos',
        'videos',
        'text',
        'articles',
        'quoted',
      ])
    })

    it('should have labels for all options', () => {
      FILTER_OPTIONS.forEach(option => {
        expect(option.label).toBeTruthy()
        expect(typeof option.label).toBe('string')
      })
    })
  })

  describe('streamedBookmarkToFeedItem', () => {
    const baseBookmark: StreamedBookmark = {
      id: 'tweet-123',
      author: 'testuser',
      authorName: 'Test User',
      authorProfileImageUrl: 'https://pbs.twimg.com/profile_images/123/avatar.jpg',
      text: 'This is a test tweet',
      tweetUrl: 'https://x.com/testuser/status/tweet-123',
      createdAt: '2024-01-15T12:00:00Z',
      processedAt: '2024-01-15T12:01:00Z',
      category: 'tech',
      isRead: false,
      isQuote: false,
      isRetweet: false,
      media: null,
      articlePreview: null,
      tags: ['test', 'vitest'],
    }

    it('should convert basic bookmark to FeedItem', () => {
      const feedItem = streamedBookmarkToFeedItem(baseBookmark)

      expect(feedItem.id).toBe('tweet-123')
      expect(feedItem.author).toBe('testuser')
      expect(feedItem.authorName).toBe('Test User')
      expect(feedItem.text).toBe('This is a test tweet')
      expect(feedItem.isRead).toBe(false)
      expect(feedItem.tags).toEqual(['test', 'vitest'])
    })

    it('should handle null media', () => {
      const feedItem = streamedBookmarkToFeedItem(baseBookmark)

      expect(feedItem.media).toBeNull()
    })

    it('should convert media items with additional fields', () => {
      const bookmarkWithMedia: StreamedBookmark = {
        ...baseBookmark,
        media: [
          {
            id: 'media-1',
            mediaType: 'photo',
            url: 'https://pbs.twimg.com/media/photo1.jpg',
            thumbnailUrl: 'https://pbs.twimg.com/media/photo1_thumb.jpg',
          },
          {
            id: 'media-2',
            mediaType: 'video',
            url: 'https://video.twimg.com/video1.mp4',
            thumbnailUrl: 'https://pbs.twimg.com/media/video1_thumb.jpg',
          },
        ],
      }

      const feedItem = streamedBookmarkToFeedItem(bookmarkWithMedia)

      expect(feedItem.media).toHaveLength(2)
      expect(feedItem.media![0]).toMatchObject({
        id: 'media-1',
        mediaType: 'photo',
        width: null,
        height: null,
      })
      expect(feedItem.media![1].shareUrl).toBeTruthy()
    })

    it('should convert article preview with defaults', () => {
      const bookmarkWithArticle: StreamedBookmark = {
        ...baseBookmark,
        articlePreview: {
          title: 'Test Article Title',
          imageUrl: 'https://example.com/article-image.jpg',
        },
      }

      const feedItem = streamedBookmarkToFeedItem(bookmarkWithArticle)

      expect(feedItem.articlePreview).toMatchObject({
        title: 'Test Article Title',
        imageUrl: 'https://example.com/article-image.jpg',
        description: null,
        domain: null,
      })
    })

    it('should handle null article preview', () => {
      const feedItem = streamedBookmarkToFeedItem(baseBookmark)

      expect(feedItem.articlePreview).toBeNull()
    })

    it('should preserve quote and retweet flags', () => {
      const quoteBookmark: StreamedBookmark = {
        ...baseBookmark,
        isQuote: true,
        isRetweet: false,
      }

      const feedItem = streamedBookmarkToFeedItem(quoteBookmark)

      expect(feedItem.isQuote).toBe(true)
      expect(feedItem.isRetweet).toBe(false)
    })

    it('should always set links to null', () => {
      const feedItem = streamedBookmarkToFeedItem(baseBookmark)

      expect(feedItem.links).toBeNull()
    })

    it('should handle empty tags array', () => {
      const bookmarkNoTags: StreamedBookmark = {
        ...baseBookmark,
        tags: [],
      }

      const feedItem = streamedBookmarkToFeedItem(bookmarkNoTags)

      expect(feedItem.tags).toEqual([])
    })

    it('should handle null authorName and authorProfileImageUrl', () => {
      const bookmarkNoAuthor: StreamedBookmark = {
        ...baseBookmark,
        authorName: null,
        authorProfileImageUrl: null,
      }

      const feedItem = streamedBookmarkToFeedItem(bookmarkNoAuthor)

      expect(feedItem.authorName).toBeNull()
      expect(feedItem.authorProfileImageUrl).toBeNull()
    })
  })
})
