/**
 * Pure data-shaping helper for `/api/feed`: turns a bookmark DB row (plus its
 * joined media/links/tags) into the shape the feed API returns to the client.
 */
import type { Bookmark, BookmarkLink, BookmarkMedia } from '@/lib/db/schema'
import type { Saver } from '@/lib/people/types'
import { keptSrc } from '@/lib/keep/src'
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
  /** Members who saved it, newest first. Signed-in viewers only; never on a public output. */
  savers?: Saver[]
  /** The viewer's own save is just for them. Signed-in viewers only. */
  isPrivate?: boolean
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
  // Every file comes from /api/files: ADHX's own kept copy, or (until it's
  // downloaded) the network's proxy. Slots count per kind, so a post with two
  // photos and a video has photo-1, photo-2 and video-1.
  const orderedMedia = [...bookmarkMediaList].sort(
    (a, b) => mediaOrdinal(a.id) - mediaOrdinal(b.id),
  )
  const counts = { video: 0, photo: 0 }
  const mediaWithUrls = orderedMedia.map((m) => {
    const kind = m.mediaType === 'photo' ? 'photo' : 'video'
    const n = ++counts[kind]
    const slot = `${kind}-${n}` as const
    const url = keptSrc(bookmark.platform, bookmark.id, slot, bookmark.author)
    const thumbnailUrl =
      kind === 'photo'
        ? url
        : n === 1
          ? keptSrc(bookmark.platform, bookmark.id, 'poster', bookmark.author)
          : m.previewUrl || keptSrc(bookmark.platform, bookmark.id, 'poster', bookmark.author)
    return {
      id: m.id,
      mediaType: m.mediaType,
      width: m.width,
      height: m.height,
      durationMs: kind === 'video' ? m.durationMs : null,
      altText: m.altText,
      url,
      thumbnailUrl,
      shareUrl: keptSrc(bookmark.platform, bookmark.id, slot, bookmark.author, { download: true }),
      originalUrl: bookmark.platform === 'twitter' ? (m.originalUrl ?? null) : null,
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
