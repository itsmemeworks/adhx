/**
 * Type definitions for the feed components
 */

export interface MediaItem {
  id: string
  mediaType: string
  width?: number | null
  height?: number | null
  url: string
  thumbnailUrl: string
  shareUrl: string
}

export interface LinkItem {
  id: number
  bookmarkId: string
  originalUrl?: string | null
  expandedUrl: string
  linkType?: string | null
  domain?: string | null
}

export interface QuoteContext {
  tweetId: string
  author: string
  authorName?: string
  authorProfileImageUrl?: string
  text: string
  media?: {
    photos?: Array<{ url: string; width: number; height: number }>
    videos?: Array<{ url: string; thumbnail_url: string; width: number; height: number }>
  } | null
  article?: {
    url: string | null
    title: string
    description?: string | null
    imageUrl?: string | null
  } | null
  external?: {
    url: string
    title?: string | null
    description?: string | null
    imageUrl?: string | null
  } | null
}

export interface RetweetContext {
  tweetId: string
  author: string
  authorName?: string
  authorProfileImageUrl?: string
  text: string
  media?: {
    photos?: Array<{ url: string; width: number; height: number }>
    videos?: Array<{ url: string; thumbnail_url: string; width: number; height: number }>
  } | null
}

export interface ArticlePreview {
  title?: string | null
  description?: string | null
  imageUrl?: string | null
  url: string
  domain?: string | null
}

export interface ArticleContentBlock {
  key: string
  text: string
  type: string
  data?: Record<string, unknown>
  entityRanges?: Array<{ key: number; length: number; offset: number }>
  inlineStyleRanges?: Array<{ length: number; offset: number; style: string }>
}

export interface ArticleEntityMap {
  [key: string]: {
    type: string
    mutability?: string
    data: {
      url?: string
      src?: string
      width?: number
      height?: number
      alt?: string
      caption?: string
      mediaItems?: Array<{ mediaId: string; localMediaId?: string; mediaCategory?: string }>
    }
  }
}

export interface MediaEntitiesMap {
  [mediaId: string]: {
    url: string
    width?: number
    height?: number
  }
}

export interface ArticleContent {
  blocks: ArticleContentBlock[]
  entityMap?: ArticleEntityMap
  mediaEntities?: MediaEntitiesMap
}

export interface FeedItem {
  id: string
  author: string
  authorName?: string | null
  authorProfileImageUrl?: string | null
  text: string
  tweetUrl: string
  createdAt?: string | null
  processedAt: string
  category?: string | null
  isRead: boolean
  isQuote?: boolean
  quoteContext?: QuoteContext | null
  quotedTweetId?: string | null
  quotedTweet?: FeedItem | null // Full quoted tweet when stored as separate bookmark
  isRetweet?: boolean
  retweetContext?: RetweetContext | null
  media: MediaItem[] | null
  links: LinkItem[] | null
  articlePreview?: ArticlePreview | null
  articleContent?: ArticleContent | null
  isXArticle?: boolean
  tags: string[]
  parentTweets?: FeedItem[] | null // Tweets that quote this one (for reverse navigation)
}

export type FilterType = 'all' | 'photos' | 'videos' | 'text' | 'articles' | 'quoted' | 'manual'

export interface TagItem {
  tag: string
  count: number
}

export const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'photos', label: 'Photos' },
  { value: 'videos', label: 'Videos' },
  { value: 'text', label: 'Text' },
  { value: 'articles', label: 'Articles' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'manual', label: 'Manual' },
]

/**
 * Bookmark data streamed during sync (lighter than full FeedItem)
 * Used by both the sync API route and the client-side sync handler
 */
export interface StreamedBookmark {
  id: string
  author: string
  authorName: string | null
  authorProfileImageUrl: string | null
  text: string
  tweetUrl: string
  createdAt: string | null
  processedAt: string
  category: string | null
  isRead: boolean
  isQuote: boolean
  isRetweet: boolean
  media: Array<{
    id: string
    mediaType: string
    url: string
    thumbnailUrl: string
  }> | null
  articlePreview: {
    title: string | null
    imageUrl: string | null
  } | null
  tags: string[]
}

/**
 * Sync progress data sent via SSE during bookmark sync
 */
export interface SyncProgress {
  phase: 'fetching' | 'categorizing' | 'complete'
  current: number
  total: number
  pagesProcessed?: number
  categorized?: number
}

/**
 * Helper to convert StreamedBookmark to full FeedItem format
 */
export function streamedBookmarkToFeedItem(bookmark: StreamedBookmark): FeedItem {
  return {
    id: bookmark.id,
    author: bookmark.author,
    authorName: bookmark.authorName,
    authorProfileImageUrl: bookmark.authorProfileImageUrl,
    text: bookmark.text,
    tweetUrl: bookmark.tweetUrl,
    createdAt: bookmark.createdAt,
    processedAt: bookmark.processedAt,
    category: bookmark.category,
    isRead: bookmark.isRead,
    isQuote: bookmark.isQuote,
    isRetweet: bookmark.isRetweet,
    media: bookmark.media?.map((m) => ({
      ...m,
      width: null,
      height: null,
      shareUrl: m.url,
    })) ?? null,
    links: null,
    articlePreview: bookmark.articlePreview ? {
      ...bookmark.articlePreview,
      description: null,
      url: bookmark.tweetUrl,
      domain: null,
    } : null,
    tags: bookmark.tags,
  }
}
