import { and, eq } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import {
  activity,
  bookmarks,
  phoneSaveQueue,
  serverSettings,
  userPreferences,
  type Bookmark,
} from '@/lib/db/schema'
import { applyRepeatNote } from './note'

/**
 * "Just for me" saves (docs/specs/friends-feed.md). A private save is kept,
 * searchable and playable by its owner; no other member sees it, counts it
 * or is told who saved it, and it never writes a public activity pulse.
 */

/** Options every save path accepts. */
export type SaveOptions = {
  /** Make the save private. On a repeat save, a boolean updates the flag; undefined leaves it. */
  private?: boolean
  /**
   * What a NEW save gets when `private` isn't given. Filled from the owner's
   * "Just for me by default" (`withPrivateDefault`); never changes a repeat save.
   */
  defaultPrivate?: boolean
  /**
   * A note for your people (`bookmarks/note.ts`). A string sets it (cleaned;
   * empty clears it), null clears it, undefined leaves a repeat save's note.
   */
  note?: string | null
}

/** `user_preferences` key for Settings → You → "Just for me by default" ('true' | 'false'). */
export const PRIVATE_DEFAULT_KEY = 'save.privateDefault'

/** Does this account start new saves private? */
export function privateByDefault(userId: string): boolean {
  const row = db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, PRIVATE_DEFAULT_KEY)))
    .get()
  return row?.value === 'true'
}

/** Fill `defaultPrivate` from the owner's setting, unless the caller already decided. */
export function withPrivateDefault(userId: string, options: SaveOptions = {}): SaveOptions {
  if (typeof options.private === 'boolean' || typeof options.defaultPrivate === 'boolean') {
    return options
  }
  return { ...options, defaultPrivate: privateByDefault(userId) }
}

/** Whether a new save made with these options is private. */
export function newSavePrivate(options: SaveOptions): boolean {
  return typeof options.private === 'boolean' ? options.private : options.defaultPrivate === true
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
    // A queue acknowledgement must not undo a newer choice on the web.
    db.update(phoneSaveQueue)
      .set({ privateChoice: isPrivate, isPrivate })
      .where(
        and(
          eq(phoneSaveQueue.userId, userId),
          eq(phoneSaveQueue.platform, platform),
          eq(phoneSaveQueue.postId, id),
        ),
      )
      .run()
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

/** A repeat save: apply `options.private` and `options.note` when they were passed. */
export function applyRepeatSave<
  T extends Pick<Bookmark, 'userId' | 'platform' | 'id'> & {
    isPrivate?: boolean | null
    note?: string | null
  },
>(row: T | undefined, options: SaveOptions): T | undefined {
  return applyRepeatNote(applyRepeatPrivacy(row, options), options)
}

/** A DB-backed fingerprint for public caches, including across web processes.
 * Never return this value to clients. Privacy toggles do not change moderation
 * state, so checking only a cache TTL or the moderation fingerprint is unsafe.
 */
export function savePrivacyFingerprint(): string {
  return (
    db
      .select({ value: serverSettings.value })
      .from(serverSettings)
      .where(eq(serverSettings.key, 'saves.visibility'))
      .get()?.value ?? '0'
  )
}
