import { db } from '@/lib/db'
import {
  tagShares,
  bookmarkTags,
  bookmarks,
  bookmarkMedia,
  bookmarkLinks,
  users,
  oauthTokens,
} from '@/lib/db/schema'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { getUserIdForUsername } from '@/lib/users/lookup'
import { getThumbnailUrl } from '@/lib/media/fxembed'
import { getOwnerCollectionStats } from '@/lib/discovery/rank'
import { isUserBanned } from '@/lib/admin/moderation'
import { TtlLruCache } from '@/lib/cache/ttl-lru'

/**
 * Public curator-profile query — the data layer for `/t/{username}`.
 * Mirrors the shape/invariants of `src/lib/tags/query.ts` (read that file
 * first): a pure async fetch function, short-lived per-db TTL cache,
 * dependency-free result type safe to render straight into server-rendered
 * HTML + JSON-LD.
 *
 * PRIVACY INVARIANT: only PUBLIC `tag_shares` rows are ever read here. A
 * user's private tags never appear in the collections list, the post count,
 * or anywhere else in the returned shape. No email, no read-state, no
 * `userId` is ever included in the result.
 *
 * A profile with zero public playlists is treated the same as a
 * nonexistent user (`not_found`) — callers should 404 either way, so
 * account existence is never confirmed for someone who hasn't published
 * anything.
 */

export interface ProfileTile {
  thumbnailUrl?: string
  text?: string
}

/** Discovery view/save stats for one public tag (docs/specs/discovery-leaderboards.md §6) —
 * `null` when the tag has no events this week. `rank` is `null` when it isn't charting on
 * the public week leaderboard. */
export interface ProfileCollectionStats {
  viewCount: number
  cloneCount: number
  rank: number | null
}

export interface ProfileCollection {
  tag: string
  /** Number of distinct posts tagged with this public tag. */
  count: number
  tiles: ProfileTile[]
  href: string
  stats: ProfileCollectionStats | null
}

/** Curator's Discovery totals across all public tags, week window. */
export interface ProfileStats {
  viewCount: number
  cloneCount: number
  bestRank: number | null
}

export interface PublicProfile {
  /** The profile owner's account id — used by the page to compare against
   * the viewer's session id (is this the signed-in visitor's own profile?).
   * Never rendered; internal to the route's auth-aware CTA logic. */
  userId: string
  /** Canonical-cased username. */
  username: string
  displayName: string | null
  avatarUrl: string | null
  /** ISO timestamp the account was created, if known. */
  memberSince: string | null
  publicTagCount: number
  /** Distinct posts across ALL public tags (a post in two tags counts once). */
  postCount: number
  collections: ProfileCollection[]
  stats: ProfileStats
}

export type PublicProfileResult = { status: 'ok'; profile: PublicProfile } | { status: 'not_found' }

const TILES_PER_COLLECTION = 4
const TEXT_FALLBACK_LENGTH = 40

const CACHE_TTL_MS = 30_000
const CACHE_MAX_ENTRIES = 128
type ProfileCache = TtlLruCache<string, PublicProfileResult>
const cachesByDb = new WeakMap<object, ProfileCache>()

function getCache(): ProfileCache {
  let c = cachesByDb.get(db as object)
  if (!c) {
    c = new TtlLruCache({ maxSize: CACHE_MAX_ENTRIES, ttlMs: CACHE_TTL_MS })
    cachesByDb.set(db as object, c)
  }
  return c
}

/**
 * Fetch a public curator profile by username. Returns `not_found` when the
 * user doesn't exist OR has zero public playlists.
 */
export async function getPublicProfile(username: string): Promise<PublicProfileResult> {
  const cache = getCache()
  const key = username.toLowerCase()
  const hit = cache.get(key)
  if (hit) return hit

  const value = await fetchPublicProfile(username)
  // Do not retain username misses: they are cheap, attacker-controlled, and a
  // newly-published profile should become visible without waiting for the TTL.
  if (value.status === 'ok') cache.set(key, value)
  return value
}

