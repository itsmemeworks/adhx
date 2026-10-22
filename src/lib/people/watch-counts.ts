import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { postWatchCounts } from '@/lib/db/schema'
import { readPostModeration } from '@/lib/admin/moderation'
import { canSeePost } from '@/lib/reactions/post-reactions'
import { seenBy } from './savers'

/**
 * Reading watch counts (`post_watch_counts`, written by
 * `src/lib/watch/record.ts`): "watched 14×", a post's plays across everyone,
 * and a member's year (Wrapped). Named to friends, never to strangers:
 *
 * - A member's exact counts are shown only to that member: call
 *   `watchCountFor` and `watchYear` with the signed-in viewer's own id, never
 *   someone else's. `postPlays` is a total with no names, which any member
 *   who can see the post may have.
 * - Totals count only members who aren't banned, and only for a post the
 *   viewer can see. An admin-hidden post has none. Moderation is read fail
 *   closed (it throws when it can't be read).
 * - Wrapped's posts are only ones the member can still see and that aren't
 *   hidden.
 */

export type WatchCount = { plays: number; finishes: number; seconds: number }

const NONE: WatchCount = { plays: 0, finishes: 0, seconds: 0 }

function hidden(platform: string, id: string): boolean {
  const moderation = readPostModeration(platform, id)
  if (!moderation.ok) throw moderation.error
  return moderation.value
}

/** One member's counts on a post, every year added up. Zeros when they never played it. */
export function watchCountFor(userId: string, platform: string, id: string): WatchCount {
  if (!userId) return { ...NONE }
  const row = db
    .select({
      plays: sql<number>`COALESCE(SUM(${postWatchCounts.plays}), 0)`,
      finishes: sql<number>`COALESCE(SUM(${postWatchCounts.finishes}), 0)`,
      seconds: sql<number>`COALESCE(SUM(${postWatchCounts.seconds}), 0)`,
    })
    .from(postWatchCounts)
    .where(
      and(
        eq(postWatchCounts.userId, userId),
        eq(postWatchCounts.platform, platform),
        eq(postWatchCounts.postId, id),
      ),
    )
    .get()
  return row ? { plays: row.plays, finishes: row.finishes, seconds: row.seconds } : { ...NONE }
}

export type PostPlays = WatchCount & {
  /** How many members played it at least once. */
  watchers: number
}

/**
 * A post's plays across every member who isn't banned, for a member who can
 * see the post; null when they can't. No names. Hidden posts have none.
 */
export function postPlays(viewerId: string, platform: string, id: string): PostPlays | null {
  if (!canSeePost(viewerId, platform, id)) return null
  if (hidden(platform, id)) return { ...NONE, watchers: 0 }
  const row = db
    .select({
      plays: sql<number>`COALESCE(SUM(${postWatchCounts.plays}), 0)`,
      finishes: sql<number>`COALESCE(SUM(${postWatchCounts.finishes}), 0)`,
      seconds: sql<number>`COALESCE(SUM(${postWatchCounts.seconds}), 0)`,
      watchers: sql<number>`COUNT(DISTINCT CASE WHEN ${postWatchCounts.plays} > 0 THEN ${postWatchCounts.userId} END)`,
    })
    .from(postWatchCounts)
    .where(
      and(
        eq(postWatchCounts.platform, platform),
        eq(postWatchCounts.postId, id),
        sql`NOT EXISTS (SELECT 1 FROM user_bans WHERE user_bans.user_id = ${postWatchCounts.userId})`,
      ),
    )
    .get()
  return row ?? { ...NONE, watchers: 0 }
}

export type Rewatched = WatchCount & { platform: string; id: string }

export type WatchYear = WatchCount & {
  year: number
  /** Posts played at least once, or watched for any time. */
  posts: number
  /** Seconds watched, in hours (one decimal). */
  hours: number
  /** The posts played most (twice or more), most first; only ones still visible to the member. */
  mostRewatched: Rewatched[]
}

/** The member's year (UTC) for Wrapped: how much, and what they played again and again. */
export function watchYear(userId: string, year: number, top = 5): WatchYear {
  const empty: WatchYear = { year, ...NONE, posts: 0, hours: 0, mostRewatched: [] }
  if (!userId) return empty
  const totals = db
    .select({
      posts: sql<number>`COUNT(*)`,
      plays: sql<number>`COALESCE(SUM(${postWatchCounts.plays}), 0)`,
      finishes: sql<number>`COALESCE(SUM(${postWatchCounts.finishes}), 0)`,
      seconds: sql<number>`COALESCE(SUM(${postWatchCounts.seconds}), 0)`,
    })
    .from(postWatchCounts)
    .where(and(eq(postWatchCounts.userId, userId), eq(postWatchCounts.year, year)))
    .get()
  if (!totals || totals.posts === 0) return empty
  const limit = Math.max(1, Math.min(50, Math.floor(top)))
  const rows = db.all<Rewatched & { postId: string }>(sql`
    SELECT w.platform AS platform, w.post_id AS postId, w.plays AS plays,
           w.finishes AS finishes, w.seconds AS seconds
    FROM post_watch_counts w
    WHERE w.user_id = ${userId} AND w.year = ${year} AND w.plays >= 2
      AND EXISTS (
        SELECT 1 FROM bookmarks b
        WHERE b.platform = w.platform AND b.id = w.post_id AND ${seenBy(userId, 'b')}
      )
      AND NOT EXISTS (
        SELECT 1 FROM moderated_posts m
        WHERE m.platform = w.platform AND m.bookmark_id = w.post_id AND m.hidden = 1
      )
    ORDER BY w.plays DESC, w.seconds DESC, w.last_at DESC
    LIMIT ${limit}
  `)
  return {
    year,
    posts: totals.posts,
    plays: totals.plays,
    finishes: totals.finishes,
    seconds: totals.seconds,
    hours: Math.round(totals.seconds / 360) / 10,
    mostRewatched: rows.map((r) => ({
      platform: r.platform,
      id: r.postId,
      plays: r.plays,
      finishes: r.finishes,
      seconds: r.seconds,
    })),
  }
}
