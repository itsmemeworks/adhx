import { postKeyBatches, postKeyWhere } from '@/lib/db/post-keys'
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import { POST_ID_PATTERN } from '@/lib/platform/networks'
import { db, runInTransaction } from '@/lib/db'
import { bookmarks, postViews, postWatchCounts, userPreferences } from '@/lib/db/schema'
import { markSendsSeen } from '@/lib/sends/sends'

/**
 * The feed's watched list (`post_views`): a post counts as seen after 2s on
 * stage, or when it's skipped. New (`/api/feed/blend?mode=new`) plays only
 * posts without a row; friend and group channels count "N new" from it
 * (`newTo`). Your own rows only, never anyone else's.
 */

export const MAX_VIEWS_PER_CALL = 50

export type PostRef = { platform: string; id: string }

const PLATFORM = /^[a-z]{1,16}$/
const POST_ID = POST_ID_PATTERN

/**
 * `{ posts: [{ platform, id }] }` → the posts (deduplicated), or an error
 * message. At most `MAX_VIEWS_PER_CALL`; an empty list is fine (nothing to do).
 */
export function parseViewBody(body: unknown): { posts: PostRef[] } | { error: string } {
  const posts = (body as { posts?: unknown } | null)?.posts
  if (!Array.isArray(posts)) return { error: 'Send { posts: [{ platform, id }] }.' }
  if (posts.length > MAX_VIEWS_PER_CALL) {
    return { error: `At most ${MAX_VIEWS_PER_CALL} posts at a time.` }
  }
  const out = new Map<string, PostRef>()
  for (const p of posts) {
    const platform = (p as { platform?: unknown })?.platform
    const id = (p as { id?: unknown })?.id
    if (typeof platform !== 'string' || !PLATFORM.test(platform)) {
      return { error: 'Each post needs a platform.' }
    }
    if (typeof id !== 'string' || !POST_ID.test(id)) return { error: 'Each post needs an id.' }
    out.set(`${platform}:${id}`, { platform, id })
  }
  return { posts: [...out.values()] }
}

/**
 * Mark posts seen. Idempotent: a post keeps the time it was first seen. Posts
 * sent to you stop leading New once seen (`post_sends.seen_at`).
 */
export function markSeen(userId: string, posts: PostRef[], now = new Date()): void {
  if (!userId || posts.length === 0) return
  const seenAt = now.toISOString()
  runInTransaction(() => {
    db.insert(postViews)
      .values(posts.map((p) => ({ userId, platform: p.platform, postId: p.id, seenAt })))
      .onConflictDoNothing()
      .run()
    markSendsSeen(userId, posts, now)
    const before = readSitting(userId)
    const at = now.getTime()
    const sitting = {
      at: Math.max(at, before?.at ?? at),
      previous: before
        ? at - before.at >= SITTING_GAP_MS
          ? before.at
          : before.previous
        : lastLookedAt(userId, at),
    }
    db.insert(userPreferences)
      .values({ userId, key: SITTING_KEY, value: JSON.stringify(sitting), updatedAt: seenAt })
      .onConflictDoUpdate({
        target: [userPreferences.userId, userPreferences.key],
        set: { value: JSON.stringify(sitting), updatedAt: seenAt },
      })
      .run()
  })
}

/** A pause this long between posts seen ends a sitting. */
export const SITTING_GAP_MS = 30 * 60_000
const SITTING_KEY = 'feed.sitting'

/** Two timestamps per member, including replay-only visits; no unbounded view log. */
function readSitting(userId: string): { at: number; previous: number | null } | null {
  const row = db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, SITTING_KEY)))
    .get()
  try {
    const s = JSON.parse(row?.value ?? 'null')
    return s &&
      typeof s.at === 'number' &&
      Number.isFinite(s.at) &&
      (s.previous === null || (typeof s.previous === 'number' && Number.isFinite(s.previous)))
      ? s
      : null
  } catch {
    return null
  }
}

/**
 * When the viewer last looked, before this sitting: the newest post they saw
 * before a gap of `SITTING_GAP_MS` (counting back from now). Null when they've
 * never seen anything, or every view is one unbroken sitting.
 */
export function lastLookedAt(userId: string, now = Date.now()): number | null {
  if (!userId) return null
  const sitting = readSitting(userId)
  if (sitting) return now - sitting.at >= SITTING_GAP_MS ? sitting.at : sitting.previous
  // Existing libraries have no sitting record until their next view.
  const rows = db
    .select({ seenAt: postViews.seenAt })
    .from(postViews)
    .where(eq(postViews.userId, userId))
    .orderBy(desc(postViews.seenAt))
    .limit(500)
    .all()
  let after = now
  for (const row of rows) {
    const at = Date.parse(row.seenAt)
    if (!Number.isFinite(at)) continue
    if (after - at > SITTING_GAP_MS) return at
    after = at
  }
  return null
}

