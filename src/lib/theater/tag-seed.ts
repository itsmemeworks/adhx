import type { TagItem } from '@/lib/tags/query'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'

/**
 * Seed assembly for the "collection" theater mode (`/t/{username}/{tag}`,
 * tag-collections-as-theater): converts the already-fetched, privacy-gated
 * `TagItem[]` (from `getPublicTagCollection()`) into `TheaterItem[]` so the
 * shared theater stage/chrome components can render a public tag collection
 * exactly like the home/shared surfaces — a static, looping queue rather than
 * a live pulse.
 *
 * Carries no `userId` — `TagItem` never has one either (see the privacy
 * invariant documented on `getPublicTagCollection`).
 */

/** Map one `TagItem` (already resolved by `getPublicTagCollection`) into a `TheaterItem`. */
export function tagItemToTheaterItem(item: TagItem): TheaterItem {
  return {
    action: 'save',
    platform: item.platform,
    bookmarkId: item.bookmarkId,
    author: item.author,
    authorName: item.authorName,
    authorAvatarUrl: item.authorAvatarUrl,
    text: item.text,
    // `externalUrl` (the source-platform URL) mirrors the convention the
    // shared-seed mappers use for `url` — `item.url` here is the on-ADHX
    // preview path, which `theaterUrlSyncPath`/`sourceUrl()` already rebuild
    // fresh from platform+author+bookmarkId wherever it matters.
    url: item.externalUrl ?? item.url,
    // Ordering slot only (collection order is curated server-side anyway) —
    // the epoch sentinel is never DISPLAYED: chips render `addedAt`.
    createdAt: item.createdAt ?? new Date(0).toISOString(),
    // Stable display time (owner decision): when the post was saved to
    // ADHX — never the source platform's own publish date.
    addedAt: item.addedAt ?? null,
    contentType: item.contentType,
    thumbnailUrl: item.thumbnailUrl,
  }
}

/**
 * Build the `TheaterFeedSeed` for a public tag collection. `savedToday`/
 * `recentActivity` are always 0 — those are live-pulse concepts and this
 * feed never polls (see `useTheaterFeed`'s `live` option).
 */
export function buildCollectionSeed(items: TagItem[]): TheaterFeedSeed {
  return {
    items: items.map(tagItemToTheaterItem),
    savedToday: 0,
    recentActivity: 0,
  }
}
