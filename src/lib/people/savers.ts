import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarks, userPreferences, users } from '@/lib/db/schema'
import { usableAvatarUrl } from '@/lib/avatar/generated-avatar'
import type { Saver } from './types'

/**
 * Who saved what, for members only (docs/specs/friends-feed.md).
 *
 * Members (signed-in, non-banned accounts) see each other's saves by name.
 * Strangers never do: every helper here returns nothing for a signed-out
 * viewer (`viewerId === ''`), and none of it may reach a public surface
 * (public tweet JSON, OG images, signed-out moments, previews, trending).
 *
 * A save counts as someone's save only when it is not private, not a quoted
 * copy (`source = 'quoted'`, the quoted post stored with a save) and its
 * saver is not banned — `visibleSave()`. The viewer always sees their own
 * save, private or not.
 */

export type { Saver }

function col(alias: string | undefined, name: string, column: unknown): SQL {
  return alias ? sql`${sql.identifier(alias)}.${sql.identifier(name)}` : sql`${column}`
}

/**
 * The SQL condition "a save other people may see or count": not private, not
 * a quoted copy, saver not banned. Pass `alias` when `bookmarks` is aliased in
 * a raw query (`FROM bookmarks b` → `visibleSave('b')`); without it, the
 * condition refers to the Drizzle `bookmarks` columns.
 *
 * Every query that counts or groups other people's saves must use it, so a
 * post with only private savers never surfaces.
 */
export function visibleSave(alias?: string): SQL {
  const isPrivate = col(alias, 'is_private', bookmarks.isPrivate)
  const source = col(alias, 'source', bookmarks.source)
  const userId = col(alias, 'user_id', bookmarks.userId)
  return sql`(${isPrivate} = 0 AND COALESCE(${source}, '') != 'quoted' AND NOT EXISTS (SELECT 1 FROM user_bans WHERE user_bans.user_id = ${userId}))`
}

/** `visibleSave()` on the Drizzle `bookmarks` table (no alias). */
export const visibleSaveFilter: SQL = visibleSave()

/** A save the viewer may see: anyone's visible save, or the viewer's own (even private). */
export function seenBy(viewerId: string, alias?: string): SQL {
  if (!viewerId) return visibleSave(alias)
  const userId = col(alias, 'user_id', bookmarks.userId)
  const source = col(alias, 'source', bookmarks.source)
  return sql`(${visibleSave(alias)} OR (${userId} = ${viewerId} AND COALESCE(${source}, '') != 'quoted'))`
}

/** Members' avatar to show: none when they chose the generated icon. */
export function memberAvatar(avatarUrl: string | null, avatarSource: string | null): string | null {
  return avatarSource === 'generated' ? null : usableAvatarUrl(avatarUrl)
}

const CHUNK = 400

/**
 * Savers for each post, keyed `platform:id`, newest saver first. Includes
 * non-banned members' visible saves plus the viewer's own save even when it
 * is private; quoted copies never count. Empty when signed out.
 */
export function saversFor(
  keys: { platform: string; id: string }[],
  viewerId: string,
): Map<string, Saver[]> {
  const out = new Map<string, Saver[]>()
  if (!viewerId || keys.length === 0) return out
  const wanted = new Set(keys.map((k) => `${k.platform}:${k.id}`))
  const ids = [...new Set(keys.map((k) => k.id))]
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = db
      .select({
        platform: bookmarks.platform,
        id: bookmarks.id,
        userId: bookmarks.userId,
        savedAt: bookmarks.processedAt,
        username: users.username,
        name: users.displayName,
        avatarUrl: users.avatarUrl,
        avatarSource: userPreferences.value,
      })
      .from(bookmarks)
      .innerJoin(users, eq(users.id, bookmarks.userId))
      .leftJoin(
        userPreferences,
        and(eq(userPreferences.userId, bookmarks.userId), eq(userPreferences.key, 'avatarSource')),
      )
      .where(and(inArray(bookmarks.id, ids.slice(i, i + CHUNK)), seenBy(viewerId)))
      .orderBy(desc(bookmarks.processedAt), users.username)
      .all()
    for (const r of rows) {
      const key = `${r.platform}:${r.id}`
      if (!wanted.has(key)) continue
      const list = out.get(key) ?? []
      list.push({
        username: r.username,
        name: r.name ?? null,
        avatarUrl: memberAvatar(r.avatarUrl, r.avatarSource),
        savedAt: r.savedAt,
        isYou: r.userId === viewerId,
      })
      out.set(key, list)
    }
  }
  // Chunked by id, so all of a post's rows come from one ordered query.
  return out
}

/** Whether the viewer's own save of a post is private, keyed `platform:id` (own saves only). */
export function privateKeysFor(
  keys: { platform: string; id: string }[],
  viewerId: string,
): Set<string> {
  const out = new Set<string>()
  if (!viewerId || keys.length === 0) return out
  const ids = [...new Set(keys.map((k) => k.id))]
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = db
      .select({ platform: bookmarks.platform, id: bookmarks.id })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, viewerId),
          eq(bookmarks.isPrivate, true),
          inArray(bookmarks.id, ids.slice(i, i + CHUNK)),
        ),
      )
      .all()
    for (const r of rows) out.add(`${r.platform}:${r.id}`)
  }
  return out
}

/** Attach `savers` and `isPrivate` to posts for a signed-in viewer; signed out, returns them as they are. */
export function withSavers<T extends { id: string; platform?: string | null }>(
  posts: T[],
  viewerId: string,
): (T & { savers?: Saver[]; isPrivate?: boolean })[] {
  if (!viewerId || posts.length === 0) return posts
  const keys = posts.map((p) => ({ platform: p.platform || 'twitter', id: p.id }))
  const savers = saversFor(keys, viewerId)
  const own = privateKeysFor(keys, viewerId)
  return posts.map((p) => {
    const key = `${p.platform || 'twitter'}:${p.id}`
    return { ...p, savers: savers.get(key) ?? [], isPrivate: own.has(key) }
  })
}
