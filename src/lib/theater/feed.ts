import { db } from '@/lib/db'
import {
  tagShares,
  bookmarkTags,
  bookmarks,
  bookmarkMedia,
  bookmarkLinks,
  moderatedPosts,
  userBans,
} from '@/lib/db/schema'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { getTrendingItems, LIVE_WINDOW_HOURS } from '@/lib/trending/query'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import { inferContentType } from '@/lib/content-type'
import { readBannedUserIds, readModeratedPostKeys } from '@/lib/admin/moderation'

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
  let seed: Awaited<ReturnType<typeof getTrendingItems>>
  try {
    seed = await getTrendingItems({
      limit: THEATER_MAX_ITEMS,
      withinHours: LIVE_WINDOW_HOURS,
    })
  } catch (error) {
    // Moderation is part of the visibility decision for every live item. If
    // that read (or the underlying pulse query) is unavailable, an empty but
    // usable theater is safer than either leaking cached content or crashing
    // the public page.
    console.error('Theater: failed to load verified trending items:', error)
    return { items: [], savedToday: 0, recentActivity: 0 }
  }
  const { items, savedToday, recentActivity } = seed

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

  // The public-tag join is a separate read path from the activity pulse, so
  // activity.hidden cannot protect it. Never treat an unreadable moderation
  // store as "nothing hidden": omit the entire unverified backfill instead.
  const moderation = readModeratedPostKeys()
  const bannedOwners = readBannedUserIds()
  if (!moderation.ok || !bannedOwners.ok) return []

  // Over-fetch: some rows collapse via dedup (the same post shared across
  // multiple public tags, or already present in `existing`).
  const rows = db
    .select({
      ownerUserId: bookmarks.userId,
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
    .leftJoin(
      moderatedPosts,
      and(
        eq(moderatedPosts.platform, bookmarks.platform),
        eq(moderatedPosts.bookmarkId, bookmarks.id),
      ),
    )
    .leftJoin(userBans, eq(userBans.userId, bookmarks.userId))
    .where(
      and(
        eq(tagShares.isPublic, true),
        isNull(userBans.userId),
        or(isNull(moderatedPosts.hidden), eq(moderatedPosts.hidden, 0)),
      ),
    )
    .orderBy(desc(bookmarks.processedAt))
    .limit(Math.max(needed * 3, 30))
    .all()
    .filter((row) => !moderation.value.has(`${row.platform}:${row.id}`))
    .filter((row) => !bannedOwners.value.has(row.ownerUserId))

  // Resolve first-class media plus article metadata. Public-tag backfill is
  // often the first copy of an older post mounted in Live, so dropping an X
  // Article's bookmark-link cover/title here leaves both its dock card and
  // StageArticle splash blank until a full reload.
  const mediaByBookmark = new Map<string, { url: string; isVideo: boolean }>()
  const articleByBookmark = new Map<string, { title: string | null; cover: string | null }>()
  const allowedTuples = [
    ...new Map(
      rows.map((row) => [
        `${row.ownerUserId}:${row.platform}:${row.id}`,
        {
          ownerUserId: row.ownerUserId,
          platform: row.platform,
          bookmarkId: row.id,
        },
      ]),
    ).values(),
  ]
  if (allowedTuples.length > 0) {
    const mediaRows = db
      .select({
        ownerUserId: bookmarkMedia.userId,
        platform: bookmarkMedia.platform,
        bookmarkId: bookmarkMedia.bookmarkId,
        previewUrl: bookmarkMedia.previewUrl,
        originalUrl: bookmarkMedia.originalUrl,
        mediaType: bookmarkMedia.mediaType,
      })
      .from(bookmarkMedia)
      .where(
        or(
          ...allowedTuples.map((tuple) =>
            and(
              eq(bookmarkMedia.userId, tuple.ownerUserId),
              eq(bookmarkMedia.platform, tuple.platform),
              eq(bookmarkMedia.bookmarkId, tuple.bookmarkId),
            ),
          ),
        ),
      )
      .all()
    for (const m of mediaRows) {
      const key = `${m.ownerUserId}:${m.platform}:${m.bookmarkId}`
      if (mediaByBookmark.has(key)) continue
      const url = m.previewUrl || m.originalUrl
      if (!url) continue
      mediaByBookmark.set(key, {
        url,
        isVideo: m.mediaType === 'video' || m.mediaType === 'animated_gif',
      })
    }

    const linkRows = db
      .select({
        ownerUserId: bookmarkLinks.userId,
        platform: bookmarkLinks.platform,
        bookmarkId: bookmarkLinks.bookmarkId,
        linkType: bookmarkLinks.linkType,
        title: bookmarkLinks.previewTitle,
        cover: bookmarkLinks.previewImageUrl,
      })
      .from(bookmarkLinks)
      .where(
        or(
          ...allowedTuples.map((tuple) =>
            and(
              eq(bookmarkLinks.userId, tuple.ownerUserId),
              eq(bookmarkLinks.platform, tuple.platform),
              eq(bookmarkLinks.bookmarkId, tuple.bookmarkId),
            ),
          ),
        ),
      )
      .all()
    for (const link of linkRows) {
      if (!link.title && !link.cover) continue
      const key = `${link.ownerUserId}:${link.platform}:${link.bookmarkId}`
      const current = articleByBookmark.get(key)
      if (!current || link.linkType === 'article') {
        articleByBookmark.set(key, {
          title: link.title ?? current?.title ?? null,
          cover: link.cover ?? current?.cover ?? null,
        })
      }
    }
  }

  const seen = new Set(existing.map((item) => theaterItemKey(item)))
  const out: TheaterItem[] = []
  for (const row of rows) {
    if (out.length >= needed) break
    if (!row.id || !row.author) continue
    const publicKey = `${row.platform}:${row.id}`
    if (seen.has(publicKey)) continue
    seen.add(publicKey)

    const media = mediaByBookmark.get(`${row.ownerUserId}:${publicKey}`)
    const article = articleByBookmark.get(`${row.ownerUserId}:${publicKey}`)
    const contentType = inferContentType({
      platform: row.platform,
      category: row.category,
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
      text: contentType === 'article' ? (article?.title ?? row.text) : row.text,
      thumbnailUrl:
        contentType === 'article' ? (article?.cover ?? media?.url ?? null) : (media?.url ?? null),
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
