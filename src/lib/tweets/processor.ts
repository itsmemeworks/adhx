/**
 * Unified Tweet Processing Module
 *
 * Consolidates tweet extraction, transformation, and categorization logic
 * used by both /api/tweets/add and /api/sync endpoints.
 *
 * This module provides a single source of truth for:
 * - Tweet URL parsing
 * - Category determination (combines media detection + URL patterns)
 * - Quote/retweet context building
 * - Article content processing (entityMap conversion)
 * - Media and link processing utilities
 */

import { fetchTweetData, type FxTwitterResponse } from '@/lib/media/fxembed'

// ============================================================================
// Types
// ============================================================================

/** Parsed result from a tweet URL */
export interface ParsedTweetUrl {
  author: string
  tweetId: string
}

/** Tweet category types */
export type TweetCategory = 'article' | 'video' | 'photo' | 'text' | 'tweet'

/** Quote context structure stored in database */
export interface QuoteContext {
  tweetId: string
  author: string
  authorName: string | null
  authorProfileImageUrl: string | null
  text: string
  media: {
    photos?: Array<{ url: string; width: number; height: number }>
    videos?: Array<{ url: string; thumbnail_url: string; width: number; height: number }>
  } | null
  article: {
    url: string
    title: string
    description: string | null
    imageUrl: string | null
  } | null
  external: {
    url: string
    title: string | null
    description: string | null
    imageUrl: string | null
  } | null
  createdAt?: string
}

/** Retweet context structure stored in database */
export interface RetweetContext {
  tweetId: string
  author: string
  authorName: string
  authorProfileImageUrl: string
  text: string
  media: {
    photos?: Array<{ url: string; width: number; height: number }>
    videos?: Array<{ url: string; thumbnail_url: string; width: number; height: number }>
  } | null
}

/** Article content with blocks, entityMap, and mediaEntities */
export interface ArticleContent {
  blocks: Array<{
    key: string
    text: string
    type: string
    data?: Record<string, unknown>
    entityRanges?: Array<{ key: number; length: number; offset: number }>
    inlineStyleRanges?: Array<{ length: number; offset: number; style: string }>
  }>
  entityMap: Record<string, unknown>
  mediaEntities?: Record<string, { url: string; width?: number; height?: number }>
}

/** Media item ready for database insertion */
export interface ProcessedMediaItem {
  id: string
  bookmarkId: string
  mediaType: 'photo' | 'video' | 'animated_gif'
  originalUrl: string
  previewUrl?: string
  width?: number
  height?: number
  durationMs?: number
}

/** Link item ready for database insertion */
export interface ProcessedLinkItem {
  bookmarkId: string
  originalUrl?: string
  expandedUrl: string
  domain: string
  linkType?: string
  previewTitle?: string
  previewDescription?: string
  previewImageUrl?: string
  contentJson?: string
}

// ============================================================================
// URL Parsing
// ============================================================================

/**
 * Parse a tweet URL to extract author and tweet ID.
 * Supports multiple URL formats:
 * - https://twitter.com/user/status/123
 * - https://x.com/user/status/123
 * - https://mobile.twitter.com/user/status/123
 * - https://vxtwitter.com/user/status/123
 * - https://fxtwitter.com/user/status/123
 */
export function parseTweetUrl(url: string): ParsedTweetUrl | null {
  const pattern =
    /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter|x|vxtwitter|fxtwitter)\.com\/([^/]+)\/status\/(\d+)/i

  const match = url.match(pattern)
  if (match) {
    return { author: match[1], tweetId: match[2] }
  }

  return null
}

// ============================================================================
// Category Determination
// ============================================================================

/**
 * Known article/blog URL patterns for categorization
 */
const ARTICLE_URL_PATTERNS = [
  'medium.com',
  'substack.com',
  'dev.to',
  '/article/',
  '/blog/',
]

/**
 * Determine tweet category from FxTwitter response.
 * Combines media detection with URL pattern matching for consistent categorization.
 *
 * Priority: article > video > photo > external links > text
 */
