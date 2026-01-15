import type { FxTwitterResponse } from '@/lib/media/fxembed'

type FxTweet = NonNullable<FxTwitterResponse['tweet']>

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
    return tweet.media.photos[0].url
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
    return tweet.quote.media.photos[0].url
  }
  if (tweet.quote?.media?.videos?.[0]?.thumbnail_url) {
    return tweet.quote.media.videos[0].thumbnail_url
  }

  // 4. External link thumbnail (Twitter Card previews)
  if (tweet.external?.thumbnail_url) {
    return tweet.external.thumbnail_url
  }

  // 5. Fallback to logo for text-only tweets
  return `${baseUrl}/logo.png`
}
