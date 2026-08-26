import { db } from '@/lib/db'
import {
  collectionAggregates,
  collectionEvents,
  tagShares,
  bookmarkTags,
  bookmarks,
  bookmarkMedia,
  bookmarkLinks,
  users,
  oauthTokens,
} from '@/lib/db/schema'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { getThumbnailUrl } from '@/lib/media/fxembed'
import { listBannedUserIds } from '@/lib/admin/moderation'

/**
 * Discovery leaderboard ranking — the SINGLE audited read choke point over
 * `collection_events` (docs/specs/discovery-leaderboards.md §5–§7), playing
 * the same role for public playlists that `src/lib/trending/query.ts` plays
 * for posts.
 *
 * VOCABULARY: what users call a **playlist** is one publicly shared tag. The
 * storage layer here still says "collection" — `collection_events`,
 * `collectionEvents`, `OwnerCollectionStats` — because the table, the API
 * paths and the indexed URLs are public contracts that were deliberately not
 * renamed. Comments below name the product concept (playlist) and the
 * identifiers as they are; see CLAUDE.md's "Home routing & the Theater" for
 * the full playlist / collection / library split.
 *
 * ANONYMITY INVARIANT: `collectionEvents.viewerId` is NEVER selected here.
 * It exists in the table only so `src/lib/discovery/record.ts` can dedupe
 * signed-in viewers and so moderation can investigate abuse later — it must
 * never reach a read path. Any change that touches the events select MUST
 * keep `viewerId` out. Leaderboard entries expose only the owning curator's
 * public `username` (never a raw `userId`).
 *
 * Score = views + 5×clones. Finite windows aggregate the retained raw log;
 * all-time reads use the durable, viewer-free collection_aggregates rollup.
 * An INNER JOIN against `tag_shares` (`isPublic = 1`) means a playlist made
 * private drops off the board on its next read.
 */

export type RankWindow = 'day' | 'week' | 'month' | 'all'
export type RankMode = 'top' | 'hot' | 'rising' | 'new'

/** How many clone events are worth, relative to one view, in the score. */
const CLONE_WEIGHT = 5
const DEFAULT_LIMIT = 24
const MAX_LIMIT = 500
const TILES_PER_COLLECTION = 4
const TEXT_FALLBACK_LENGTH = 40

export const RANK_WINDOWS: { id: RankWindow; label: string; slug: string }[] = [
  { id: 'day', label: 'Today', slug: 'today' },
  { id: 'week', label: 'This week', slug: 'week' },
  { id: 'month', label: 'Month', slug: 'month' },
  { id: 'all', label: 'All-time', slug: 'all-time' },
]

/** Reverse lookup for `RANK_WINDOWS`. Returns null for an unrecognised slug. */
export function slugToWindow(slug: string): RankWindow | null {
  return RANK_WINDOWS.find((w) => w.slug === slug)?.id ?? null
}

/**
 * The public, tidy path for a window. `week` is the default view and lives at
 * the bare `/leaderboard` path; every other window gets its own slug segment
 * so it's shareable/crawlable (mirrors `/trending` vs `/trending/[filter]`).
 *
 * This lived at `/collections` until the owner asked for it to move — that
 * path collided with a now-deleted custom-collections CRUD API. The old
 * `/collections`(`/[window]`) paths still resolve, via thin
 * `permanentRedirect` stubs in `src/app/collections/`.
 */
export function windowToPath(window: RankWindow): string {
  if (window === 'week') return '/leaderboard'
  return `/leaderboard/${RANK_WINDOWS.find((w) => w.id === window)!.slug}`
}

export interface LeaderboardTile {
  thumbnailUrl?: string | null
  text?: string | null
}

export interface LeaderboardEntry {
  /** Curator handle — public by construction (never a raw userId). */
  username: string
  tag: string
  /** 1-based position on this board. */
  rank: number
  score: number
  viewCount: number
  cloneCount: number
  /** Distinct posts tagged into this playlist. */
  itemCount: number
  /** Up to `TILES_PER_COLLECTION` poster tiles for the mosaic. */
  tiles: LeaderboardTile[]
  /** Newest event timestamp within the window, ISO. */
  updatedAt: string
}

