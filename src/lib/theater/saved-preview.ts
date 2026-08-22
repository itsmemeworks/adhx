import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarks } from '@/lib/db/schema'

export interface SavedPreviewDisplay {
  author: string | null
  authorName: string | null
  text: string | null
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
    })
    .from(bookmarks)
    .where(and(eq(bookmarks.platform, platform), eq(bookmarks.id, id)))
    .limit(1)
    .get()
  if (!row) return null
  return { author: row.author, authorName: row.authorName, text: row.text }
}
