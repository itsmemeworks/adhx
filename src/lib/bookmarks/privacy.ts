import { and, eq } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { activity, bookmarks, type Bookmark } from '@/lib/db/schema'

/**
 * "Just for me" saves (docs/specs/friends-feed.md). A private save is kept,
 * searchable and playable by its owner; no other member sees it, counts it
 * or is told who saved it, and it never writes a public activity pulse.
 */

/** Options every save path accepts. */
export type SaveOptions = {
  /** Make the save private. On a repeat save, a boolean updates the flag; undefined leaves it. */
  private?: boolean
}

/** Read `private` from a request body: a boolean, or undefined for anything else. */
export function privateFlag(body: unknown): boolean | undefined {
  if (!body || typeof body !== 'object') return undefined
  const value = (body as { private?: unknown }).private
  return typeof value === 'boolean' ? value : undefined
}

/**
 * Mark one of the user's saves private or shared. Returns the new value, or
 * null when the user hasn't saved that post. Going private also removes this
 * user's earlier `save` pulse events for the post, so the public pulse never
 * shows (or counts) a save that is now just for them.
 */
export function setSavePrivate(
  userId: string,
  platform: string,
  id: string,
  isPrivate: boolean,
): boolean | null {
  return runInTransaction(() => {
    const updated = db
      .update(bookmarks)
      .set({ isPrivate })
      .where(
        and(eq(bookmarks.userId, userId), eq(bookmarks.platform, platform), eq(bookmarks.id, id)),
      )
      .run()
    if (updated.changes === 0) return null
    if (isPrivate) {
      db.delete(activity)
        .where(
          and(
            eq(activity.userId, userId),
            eq(activity.action, 'save'),
            eq(activity.platform, platform),
            eq(activity.bookmarkId, id),
          ),
        )
        .run()
    }
    return isPrivate
  })
}

/**
 * A repeat save: apply `options.private` to the existing row when it was
 * passed and differs. Returns the row as it now stands.
 */
export function applyRepeatPrivacy<
  T extends Pick<Bookmark, 'userId' | 'platform' | 'id'> & {
    isPrivate?: boolean | null
  },
>(row: T | undefined, options: SaveOptions): T | undefined {
  if (!row || typeof options.private !== 'boolean') return row
  if (!!row.isPrivate === options.private) return row
  const next = setSavePrivate(row.userId, row.platform, row.id, options.private)
  return next === null ? row : { ...row, isPrivate: next }
}