export interface OwnerCollectionStats {
  totals: { viewCount: number; cloneCount: number; bestRank: number | null }
  byTag: Record<string, { viewCount: number; cloneCount: number; rank: number | null }>
}

/** Rolling window lengths in ms. `all` has no lower bound. */
const WINDOW_MS: Record<RankWindow, number | null> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  all: null,
}

function windowStartIso(window: RankWindow): string | null {
  const ms = WINDOW_MS[window]
  return ms == null ? null : new Date(Date.now() - ms).toISOString()
}

/**
 * Batch-resolve `userId -> username`, mirroring the fallback convention in
 * `src/lib/users/lookup.ts` (`users` table is authoritative; `oauth_tokens`
 * is a fallback for rows the accounts backfill hasn't touched). Written as
 * its own synchronous batch query — rather than calling `lookup.ts`'s
 * per-id async helper — because every export in this module is a plain
 * synchronous function over the synchronous better-sqlite3 driver.
 */
function resolveUsernames(userIds: string[]): Map<string, string> {
  const map = new Map<string, string>()
  if (userIds.length === 0) return map

  const userRows = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, userIds))
    .all()
  for (const r of userRows) if (r.username) map.set(r.id, r.username)

  const missing = userIds.filter((id) => !map.has(id))
  if (missing.length > 0) {
    const tokenRows = db
      .select({ userId: oauthTokens.userId, username: oauthTokens.username })
      .from(oauthTokens)
      .where(inArray(oauthTokens.userId, missing))
      .all()
    for (const r of tokenRows) if (r.username && !map.has(r.userId)) map.set(r.userId, r.username)
  }
  return map
}

/**
 * Poster thumbnail for a tagged item, platform-aware. Lifted from
 * `resolveThumbnail` in `src/lib/users/profile.ts` (not exported there, and
 * that file is owned by another change in flight) — kept in lockstep by
 * hand; if the profile mosaic logic changes, mirror it here too.
 */
function resolveTileThumbnail(
  item: { platform: string; id: string; author: string },
  firstMedia: { mediaType: string; previewUrl: string | null } | undefined,
  articleCover: string | undefined,
): string | undefined {
  if (articleCover) return articleCover
  if (item.platform === 'tiktok') {
    return `/api/media/tiktok/thumbnail?username=${encodeURIComponent(item.author)}&id=${encodeURIComponent(item.id)}`
  }
  if (item.platform === 'instagram') {
    return `/api/media/instagram/thumbnail?id=${encodeURIComponent(item.id)}`
  }
  if (item.platform === 'youtube') {
    return `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`
  }
  if (!firstMedia) return undefined
  const mediaType = firstMedia.mediaType as 'photo' | 'video' | 'animated_gif'
  return getThumbnailUrl({
    tweetId: item.id,
    author: item.author,
    mediaType,
    mediaIndex: 1,
    previewUrl: firstMedia.previewUrl || undefined,
  })
}

/**
 * Poster mosaic + item count for a batch of `(ownerUserId, tag)` pairs.
 * Generalises the single-owner tile-building in `profile.ts`'s
 * `fetchPublicProfile` (read that first) to many owners at once, since the
 * leaderboard spans curators. Returns a map keyed by `${userId}:${tag}`;
 * every requested pair is present (possibly with `itemCount: 0, tiles: []`).
 */
