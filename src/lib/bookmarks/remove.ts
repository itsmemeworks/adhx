import { and, eq } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import {
  activity,
  archivedPosts,
  bookmarkLinks,
  bookmarkMedia,
  bookmarkTags,
  bookmarks,
} from '@/lib/db/schema'

/** Whether this member has saved the post. */
export function hasSave(userId: string, platform: string, id: string): boolean {
  return (
    db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(
        and(eq(bookmarks.userId, userId), eq(bookmarks.platform, platform), eq(bookmarks.id, id)),
      )
      .limit(1)
      .all().length > 0
  )
}

/**
 * Removes one member's save of a post and everything hanging off it (tags,
 * media rows, links, archive state, the public "saved" pulse), all or
 * nothing. Other members' saves of the same post are untouched.
 */
export function removeSave(userId: string, platform: string, id: string): void {
  runInTransaction(() => {
    db.delete(bookmarkTags)
      .where(
        and(
          eq(bookmarkTags.userId, userId),
          eq(bookmarkTags.platform, platform),
          eq(bookmarkTags.bookmarkId, id),
        ),
      )
      .run()
    db.delete(bookmarkMedia)
      .where(
        and(
          eq(bookmarkMedia.userId, userId),
          eq(bookmarkMedia.platform, platform),
          eq(bookmarkMedia.bookmarkId, id),
        ),
      )
      .run()
    db.delete(bookmarkLinks)
      .where(
        and(
          eq(bookmarkLinks.userId, userId),
          eq(bookmarkLinks.platform, platform),
          eq(bookmarkLinks.bookmarkId, id),
        ),
      )
      .run()
    db.delete(archivedPosts)
      .where(
        and(
          eq(archivedPosts.userId, userId),
          eq(archivedPosts.platform, platform),
          eq(archivedPosts.bookmarkId, id),
        ),
      )
      .run()
    db.delete(bookmarks)
      .where(
        and(eq(bookmarks.userId, userId), eq(bookmarks.platform, platform), eq(bookmarks.id, id)),
      )
      .run()
    // The public "saved" pulse for a save that no longer exists.
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
  })
}
