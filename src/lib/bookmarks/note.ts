import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { bookmarks, users, type Bookmark } from '@/lib/db/schema'
import { cleanNote } from '@/lib/people/note-text'
import type { SaveOptions } from './privacy'

/**
 * Notes on saves (docs/specs/friends-feed.md): a few words for your people
 * ("this is so you, Ben"), stored on your own `bookmarks` row. Members see it
 * next to your face (`Saver.note`, via `saversFor`); strangers never do, and a
 * private save's note is only ever shown to its owner.
 */

/**
 * Read `note` from a request body: a cleaned string, null to clear (`null`,
 * or a string that is empty once cleaned), undefined when it wasn't sent or
 * isn't text.
 */
export function noteOption(body: unknown): string | null | undefined {
  if (!body || typeof body !== 'object' || !('note' in body)) return undefined
  const value = (body as { note?: unknown }).note
  if (value === null) return null
  return typeof value === 'string' ? cleanNote(value) : undefined
}

/** The note a new save made with these options gets. */
export function newSaveNote(options: SaveOptions): string | null {
  return typeof options.note === 'string' ? cleanNote(options.note) : null
}

/**
 * Set or clear the note on one of the user's saves. Returns `{ note }` as
 * stored, or null when the user hasn't saved that post. Only ever touches the
 * user's own row.
 */
export function setSaveNote(
  userId: string,
  platform: string,
  id: string,
  note: string | null,
): { note: string | null } | null {
  const clean = note === null ? null : cleanNote(note)
  const updated = db
    .update(bookmarks)
    .set({ note: clean })
    .where(
      and(eq(bookmarks.userId, userId), eq(bookmarks.platform, platform), eq(bookmarks.id, id)),
    )
    .run()
  return updated.changes === 0 ? null : { note: clean }
}

/**
 * A repeat save: apply `options.note` to the existing row when it was passed
 * (a string sets it, an empty string or null clears it). Returns the row as
 * it now stands.
 */
export function applyRepeatNote<
  T extends Pick<Bookmark, 'userId' | 'platform' | 'id'> & { note?: string | null },
>(row: T | undefined, options: SaveOptions): T | undefined {
  if (!row || options.note === undefined) return row
  const next = options.note === null ? null : cleanNote(options.note)
  if ((row.note ?? null) === next) return row
  const done = setSaveNote(row.userId, row.platform, row.id, next)
  return done === null ? row : { ...row, note: done.note }
}

/**
 * Moderation: clear the notes on a post, everyone's or one member's
 * (`username`). Returns how many notes were cleared. Admin routes only.
 */
export function clearPostNotes(platform: string, id: string, username?: string): number {
  return runInTransaction(() => {
    const owners = username
      ? db.select({ id: users.id }).from(users).where(eq(users.username, username)).all()
      : null
    if (owners && owners.length === 0) return 0
    return db
      .update(bookmarks)
      .set({ note: null })
      .where(
        and(
          eq(bookmarks.platform, platform),
          eq(bookmarks.id, id),
          isNotNull(bookmarks.note),
          ...(owners
            ? [
                inArray(
                  bookmarks.userId,
                  owners.map((o) => o.id),
                ),
              ]
            : []),
        ),
      )
      .run().changes
  })
}