function getTileDataForTags(
  pairs: { userId: string; tag: string }[],
): Map<string, { itemCount: number; tiles: LeaderboardTile[] }> {
  const result = new Map<string, { itemCount: number; tiles: LeaderboardTile[] }>()
  const pairKeys = new Set(pairs.map((p) => `${p.userId}:${p.tag}`))
  for (const key of pairKeys) result.set(key, { itemCount: 0, tiles: [] })
  if (pairs.length === 0) return result

  const userIds = [...new Set(pairs.map((p) => p.userId))]
  const tags = [...new Set(pairs.map((p) => p.tag))]

  const taggedRows = db
    .select({
      userId: bookmarkTags.userId,
      tag: bookmarkTags.tag,
      bookmarkId: bookmarkTags.bookmarkId,
      platform: bookmarkTags.platform,
    })
    .from(bookmarkTags)
    .where(and(inArray(bookmarkTags.userId, userIds), inArray(bookmarkTags.tag, tags)))
    .all()
    // The cross-product of userIds×tags can match combinations that weren't
    // actually requested (a different owner happening to use the same tag
    // name) — restrict to the exact pairs we were asked about.
    .filter((r) => pairKeys.has(`${r.userId}:${r.tag}`))

  if (taggedRows.length === 0) return result

  const allBookmarkIds = [...new Set(taggedRows.map((r) => r.bookmarkId))]
  const bookmarkResults = db
    .select()
    .from(bookmarks)
    .where(and(inArray(bookmarks.userId, userIds), inArray(bookmarks.id, allBookmarkIds)))
    .orderBy(desc(bookmarks.processedAt))
    .all()
  const bookmarkByKey = new Map(
    bookmarkResults.map((b) => [`${b.userId}:${b.platform}:${b.id}`, b]),
  )

  const byGroup = new Map<string, typeof bookmarkResults>()
  for (const row of taggedRows) {
    const groupKey = `${row.userId}:${row.tag}`
    const b = bookmarkByKey.get(`${row.userId}:${row.platform}:${row.bookmarkId}`)
    if (!b) continue
    const arr = byGroup.get(groupKey) ?? []
    arr.push(b)
    byGroup.set(groupKey, arr)
  }

  // Only fetch media/link enrichment for the posts that will actually render
  // as tiles (top N per group), not every tagged post.
  const tileKeys = new Set<string>()
  for (const [, arr] of byGroup) {
    for (const b of arr.slice(0, TILES_PER_COLLECTION))
      tileKeys.add(`${b.userId}:${b.platform}:${b.id}`)
  }
  const tileUserIds = [...new Set([...tileKeys].map((k) => k.split(':')[0]))]
  const tileBookmarkIds = [...new Set([...tileKeys].map((k) => k.split(':')[2]))]

  const mediaResults =
    tileBookmarkIds.length > 0
      ? db
          .select()
          .from(bookmarkMedia)
          .where(
            and(
              inArray(bookmarkMedia.userId, tileUserIds),
              inArray(bookmarkMedia.bookmarkId, tileBookmarkIds),
            ),
          )
          .all()
      : []
  const linkResults =
    tileBookmarkIds.length > 0
      ? db
          .select({
            userId: bookmarkLinks.userId,
            bookmarkId: bookmarkLinks.bookmarkId,
            platform: bookmarkLinks.platform,
            linkType: bookmarkLinks.linkType,
            imageUrl: bookmarkLinks.previewImageUrl,
          })
          .from(bookmarkLinks)
          .where(
            and(
              inArray(bookmarkLinks.userId, tileUserIds),
              inArray(bookmarkLinks.bookmarkId, tileBookmarkIds),
            ),
          )
          .all()
      : []

  const mediaByKey = new Map<string, (typeof mediaResults)[number][]>()
  for (const m of mediaResults) {
    const k = `${m.userId}:${m.platform}:${m.bookmarkId}`
    const arr = mediaByKey.get(k) ?? []
    arr.push(m)
    mediaByKey.set(k, arr)
  }
  const articleCovers = new Map<string, string>()
  for (const l of linkResults) {
    const k = `${l.userId}:${l.platform}:${l.bookmarkId}`
    if (l.imageUrl && (!articleCovers.has(k) || l.linkType === 'article'))
      articleCovers.set(k, l.imageUrl)
  }

  for (const [groupKey, arr] of byGroup) {
    const tiles: LeaderboardTile[] = arr.slice(0, TILES_PER_COLLECTION).map((b) => {
      const key = `${b.userId}:${b.platform}:${b.id}`
      const media = mediaByKey.get(key) ?? []
      const thumbnailUrl = resolveTileThumbnail(
        { platform: b.platform, id: b.id, author: b.author },
        media[0],
        articleCovers.get(key),
      )
      const tile: LeaderboardTile = {}
      if (thumbnailUrl) tile.thumbnailUrl = thumbnailUrl
      if (b.text) tile.text = b.text.slice(0, TEXT_FALLBACK_LENGTH)
      return tile
    })
    result.set(groupKey, { itemCount: arr.length, tiles })
  }

  return result
}

interface RawLeaderboardRow {
  ownerUserId: string
  tag: string
  viewCount: number
  cloneCount: number
  lastEventAt: string
}

