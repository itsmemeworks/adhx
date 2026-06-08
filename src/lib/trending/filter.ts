import type { TrendingItem } from './query'
import type { ContentType } from '@/components/matter'

/**
 * The Discover/Trending filter lenses. Shared between the client grid
 * (`DiscoverFeed`) and the server-rendered `/trending/[filter]` hubs so the
 * crawlable HTML and the hydrated grid always agree on what each filter shows.
 *
 * Pure module (no React, no DB) — safe to import from server components.
 */

export type FilterId = 'latest' | 'popular' | 'photos' | 'videos' | 'text' | 'articles'

export const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'latest', label: 'Latest' },
  { id: 'popular', label: 'Popular' },
  { id: 'photos', label: 'Photos' },
  { id: 'videos', label: 'Videos' },
  { id: 'text', label: 'Text' },
  { id: 'articles', label: 'Articles' },
]

/**
 * Filters that get their own tidy path `/trending/<slug>`. The default lens
 * ("latest") lives at the bare `/trending`, so it isn't a sub-path.
 */
export const FILTER_SLUGS: Exclude<FilterId, 'latest'>[] = [
  'popular',
  'photos',
  'videos',
  'text',
  'articles',
]

const VALID_FILTERS = new Set<string>(FILTERS.map((f) => f.id))

/** `/trending/<slug>` → FilterId, or null for an unknown slug (route should 404). */
export function slugToFilter(slug: string): FilterId | null {
  return slug !== 'latest' && VALID_FILTERS.has(slug) ? (slug as FilterId) : null
}

/** FilterId → on-site path. The default lens (latest) is the bare `/trending`. */
export function filterToPath(filter: FilterId): string {
  return filter === 'latest' ? '/trending' : `/trending/${filter}`
}

/** A human label for a filter (used in hub titles/headings). */
export function filterLabel(filter: FilterId): string {
  return FILTERS.find((f) => f.id === filter)?.label ?? 'Latest'
}

/**
 * The post's type for the badge/filtering. Prefer the real `contentType`
 * resolved server-side from the saved bookmark; otherwise fall back to a
 * heuristic:
 *   tiktok / youtube / instagram → video (single-format platforms)
 *   an avatar/profile image is NOT real media → text
 *   a Twitter video poster (ext_tw_video_thumb / amplify / tweet_video_thumb) → video
 *   any other thumbnail ⇒ photo, otherwise text
 */
export function inferType(item: TrendingItem): ContentType {
  if (item.contentType) return item.contentType
  if (item.platform === 'tiktok' || item.platform === 'youtube' || item.platform === 'instagram') {
    return 'video'
  }
  if (item.thumbnailUrl && /profile_images/.test(item.thumbnailUrl)) return 'text'
  if (
    item.thumbnailUrl &&
    /(ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)/.test(item.thumbnailUrl)
  ) {
    return 'video'
  }
  return item.thumbnailUrl ? 'photo' : 'text'
}

/**
 * Whether a trending item can play in the autoplay **Reel** (`/trending/play`).
 * Supports the platforms that expose a clean MP4 stream + a native `ended` event
 * we can chain on: **TikTok** (`/api/media/tiktok/video`), **X video**
 * (`/api/media/video`), and **Instagram** (`/api/media/instagram/video`, via the
 * mirror registry). YouTube (iframe embed, no MP4) is excluded until its
 * playback path supports inline auto-advance. Requires a `bookmarkId` (the
 * source video id) to build the stream URL.
 */
export function isReelPlayable(item: TrendingItem): boolean {
  if (!item.bookmarkId) return false
  if (item.platform !== 'twitter' && item.platform !== 'tiktok' && item.platform !== 'instagram') {
    return false
  }
  return inferType(item) === 'video'
}

/**
 * Filter + sort a deduped list by lens. "Latest" (the default) = newest first
 * (the API already returns newest-first) and shows EVERY recent item regardless
 * of how it entered the pulse (saved / synced / added / previewed). "Popular"
 * surfaces posts with 2+ interactions (saves + previews), ranked by that score
 * (newest as tiebreaker). Photos/Videos/Text/Articles filter by type (Text
 * includes quotes).
 */
export function applyFilter(items: TrendingItem[], filter: FilterId): TrendingItem[] {
  if (filter === 'popular') {
    return items
      .filter((it) => (it.trendCount ?? 0) >= 2)
      .sort((a, b) => {
        const d = (b.trendCount ?? 0) - (a.trendCount ?? 0)
        if (d !== 0) return d
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  }

  if (filter === 'photos') return items.filter((it) => inferType(it) === 'photo')
  if (filter === 'videos') return items.filter((it) => inferType(it) === 'video')
  if (filter === 'text')
    return items.filter((it) => inferType(it) === 'text' || inferType(it) === 'quote')
  if (filter === 'articles') return items.filter((it) => inferType(it) === 'article')

  // latest: every recent item, newest-first, no matter how it entered the
  // pulse (saved / synced / added / previewed). The API already returns the
  // deduped list newest-first, so this is a pass-through.
  return items
}