export function determineCategory(tweet: FxTwitterResponse['tweet']): TweetCategory {
  if (!tweet) return 'text'

  // Check for X Article
  if (tweet.article) {
    return 'article'
  }

  // Check for video content (either in videos array or all array with type='video')
  if (tweet.media?.videos && tweet.media.videos.length > 0) {
    return 'video'
  }
  if (tweet.media?.all?.some(m => m.type === 'video' || m.type === 'animated_gif')) {
    return 'video'
  }

  // Check for photos (either in photos array or all array with type='photo')
  if (tweet.media?.photos && tweet.media.photos.length > 0) {
    return 'photo'
  }
  if (tweet.media?.all?.some(m => m.type === 'photo')) {
    return 'photo'
  }

  // Check for external links that are known article platforms
  if (tweet.external?.expanded_url) {
    const url = tweet.external.expanded_url.toLowerCase()
    if (ARTICLE_URL_PATTERNS.some((pattern) => url.includes(pattern))) {
      return 'article'
    }
  }

  return 'text'
}

/**
 * Determine category from URL patterns only (for sync endpoint fallback).
 * Used when FxTwitter enrichment isn't available.
 */
export function categorizeTweetByUrls(urls: Array<{ expandedUrl: string }>): TweetCategory {
  for (const url of urls) {
    const expanded = url.expandedUrl.toLowerCase()
    if (ARTICLE_URL_PATTERNS.some((pattern) => expanded.includes(pattern))) {
      return 'article'
    }
  }
  return 'tweet'
}

// ============================================================================
// Context Building
// ============================================================================

/**
 * Build quote context JSON from FxTwitter quote data.
 * This is stored in the database for displaying quoted tweets.
 */
export function buildQuoteContext(
  quote: NonNullable<FxTwitterResponse['tweet']>['quote']
): QuoteContext | null {
  if (!quote) return null

  // Article URL for future use (quoted tweet articles)
  const _articleUrl = quote.author?.screen_name
    ? `https://x.com/${quote.author.screen_name}/article/${quote.id}`
    : null

  return {
    tweetId: quote.id,
    author: quote.author?.screen_name || 'unknown',
    authorName: quote.author?.name || null,
    authorProfileImageUrl: quote.author?.avatar_url || null,
    text: quote.text,
    media: quote.media
      ? {
          photos: quote.media.photos,
          videos: quote.media.videos,
        }
      : null,
    article: null, // Quote tweets in FxTwitter don't include nested article data
    external: null,
    createdAt: quote.created_at,
  }
}

/**
 * Build quote context from full FxTwitter tweet response.
 * Used when fetching quoted tweet data separately.
 */
export function buildQuoteContextFromTweet(
  tweet: NonNullable<FxTwitterResponse['tweet']>
): QuoteContext {
  const articleUrl = tweet.article
    ? `https://x.com/${tweet.author.screen_name}/article/${tweet.id}`
    : null

  return {
    tweetId: tweet.id,
    author: tweet.author.screen_name,
    authorName: tweet.author.name,
    authorProfileImageUrl: tweet.author.avatar_url,
    text: tweet.text,
    media: tweet.media
      ? {
          photos: tweet.media.photos,
          videos: tweet.media.videos,
        }
      : null,
    article: tweet.article
      ? {
          url: articleUrl!,
          title: tweet.article.title,
          description: tweet.article.preview_text || null,
          imageUrl: tweet.article.cover_media?.media_info?.original_img_url || null,
        }
      : null,
    external: tweet.external
      ? {
          url: tweet.external.expanded_url || tweet.external.url,
          title: tweet.external.title || null,
          description: tweet.external.description || null,
          imageUrl: tweet.external.thumbnail_url || null,
        }
      : null,
    createdAt: tweet.created_at,
  }
}

/**
 * Build retweet context JSON from FxTwitter tweet data.
 */
export function buildRetweetContext(
  tweet: NonNullable<FxTwitterResponse['tweet']>
): RetweetContext {
  return {
    tweetId: tweet.id,
    author: tweet.author.screen_name,
    authorName: tweet.author.name,
    authorProfileImageUrl: tweet.author.avatar_url,
    text: tweet.text,
    media: tweet.media
      ? {
          photos: tweet.media.photos,
          videos: tweet.media.videos,
        }
      : null,
  }
}

// ============================================================================
// Article Content Processing
// ============================================================================

/**
 * Build article content structure from FxTwitter article data.
 * Handles entityMap conversion from array to dictionary format.
 */
