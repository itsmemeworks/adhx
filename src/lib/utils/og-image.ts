import type { FxTwitterResponse } from '@/lib/media/fxembed'

type FxTweet = NonNullable<FxTwitterResponse['tweet']>

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
 */
export function getOgImage(tweet: FxTweet, baseUrl: string): string {
  // 1. Direct media on the tweet
  if (tweet.media?.photos?.[0]?.url) {
    // Strip ?name=orig to ensure CORS headers for social media crawlers
    return stripTwitterMediaParams(tweet.media.photos[0].url)
  }
  if (tweet.media?.videos?.[0]?.thumbnail_url) {
    return tweet.media.videos[0].thumbnail_url
  }

  // 2. Article cover image (X Articles feature)
  if (tweet.article?.cover_media?.media_info?.original_img_url) {
    return tweet.article.cover_media.media_info.original_img_url
  }

  // 3. Quote tweet media (when parent tweet has no media)
  if (tweet.quote?.media?.photos?.[0]?.url) {
    return stripTwitterMediaParams(tweet.quote.media.photos[0].url)
  }
  if (tweet.quote?.media?.videos?.[0]?.thumbnail_url) {
    return tweet.quote.media.videos[0].thumbnail_url
  }

  // 4. External link thumbnail (Twitter Card previews)
  if (tweet.external?.thumbnail_url) {
    return tweet.external.thumbnail_url
  }

  // 5. Fallback to optimized OG logo for text-only tweets
  // Using og-logo.png (150KB) instead of logo.png (918KB) for faster crawler fetches
  return `${baseUrl}/og-logo.png`
}
