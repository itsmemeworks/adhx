import type { ContentType } from '@/components/matter'

/**
 * One content-type inferrer for library, theater, trending, tags, and author
 * hubs. Callers map their row/item into {@link ContentSignals}; they do not
 * re-implement the priority list.
 *
 * Priority:
 *   1. an already-resolved `contentType` (server-enriched pulse items)
 *   2. single-format platforms (tiktok / youtube / instagram) → video
 *   3. article (X Article, `category === 'article'`, article blocks, or a
 *      link-preview with no first-class media)
 *   4. video / animated_gif
 *   5. photo
 *   6. quote
 *   7. thumbnail heuristics (preview-only pulse items)
 *   8. text
 *
 * Library `FeedItem` and theater `TrendingItem` stay different shapes —
 * convert at the edges with `feedItemToTheaterItem`, do not merge the types.
 */

export const CONTENT_TYPES = new Set<string>(['video', 'photo', 'text', 'quote', 'article'])

const SINGLE_FORMAT = new Set(['tiktok', 'youtube', 'instagram'])

const VIDEO_THUMB_RE = /(ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)/

export interface ContentSignals {
  platform?: string | null
  /** Already-resolved type — wins when it is a known ContentType. */
  contentType?: string | null
  category?: string | null
  isQuote?: boolean | null
  isXArticle?: boolean | null
  hasArticleBlocks?: boolean | null
  /** Link preview with a title or description. */
  hasArticlePreview?: boolean | null
  /** Tweet/post has its own media row (not just a link-preview image). */
  hasFirstClassMedia?: boolean | null
  primaryMediaType?: string | null
  hasVideo?: boolean | null
  hasPhoto?: boolean | null
  thumbnailUrl?: string | null
}

/** Coerce a stored/recorded string to a known ContentType. */
export function asContentType(v: string | null | undefined): ContentType | undefined {
  return v && CONTENT_TYPES.has(v) ? (v as ContentType) : undefined
}

export function inferContentType(signals: ContentSignals): ContentType {
  const resolved = asContentType(signals.contentType)
  if (resolved) return resolved

  const platform = signals.platform ?? 'twitter'
  if (SINGLE_FORMAT.has(platform)) return 'video'

  if (signals.isXArticle || signals.category === 'article' || signals.hasArticleBlocks) {
    return 'article'
  }
  if (!signals.hasFirstClassMedia && signals.hasArticlePreview) return 'article'

  if (
    signals.hasVideo ||
    signals.primaryMediaType === 'video' ||
    signals.primaryMediaType === 'animated_gif'
  ) {
    return 'video'
  }
  if (signals.hasPhoto || signals.primaryMediaType === 'photo') return 'photo'
  if (signals.isQuote) return 'quote'

  const thumb = signals.thumbnailUrl
  if (thumb && /profile_images/.test(thumb)) return 'text'
  if (thumb && VIDEO_THUMB_RE.test(thumb)) return 'video'
  if (thumb) return 'photo'

  return 'text'
}