/**
 * Compute the FULL (unlimited) ranked board for a window+mode — the
 * expensive query, cached below. `getCollectionLeaderboard()` slices this to
 * the caller's `limit`; `getOwnerCollectionStats()` scans the whole thing to
 * find one owner's rank, which would be wrong if it only ever saw a
 * pre-sliced top-N.
 */
function computeLeaderboard(window: RankWindow, mode: RankMode): LeaderboardEntry[] {
  if (mode === 'hot' || mode === 'rising') {
    throw new Error('not implemented')
  }

  let rows: RawLeaderboardRow[]
  if (window === 'all') {
    // ANONYMITY CHOKE POINT: this table contains no viewer identifier at all.
    // All-time work is proportional to playlist count, not retained history.
    rows = db
      .select({
        ownerUserId: collectionAggregates.ownerUserId,
        tag: collectionAggregates.tag,
        viewCount: collectionAggregates.viewCount,
        cloneCount: collectionAggregates.cloneCount,
        lastEventAt: collectionAggregates.lastEventAt,
      })
      .from(collectionAggregates)
      .innerJoin(
        tagShares,
        and(
          eq(tagShares.userId, collectionAggregates.ownerUserId),
          eq(tagShares.tag, collectionAggregates.tag),
        ),
      )
      .where(and(eq(collectionAggregates.hidden, 0), eq(tagShares.isPublic, true)))
      .all()
      .filter((row): row is typeof row & { lastEventAt: string } => row.lastEventAt != null)
  } else {
    const windowStart = windowStartIso(window) as string
    // Finite windows remain bounded by raw retention. Only aggregate columns
    // are selected; collectionEvents.viewerId is intentionally absent.
    rows = db
      .select({
        ownerUserId: collectionEvents.ownerUserId,
        tag: collectionEvents.tag,
        viewCount: sql<number>`sum(case when ${collectionEvents.action} = 'view' then 1 else 0 end)`,
        cloneCount: sql<number>`sum(case when ${collectionEvents.action} = 'clone' then 1 else 0 end)`,
        lastEventAt: sql<string>`max(${collectionEvents.createdAt})`,
      })
      .from(collectionEvents)
      .innerJoin(
        tagShares,
        and(
          eq(tagShares.userId, collectionEvents.ownerUserId),
          eq(tagShares.tag, collectionEvents.tag),
        ),
      )
      .where(
        and(
          eq(collectionEvents.hidden, 0),
          eq(tagShares.isPublic, true),
          gte(collectionEvents.createdAt, windowStart),
        ),
      )
      .groupBy(collectionEvents.ownerUserId, collectionEvents.tag)
      .all() as unknown as RawLeaderboardRow[]
  }

  if (rows.length === 0) return []

  const banned = listBannedUserIds()
  const visible = banned.size === 0 ? rows : rows.filter((r) => !banned.has(r.ownerUserId))
  if (visible.length === 0) return []

  const usernames = resolveUsernames([...new Set(visible.map((r) => r.ownerUserId))])

  const scored = visible
    .map((r) => {
      const viewCount = Number(r.viewCount) || 0
      const cloneCount = Number(r.cloneCount) || 0
      return {
        ownerUserId: r.ownerUserId,
        tag: r.tag,
        username: usernames.get(r.ownerUserId),
        viewCount,
        cloneCount,
        score: viewCount + CLONE_WEIGHT * cloneCount,
        lastEventAt: r.lastEventAt,
      }
    })
    // An owner who can't be resolved to a public username (shouldn't happen
    // post-accounts-migration) can't be safely rendered — drop the row
    // rather than ever surface a raw userId in its place.
    .filter((r): r is typeof r & { username: string } => !!r.username)

  scored.sort((a, b) => {
    // 'new' ranks by recency alone; 'top' ranks by score, ties broken by the
    // most recently active playlist.
    if (mode === 'new') return b.lastEventAt.localeCompare(a.lastEventAt)
    if (b.score !== a.score) return b.score - a.score
    return b.lastEventAt.localeCompare(a.lastEventAt)
  })

  const tileData = getTileDataForTags(scored.map((r) => ({ userId: r.ownerUserId, tag: r.tag })))

  return scored.map((r, index) => {
    const tiles = tileData.get(`${r.ownerUserId}:${r.tag}`)
    return {
      username: r.username,
      tag: r.tag,
      rank: index + 1,
      score: r.score,
      viewCount: r.viewCount,
      cloneCount: r.cloneCount,
      itemCount: tiles?.itemCount ?? 0,
      tiles: tiles?.tiles ?? [],
      updatedAt: r.lastEventAt,
    }
  })
}

