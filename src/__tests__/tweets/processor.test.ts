import { describe, it, expect } from 'vitest'
import {
  parseTweetUrl,
  determineCategory,
  buildQuoteContext,
  buildArticleContent,
  buildArticlePreview,
  generateMediaId,
  processPhotos,
  processVideos,
  processMedia,
  extractDomain,
  determineLinkType,
  isSelfLink,
  categorizeTweetByUrls,
} from '@/lib/tweets/processor'
import type { FxTwitterResponse } from '@/lib/media/fxembed'

/**
 * Unit Tests: Tweet Processor Module
 *
 * Tests the unified tweet processing utilities used by both
 * /api/tweets/add and /api/sync endpoints.
 */

describe('Tweet Processor', () => {
  describe('parseTweetUrl', () => {
    it('parses twitter.com URLs', () => {
      const result = parseTweetUrl('https://twitter.com/elonmusk/status/123456789')
      expect(result).toEqual({ author: 'elonmusk', tweetId: '123456789' })
    })

    it('parses x.com URLs', () => {
      const result = parseTweetUrl('https://x.com/elonmusk/status/123456789')
      expect(result).toEqual({ author: 'elonmusk', tweetId: '123456789' })
    })

    it('parses mobile.twitter.com URLs', () => {
      const result = parseTweetUrl('https://mobile.twitter.com/user/status/999')
      expect(result).toEqual({ author: 'user', tweetId: '999' })
    })

    it('parses vxtwitter.com URLs', () => {
      const result = parseTweetUrl('https://vxtwitter.com/user/status/111')
      expect(result).toEqual({ author: 'user', tweetId: '111' })
    })

    it('parses fxtwitter.com URLs', () => {
      const result = parseTweetUrl('https://fxtwitter.com/user/status/222')
      expect(result).toEqual({ author: 'user', tweetId: '222' })
    })

    it('parses URLs without https://', () => {
      const result = parseTweetUrl('twitter.com/user/status/333')
      expect(result).toEqual({ author: 'user', tweetId: '333' })
    })

    it('parses URLs with www prefix', () => {
      const result = parseTweetUrl('https://www.twitter.com/user/status/444')
      expect(result).toEqual({ author: 'user', tweetId: '444' })
    })

    it('returns null for invalid URLs', () => {
      expect(parseTweetUrl('https://google.com')).toBeNull()
      expect(parseTweetUrl('not a url')).toBeNull()
      expect(parseTweetUrl('https://twitter.com/user')).toBeNull()
    })
  })

  describe('determineCategory', () => {
    it('returns "text" for null tweet', () => {
      expect(determineCategory(undefined)).toBe('text')
    })

    it('returns "article" for tweets with article', () => {
      const tweet = {
        id: '123',
        url: 'https://x.com/user/status/123',
        text: 'Check out my article',
        author: { id: '1', name: 'User', screen_name: 'user', avatar_url: '' },
        created_at: '2024-01-01',
        replies: 0,
        retweets: 0,
        likes: 0,
        article: { id: '1', title: 'My Article' },
      } as FxTwitterResponse['tweet']

      expect(determineCategory(tweet)).toBe('article')
    })

    it('returns "video" for tweets with videos', () => {
      const tweet = {
        id: '123',
        url: 'https://x.com/user/status/123',
        text: 'Check out this video',
        author: { id: '1', name: 'User', screen_name: 'user', avatar_url: '' },
        created_at: '2024-01-01',
        replies: 0,
        retweets: 0,
        likes: 0,
        media: {
          videos: [{ url: 'video.mp4', thumbnail_url: 'thumb.jpg', width: 1920, height: 1080, duration: 30 }],
        },
      } as FxTwitterResponse['tweet']

      expect(determineCategory(tweet)).toBe('video')
    })

    it('returns "video" for tweets with media.all containing video', () => {
      const tweet = {
        id: '123',
        url: 'https://x.com/user/status/123',
        text: 'Video via all array',
        author: { id: '1', name: 'User', screen_name: 'user', avatar_url: '' },
        created_at: '2024-01-01',
        replies: 0,
        retweets: 0,
        likes: 0,
        media: {
          all: [{ type: 'video' as const, url: 'video.mp4', width: 1920, height: 1080 }],
        },
      } as FxTwitterResponse['tweet']

      expect(determineCategory(tweet)).toBe('video')
    })

    it('returns "photo" for tweets with photos', () => {
      const tweet = {
        id: '123',
        url: 'https://x.com/user/status/123',
        text: 'Nice photo',
        author: { id: '1', name: 'User', screen_name: 'user', avatar_url: '' },
        created_at: '2024-01-01',
        replies: 0,
        retweets: 0,
        likes: 0,
        media: {
          photos: [{ url: 'photo.jpg', width: 1200, height: 800 }],
        },
      } as FxTwitterResponse['tweet']

      expect(determineCategory(tweet)).toBe('photo')
    })

    it('returns "photo" for tweets with media.all containing photo', () => {
      const tweet = {
        id: '123',
        url: 'https://x.com/user/status/123',
        text: 'Photo via all array',
        author: { id: '1', name: 'User', screen_name: 'user', avatar_url: '' },
        created_at: '2024-01-01',
        replies: 0,
        retweets: 0,
        likes: 0,
        media: {
          all: [{ type: 'photo' as const, url: 'photo.jpg', width: 1200, height: 800 }],
        },
      } as FxTwitterResponse['tweet']

      expect(determineCategory(tweet)).toBe('photo')
    })

    it('returns "article" for external links to article platforms', () => {
      const tweet = {
        id: '123',
        url: 'https://x.com/user/status/123',
        text: 'Great read',
        author: { id: '1', name: 'User', screen_name: 'user', avatar_url: '' },
        created_at: '2024-01-01',
        replies: 0,
        retweets: 0,
        likes: 0,
        external: {
          url: 'https://medium.com/article',
          display_url: 'medium.com/article',
          expanded_url: 'https://medium.com/some-article',
        },
      } as FxTwitterResponse['tweet']

      expect(determineCategory(tweet)).toBe('article')
    })

    it('returns "text" for plain text tweets', () => {
      const tweet = {
        id: '123',
        url: 'https://x.com/user/status/123',
        text: 'Just a thought',
        author: { id: '1', name: 'User', screen_name: 'user', avatar_url: '' },
        created_at: '2024-01-01',
        replies: 0,
        retweets: 0,
        likes: 0,
      } as FxTwitterResponse['tweet']

      expect(determineCategory(tweet)).toBe('text')
    })

    it('prioritizes article over video', () => {
      const tweet = {
        id: '123',
        url: 'https://x.com/user/status/123',
        text: 'Article with video',
        author: { id: '1', name: 'User', screen_name: 'user', avatar_url: '' },
        created_at: '2024-01-01',
        replies: 0,
        retweets: 0,
        likes: 0,
        article: { id: '1', title: 'Article' },
        media: {
          videos: [{ url: 'video.mp4', thumbnail_url: 'thumb.jpg', width: 1920, height: 1080, duration: 30 }],
        },
      } as FxTwitterResponse['tweet']

      expect(determineCategory(tweet)).toBe('article')
    })
  })

  describe('categorizeTweetByUrls', () => {
    it('returns "article" for medium.com URLs', () => {
      expect(categorizeTweetByUrls([{ expandedUrl: 'https://medium.com/article' }])).toBe('article')
    })

    it('returns "article" for substack.com URLs', () => {
      expect(categorizeTweetByUrls([{ expandedUrl: 'https://example.substack.com/p/post' }])).toBe('article')
    })

    it('returns "article" for URLs containing /article/', () => {
      expect(categorizeTweetByUrls([{ expandedUrl: 'https://example.com/article/123' }])).toBe('article')
    })

    it('returns "tweet" for non-article URLs', () => {
      expect(categorizeTweetByUrls([{ expandedUrl: 'https://example.com' }])).toBe('tweet')
    })

    it('returns "tweet" for empty URLs array', () => {
      expect(categorizeTweetByUrls([])).toBe('tweet')
    })
  })

  describe('buildQuoteContext', () => {
    it('returns null for undefined quote', () => {
      expect(buildQuoteContext(undefined)).toBeNull()
    })

    it('builds quote context from quote data', () => {
      const quote = {
        id: '456',
        url: 'https://x.com/quoted/status/456',
        text: 'Quoted tweet text',
        author: {
          id: '2',
          name: 'Quoted User',
          screen_name: 'quoteduser',
          avatar_url: 'https://avatar.url',
        },
        created_at: '2024-01-01T12:00:00Z',
        replies: 10,
        retweets: 5,
        likes: 20,
        media: {
          photos: [{ url: 'photo.jpg', width: 800, height: 600 }],
        },
      }

      const result = buildQuoteContext(quote)

      expect(result).toEqual({
        tweetId: '456',
        author: 'quoteduser',
        authorName: 'Quoted User',
        authorProfileImageUrl: 'https://avatar.url',
        text: 'Quoted tweet text',
        media: {
          photos: [{ url: 'photo.jpg', width: 800, height: 600 }],
          videos: undefined,
        },
        article: null,
        external: null,
        createdAt: '2024-01-01T12:00:00Z',
      })
    })
  })

  describe('buildArticleContent', () => {
    it('returns null when article has no content', () => {
      const article = { id: '1', title: 'Title' }
      expect(buildArticleContent(article as any)).toBeNull()
    })

    it('converts entityMap from array to dictionary', () => {
      const article = {
        id: '1',
        title: 'Title',
        content: {
          blocks: [{ key: 'a', text: 'Hello', type: 'unstyled' }],
          entityMap: [
            { key: '0', value: { type: 'LINK', data: { url: 'https://example.com' } } },
          ] as any,
        },
      }

      const result = buildArticleContent(article as any)

      expect(result).toEqual({
        blocks: [{ key: 'a', text: 'Hello', type: 'unstyled' }],
        entityMap: {
          '0': { type: 'LINK', data: { url: 'https://example.com' } },
        },
        mediaEntities: undefined,
      })
    })

    it('builds mediaEntities from media_entities array', () => {
      const article = {
        id: '1',
        title: 'Title',
        content: {
          blocks: [],
          entityMap: {},
        },
        media_entities: [
          {
            media_id: 'img1',
            media_info: {
              original_img_url: 'https://img.url',
              original_img_width: 800,
              original_img_height: 600,
            },
          },
        ],
      }

      const result = buildArticleContent(article as any)

      expect(result?.mediaEntities).toEqual({
        img1: { url: 'https://img.url', width: 800, height: 600 },
      })
    })
  })

  describe('buildArticlePreview', () => {
    it('builds article preview with correct URL', () => {
      const article = {
        id: '1',
        title: 'My Article',
        preview_text: 'Article description',
        cover_media: {
          media_info: {
            original_img_url: 'https://cover.jpg',
          },
        },
      }

      const result = buildArticlePreview(article as any, 'authoruser', '123456')

      expect(result).toEqual({
        title: 'My Article',
        description: 'Article description',
        imageUrl: 'https://cover.jpg',
        url: 'https://x.com/authoruser/article/123456',
        domain: 'x.com',
      })
    })
  })

  describe('generateMediaId', () => {
    it('generates photo media ID', () => {
      expect(generateMediaId('123', 'photo', 0)).toBe('123_photo_0')
      expect(generateMediaId('123', 'photo', 2)).toBe('123_photo_2')
    })

    it('generates video media ID', () => {
      expect(generateMediaId('123', 'video', 0)).toBe('123_video_0')
    })
  })

  describe('processPhotos', () => {
    it('returns empty array for undefined photos', () => {
      expect(processPhotos('123', undefined)).toEqual([])
    })

    it('processes photos into media items', () => {
      const photos = [
        { url: 'https://photo1.jpg', width: 1200, height: 800 },
        { url: 'https://photo2.jpg', width: 800, height: 600 },
      ]

      const result = processPhotos('123', photos)

      expect(result).toEqual([
        {
          id: '123_photo_0',
          bookmarkId: '123',
          mediaType: 'photo',
          originalUrl: 'https://photo1.jpg',
          width: 1200,
          height: 800,
        },
        {
          id: '123_photo_1',
          bookmarkId: '123',
          mediaType: 'photo',
          originalUrl: 'https://photo2.jpg',
          width: 800,
          height: 600,
        },
      ])
    })
  })

  describe('processVideos', () => {
    it('returns empty array for undefined videos', () => {
      expect(processVideos('123', undefined)).toEqual([])
    })

    it('processes videos into media items', () => {
      const videos = [
        { url: 'https://video.mp4', thumbnail_url: 'https://thumb.jpg', width: 1920, height: 1080, duration: 30 },
      ]

      const result = processVideos('123', videos)

      expect(result).toEqual([
        {
          id: '123_video_0',
          bookmarkId: '123',
          mediaType: 'video',
          originalUrl: 'https://video.mp4',
          previewUrl: 'https://thumb.jpg',
          width: 1920,
          height: 1080,
          durationMs: 30000,
        },
      ])
    })
  })

  describe('processMedia', () => {
    it('returns empty array for undefined media', () => {
      expect(processMedia('123', undefined)).toEqual([])
    })

    it('combines photos and videos', () => {
      const media = {
        photos: [{ url: 'photo.jpg', width: 800, height: 600 }],
        videos: [{ url: 'video.mp4', thumbnail_url: 'thumb.jpg', width: 1920, height: 1080, duration: 10 }],
      }

      const result = processMedia('123', media)

      expect(result).toHaveLength(2)
      expect(result[0].mediaType).toBe('photo')
      expect(result[1].mediaType).toBe('video')
    })
  })

  describe('extractDomain', () => {
    it('extracts domain from URL', () => {
      expect(extractDomain('https://example.com/path')).toBe('example.com')
    })

    it('removes www prefix', () => {
      expect(extractDomain('https://www.example.com/path')).toBe('example.com')
    })

    it('returns empty string for invalid URLs', () => {
      expect(extractDomain('not a url')).toBe('')
    })
  })

  describe('determineLinkType', () => {
    it('returns "tweet" for Twitter URLs', () => {
      expect(determineLinkType('https://twitter.com/user/status/123')).toBe('tweet')
      expect(determineLinkType('https://x.com/user/status/123')).toBe('tweet')
    })

    it('returns "video" for YouTube URLs', () => {
      expect(determineLinkType('https://youtube.com/watch?v=123')).toBe('video')
      expect(determineLinkType('https://youtu.be/123')).toBe('video')
    })

    it('returns "image" for image URLs', () => {
      expect(determineLinkType('https://example.com/image.jpg')).toBe('image')
      expect(determineLinkType('https://example.com/image.png')).toBe('image')
      expect(determineLinkType('https://example.com/image.gif')).toBe('image')
    })

    it('returns "media" for video file URLs', () => {
      expect(determineLinkType('https://example.com/video.mp4')).toBe('media')
      expect(determineLinkType('https://example.com/video.webm')).toBe('media')
    })

    it('returns "link" for other URLs', () => {
      expect(determineLinkType('https://example.com/article')).toBe('link')
    })
  })

  describe('isSelfLink', () => {
    it('returns true for status URLs', () => {
      expect(isSelfLink('https://twitter.com/user/status/123')).toBe(true)
      expect(isSelfLink('https://x.com/user/status/123')).toBe(true)
    })

    it('returns false for non-status URLs', () => {
      expect(isSelfLink('https://example.com')).toBe(false)
      expect(isSelfLink('https://twitter.com/user')).toBe(false)
    })
  })
})
