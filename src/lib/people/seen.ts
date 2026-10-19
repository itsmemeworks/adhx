import { sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'

/**
 * What a member has already watched (`post_views`, the server-side seen
 * list). Friend and group channels use it to say "N new". Written so it
 * works before `post_views` exists: with no table, nothing counts as seen.
 */

const ready = new WeakMap<object, true>()

/** Whether `post_views` exists. Only a yes is remembered (a migration may add it later). */
export function hasPostViews(): boolean {
  if (ready.has(db as object)) return true
  try {
    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'post_views'`,
    )
    if (rows.length === 0) return false
    ready.set(db as object, true)
    return true
  } catch {
    return false
  }
}

/**
 * SQL: the viewer hasn't seen this post. `alias` is the `bookmarks` alias in
 * a raw query (`FROM bookmarks b` → `notSeenBy(viewer, 'b')`). Always true
 * when `post_views` doesn't exist or nobody is signed in.
 */
export function notSeenBy(viewerId: string, alias: string): SQL {
  if (!viewerId || !hasPostViews()) return sql`1 = 1`
  const a = sql.identifier(alias)
  return sql`NOT EXISTS (
    SELECT 1 FROM post_views pv
    WHERE pv.user_id = ${viewerId} AND pv.platform = ${a}.platform AND pv.post_id = ${a}.id
  )`
}

/** Posts the viewer has seen, as `platform:id`. Empty without `post_views`. */
export function seenKeys(viewerId: string): Set<string> {
  if (!viewerId || !hasPostViews()) return new Set()
  try {
    const rows = db.all<{ platform: string; post_id: string }>(
      sql`SELECT platform, post_id FROM post_views WHERE user_id = ${viewerId}`,
    )
    return new Set(rows.map((r) => `${r.platform}:${r.post_id}`))
  } catch {
    return new Set()
  }
}

/** SQL: neither saved by the viewer nor seen by them — what "new" means on a channel. */
export function newTo(viewerId: string, alias: string): SQL {
  const a = sql.identifier(alias)
  return sql`(NOT EXISTS (
    SELECT 1 FROM bookmarks mine
    WHERE mine.user_id = ${viewerId} AND mine.platform = ${a}.platform AND mine.id = ${a}.id
  ) AND ${notSeenBy(viewerId, alias)})`
}
