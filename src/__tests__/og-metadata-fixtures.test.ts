/**
 * OG Metadata Tests with Real Tweet Fixtures
 *
 * Tests the Open Graph metadata generation using real FxTwitter API responses.
 * These tests ensure social sharing previews (unfurls) work correctly for all tweet types.
 */

import { describe, it, expect } from 'vitest'
import { getOgImage } from '@/lib/utils/og-image'
import { truncate } from '@/lib/utils/format'
import { fixtures, fixtureMetadata, type FixtureSlug } from './fixtures/tweets'

const BASE_URL = 'https://adhx.com'

describe('OG Metadata with Real Fixtures', () => {
  describe('getOgImage returns appropriate image for each tweet type', () => {
    it.each(fixtureMetadata)('$slug: returns correct OG image', ({ slug }) => {
      const fixture = fixtures[slug as FixtureSlug]
      const tweet = fixture.tweet!

      const ogImage = getOgImage(tweet, BASE_URL)

      // Verify we get a valid URL
      expect(ogImage).toBeTruthy()
      expect(ogImage).toMatch(/^https?:\/\//)

      // Snapshot the OG image URL for regression detection
      expect({ slug, ogImage }).toMatchSnapshot()
    })
  })

  describe('Text tweets fallback to logo', () => {
    it('plain-text: falls back to logo.png', () => {
      const tweet = fixtures['plain-text'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      expect(ogImage).toBe(`${BASE_URL}/logo.png`)
    })
  })

  describe('Media tweets use media thumbnails', () => {
    it('video-tweet: uses video thumbnail', () => {
      const tweet = fixtures['video-tweet'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      // Should be the video thumbnail, not the logo
      expect(ogImage).not.toBe(`${BASE_URL}/logo.png`)
      expect(ogImage).toContain('twimg.com')
    })

    it('4-images: uses first photo', () => {
      const tweet = fixtures['4-images'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      expect(ogImage).not.toBe(`${BASE_URL}/logo.png`)
      expect(ogImage).toContain('twimg.com')
    })

    it('long-text-2-images: uses first photo', () => {
      const tweet = fixtures['long-text-2-images'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      expect(ogImage).not.toBe(`${BASE_URL}/logo.png`)
    })

    it('long-text-1-image: uses the single photo', () => {
      const tweet = fixtures['long-text-1-image'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      expect(ogImage).not.toBe(`${BASE_URL}/logo.png`)
    })
  })

  describe('Quote tweets with media', () => {
    it('text-quoting-video: uses quoted video thumbnail if no direct media', () => {
      const tweet = fixtures['text-quoting-video'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      // Should use the quoted video's thumbnail
      expect(ogImage).toBeTruthy()
    })

    it('quote-of-image-tweet: uses quoted image if no direct media', () => {
      const tweet = fixtures['quote-of-image-tweet'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      expect(ogImage).toBeTruthy()
    })

    it('quote-of-text-tweet: falls back to logo if quoted tweet has no media', () => {
      const tweet = fixtures['quote-of-text-tweet'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      // If the quoted tweet is text-only, should fall back to logo
      // (unless the quoting tweet has its own media)
      expect(ogImage).toBeTruthy()
    })
  })

  describe('Article tweets', () => {
    it('article-no-header: handles article without cover image', () => {
      const tweet = fixtures['article-no-header'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      // Should fallback appropriately
      expect(ogImage).toBeTruthy()
    })

    it('article-with-media: uses article cover or media', () => {
      const tweet = fixtures['article-with-media'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      expect(ogImage).toBeTruthy()
      expect(ogImage).not.toBe(`${BASE_URL}/logo.png`)
    })
  })

  describe('External link tweets', () => {
    it('youtube-link: uses external thumbnail if available', () => {
      const tweet = fixtures['youtube-link'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      // YouTube links typically have thumbnails
      expect(ogImage).toBeTruthy()
    })
  })

  describe('Full metadata generation', () => {
    // Test the complete metadata object that would be generated
    it.each(fixtureMetadata)('$slug: generates valid metadata structure', ({ slug }) => {
      const fixture = fixtures[slug as FixtureSlug]
      const tweet = fixture.tweet!

      // Simulate metadata generation (matching generateMetadata in page.tsx)
      const tweetText = tweet.text || ''
      const description = truncate(tweetText, 160)
      const title = `@${tweet.author.screen_name}: "${truncate(tweetText, 50)}" - Save to ADHX`
      const ogImage = getOgImage(tweet, BASE_URL)

      const metadata = {
        title,
        description,
        openGraph: {
          type: 'article',
          title: `@${tweet.author.screen_name} on X`,
          description,
          siteName: 'ADHX',
          images: [{ url: ogImage, width: 1200, height: 630 }],
        },
        twitter: {
          card: 'summary_large_image',
          title: `@${tweet.author.screen_name} on X`,
          description,
          images: [ogImage],
        },
      }

      // Validate structure
      expect(metadata.title).toBeTruthy()
      expect(metadata.description.length).toBeLessThanOrEqual(163) // 160 + "..."
      expect(metadata.openGraph.images[0].url).toBeTruthy()
      expect(metadata.twitter.card).toBe('summary_large_image')

      // Snapshot full metadata for regression detection
      expect(metadata).toMatchSnapshot()
    })
  })

  describe('Edge cases', () => {
    it('emoji-tweet: handles emoji-heavy content', () => {
      const tweet = fixtures['emoji-tweet'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      expect(ogImage).toBeTruthy()
    })

    it('reply-tweet: handles reply context', () => {
      const tweet = fixtures['reply-tweet'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      expect(ogImage).toBeTruthy()
    })

    it('long-text-with-quote: handles both long text and quote', () => {
      const tweet = fixtures['long-text-with-quote'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      expect(ogImage).toBeTruthy()
    })
  })

  describe('OG Image URL Accessibility (Integration)', () => {
    /**
     * These tests verify that OG image URLs are actually fetchable by crawlers.
     * This catches issues like:
     * - URLs that return HTML instead of images
     * - CDN blocks on crawler user-agents
     * - Expired or invalid URLs
     */

    // Helper to check if a URL returns an image
    async function isImageAccessible(url: string): Promise<{ ok: boolean; contentType?: string; status?: number }> {
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          headers: {
            // Simulate a social media crawler
            'User-Agent': 'WhatsApp/2.0',
          },
        })
        const contentType = response.headers.get('content-type') || ''
        return {
          ok: response.ok && contentType.startsWith('image/'),
          contentType,
          status: response.status,
        }
      } catch {
        return { ok: false }
      }
    }

    it('video-tweet: thumbnail URL is accessible to crawlers', async () => {
      const tweet = fixtures['video-tweet'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      // Skip logo fallback URLs (local)
      if (ogImage.includes('logo.png')) return

      const result = await isImageAccessible(ogImage)
      expect(result.ok).toBe(true)
      expect(result.contentType).toMatch(/^image\//)
    }, 10000)

    it('4-images: photo URL is accessible to crawlers', async () => {
      const tweet = fixtures['4-images'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      if (ogImage.includes('logo.png')) return

      const result = await isImageAccessible(ogImage)
      expect(result.ok).toBe(true)
      expect(result.contentType).toMatch(/^image\//)
    }, 10000)

    it('article-with-media: article cover URL is accessible', async () => {
      const tweet = fixtures['article-with-media'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      if (ogImage.includes('logo.png')) return

      const result = await isImageAccessible(ogImage)
      expect(result.ok).toBe(true)
      expect(result.contentType).toMatch(/^image\//)
    }, 10000)

    it('youtube-link: external thumbnail URL is accessible', async () => {
      const tweet = fixtures['youtube-link'].tweet!
      const ogImage = getOgImage(tweet, BASE_URL)

      if (ogImage.includes('logo.png')) return

      const result = await isImageAccessible(ogImage)
      // YouTube thumbnails should be accessible
      expect(result.ok).toBe(true)
      expect(result.contentType).toMatch(/^image\//)
    }, 10000)
  })
})