/**
 * Short-lived in-memory cache around `computeLeaderboard`, mirroring the
 * pattern in `src/lib/trending/query.ts` (read that file's cache comment for
 * the full rationale). 60s TTL absorbs bursts of public reads against the
 * single synchronous better-sqlite3 connection.
 *
 * Keyed per-`db`-instance via a WeakMap so tests get a clean cache for free:
 * `createTestDb()` swaps in a fresh database each test, which is a new
 * object identity, so there's nothing to explicitly reset.
 */
const CACHE_TTL_MS = 60_000
type RankCache = Map<string, { value: LeaderboardEntry[]; expiresAt: number }>
const cachesByDb = new WeakMap<object, RankCache>()

function getCache(): RankCache {
  let c = cachesByDb.get(db as object)
  if (!c) {
    c = new Map()
    cachesByDb.set(db as object, c)
  }
  return c
}

function getCachedLeaderboard(window: RankWindow, mode: RankMode): LeaderboardEntry[] {
  if (mode === 'hot' || mode === 'rising') {
    throw new Error('not implemented')
  }

  const cache = getCache()
  const key = `${window}:${mode}`
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expiresAt > now) return hit.value

  const value = computeLeaderboard(window, mode)
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS })
  return value
}

/**
 * Public playlists leaderboard for a window, ranked by `mode` (default
 * `'top'`). `hot`/`rising` are reserved for a future velocity-based ranking
 * and throw until implemented; `new` ranks by most recent activity.
 */
export function getCollectionLeaderboard(opts: {
  window: RankWindow
  mode?: RankMode
  limit?: number
}): LeaderboardEntry[] {
  const mode = opts.mode ?? 'top'
  const limit = Math.min(MAX_LIMIT, Math.max(1, opts.limit ?? DEFAULT_LIMIT))
  const full = getCachedLeaderboard(opts.window, mode)
  return full.slice(0, limit)
}

/**
 * One owner's week-window Discovery stats: raw view/clone totals per tag
 * (independent of current public/private status — this is the owner
 * looking at their own history, not a public read) plus each tag's rank on
 * the public week board (`null` when the tag doesn't chart there, including
 * when it's currently private).
 */
export function getOwnerCollectionStats(userId: string): OwnerCollectionStats {
  const windowStart = windowStartIso('week') as string

  const rows = db
    .select({
      tag: collectionEvents.tag,
      viewCount: sql<number>`sum(case when ${collectionEvents.action} = 'view' then 1 else 0 end)`,
      cloneCount: sql<number>`sum(case when ${collectionEvents.action} = 'clone' then 1 else 0 end)`,
    })
    .from(collectionEvents)
    .where(
      and(
        eq(collectionEvents.ownerUserId, userId),
        eq(collectionEvents.hidden, 0),
        gte(collectionEvents.createdAt, windowStart),
      ),
    )
    .groupBy(collectionEvents.tag)
    .all()

  const byTag: OwnerCollectionStats['byTag'] = {}
  let totalViews = 0
  let totalClones = 0
  for (const r of rows) {
    const viewCount = Number(r.viewCount) || 0
    const cloneCount = Number(r.cloneCount) || 0
    totalViews += viewCount
    totalClones += cloneCount
    byTag[r.tag] = { viewCount, cloneCount, rank: null }
  }

  let bestRank: number | null = null
  const username = resolveUsernames([userId]).get(userId)
  if (username) {
    const board = getCachedLeaderboard('week', 'top')
    for (const entry of board) {
      if (entry.username !== username) continue
      const existing = byTag[entry.tag]
      if (existing) existing.rank = entry.rank
      if (bestRank == null || entry.rank < bestRank) bestRank = entry.rank
    }
  }

  return {
    totals: { viewCount: totalViews, cloneCount: totalClones, bestRank },
    byTag,
  }
}
