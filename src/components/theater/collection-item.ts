/**
 * Converts the authed Collection's `FeedItem`s into `TheaterItem`s so
 * `CollectionTheater` can reuse the read-only theater stage components
 * (`StageText`/`StageArticle`/`StageInstagram`/`StageYouTube`) without those
 * components needing to know anything about the richer `FeedItem` shape.
 *
 * `TheaterItem` (== `TrendingItem`) is deliberately narrower than `FeedItem` —
 * it has no `media[]`, `quotedTweet`, or `quoteContext`. The stage/rail for
 * the collection surface therefore keeps the ORIGINAL `FeedItem` alongside
 * the converted `TheaterItem` (see `theaterItemsFromFeed`) for anything that
 * needs that extra fidelity (video playback, quote cards).
 */

import type { FeedItem } from '@/components/feed/types'
import type { TheaterItem } from './types'
import { theaterItemKey } from './types'

export type CollectionContentType = 'video' | 'photo' | 'text' | 'quote' | 'article'

/** Mirrors `isArticleItem` in `MediaCard.tsx` / `typeOf` in `trending/query.ts`. */
function isArticleItem(item: FeedItem): boolean {
  const hasMedia = !!(item.media?.[0]?.thumbnailUrl || item.articlePreview?.imageUrl)
  return (
    !!item.isXArticle ||
    !!(item.articleContent?.blocks && item.articleContent.blocks.length > 0) ||
    (!hasMedia &&
      !!(item.articlePreview && (item.articlePreview.title || item.articlePreview.description)))
  )
}

/**
 * Real content type for a saved item — mirrors the priority order
 * `getTrendingItems()`'s `typeOf()` uses for saved bookmarks: single-format
 * platforms are always video; otherwise article > video > photo > quote > text.
 */
export function inferCollectionContentType(item: FeedItem): CollectionContentType {
  const platform = item.platform ?? 'twitter'
  if (platform === 'tiktok' || platform === 'youtube' || platform === 'instagram') return 'video'
  if (isArticleItem(item)) return 'article'
  const primary = item.media?.[0]
  if (primary?.mediaType === 'video' || primary?.mediaType === 'animated_gif') return 'video'
  if (primary?.mediaType === 'photo') return 'photo'
  if (item.isQuote && (item.quotedTweet || item.quoteContext)) return 'quote'
  return 'text'
}

/** The poster/hero image for a saved item — mirrors `heroImageUrl` in `MediaCard.tsx`. */
function heroThumbnail(item: FeedItem): string | null {
  if (item.media?.[0]?.thumbnailUrl) return item.media[0].thumbnailUrl
  if (item.articlePreview?.imageUrl) return item.articlePreview.imageUrl
  return null
}

/**
 * Convert one `FeedItem` to a `TheaterItem`. Deliberately carries no `userId`
 * (there isn't one on `FeedItem` client-side anyway) — keeps the same
 * anonymity-safe shape the public theater surfaces use.
 */
export function feedItemToTheaterItem(item: FeedItem): TheaterItem {
  const platform = item.platform ?? 'twitter'
  const contentType = inferCollectionContentType(item)
  return {
    action: 'save',
    platform,
    bookmarkId: item.id,
    author: item.author,
    authorName: item.authorName ?? null,
    authorAvatarUrl: item.authorProfileImageUrl ?? null,
    // Articles show the article's own headline — the stored tweet `text` is
    // usually just the wrapper's t.co/x.com link (same override the trending
    // pipeline does with the saved link's preview title).
    text: (contentType === 'article' && item.articlePreview?.title) || item.text || null,
    thumbnailUrl: heroThumbnail(item),
    url: item.tweetUrl,
    createdAt: item.createdAt || item.processedAt,
    contentType,
  }
}

export interface TheaterQueue {
  theaterItems: TheaterItem[]
  /** Original `FeedItem`s keyed by `theaterItemKey` — for stage/rail fidelity. */
  byKey: Map<string, FeedItem>
}

/** Convert a whole queue, keeping a lookup back to the original `FeedItem`s. */
export function theaterItemsFromFeed(items: FeedItem[]): TheaterQueue {
  const byKey = new Map<string, FeedItem>()
  const theaterItems = items.map((item) => {
    const theaterItem = feedItemToTheaterItem(item)
    byKey.set(theaterItemKey(theaterItem), item)
    return theaterItem
  })
  return { theaterItems, byKey }
}
