import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { POST_ID_PATTERN } from '@/lib/platform/networks'
import { db } from '@/lib/db'
import { postViews } from '@/lib/db/schema'
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
  db.insert(postViews)
    .values(posts.map((p) => ({ userId, platform: p.platform, postId: p.id, seenAt })))
    .onConflictDoNothing()
    .run()
  markSendsSeen(userId, posts, now)
}

/** Which of these posts (`platform:id`) the viewer has seen. */
export function seenKeys(userId: string, keys: string[]): Set<string> {
  const out = new Set<string>()
  if (!userId || keys.length === 0) return out
  const wanted = new Set(keys)
  const ids = [...new Set(keys.map((k) => k.slice(k.indexOf(':') + 1)))]
  for (let i = 0; i < ids.length; i += 400) {
    const rows = db
      .select({ platform: postViews.platform, postId: postViews.postId })
      .from(postViews)
      .where(and(eq(postViews.userId, userId), inArray(postViews.postId, ids.slice(i, i + 400))))
      .all()
    for (const r of rows) {
      const key = `${r.platform}:${r.postId}`
      if (wanted.has(key)) out.add(key)
    }
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
  const ids = [...new Set(keys.map((k) => k.slice(k.indexOf(':') + 1)))]
  for (let i = 0; i < ids.length; i += 400) {
    const rows = db.all<{ platform: string; id: string }>(
      sql`SELECT platform, id FROM bookmarks
          WHERE user_id = ${viewerId} AND id IN (${sql.join(
            ids.slice(i, i + 400).map((id) => sql`${id}`),
            sql`, `,
          )})`,
    )
    for (const r of rows) saved.add(`${r.platform}:${r.id}`)
  }
  for (const key of keys) if (!seen.has(key) && !saved.has(key)) out.add(key)
  return out
}
