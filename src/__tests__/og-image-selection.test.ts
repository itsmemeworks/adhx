import { describe, it, expect } from 'vitest'
import { getOgImage } from '@/lib/utils/og-image'

/**
 * OG Image Selection Tests
 *
 * Tests the priority order for selecting Open Graph images:
 * 1. Direct media (photo or video thumbnail)
 * 2. Article cover image (X Articles)
 * 3. Quote tweet media (if parent has no media)
 * 4. External link thumbnail
 * 5. Fallback to logo
 */

const BASE_URL = 'https://example.com'

// Helper to create minimal tweet objects for testing
function createTweet(overrides: Record<string, unknown> = {}) {
  return {
    id: '123',
    url: 'https://twitter.com/user/status/123',
    text: 'Test tweet',
    author: {
      id: 'author-id',
      name: 'Test Author',
      screen_name: 'testauthor',
      avatar_url: 'https://pbs.twimg.com/avatar.jpg',
    },
    created_at: '2024-01-15T12:00:00Z',
    replies: 0,
    retweets: 0,
    likes: 0,
    ...overrides,
  } as Parameters<typeof getOgImage>[0]
}

describe('getOgImage', () => {
  describe('Priority 1: Direct media', () => {
    it('returns first photo URL when tweet has photos', () => {
      const tweet = createTweet({
        media: {
          photos: [
            { url: 'https://pbs.twimg.com/photo1.jpg', width: 1200, height: 800 },
            { url: 'https://pbs.twimg.com/photo2.jpg', width: 1200, height: 800 },
          ],
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://pbs.twimg.com/photo1.jpg')
    })

    it('returns video thumbnail when tweet has video but no photos', () => {
      const tweet = createTweet({
        media: {
          videos: [
            {
              url: 'https://video.twimg.com/video.mp4',
              thumbnail_url: 'https://pbs.twimg.com/video-thumb.jpg',
              width: 1920,
              height: 1080,
              duration: 30,
            },
          ],
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://pbs.twimg.com/video-thumb.jpg')
    })

    it('prefers photo over video when both exist', () => {
      const tweet = createTweet({
        media: {
          photos: [{ url: 'https://pbs.twimg.com/photo.jpg', width: 1200, height: 800 }],
          videos: [
            {
              url: 'https://video.twimg.com/video.mp4',
              thumbnail_url: 'https://pbs.twimg.com/video-thumb.jpg',
              width: 1920,
              height: 1080,
              duration: 30,
            },
          ],
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://pbs.twimg.com/photo.jpg')
    })
  })

  describe('Priority 2: Article cover image', () => {
    it('returns article cover image when no direct media', () => {
      const tweet = createTweet({
        article: {
          id: 'article-123',
          title: 'Test Article',
          cover_media: {
            media_info: {
              __typename: 'Image',
              original_img_url: 'https://pbs.twimg.com/article-cover.jpg',
              original_img_width: 1200,
              original_img_height: 630,
            },
          },
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://pbs.twimg.com/article-cover.jpg')
    })

    it('prefers direct media over article cover', () => {
      const tweet = createTweet({
        media: {
          photos: [{ url: 'https://pbs.twimg.com/direct-photo.jpg', width: 1200, height: 800 }],
        },
        article: {
          id: 'article-123',
          title: 'Test Article',
          cover_media: {
            media_info: {
              __typename: 'Image',
              original_img_url: 'https://pbs.twimg.com/article-cover.jpg',
            },
          },
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://pbs.twimg.com/direct-photo.jpg')
    })
  })

  describe('Priority 3: Quote tweet media', () => {
    it('returns quoted tweet photo when main tweet has no media', () => {
      const tweet = createTweet({
        quote: {
          id: 'quote-123',
          url: 'https://twitter.com/quoted/status/456',
          text: 'Quoted tweet',
          author: {
            id: 'quoted-author',
            name: 'Quoted Author',
            screen_name: 'quotedauthor',
            avatar_url: 'https://pbs.twimg.com/quoted-avatar.jpg',
          },
          created_at: '2024-01-14T12:00:00Z',
          replies: 0,
          retweets: 0,
          likes: 0,
          media: {
            photos: [{ url: 'https://pbs.twimg.com/quote-photo.jpg', width: 1200, height: 800 }],
          },
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://pbs.twimg.com/quote-photo.jpg')
    })

    it('returns quoted tweet video thumbnail when main tweet has no media', () => {
      const tweet = createTweet({
        quote: {
          id: 'quote-123',
          url: 'https://twitter.com/quoted/status/456',
          text: 'Quoted tweet with video',
          author: {
            id: 'quoted-author',
            name: 'Quoted Author',
            screen_name: 'quotedauthor',
            avatar_url: 'https://pbs.twimg.com/quoted-avatar.jpg',
          },
          created_at: '2024-01-14T12:00:00Z',
          replies: 0,
          retweets: 0,
          likes: 0,
          media: {
            videos: [
              {
                url: 'https://video.twimg.com/quote-video.mp4',
                thumbnail_url: 'https://pbs.twimg.com/quote-video-thumb.jpg',
                width: 1920,
                height: 1080,
              },
            ],
          },
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://pbs.twimg.com/quote-video-thumb.jpg')
    })

    it('prefers main tweet media over quote media', () => {
      const tweet = createTweet({
        media: {
          photos: [{ url: 'https://pbs.twimg.com/main-photo.jpg', width: 1200, height: 800 }],
        },
        quote: {
          id: 'quote-123',
          url: 'https://twitter.com/quoted/status/456',
          text: 'Quoted tweet',
          author: {
            id: 'quoted-author',
            name: 'Quoted Author',
            screen_name: 'quotedauthor',
            avatar_url: 'https://pbs.twimg.com/quoted-avatar.jpg',
          },
          created_at: '2024-01-14T12:00:00Z',
          replies: 0,
          retweets: 0,
          likes: 0,
          media: {
            photos: [{ url: 'https://pbs.twimg.com/quote-photo.jpg', width: 1200, height: 800 }],
          },
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://pbs.twimg.com/main-photo.jpg')
    })
  })

  describe('Priority 4: External link thumbnail', () => {
    it('returns external thumbnail when no other media available', () => {
      const tweet = createTweet({
        external: {
          url: 'https://example.com/article',
          display_url: 'example.com/article',
          expanded_url: 'https://example.com/article',
          title: 'External Article',
          description: 'Article description',
          thumbnail_url: 'https://example.com/thumbnail.jpg',
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://example.com/thumbnail.jpg')
    })

    it('prefers article cover over external thumbnail', () => {
      const tweet = createTweet({
        article: {
          id: 'article-123',
          title: 'X Article',
          cover_media: {
            media_info: {
              __typename: 'Image',
              original_img_url: 'https://pbs.twimg.com/article-cover.jpg',
            },
          },
        },
        external: {
          url: 'https://example.com/article',
          display_url: 'example.com/article',
          expanded_url: 'https://example.com/article',
          thumbnail_url: 'https://example.com/external-thumb.jpg',
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://pbs.twimg.com/article-cover.jpg')
    })
  })

  describe('Priority 5: Fallback to logo', () => {
    it('returns logo URL for text-only tweets', () => {
      const tweet = createTweet({})

      expect(getOgImage(tweet, BASE_URL)).toBe('https://example.com/og-logo.png')
    })

    it('returns logo when media object exists but is empty', () => {
      const tweet = createTweet({
        media: {
          photos: [],
          videos: [],
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://example.com/og-logo.png')
    })

    it('returns logo when quote exists but has no media', () => {
      const tweet = createTweet({
        quote: {
          id: 'quote-123',
          url: 'https://twitter.com/quoted/status/456',
          text: 'Text-only quoted tweet',
          author: {
            id: 'quoted-author',
            name: 'Quoted Author',
            screen_name: 'quotedauthor',
            avatar_url: 'https://pbs.twimg.com/quoted-avatar.jpg',
          },
          created_at: '2024-01-14T12:00:00Z',
          replies: 0,
          retweets: 0,
          likes: 0,
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://example.com/og-logo.png')
    })
  })

  describe('Edge cases', () => {
    it('handles article without cover_media', () => {
      const tweet = createTweet({
        article: {
          id: 'article-123',
          title: 'Article without cover',
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://example.com/og-logo.png')
    })

    it('handles article with cover_media but no media_info', () => {
      const tweet = createTweet({
        article: {
          id: 'article-123',
          title: 'Article',
          cover_media: {},
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://example.com/og-logo.png')
    })

    it('handles external without thumbnail_url', () => {
      const tweet = createTweet({
        external: {
          url: 'https://example.com/page',
          display_url: 'example.com/page',
          expanded_url: 'https://example.com/page',
          title: 'Page without thumbnail',
        },
      })

      expect(getOgImage(tweet, BASE_URL)).toBe('https://example.com/og-logo.png')
    })
  })
})