/** Which of these posts (`platform:id`) the viewer has seen. */
export function seenKeys(userId: string, keys: string[]): Set<string> {
  const out = new Set<string>()
  if (!userId || keys.length === 0) return out
  const wanted = new Set(keys)
  for (const part of postKeyBatches(keys)) {
    const rows = db
      .select({ platform: postViews.platform, postId: postViews.postId })
      .from(postViews)
      .where(
        and(eq(postViews.userId, userId), postKeyWhere(postViews.platform, postViews.postId, part)),
      )
      .all()
    for (const r of rows) {
      const key = `${r.platform}:${r.postId}`
      if (wanted.has(key)) out.add(key)
    }
  }
  return out
}

/**
 * When the viewer last watched each of these posts (epoch ms): the later of
 * their seen mark and their last play (`post_watch_counts.last_at`). Posts
 * never watched are left out. Your own rows only.
 */
export function lastWatchedAt(userId: string, keys: string[]): Map<string, number> {
  const out = new Map<string, number>()
  if (!userId || keys.length === 0) return out
  const wanted = new Set(keys)
  const later = (key: string, iso: string | null) => {
    const at = iso ? Date.parse(iso) : NaN
    if (!wanted.has(key) || !Number.isFinite(at)) return
    out.set(key, Math.max(out.get(key) ?? 0, at))
  }
  for (const part of postKeyBatches(keys)) {
    const seen = db
      .select({ platform: postViews.platform, postId: postViews.postId, at: postViews.seenAt })
      .from(postViews)
      .where(
        and(eq(postViews.userId, userId), postKeyWhere(postViews.platform, postViews.postId, part)),
      )
      .all()
    for (const r of seen) later(`${r.platform}:${r.postId}`, r.at)
    const played = db
      .select({
        platform: postWatchCounts.platform,
        postId: postWatchCounts.postId,
        at: sql<string | null>`MAX(${postWatchCounts.lastAt})`,
      })
      .from(postWatchCounts)
      .where(
        and(
          eq(postWatchCounts.userId, userId),
          postKeyWhere(postWatchCounts.platform, postWatchCounts.postId, part),
        ),
      )
      .groupBy(postWatchCounts.platform, postWatchCounts.postId)
      .all()
    for (const r of played) later(`${r.platform}:${r.postId}`, r.at)
  }
  return out
}

/**
 * SQL: the viewer hasn't seen this post. `alias` is the `bookmarks` alias in
 * a raw query (`FROM bookmarks b` → `notSeenBy(viewer, 'b')`). Always true
 * when nobody is signed in.
 */
export function notSeenBy(viewerId: string, alias: string): SQL {
  if (!viewerId) return sql`1 = 1`
  const a = sql.identifier(alias)
  return sql`NOT EXISTS (
    SELECT 1 FROM post_views pv
    WHERE pv.user_id = ${viewerId} AND pv.platform = ${a}.platform AND pv.post_id = ${a}.id
  )`
}

/** SQL: neither saved by the viewer nor seen by them — what "new" means on a channel. */
export function newTo(viewerId: string, alias: string): SQL {
  const a = sql.identifier(alias)
  return sql`(NOT EXISTS (
    SELECT 1 FROM bookmarks mine
    WHERE mine.user_id = ${viewerId} AND mine.platform = ${a}.platform AND mine.id = ${a}.id
  ) AND ${notSeenBy(viewerId, alias)})`
}

/**
 * Of these posts (`platform:id`), the ones new to the viewer: not in their
 * saves and not seen (`post_views`), the same reading as `newTo`. Channel
 * queues mark each item with it (`isNew`), so the tiles' "New" marks and
 * "Play the N new ones" agree.
 */
export function newKeysFor(viewerId: string, keys: string[]): Set<string> {
  const out = new Set<string>()
  if (!viewerId || keys.length === 0) return out
  const seen = seenKeys(viewerId, keys)
  const saved = new Set<string>()
  for (const part of postKeyBatches(keys)) {
    const rows = db.all<{ platform: string; id: string }>(
      sql`SELECT platform, id FROM bookmarks
          WHERE user_id = ${viewerId} AND ${postKeyWhere(bookmarks.platform, bookmarks.id, part)}`,
    )
    for (const r of rows) saved.add(`${r.platform}:${r.id}`)
  }
  for (const key of keys) if (!seen.has(key) && !saved.has(key)) out.add(key)
  return out
}
