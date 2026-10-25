import { sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db, runInTransaction } from '@/lib/db'
import { postWatchCounts } from '@/lib/db/schema'
import { POST_ID_PATTERN } from '@/lib/platform/networks'
import { canSeePost } from '@/lib/reactions/post-reactions'

/**
 * Watch counts (`post_watch_counts`): how many times a member played a post,
 * how many times they watched it to the end, and how many seconds they
 * actually watched. Phones (`POST /api/app/watched`) and the web theater
 * (`POST /api/watched`) send what they tallied since the last batch; the
 * numbers are added to the member's row for this year. Only posts the member
 * can see are counted (anyone's visible save, or their own).
 */

export const MAX_WATCHED_PER_CALL = 50
/** Per post per batch. Larger numbers are capped, not refused. */
export const MAX_PLAYS = 500
export const MAX_FINISHES = 500
export const MAX_SECONDS = 86_400

export type Watched = {
  platform: string
  id: string
  plays: number
  finishes: number
  seconds: number
}

const PLATFORM = /^[a-z]{1,16}$/

function count(value: unknown, cap: number): number | null {
  if (value === undefined) return 0
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.min(cap, Math.floor(value))
}

/**
 * `{ posts: [{ platform, id, plays, finishes, seconds }] }` → the tallies
 * (one per post, repeats added together, empty ones dropped), or an error
 * message. Counts are whole numbers ≥ 0; each is capped.
 */
export class WatchBatchConflict extends Error {}
const BATCH_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function parseWatchedBody(
  body: unknown,
): { posts: Watched[]; batchId?: string } | { error: string } {
  const batchId = (body as { batchId?: unknown } | null)?.batchId
  if (batchId !== undefined && (typeof batchId !== 'string' || !BATCH_ID.test(batchId)))
    return { error: 'A batch id must be a UUID.' }
  const posts = (body as { posts?: unknown } | null)?.posts
  if (!Array.isArray(posts)) {
    return { error: 'Send { posts: [{ platform, id, plays, finishes, seconds }] }.' }
  }
  if (posts.length > MAX_WATCHED_PER_CALL) {
    return { error: `At most ${MAX_WATCHED_PER_CALL} posts at a time.` }
  }
  const out = new Map<string, Watched>()
  for (const p of posts) {
    const entry = (p ?? {}) as Record<string, unknown>
    const { platform, id } = entry
    if (typeof platform !== 'string' || !PLATFORM.test(platform)) {
      return { error: 'Each post needs a platform.' }
    }
    if (typeof id !== 'string' || !POST_ID_PATTERN.test(id)) {
      return { error: 'Each post needs an id.' }
    }
    const plays = count(entry.plays, MAX_PLAYS)
    const finishes = count(entry.finishes, MAX_FINISHES)
    const seconds = count(entry.seconds, MAX_SECONDS)
    if (plays === null || finishes === null || seconds === null) {
      return { error: 'Plays, finishes and seconds are whole numbers, 0 or more.' }
    }
    const key = `${platform}:${id}`
    const before = out.get(key)
    out.set(key, {
      platform,
      id,
      plays: Math.min(MAX_PLAYS, (before?.plays ?? 0) + plays),
      finishes: Math.min(MAX_FINISHES, (before?.finishes ?? 0) + finishes),
      seconds: Math.min(MAX_SECONDS, (before?.seconds ?? 0) + seconds),
    })
  }
  return {
    posts: [...out.values()].filter((w) => w.plays || w.finishes || w.seconds),
    ...(typeof batchId === 'string' ? { batchId: batchId.toLowerCase() } : {}),
  }
}

/**
 * Add these tallies to the member's counts for this year. Posts they can't
 * see are left out (a phone can still be holding a batch for a post that was
 * since made private or removed). Returns how many posts were counted.
 */
export function recordWatched(
  userId: string,
  posts: Watched[],
  now = new Date(),
  batchId?: string,
): number {
  if (!userId || posts.length === 0) return 0
  if (batchId !== undefined && !BATCH_ID.test(batchId))
    throw new WatchBatchConflict('Invalid batch id')
  const at = now.toISOString()
  const year = now.getUTCFullYear()
  return runInTransaction(() => {
    if (batchId) {
      const id = batchId.toLowerCase()
      const hash = createHash('sha256').update(JSON.stringify(posts)).digest('hex')
      const previous = db.get<{ payload_hash: string }>(
        sql`SELECT payload_hash FROM watch_batch_receipts WHERE user_id=${userId} AND batch_id=${id}`,
      )
      if (previous) {
        if (previous.payload_hash !== hash)
          throw new WatchBatchConflict('A batch id cannot change its posts')
        return 0
      }
      db.run(
        sql`INSERT INTO watch_batch_receipts(user_id,batch_id,payload_hash) VALUES(${userId},${id},${hash})`,
      )
    }
    const allowed = posts.filter((p) => canSeePost(userId, p.platform, p.id))
    for (const p of allowed) {
      db.insert(postWatchCounts)
        .values({
          userId,
          platform: p.platform,
          postId: p.id,
          year,
          plays: p.plays,
          finishes: p.finishes,
          seconds: p.seconds,
          firstAt: at,
          lastAt: at,
        })
        .onConflictDoUpdate({
          target: [
            postWatchCounts.userId,
            postWatchCounts.platform,
            postWatchCounts.postId,
            postWatchCounts.year,
          ],
          set: {
            plays: sql`${postWatchCounts.plays} + ${p.plays}`,
            finishes: sql`${postWatchCounts.finishes} + ${p.finishes}`,
            seconds: sql`${postWatchCounts.seconds} + ${p.seconds}`,
            lastAt: at,
          },
        })
        .run()
    }
    return allowed.length
  })
}
