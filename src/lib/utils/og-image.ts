import type { FxTwitterResponse } from '@/lib/media/fxembed'

type FxTweet = NonNullable<FxTwitterResponse['tweet']>

export interface OgImageResult {
  url: string
  width?: number
  height?: number
}

/**
 * Strip query params from Twitter media URLs for OG images.
 *
 * Twitter's CDN returns different headers based on URL format:
 * - With ?name=orig/large: No CORS headers → WhatsApp/Facebook crawlers fail
 * - Without query params: Has access-control-allow-origin: * → Crawlers work
 *
 * Video thumbnails don't have this issue (always have CORS headers).
 */
function stripTwitterMediaParams(url: string): string {
  if (url.includes('pbs.twimg.com/media/')) {
    return url.split('?')[0]
  }
  return url
}

/**
 * Select the best OG image for a tweet in priority order:
 * 1. Direct media (photo or video thumbnail)
 * 2. Article cover image (X Articles)
 * 3. Quote tweet media (if parent has no media)
 * 4. External link thumbnail
 * 5. Fallback to logo
 *
 * Returns URL string for backward compatibility. Use getOgImages() for dimensions.
 */
export function getOgImage(tweet: FxTweet, baseUrl: string): string {
  return getOgImages(tweet, baseUrl)[0].url
}

/**
 * Get all OG images for a tweet with dimensions.
 * Returns up to 4 images for multi-photo tweets.
 * First image follows the same priority as getOgImage().
 */
export function getOgImages(tweet: FxTweet, baseUrl: string): OgImageResult[] {
  // 1. Direct media on the tweet
  if (tweet.media?.photos?.length) {
    return tweet.media.photos.slice(0, 4).map((photo) => ({
      url: stripTwitterMediaParams(photo.url),
      width: photo.width,
      height: photo.height,
    }))
  }
  if (tweet.media?.videos?.[0]?.thumbnail_url) {
    const video = tweet.media.videos[0]
    return [{
      url: video.thumbnail_url,
      width: video.width,
      height: video.height,
    }]
  }

  // 2. Article cover image (X Articles feature)
  const articleMedia = tweet.article?.cover_media?.media_info
  if (articleMedia?.original_img_url) {
    return [{
      url: articleMedia.original_img_url,
      width: articleMedia.original_img_width,
      height: articleMedia.original_img_height,
    }]
  }

  // 3. Quote tweet media (when parent tweet has no media)
  if (tweet.quote?.media?.photos?.[0]?.url) {
    const photo = tweet.quote.media.photos[0]
    return [{
      url: stripTwitterMediaParams(photo.url),
      width: photo.width,
      height: photo.height,
    }]
  }
  if (tweet.quote?.media?.videos?.[0]?.thumbnail_url) {
    const video = tweet.quote.media.videos[0]
    return [{
      url: video.thumbnail_url,
      width: video.width,
      height: video.height,
    }]
  }

  // 4. External link thumbnail (Twitter Card previews — no dimensions available)
  if (tweet.external?.thumbnail_url) {
    return [{ url: tweet.external.thumbnail_url }]
  }

  // 5. Fallback to optimized OG logo for text-only tweets
  // Using og-logo.png (150KB) instead of logo.png (918KB) for faster crawler fetches
  return [{ url: `${baseUrl}/og-logo.png`, width: 1200, height: 630 }]
}
