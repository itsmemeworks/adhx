import { getTheaterFeed } from './feed'
import { theaterItemKey } from '@/components/theater/types'
import type {
  TextLinkRef,
  TheaterFeedSeed,
  TheaterItem,
  TheaterQuoteRef,
} from '@/components/theater/types'
import { sourceUrl } from '@/lib/activity/preview-path'
import { tiktokCreatedAtFromId } from '@/lib/media/tiktok-id'
import { youtubeThumbnail } from '@/lib/media/youtube'

/**
 * Seed assembly for the "shared" theater mode (preview pages,
 * docs/specs/theater-first.md §3/PR 3): the visitor lands on the theater with
 * the shared post already playing, then chains into the live pulse.
 *
 * Never selects/forwards `userId` — the mappers below only ever read from
 * data the pages already fetched (FxTwitter/instafix/tnktok/oEmbed + saved-
 * bookmark display fields), the same anonymity-safe inputs `recordActivity()`
 * already accepts.
 */

/**
 * Build the shared-mode seed: the shared post leads, followed by the live
 * pulse/backfill feed with that same post deduped out (by `theaterItemKey`,
 * matching `getTheaterFeed`'s own dedup convention). Degrades to a
 * single-item seed if the feed read fails — the theater must never fail to
 * open just because the ambient pulse couldn't be fetched.
 */
export async function buildSharedSeed(
  shared: TheaterItem,
): Promise<{ seed: TheaterFeedSeed; sharedItem: TheaterItem }> {
  const sharedKey = theaterItemKey(shared)
  try {
    const feed = await getTheaterFeed()
    const rest = feed.items.filter((item) => theaterItemKey(item) !== sharedKey)
    // Backfill pulse-only display fields from the pulse's enriched copy of
    // the SAME post: addedAt (when it first hit ADHX — never the source
    // date) plus saveCount/trendCount (the flame chip). Preview-page
    // mappers don't have these; without them the lead looks statless
    // while the next dock card of the same post shows them. The page's
    // `recordActivity('preview')` runs before this, so the post is in
    // the pulse.
    const pulseCopy = feed.items.find((item) => theaterItemKey(item) === sharedKey)
    const sharedWithPulse = withPulseDisplay(shared, pulseCopy)
    return {
      sharedItem: sharedWithPulse,
      seed: {
        items: [sharedWithPulse, ...rest],
        savedToday: feed.savedToday,
        recentActivity: feed.recentActivity,
      },
    }
  } catch (error) {
    console.error('Theater: failed to build shared seed, degrading to solo item:', error)
    return {
      sharedItem: shared,
      seed: { items: [shared], savedToday: 0, recentActivity: 0 },
    }
  }
}

/**
 * Pulse-only display fields the preview-page mappers never have: when the
 * post first hit ADHX, and the anonymous save/trend counts that power the
 * flame chip. Preview pages would otherwise land with no stats even when
 * the same post shows them one card later in the dock.
 */
function withPulseDisplay(shared: TheaterItem, pulseCopy?: TheaterItem): TheaterItem {
  if (!pulseCopy) return shared
  return {
    ...shared,
    ...(pulseCopy.addedAt ? { addedAt: pulseCopy.addedAt } : {}),
    ...(pulseCopy.saveCount != null ? { saveCount: pulseCopy.saveCount } : {}),
    ...(pulseCopy.trendCount != null ? { trendCount: pulseCopy.trendCount } : {}),
  }
}

/** Strip a leading `@` (TikTok handles are stored with one; X/IG/YouTube never have one). */
function stripAt(handle: string): string {
  return handle.replace(/^@+/, '')
}

export interface TweetSharedInput {
  id: string
  author: string
  authorName?: string | null
  authorAvatarUrl?: string | null
  text?: string | null
  thumbnailUrl?: string | null
  contentType: NonNullable<TheaterItem['contentType']>
  createdAt: string
  /** Short-link expansions from the FxTwitter tweet's `urls[]` (spec §6b). */
  textLinks?: TextLinkRef[]
  /** The quoted post, when the FxTwitter tweet carries one. See TheaterQuoteRef. */
  quote?: TheaterQuoteRef
}