export function buildArticleContent(
  article: NonNullable<NonNullable<FxTwitterResponse['tweet']>['article']>
): ArticleContent | null {
  if (!article.content) return null

  // FxTwitter returns entityMap as array [{key, value}], convert to dictionary
  const entityMap = Array.isArray(article.content.entityMap)
    ? (article.content.entityMap as Array<{ key: string; value: unknown }>).reduce(
        (acc, item) => {
          acc[item.key] = item.value
          return acc
        },
        {} as Record<string, unknown>
      )
    : article.content.entityMap || {}

  // Build mediaEntities mapping from media_entities array
  const mediaEntities = article.media_entities?.reduce(
    (
      acc: Record<string, { url: string; width?: number; height?: number }>,
      entity: {
        media_id?: string
        media_info?: {
          original_img_url?: string
          original_img_width?: number
          original_img_height?: number
        }
      }
    ) => {
      if (entity.media_id && entity.media_info?.original_img_url) {
        acc[entity.media_id] = {
          url: entity.media_info.original_img_url,
          width: entity.media_info.original_img_width,
          height: entity.media_info.original_img_height,
        }
      }
      return acc
    },
    {}
  )

  return {
    blocks: article.content.blocks,
    entityMap,
    mediaEntities,
  }
}

/**
 * Build article preview data for storage.
 */
export function buildArticlePreview(
  article: NonNullable<NonNullable<FxTwitterResponse['tweet']>['article']>,
  authorUsername: string,
  tweetId: string
): {
  title: string
  description: string | null
  imageUrl: string | null
  url: string
  domain: string
} {
  return {
    title: article.title,
    description: article.preview_text || null,
    imageUrl: article.cover_media?.media_info?.original_img_url || null,
    url: `https://x.com/${authorUsername}/article/${tweetId}`,
    domain: 'x.com',
  }
}

// ============================================================================
// Media Processing
// ============================================================================

/**
 * Generate a consistent media ID.
 * Uses index-based IDs for consistency across add and sync endpoints.
 *
 * Format: {tweetId}_{type}_{index}
 * Example: 123456789_photo_0, 123456789_video_0
 */
export function generateMediaId(
  tweetId: string,
  mediaType: 'photo' | 'video',
  index: number
): string {
  return `${tweetId}_${mediaType}_${index}`
}

/**
 * Process photos from FxTwitter response into database-ready items.
 */
export function processPhotos(
  tweetId: string,
  photos: NonNullable<NonNullable<FxTwitterResponse['tweet']>['media']>['photos']
): ProcessedMediaItem[] {
  if (!photos) return []

  return photos.map((photo, index) => ({
    id: generateMediaId(tweetId, 'photo', index),
    bookmarkId: tweetId,
    mediaType: 'photo' as const,
    originalUrl: photo.url,
    width: photo.width,
    height: photo.height,
  }))
}

/**
 * Process videos from FxTwitter response into database-ready items.
 */
export function processVideos(
  tweetId: string,
  videos: NonNullable<NonNullable<FxTwitterResponse['tweet']>['media']>['videos']
): ProcessedMediaItem[] {
  if (!videos) return []

  return videos.map((video, index) => ({
    id: generateMediaId(tweetId, 'video', index),
    bookmarkId: tweetId,
    mediaType: 'video' as const,
    originalUrl: video.url,
    previewUrl: video.thumbnail_url,
    width: video.width,
    height: video.height,
    durationMs: video.duration ? video.duration * 1000 : undefined,
  }))
}

/**
 * Process all media from FxTwitter response.
 */
export function processMedia(
  tweetId: string,
  media: NonNullable<FxTwitterResponse['tweet']>['media']
): ProcessedMediaItem[] {
  if (!media) return []

  return [...processPhotos(tweetId, media.photos), ...processVideos(tweetId, media.videos)]
}

// ============================================================================
// Link Processing
// ============================================================================

/**
 * Extract domain from a URL.
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace('www.', '')
  } catch {
    return ''
  }
}

/**
 * Determine link type from URL.
 */
export function determineLinkType(url: string): string {
  const lower = url.toLowerCase()

  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'tweet'
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'video'
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(lower)) return 'image'
  if (/\.(mp4|webm|mov)$/i.test(lower)) return 'media'

  return 'link'
}

/**
 * Check if a URL is a self-referencing tweet link (should be skipped).
 */
export function isSelfLink(url: string): boolean {
  return url.includes('/status/')
}

// ============================================================================
// FxTwitter API
// ============================================================================

/**
 * Fetch tweet data from FxTwitter API.
 * Re-exports the canonical implementation from fxembed.ts which includes
 * timeout handling and better error reporting.
 */
export const fetchTweetFromFxTwitter = fetchTweetData
