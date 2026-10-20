import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarkLinks, bookmarkMedia, bookmarks } from '@/lib/db/schema'
import { buildFeedItem, type FeedItemResponse } from '@/lib/feed/build-item'
import { buildPostDocument, type PostDocument } from './documents'
import { extractedWords } from './extracted'

/**
 * Load one post as the feed would show it, from any saver's copy. Post
 * content is identical across savers; tags are never read here (they are
 * private and are not part of what gets understood).
 */
export async function loadPostItem(
  platform: string,
  postId: string,
): Promise<FeedItemResponse | null> {
  const [row] = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.platform, platform), eq(bookmarks.id, postId)))
    .orderBy(desc(bookmarks.processedAt))
    .limit(1)
  if (!row) return null
  const owner = and(
    eq(bookmarkMedia.userId, row.userId),
    eq(bookmarkMedia.platform, platform),
    eq(bookmarkMedia.bookmarkId, postId),
  )
  const [media, links] = await Promise.all([
    db.select().from(bookmarkMedia).where(owner),
    db
      .select()
      .from(bookmarkLinks)
      .where(
        and(
          eq(bookmarkLinks.userId, row.userId),
          eq(bookmarkLinks.platform, platform),
          eq(bookmarkLinks.bookmarkId, postId),
        ),
      ),
  ])
  const isArticle = links.some(
    (l) => l.expandedUrl?.includes('/article/') || l.expandedUrl?.includes('/i/article/'),
  )
  return buildFeedItem(row, links, media, [], false, isArticle)
}

/**
 * One post's understanding document, with the words read out of its media
 * (speech, text on screen). Every writer of the text vector and keyword row
 * goes through this, so they agree on the text hash.
 */
export async function loadPostDocument(
  platform: string,
  postId: string,
): Promise<{ item: FeedItemResponse; doc: PostDocument } | null> {
  const item = await loadPostItem(platform, postId)
  if (!item) return null
  return { item, doc: buildPostDocument(item, extractedWords(platform, postId)) }
}