/** Map the already-fetched FxTwitter tweet fields (as computed by the status page) into a TheaterItem. */
export function tweetToTheaterItem(input: TweetSharedInput): TheaterItem {
  const author = stripAt(input.author)
  return {
    action: 'preview',
    platform: 'twitter',
    bookmarkId: input.id,
    author,
    authorName: input.authorName ?? null,
    authorAvatarUrl: input.authorAvatarUrl ?? null,
    text: input.text ?? null,
    thumbnailUrl: input.thumbnailUrl ?? null,
    url: sourceUrl('twitter', author, input.id) ?? `https://x.com/${author}/status/${input.id}`,
    createdAt: input.createdAt,
    contentType: input.contentType,
    textLinks: input.textLinks,
    ...(input.quote ? { quote: input.quote } : {}),
  }
}

export interface ReelSharedInput {
  id: string
  author: string
  authorName?: string | null
  text?: string | null
  thumbnailUrl?: string | null
}

/** Map instafix/saved-reel fields (as computed by the reel preview page) into a TheaterItem. */
export function reelToTheaterItem(input: ReelSharedInput): TheaterItem {
  const author = stripAt(input.author) || 'instagram'
  return {
    action: 'preview',
    platform: 'instagram',
    bookmarkId: input.id,
    author,
    authorName: input.authorName ?? null,
    authorAvatarUrl: null,
    text: input.text ?? null,
    thumbnailUrl: input.thumbnailUrl ?? null,
    url: sourceUrl('instagram', author, input.id) ?? `https://www.instagram.com/reel/${input.id}/`,
    // Ordering slot only — never displayed; `buildSharedSeed` backfills the
    // displayed `addedAt` from the pulse.
    createdAt: new Date().toISOString(),
    contentType: 'video',
  }
}

export interface TikTokSharedInput {
  id: string
  handle: string
  author?: string | null
  authorName?: string | null
  text?: string | null
}

/** Map tnktok/saved-TikTok fields (as computed by the TikTok preview page) into a TheaterItem. */
export function tiktokToTheaterItem(input: TikTokSharedInput): TheaterItem {
  const author = stripAt(input.author || input.handle)
  return {
    action: 'preview',
    platform: 'tiktok',
    bookmarkId: input.id,
    author,
    authorName: input.authorName ?? null,
    authorAvatarUrl: null,
    text: input.text ?? null,
    thumbnailUrl: `/api/media/tiktok/thumbnail?username=${encodeURIComponent(author)}&id=${encodeURIComponent(input.id)}`,
    url:
      sourceUrl('tiktok', author, input.id) ??
      `https://www.tiktok.com/@${author}/video/${input.id}`,
    createdAt: tiktokCreatedAtFromId(input.id) ?? new Date().toISOString(),
    contentType: 'video',
  }
}

export interface YouTubeSharedInput {
  id: string
  author: string
  authorName?: string | null
  text?: string | null
}

/** Map oEmbed/saved-Short fields (as computed by the Shorts preview page) into a TheaterItem. */
export function youtubeToTheaterItem(input: YouTubeSharedInput): TheaterItem {
  const author = stripAt(input.author)
  return {
    action: 'preview',
    platform: 'youtube',
    bookmarkId: input.id,
    author,
    authorName: input.authorName ?? null,
    authorAvatarUrl: null,
    text: input.text ?? null,
    thumbnailUrl: youtubeThumbnail(input.id),
    url: sourceUrl('youtube', author, input.id) ?? `https://www.youtube.com/shorts/${input.id}`,
    // Ordering slot only — never displayed; `buildSharedSeed` backfills the
    // displayed `addedAt` from the pulse.
    createdAt: new Date().toISOString(),
    contentType: 'video',
  }
}
