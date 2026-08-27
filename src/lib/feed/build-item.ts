/**
 * Pure data-shaping helper for `/api/feed`: turns a bookmark DB row (plus its
 * joined media/links/tags) into the shape the feed API returns to the client.
 */
import type { Bookmark, BookmarkLink, BookmarkMedia } from '@/lib/db/schema'
import { resolveMediaUrl, getShareableUrl, getThumbnailUrl } from '@/lib/media/fxembed'
import { expandUrls } from '@/lib/utils/url-expander'
import {
  selectArticleLink,
  buildArticlePreview,
  parseArticleContent,
} from '@/lib/utils/feed-helpers'

export type FeedItemResponse = {
  id: string
  platform: string
  author: string
  authorName: string | null
  authorProfileImageUrl: string | null
  text: string
  tweetUrl: string
  createdAt: string | null
  processedAt: string
  category: string | null
  isArchived: boolean
  isQuote: boolean | null
  quoteContext: unknown
  quotedTweetId: string | null
  quotedTweet: FeedItemResponse | null
  isRetweet: boolean | null
  retweetContext: unknown
  media: Array<{
    id: string
    mediaType: string
    width: number | null
    height: number | null
    durationMs: number | null
    altText: string | null
    url: string
    thumbnailUrl: string
    shareUrl: string
    originalUrl: string | null
  }> | null
  links: BookmarkLink[] | null
  articlePreview: {
    title: string | null
    description: string | null
    imageUrl: string | null
    url: string
    domain: string | null
    isXArticle?: boolean
  } | null
  articleContent: unknown
  isXArticle: boolean
  tags: string[]
  parentTweets: FeedItemResponse[] | null
  summary: string | null
}

