import { db } from '@/lib/db'
import { tagShares, bookmarkTags, bookmarks, bookmarkMedia } from '@/lib/db/schema'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { getTrendingItems, LIVE_WINDOW_HOURS } from '@/lib/trending/query'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import { inferContentType } from '@/lib/content-type'

/**
 * Server-side feed assembly for the theater (docs/specs/theater-first.md §4).
 *
 * Starts from the anonymity-safe `getTrendingItems()` choke point — the same
 * data as /trending and /api/activity. If the pulse is thin (a quiet period,
 * or a fresh install with little activity), backfills with saved posts from
 * PUBLIC tag collections so the theater never opens empty. The backfill query
 * joins through `userId` (necessary to resolve which bookmarks belong to a
 * publicly-shared tag) but NEVER selects it into the returned item shape —
 * the same invariant `getTrendingItems()` enforces for the live pulse.
 */

const THEATER_MIN_ITEMS = 12
// Must match `/api/activity`'s default page size (getTrendingItems LIMIT 30):
// the client's 12s poll merges against this seed, and a smaller seed would
// make the first poll "discover" older items and surface them as fresh.
const THEATER_MAX_ITEMS = 30

export async function getTheaterFeed(): Promise<TheaterFeedSeed> {
  // Live mode is "the last 24 hours of community activity" (owner) — the same
  // window `/api/activity` polls with, so the poll never surfaces a post the
  // seed excluded. When that window is thin the public-tag backfill below
  // still keeps the stage from opening empty.
  const { items, savedToday, recentActivity } = await getTrendingItems({
    limit: THEATER_MAX_ITEMS,
    withinHours: LIVE_WINDOW_HOURS,
  })

  let combined: TheaterItem[] = items

  if (combined.length < THEATER_MIN_ITEMS) {
    try {
      const needed = THEATER_MAX_ITEMS - combined.length
      const backfill = fetchPublicTagBackfill(combined, needed)
      combined = [...combined, ...backfill].slice(0, THEATER_MAX_ITEMS)
    } catch (error) {
      // A backfill failure must never take the theater down with it — degrade
      // to whatever the live pulse returned (possibly still empty; the Stage
      // and Rail both render an explicit empty state).
      console.error('Theater: failed to backfill from public tags:', error)
    }
  }

  return { items: combined, savedToday, recentActivity }
}

/**
 * Saved posts from publicly-shared tags, newest-first, mapped into the
 * TrendingItem shape and deduped against `existing`. Synchronous
 * better-sqlite3 reads, matching the style of `src/lib/trending/query.ts`.
 *
 * ANONYMITY: `userId` is used only to join tag_shares -> bookmark_tags ->
 * bookmarks; it is never included in a returned item.
 */
function fetchPublicTagBackfill(existing: TheaterItem[], needed: number): TheaterItem[] {
  if (needed <= 0) return []

  // Over-fetch: some rows collapse via dedup (the same post shared across
  // multiple public tags, or already present in `existing`).
  const rows = db
    .select({
      platform: bookmarks.platform,
      id: bookmarks.id,
      author: bookmarks.author,
      authorName: bookmarks.authorName,
      authorAvatarUrl: bookmarks.authorProfileImageUrl,
      text: bookmarks.text,
      url: bookmarks.tweetUrl,
      createdAt: bookmarks.createdAt,
      processedAt: bookmarks.processedAt,
      category: bookmarks.category,
      isQuote: bookmarks.isQuote,
    })
    .from(tagShares)
    .innerJoin(
      bookmarkTags,
      and(eq(bookmarkTags.userId, tagShares.userId), eq(bookmarkTags.tag, tagShares.tag)),
    )
    .innerJoin(
      bookmarks,
      and(
        eq(bookmarks.userId, bookmarkTags.userId),
        eq(bookmarks.platform, bookmarkTags.platform),
        eq(bookmarks.id, bookmarkTags.bookmarkId),
      ),
    )
    .where(eq(tagShares.isPublic, true))
    .orderBy(desc(bookmarks.processedAt))
    .limit(Math.max(needed * 3, 30))
    .all()

  const ids = [...new Set(rows.map((r) => r.id))]

  // First media thumbnail per bookmark, if any — kept deliberately simple
  // (no article-cover / quote-context resolution like the live pulse does).
  const mediaByBookmark = new Map<string, { url: string; isVideo: boolean }>()
  if (ids.length > 0) {
    const mediaRows = db
      .select({
        platform: bookmarkMedia.platform,
        bookmarkId: bookmarkMedia.bookmarkId,
        previewUrl: bookmarkMedia.previewUrl,
        originalUrl: bookmarkMedia.originalUrl,
        mediaType: bookmarkMedia.mediaType,
      })
      .from(bookmarkMedia)
      .where(inArray(bookmarkMedia.bookmarkId, ids))
      .all()
    for (const m of mediaRows) {
      const key = `${m.platform}:${m.bookmarkId}`
      if (mediaByBookmark.has(key)) continue
      const url = m.previewUrl || m.originalUrl
      if (!url) continue
      mediaByBookmark.set(key, {
        url,
        isVideo: m.mediaType === 'video' || m.mediaType === 'animated_gif',
      })
    }
  }

  const seen = new Set(existing.map((item) => theaterItemKey(item)))
  const out: TheaterItem[] = []
  for (const row of rows) {
    if (out.length >= needed) break
    if (!row.id || !row.author) continue
    const key = `${row.platform}:${row.id}`
    if (seen.has(key)) continue
    seen.add(key)

    const media = mediaByBookmark.get(key)
    const contentType = inferContentType({
      platform: row.platform,
      category: row.category,
      isQuote: row.isQuote,
      hasVideo: media?.isVideo,
      hasPhoto: !!media && !media.isVideo,
    })

    out.push({
      action: 'save',
      platform: row.platform,
      bookmarkId: row.id,
      author: row.author,
      authorName: row.authorName,
      authorAvatarUrl: row.authorAvatarUrl,
      text: row.text,
      thumbnailUrl: media?.url ?? null,
      url: row.url,
      // BOTH times are ADHX-side, never the source platform's publish date
      // (owner decision, see TrendingItem.addedAt): `processedAt` is when the
      // curator saved it, which is both this item's "added to ADHX" chip and
      // the event time the pulse orders/merges on. Using `row.createdAt` here
      // leaked the post's own publish date into the queue — it dropped the
      // time chip entirely (hasKnownTimestamp reads `addedAt`, which was
      // absent) and made a months-old post look "fresh"/"stale" to
      // mergeFeedItems depending on when it was posted rather than added.
      createdAt: row.processedAt,
      addedAt: row.processedAt,
      contentType,
    })
  }

  return out
}
