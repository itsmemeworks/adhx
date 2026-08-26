/**
 * Converts Saved (`FeedItem`) rows into `TheaterItem`s so TheaterShell
 * can reuse the read-only theater stage components
 * (`StageText`/`StageArticle`/`StageInstagram`/`StageYouTube`) without those
 * components needing to know anything about the richer `FeedItem` shape.
 *
 * `TheaterItem` (== `TrendingItem`) is deliberately narrower than `FeedItem` —
 * it has no `media[]`. Quote cards go through `TheaterItem.quote` (mapped from
 * `quotedTweet` / `quoteContext`). The stage still keeps the original
 * `FeedItem` for video playback fidelity.
 */

import type { FeedItem, LinkItem } from '@/components/feed/types'
import { feedItemType } from '@/components/feed/feedItemMeta'
import { quoteRefFromSource, quoteRefFromStoredContext } from '@/lib/theater/quote-ref'
import { linkPreviewFromArticlePreview } from '@/lib/theater/link-preview'
import type { TextLinkRef, TheaterItem } from './types'
import { theaterItemKey } from './types'

/** Max short-link expansions attached per post (spec §6b) — mirrors trending/query.ts. */
const MAX_TEXT_LINKS = 8

/**
 * Map a saved item's resolved links into `TextLinkRef[]` (spec §6b), capped
 * and deduped by `expandedUrl` — same shape/limits as `getTrendingItems()`'s
 * `bookmark_links` enrichment, so the theater's link-in-text policy behaves
 * identically across the public and Collection surfaces.
 */
function toTextLinks(links: LinkItem[] | null | undefined): TextLinkRef[] | undefined {
  if (!links || links.length === 0) return undefined
  const refs: TextLinkRef[] = []
  for (const link of links) {
    if (!link.expandedUrl) continue
    if (refs.some((ref) => ref.expandedUrl === link.expandedUrl)) continue
    refs.push({
      shortUrl: link.originalUrl,
      expandedUrl: link.expandedUrl,
      linkType: link.linkType,
    })
    if (refs.length >= MAX_TEXT_LINKS) break
  }
  return refs.length > 0 ? refs : undefined
}

export type CollectionContentType = 'video' | 'photo' | 'text' | 'article'

/**
 * Real content type for a saved item. Same function as `feedItemType` —
 * {@link inferContentType} in `src/lib/content-type.ts`.
 */
export function inferCollectionContentType(item: FeedItem): CollectionContentType {
  return feedItemType(item)
}

/** The poster/hero image for a saved item. */
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
  const quote = quoteFromFeedItem(item)
  const linkPreview = linkPreviewFromArticlePreview(item.articlePreview)
  return {
    action: 'save',
    platform,
    bookmarkId: item.id,
    author: item.author,
    authorName: item.authorName ?? null,
    authorAvatarUrl: item.authorProfileImageUrl ?? null,
    // X Articles show the article headline. Off-site link cards keep the
    // tweet body (the headline lives on the card).
    text:
      (contentType === 'article' && !linkPreview && item.articlePreview?.title) ||
      item.text ||
      null,
    thumbnailUrl: heroThumbnail(item),
    url: item.tweetUrl,
    createdAt: item.createdAt || item.processedAt,
    // THIS user's own save time — `bookmarks.processedAt` for their row, not
    // the community-wide "first added to ADHX" MIN the live pulse shows.
    //
    // Owner rule: "if somebody adds something to their own collection, we
    // should override the time if it was added to ADHX before this user saved
    // it. The time we want to store for that user for their collection is the
    // time that they saved that to their collection." So on a user-owned
    // surface the user's own timestamp always wins; the global MIN is for the
    // community feed only. Don't "unify" these — they answer different
    // questions. (And never the source platform's publish date, for any
    // platform.)
    addedAt: item.processedAt || null,
    contentType,
    textLinks: toTextLinks(item.links),
    ...(quote ? { quote } : {}),
    ...(linkPreview ? { linkPreview } : {}),
    ...twitterAlbum(item),
  }
}

function twitterAlbum(
  item: FeedItem,
): Pick<TheaterItem, 'videoCount' | 'videoPosters' | 'photoCount'> {
  if ((item.platform ?? 'twitter') !== 'twitter') return {}
  const media = item.media ?? []
  const videos = media.filter((m) => m.mediaType === 'video' || m.mediaType === 'animated_gif')
  const photos = media.filter((m) => m.mediaType === 'photo')
  return {
    ...(videos.length > 1
      ? {
          videoCount: videos.length,
          videoPosters: videos.map((m) => m.thumbnailUrl).filter((url): url is string => !!url),
        }
      : {}),
    ...(photos.length > 1 ? { photoCount: photos.length } : {}),
  }
}

function quoteFromFeedItem(item: FeedItem): TheaterItem['quote'] {
  const quoted = item.quotedTweet
  if (quoted) {
    const photos = (quoted.media ?? []).filter((m) => m.mediaType === 'photo')
    return quoteRefFromSource({
      id: quoted.id,
      text: quoted.text,
      author: {
        screen_name: quoted.author,
        name: quoted.authorName,
        avatar_url: quoted.authorProfileImageUrl,
      },
      media: {
        photos: photos.map((m) => ({ url: m.url || m.thumbnailUrl })),
        videos: (quoted.media ?? [])
          .filter((m) => m.mediaType === 'video' || m.mediaType === 'animated_gif')
          .map((m) => ({ thumbnailUrl: m.thumbnailUrl })),
      },
    })
  }
  return quoteRefFromStoredContext(item.quoteContext ?? undefined)
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
