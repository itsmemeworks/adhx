/**
 * FxEmbed Media Proxy Utilities
 *
 * FxEmbed (fxtwitter.com) is a proxy service that serves Twitter media
 * with proper embed support. This eliminates the need for local media storage.
 *
 * URL Patterns:
 * - Videos: https://d.fxtwitter.com/{author}/status/{tweetId}.mp4
 * - Photos: https://d.fixupx.com/{author}/status/{tweetId}/photo/{index}
 * - Embed:  https://fxtwitter.com/{author}/status/{tweetId}
 */

export interface MediaUrlOptions {
  tweetId: string
  author: string
  mediaType: 'photo' | 'video' | 'animated_gif'
  mediaIndex?: number // 1-based index for multiple photos
  mediaKey?: string // Twitter media key for original URL fallback
}

/**
 * Get FxEmbed video URL (works for videos and GIFs)
 */
export function getVideoUrl(author: string, tweetId: string): string {
  return `https://d.fxtwitter.com/${author}/status/${tweetId}.mp4`
}

/**
 * Get FxEmbed photo URL
 * @param index 1-based index for multiple photos (default: 1)
 */
export function getPhotoUrl(author: string, tweetId: string, index: number = 1): string {
  return `https://d.fixupx.com/${author}/status/${tweetId}/photo/${index}`
}

/**
 * Get original Twitter image URL (pbs.twimg.com)
 * These URLs are more reliable but may expire
 */
export function getTwitterImageUrl(
  mediaKey: string,
  size: 'small' | 'medium' | 'large' | 'orig' = 'large'
): string {
  return `https://pbs.twimg.com/media/${mediaKey}?format=jpg&name=${size}`
}

/**
 * Get FxTwitter embed URL (for sharing)
 */
export function getEmbedUrl(author: string, tweetId: string): string {
  return `https://fxtwitter.com/${author}/status/${tweetId}`
}

/**
 * Resolve the best URL for a media item
 */
export function resolveMediaUrl(options: MediaUrlOptions): string {
  const { tweetId, author, mediaType, mediaIndex = 1 } = options

  switch (mediaType) {
    case 'video':
    case 'animated_gif':
      return getVideoUrl(author, tweetId)
    case 'photo':
      return getPhotoUrl(author, tweetId, mediaIndex)
    default:
      return getPhotoUrl(author, tweetId, mediaIndex)
  }
}

/**
 * Get a shareable URL for the media (direct download/embed)
 */
export function getShareableUrl(options: MediaUrlOptions): string {
  const { tweetId, author, mediaType, mediaIndex = 1 } = options

  switch (mediaType) {
    case 'video':
    case 'animated_gif':
      // Direct MP4 URL
      return getVideoUrl(author, tweetId)
    case 'photo':
      // Direct photo URL
      return getPhotoUrl(author, tweetId, mediaIndex)
    default:
      // Embed URL as fallback
      return getEmbedUrl(author, tweetId)
  }
}

/**
 * Get the download URL for a media item
 * Same as shareable URL - FxEmbed URLs can be used directly
 */
export function getDownloadUrl(options: MediaUrlOptions): string {
  return getShareableUrl(options)
}

/**
 * Get thumbnail URL for a media item
 * For videos, we use the preview image URL from Twitter
 * For photos, we use a smaller version
 */
export function getThumbnailUrl(options: MediaUrlOptions & { previewUrl?: string }): string {
  const { mediaType, previewUrl } = options

  // For videos, use the preview image from Twitter API
  if ((mediaType === 'video' || mediaType === 'animated_gif') && previewUrl) {
    return previewUrl
  }

  // For photos, use the same URL (browsers will handle sizing)
  return resolveMediaUrl(options)
}

/**
 * Extract media index from a composite media ID
 * Media IDs are formatted as: {tweetId}_{mediaKey}
 */
export function extractMediaIndex(mediaId: string, allMediaIds: string[]): number {
  const index = allMediaIds.findIndex((id) => id === mediaId)
  return index >= 0 ? index + 1 : 1 // 1-based index
}

/**
 * FxTwitter API response types
 */