/** Build a `FeedItemResponse` from a bookmark row and its joined data. */
export function buildFeedItem(
  bookmark: Bookmark,
  bookmarkLinksList: BookmarkLink[],
  bookmarkMediaList: BookmarkMedia[],
  bookmarkTags: string[],
  isArchived: boolean,
  isArticle: boolean,
): FeedItemResponse {
  // Build media URLs — platform-aware. Twitter uses FxEmbed; Instagram and
  // TikTok stream through our own proxy routes (CDN URLs require referer/sig
  // headers that only the proxy adds).
  const orderedMedia = [...bookmarkMediaList].sort(
    (a, b) => mediaOrdinal(a.id) - mediaOrdinal(b.id),
  )
  const mediaWithUrls = orderedMedia.map((m, index) => {
    const mediaType = m.mediaType as 'photo' | 'video' | 'animated_gif'

    if (bookmark.platform === 'instagram') {
      // Reels play inline via the IG video proxy; photos and ordered carousel
      // children re-resolve fresh signed CDN URLs through the image proxy.
      const mediaIndex = index + 1
      const indexQuery = mediaIndex === 1 ? '' : `&index=${mediaIndex}`
      const thumbnailUrl = `/api/media/instagram/thumbnail?id=${encodeURIComponent(bookmark.id)}${indexQuery}`
      const isVideo = m.mediaType === 'video'
      const streamUrl = `/api/media/instagram/video?id=${encodeURIComponent(bookmark.id)}`
      const downloadUrl = `/api/media/instagram/video/download?id=${encodeURIComponent(bookmark.id)}`
      return {
        id: m.id,
        mediaType: m.mediaType,
        width: m.width,
        height: m.height,
        durationMs: isVideo ? m.durationMs : null,
        altText: m.altText,
        url: isVideo ? streamUrl : thumbnailUrl,
        thumbnailUrl,
        shareUrl: isVideo ? downloadUrl : `${thumbnailUrl}&download=1`,
        originalUrl: null,
      }
    }

    if (bookmark.platform === 'tiktok') {
      const streamUrl = `/api/media/tiktok/video?username=${encodeURIComponent(bookmark.author)}&id=${encodeURIComponent(bookmark.id)}`
      const downloadUrl = `/api/media/tiktok/video/download?username=${encodeURIComponent(bookmark.author)}&id=${encodeURIComponent(bookmark.id)}`
      const thumbnailUrl = `/api/media/tiktok/thumbnail?username=${encodeURIComponent(bookmark.author)}&id=${encodeURIComponent(bookmark.id)}`
      return {
        id: m.id,
        mediaType: m.mediaType,
        width: m.width,
        height: m.height,
        durationMs: m.durationMs,
        altText: m.altText,
        url: streamUrl,
        thumbnailUrl,
        shareUrl: downloadUrl,
        originalUrl: null,
      }
    }

    if (bookmark.platform === 'youtube') {
      // Playback is the official iframe embed (handled in StageYouTube by
      // platform+id); the gallery just needs the poster + a 'video' type.
      return {
        id: m.id,
        mediaType: 'video' as const,
        width: m.width,
        height: m.height,
        durationMs: m.durationMs,
        altText: m.altText,
        url: `https://www.youtube.com/shorts/${bookmark.id}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${bookmark.id}/hqdefault.jpg`,
        shareUrl: `https://www.youtube.com/shorts/${bookmark.id}`,
        originalUrl: null,
      }
    }

    // Twitter / default — existing FxEmbed flow
    const urlOptions = {
      tweetId: bookmark.id,
      author: bookmark.author,
      mediaType,
      mediaIndex: index + 1,
    }
    return {
      id: m.id,
      mediaType: m.mediaType,
      width: m.width,
      height: m.height,
      durationMs: m.durationMs,
      altText: m.altText,
      url: resolveMediaUrl(urlOptions),
      thumbnailUrl: getThumbnailUrl({ ...urlOptions, previewUrl: m.previewUrl || undefined }),
      shareUrl: getShareableUrl(urlOptions),
      originalUrl: m.originalUrl ?? null,
    }
  })

  // Expand t.co URLs in the text
  const expandedText = bookmark.text ? expandUrls(bookmark.text, bookmarkLinksList) : bookmark.text

  // Parse quote context if exists
  let quoteContext = null
  if (bookmark.isQuote && bookmark.quoteContext) {
    try {
      quoteContext = JSON.parse(bookmark.quoteContext)
    } catch {
      // Ignore parse errors
    }
  }

  // Parse retweet context if exists
  let retweetContext = null
  if (bookmark.isRetweet && bookmark.retweetContext) {
    try {
      retweetContext = JSON.parse(bookmark.retweetContext)
    } catch {
      // Ignore parse errors
    }
  }

  // Get article preview and content from links
  let articlePreview = null
  let articleContent = null

  const articleLink = selectArticleLink(bookmarkLinksList)

  if (articleLink) {
    articlePreview = buildArticlePreview(articleLink, isArticle)
    articleContent = parseArticleContent(articleLink.contentJson)
  } else if (isArticle) {
    const correctArticleUrl = `https://x.com/${bookmark.author}/article/${bookmark.id}`
    articlePreview = {
      title: `Article by @${bookmark.author}`,
      description: null,
      imageUrl: null,
      url: correctArticleUrl,
      domain: 'x.com',
      isXArticle: true,
    }
  }

  const effectiveCategory = isArticle ? 'article' : bookmark.category

  return {
    id: bookmark.id,
    platform: bookmark.platform,
    author: bookmark.author,
    authorName: bookmark.authorName,
    authorProfileImageUrl: bookmark.authorProfileImageUrl,
    text: expandedText,
    tweetUrl: bookmark.tweetUrl,
    createdAt: bookmark.createdAt,
    processedAt: bookmark.processedAt,
    category: effectiveCategory,
    isArchived,
    isQuote: bookmark.isQuote,
    quoteContext,
    quotedTweetId: bookmark.quotedTweetId,
    quotedTweet: null,
    isRetweet: bookmark.isRetweet,
    retweetContext,
    media: mediaWithUrls.length > 0 ? mediaWithUrls : null,
    links: bookmarkLinksList.length > 0 ? bookmarkLinksList : null,
    articlePreview,
    articleContent,
    isXArticle: isArticle,
    tags: bookmarkTags,
    parentTweets: null,
    summary: bookmark.summary,
  }
}

function mediaOrdinal(id: string): number {
  const match = id.match(/_(?:photo|video)_(\d+)$/)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}
