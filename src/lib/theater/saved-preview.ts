import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarkMedia, bookmarks } from '@/lib/db/schema'

export interface SavedPreviewDisplay {
  author: string | null
  authorName: string | null
  text: string | null
  category: string | null
  mediaCount: number
}

/**
 * Cross-user display row for a preview page. Content is identical regardless
 * of saver — one row is enough to skip the upstream scrape/oEmbed. Never
 * selects `userId`.
 */
export function getSavedPreviewDisplay(
  platform: 'instagram' | 'tiktok' | 'youtube',
  id: string,
): SavedPreviewDisplay | null {
  const row = db
    .select({
      author: bookmarks.author,
      authorName: bookmarks.authorName,
      text: bookmarks.text,
      category: bookmarks.category,
      mediaCount: sql<number>`(
        SELECT COUNT(*)
        FROM ${bookmarkMedia}
        WHERE ${bookmarkMedia.userId} = ${bookmarks.userId}
          AND ${bookmarkMedia.platform} = ${bookmarks.platform}
          AND ${bookmarkMedia.bookmarkId} = ${bookmarks.id}
      )`,
    })
    .from(bookmarks)
    .where(and(eq(bookmarks.platform, platform), eq(bookmarks.id, id)))
    // A legacy Instagram image may coexist with an older row misclassified as
    // video. A repaired photo row is authoritative; otherwise use the freshest.
    .orderBy(
      sql`CASE WHEN ${bookmarks.category} = 'photo' THEN 0 ELSE 1 END`,
      desc(bookmarks.processedAt),
    )
    .limit(1)
    .get()
  if (!row) return null
  return {
    author: row.author,
    authorName: row.authorName,
    text: row.text,
    category: row.category,
    mediaCount: Number(row.mediaCount) || 0,
  }
}
