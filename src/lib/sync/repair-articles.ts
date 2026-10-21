import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarks } from '@/lib/db/schema'
import { upsertBookmarkLinks } from '@/lib/db/bookmark-link-merge'
import { extractEnrichmentData, fetchTweetData } from '@/lib/media/fxembed'

const PER_PASS = 40

/**
 * X articles whose content never loaded: sync gives up on FxTwitter after
 * three tries, which left a few saves as a bare `x.com/i/article/…` link
 * with nothing to read, show or search. Fetch them again and store the
 * article like sync would. Returns the posts that now have their article.
 */
export async function repairUnloadedArticles(
  opts: { limit?: number; pauseMs?: number } = {},
): Promise<{ platform: string; postId: string }[]> {
  const rows = db.all<{ id: string; author: string; user_id: string }>(sql`
    SELECT b.id AS id, b.author AS author, b.user_id AS user_id
    FROM bookmarks b
    WHERE b.platform = 'twitter'
      AND b.text LIKE '%x.com/i/article/%'
      AND NOT EXISTS (
        SELECT 1 FROM bookmark_links l
        WHERE l.user_id = b.user_id AND l.platform = 'twitter' AND l.bookmark_id = b.id
          AND l.link_type = 'article' AND l.domain = 'x.com' AND l.content_json IS NOT NULL
      )
    ORDER BY b.processed_at DESC
    LIMIT ${(opts.limit ?? PER_PASS) * 4}
  `)
  const byPost = new Map<string, { author: string; users: string[] }>()
  for (const r of rows) {
    const entry = byPost.get(r.id) ?? { author: r.author, users: [] }
    entry.users.push(r.user_id)
    byPost.set(r.id, entry)
  }

  const repaired: { platform: string; postId: string }[] = []
  for (const [id, { author, users }] of [...byPost].slice(0, opts.limit ?? PER_PASS)) {
    const data = await fetchTweetData(author, id, { timeoutMs: 20_000 })
    const article = data?.tweet ? extractEnrichmentData(data)?.article : null
    const url = article?.url
    if (article && url) {
      upsertBookmarkLinks(
        users.map((userId) => ({
          userId,
          bookmarkId: id,
          expandedUrl: url,
          domain: 'x.com',
          linkType: 'article',
          previewTitle: article.title,
          previewDescription: article.description,
          previewImageUrl: article.imageUrl,
          contentJson: article.content ? JSON.stringify(article.content) : null,
        })),
      )
      for (const userId of users) {
        db.update(bookmarks)
          .set({ category: 'article' })
          .where(
            and(
              eq(bookmarks.userId, userId),
              eq(bookmarks.platform, 'twitter'),
              eq(bookmarks.id, id),
            ),
          )
          .run()
      }
      repaired.push({ platform: 'twitter', postId: id })
    }
    if (opts.pauseMs !== 0) await new Promise((r) => setTimeout(r, opts.pauseMs ?? 500))
  }
  return repaired
}