export interface FxTwitterResponse {
  code: number
  message: string
  tweet?: {
    id: string
    url: string
    text: string
    author: {
      id: string
      name: string
      screen_name: string
      avatar_url: string
      banner_url?: string
    }
    created_at: string
    replies: number
    retweets: number
    likes: number
    views?: number
    // Reply information
    replying_to?: string // Username being replied to (without @)
    replying_to_status?: string // Parent tweet ID (may not be present)
    media?: {
      photos?: Array<{
        url: string
        width: number
        height: number
      }>
      videos?: Array<{
        url: string
        thumbnail_url: string
        width: number
        height: number
        duration: number
      }>
      // Combined array with type field (used by add endpoint)
      all?: Array<{
        type: 'photo' | 'video' | 'animated_gif'
        url: string
        thumbnail_url?: string
        width: number
        height: number
        duration?: number
      }>
    }
    // URLs extracted from tweet text
    urls?: Array<{
      url: string
      expanded_url?: string
      display_url?: string
      domain?: string
    }>
    // External link preview (Twitter Card)
    twitter_card?: 'summary' | 'summary_large_image' | 'player'
    external?: {
      url: string
      display_url: string
      expanded_url: string
      title?: string
      description?: string
      thumbnail_url?: string
    }
    // Quote tweet (when this tweet quotes another)
    quote?: {
      id: string
      url: string
      text: string
      author: {
        id: string
        name: string
        screen_name: string
        avatar_url: string
      }
      created_at: string
      replies: number
      retweets: number
      likes: number
      views?: number
      media?: {
        photos?: Array<{
          url: string
          width: number
          height: number
        }>
        videos?: Array<{
          url: string
          thumbnail_url: string
          width: number
          height: number
        }>
      }
      // Article in quoted tweet
      article?: {
        id: string
        title: string
        preview_text?: string
        cover_media?: {
          media_info?: {
            original_img_url?: string
          }
        }
      }
      // External link in quoted tweet
      external?: {
        url: string
        expanded_url?: string
        title?: string
        description?: string
        thumbnail_url?: string
      }
    }
    // X Article content
    article?: {
      id: string
      title: string
      preview_text?: string
      created_at?: string
      modified_at?: string
      cover_media?: {
        media_key?: string
        media_id?: string
        media_info?: {
          __typename: string
          original_img_url?: string
          original_img_width?: number
          original_img_height?: number
        }
      }
      // Media entities with actual image URLs
      media_entities?: Array<{
        media_id: string
        media_key?: string
        media_info?: {
          __typename: string
          original_img_url?: string
          original_img_width?: number
          original_img_height?: number
        }
      }>
      content?: {
        blocks: Array<{
          key: string
          text: string
          type: string // 'unstyled' | 'header-one' | 'header-two' | 'atomic' | etc
          data?: Record<string, unknown>
          entityRanges?: Array<{ key: number; length: number; offset: number }>
          inlineStyleRanges?: Array<{ length: number; offset: number; style: string }>
        }>
        entityMap?: Record<string, {
          type: string // 'IMAGE' | 'LINK' | etc
          data: {
            url?: string
            src?: string
            width?: number
            height?: number
            alt?: string
          }
        }>
      }
    }
  }
}

/**
 * Fetch tweet data from FxTwitter API
 * Returns author profile image and external link preview data
 */
export async function fetchTweetData(author: string, tweetId: string): Promise<FxTwitterResponse | null> {
  try {
    // Add 5 second timeout to prevent hanging when FxTwitter is slow/down
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`https://api.fxtwitter.com/${author}/status/${tweetId}`, {
      headers: {
        'User-Agent': 'ADHX/1.0',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      console.error(`FxTwitter API error: ${response.status}`)
      return null
    }

    const data = await response.json() as FxTwitterResponse
    return data
  } catch (error) {
    // AbortError means timeout - log differently for clarity
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('FxTwitter API request timed out after 5s')
    } else {
      console.error('Failed to fetch tweet data from FxTwitter:', error)
    }
    return null
  }
}

/**
 * Extract enrichment data from FxTwitter response
 */
export function extractEnrichmentData(data: FxTwitterResponse) {
  if (!data.tweet) return null

  // Build correct article URL using author and tweet ID
  const articleUrl = data.tweet.article
    ? `https://x.com/${data.tweet.author.screen_name}/article/${data.tweet.id}`
    : null

  return {
    authorProfileImageUrl: data.tweet.author.avatar_url,
    authorName: data.tweet.author.name,
    // External link preview
    external: data.tweet.external ? {
      url: data.tweet.external.expanded_url || data.tweet.external.url,
      title: data.tweet.external.title,
      description: data.tweet.external.description,
      imageUrl: data.tweet.external.thumbnail_url,
    } : null,
    // X Article data with full content including entityMap for images/links
    article: data.tweet.article ? {
      url: articleUrl,
      title: data.tweet.article.title,
      description: data.tweet.article.preview_text,
      imageUrl: data.tweet.article.cover_media?.media_info?.original_img_url,
      // Include full article content with blocks, entityMap, and media_entities for rendering
      content: data.tweet.article.content ? {
        blocks: data.tweet.article.content.blocks,
        // FxTwitter returns entityMap as array [{key, value}], convert to dictionary
        entityMap: Array.isArray(data.tweet.article.content.entityMap)
          ? data.tweet.article.content.entityMap.reduce((acc: Record<string, unknown>, item: { key: string; value: unknown }) => {
              acc[item.key] = item.value
              return acc
            }, {})
          : (data.tweet.article.content.entityMap || {}),
        // Include media_entities to map mediaId to actual image URLs
        mediaEntities: data.tweet.article.media_entities?.reduce((acc: Record<string, { url: string; width?: number; height?: number }>, entity) => {
          if (entity.media_id && entity.media_info?.original_img_url) {
            acc[entity.media_id] = {
              url: entity.media_info.original_img_url,
              width: entity.media_info.original_img_width,
              height: entity.media_info.original_img_height,
            }
          }
          return acc
        }, {}),
      } : null,
    } : null,
  }
}

/**
 * Build media URLs for a bookmark with all its media items
 */
export function buildMediaUrls(
  bookmark: { id: string; author: string },
  media: Array<{
    id: string
    mediaType: string
    previewUrl?: string | null
    originalUrl: string
  }>
): Array<{
  id: string
  type: string
  url: string
  thumbnailUrl: string
  shareUrl: string
  downloadUrl: string
}> {
  return media.map((item, index) => {
    const mediaType = item.mediaType as 'photo' | 'video' | 'animated_gif'
    const options: MediaUrlOptions = {
      tweetId: bookmark.id,
      author: bookmark.author,
      mediaType,
      mediaIndex: index + 1, // 1-based
    }

    return {
      id: item.id,
      type: item.mediaType,
      url: resolveMediaUrl(options),
      thumbnailUrl: getThumbnailUrl({ ...options, previewUrl: item.previewUrl || undefined }),
      shareUrl: getShareableUrl(options),
      downloadUrl: getDownloadUrl(options),
    }
  })
}