/** Best-effort thumbnail for a tagged item, platform-aware (mirrors tags/query.ts's resolveThumbnail). */
function resolveThumbnail(
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

async function fetchPublicProfile(usernameParam: string): Promise<PublicProfileResult> {
  const userId = await getUserIdForUsername(usernameParam)
  if (!userId) return { status: 'not_found' }
  if (isUserBanned(userId)) return { status: 'not_found' }

  const shares = db
    .select({ tag: tagShares.tag })
    .from(tagShares)
    .where(and(eq(tagShares.userId, userId), eq(tagShares.isPublic, true)))
    .all()
  if (shares.length === 0) return { status: 'not_found' }

  // Identity: prefer the first-class `users` row; fall back to `oauth_tokens`
  // for accounts the backfill hasn't touched (same fallback lookup.ts uses).
  const [userRow] = await db
    .select({
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  let username = userRow?.username ?? usernameParam
  const displayName = userRow?.displayName ?? null
  let avatarUrl = userRow?.avatarUrl ?? null
  let memberSince = userRow?.createdAt ?? null

  if (!userRow) {
    const [token] = await db
      .select({
        username: oauthTokens.username,
        profileImageUrl: oauthTokens.profileImageUrl,
        createdAt: oauthTokens.createdAt,
      })
      .from(oauthTokens)
      .where(eq(oauthTokens.userId, userId))
      .limit(1)
    if (token) {
      username = token.username ?? username
      avatarUrl = token.profileImageUrl ?? null
      memberSince = token.createdAt ?? null
    }
  }

  const tagNames = shares.map((s) => s.tag)

  // Discovery view/save stats (docs/specs/discovery-leaderboards.md §6). This
  // is a PUBLIC page, so unlike the owner-only `/api/tags` dashboard we can't
  // forward `getOwnerCollectionStats().totals` as-is: `byTag` there carries
  // historical events for tags this owner has since made private (recording
  // happened while they were public), and summing across all of it would
  // leak "this curator has more activity than their visible collections
  // show." Instead, sum only over `tagNames` — the shares already filtered
  // to `isPublic = true` above. `bestRank` needs no such filtering: it's
  // derived from the public week leaderboard, which excludes private tags by
  // construction (the leaderboard query inner-joins on `isPublic = 1`).
  const ownerStats = getOwnerCollectionStats(userId)
  const statsForTag = (tag: string): ProfileCollectionStats | null => {
    const s = ownerStats.byTag[tag]
    return s ? { viewCount: s.viewCount, cloneCount: s.cloneCount, rank: s.rank } : null
  }
  const profileStats: ProfileStats = {
    viewCount: tagNames.reduce((sum, tag) => sum + (ownerStats.byTag[tag]?.viewCount ?? 0), 0),
    cloneCount: tagNames.reduce((sum, tag) => sum + (ownerStats.byTag[tag]?.cloneCount ?? 0), 0),
    bestRank: ownerStats.totals.bestRank,
  }

  const taggedRows = db
    .select({
      tag: bookmarkTags.tag,
      bookmarkId: bookmarkTags.bookmarkId,
      platform: bookmarkTags.platform,
    })
    .from(bookmarkTags)
    .where(and(eq(bookmarkTags.userId, userId), inArray(bookmarkTags.tag, tagNames)))
    .all()

  if (taggedRows.length === 0) {
    return {
      status: 'ok',
      profile: {
        userId,
        username,
        displayName,
        avatarUrl,
        memberSince,
        publicTagCount: tagNames.length,
        postCount: 0,
        collections: tagNames.map((tag) => ({
          tag,
          count: 0,
          tiles: [],
          href: `/t/${username}/${tag}`,
          stats: statsForTag(tag),
        })),
        stats: profileStats,
      },
    }
  }

  const allIds = [...new Set(taggedRows.map((r) => r.bookmarkId))]
  const bookmarkResults = db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.id, allIds)))
    .orderBy(desc(bookmarks.processedAt))
    .all()
  const bookmarkByKey = new Map(bookmarkResults.map((b) => [`${b.platform}:${b.id}`, b]))

  // Group matched bookmarks by tag, preserving the processedAt-desc order
  // already established by the query above.
  const byTag = new Map<string, typeof bookmarkResults>()
  for (const row of taggedRows) {
    const key = `${row.platform}:${row.bookmarkId}`
    const b = bookmarkByKey.get(key)
    if (!b) continue
    const arr = byTag.get(row.tag) ?? []
    arr.push(b)
    byTag.set(row.tag, arr)
  }

  // Collect the ids we'll actually render tiles for (top N per tag) so the
  // media/links enrichment queries stay small.
  const tileIdsSet = new Set<string>()
  for (const [, arr] of byTag) {
    for (const b of arr.slice(0, TILES_PER_COLLECTION)) tileIdsSet.add(b.id)
  }
  const tileIds = [...tileIdsSet]

  const mediaResults =
    tileIds.length > 0
      ? db
          .select()
          .from(bookmarkMedia)
          .where(and(eq(bookmarkMedia.userId, userId), inArray(bookmarkMedia.bookmarkId, tileIds)))
          .all()
      : []
  const linkResults =
    tileIds.length > 0
      ? db
          .select({
            bookmarkId: bookmarkLinks.bookmarkId,
            platform: bookmarkLinks.platform,
            linkType: bookmarkLinks.linkType,
            imageUrl: bookmarkLinks.previewImageUrl,
          })
          .from(bookmarkLinks)
          .where(and(eq(bookmarkLinks.userId, userId), inArray(bookmarkLinks.bookmarkId, tileIds)))
          .all()
      : []

  const mediaByKey = new Map<string, typeof mediaResults>()
  for (const m of mediaResults) {
    const k = `${m.platform}:${m.bookmarkId}`
    const arr = mediaByKey.get(k) ?? []
    arr.push(m)
    mediaByKey.set(k, arr)
  }
  const articleCovers = new Map<string, string>()
  for (const l of linkResults) {
    const k = `${l.platform}:${l.bookmarkId}`
    if (l.imageUrl && (!articleCovers.has(k) || l.linkType === 'article'))
      articleCovers.set(k, l.imageUrl)
  }

  const collections: ProfileCollection[] = tagNames.map((tag) => {
    const arr = byTag.get(tag) ?? []
    const tiles: ProfileTile[] = arr.slice(0, TILES_PER_COLLECTION).map((b) => {
      const key = `${b.platform}:${b.id}`
      const media = mediaByKey.get(key) ?? []
      const thumbnailUrl = resolveThumbnail(
        { platform: b.platform, id: b.id, author: b.author },
        media[0],
        articleCovers.get(key),
      )
      const tile: ProfileTile = {}
      if (thumbnailUrl) tile.thumbnailUrl = thumbnailUrl
      if (b.text) tile.text = b.text.slice(0, TEXT_FALLBACK_LENGTH)
      return tile
    })
    return { tag, count: arr.length, tiles, href: `/t/${username}/${tag}`, stats: statsForTag(tag) }
  })

  // Distinct posts across public tags only — a post tagged with two public
  // tags counts once. Restrict the union to bookmarks actually tagged with a
  // PUBLIC tag (byTag keys are exactly the public tag names).
  const distinctPublicPostKeys = new Set<string>()
  for (const arr of byTag.values()) {
    for (const b of arr) distinctPublicPostKeys.add(`${b.platform}:${b.id}`)
  }

  return {
    status: 'ok',
    profile: {
      userId,
      username,
      displayName,
      avatarUrl,
      memberSince,
      publicTagCount: tagNames.length,
      postCount: distinctPublicPostKeys.size,
      collections,
      stats: profileStats,
    },
  }
}
