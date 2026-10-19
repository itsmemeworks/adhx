import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { postViews } from '@/lib/db/schema'

/**
 * The feed's watched list (`post_views`): a post counts as seen after 2s on
 * stage, or when it's skipped. New (`/api/feed/blend?mode=new`) plays only
 * posts without a row. Your own rows only, never anyone else's.
 */

export const MAX_VIEWS_PER_CALL = 50

export type PostRef = { platform: string; id: string }

const PLATFORM = /^[a-z]{1,16}$/
const POST_ID = /^[A-Za-z0-9_-]{1,64}$/

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

/** Mark posts seen. Idempotent: a post keeps the time it was first seen. */
export function markSeen(userId: string, posts: PostRef[], now = new Date()): void {
  if (!userId || posts.length === 0) return
  const seenAt = now.toISOString()
  db.insert(postViews)
    .values(posts.map((p) => ({ userId, platform: p.platform, postId: p.id, seenAt })))
    .onConflictDoNothing()
    .run()
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
