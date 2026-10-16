import { sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'

/**
 * Keyword side of hybrid search: SQLite FTS5 over the same post text the
 * model reads (`documents.ts`; never tags). One row per post.
 */

const MAX_TOKENS = 12

/** Replace this post's keyword text. */
export function indexPostText(platform: string, postId: string, body: string): void {
  runInTransaction(() => {
    db.run(sql`DELETE FROM post_text_fts WHERE platform = ${platform} AND post_id = ${postId}`)
    if (body.trim()) {
      db.run(
        sql`INSERT INTO post_text_fts (platform, post_id, body) VALUES (${platform}, ${postId}, ${body})`,
      )
    }
  })
}

export function hasPostText(platform: string, postId: string): boolean {
  const rows = db.all<{ one: number }>(
    sql`SELECT 1 AS one FROM post_text_fts WHERE platform = ${platform} AND post_id = ${postId} LIMIT 1`,
  )
  return rows.length > 0
}

/**
 * Build an FTS5 query from free text. Every token is quoted (so user input
 * can never use FTS syntax) and OR-ed; bm25 already favours posts matching
 * more of them. The last token is a prefix while the person is still typing.
 */
export function ftsQuery(input: string): string | null {
  const tokens =
    input
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.slice(0, MAX_TOKENS) ?? []
  if (tokens.length === 0) return null
  const typing = !/\s$/.test(input)
  return tokens
    .map((t, i) => (typing && i === tokens.length - 1 && t.length >= 2 ? `"${t}"*` : `"${t}"`))
    .join(' OR ')
}

export interface KeywordHit {
  key: string
  /** bm25 is lower-is-better; this is negated so higher is better. */
  score: number
}

/** Best keyword matches, optionally only among one user's saves. */
export function keywordSearch(input: string, limit: number, userId?: string): KeywordHit[] {
  const match = ftsQuery(input)
  if (!match) return []
  const rows = userId
    ? db.all<{ platform: string; post_id: string; rank: number }>(sql`
        SELECT f.platform AS platform, f.post_id AS post_id, bm25(post_text_fts) AS rank
        FROM post_text_fts f
        WHERE post_text_fts MATCH ${match}
          AND EXISTS (
            SELECT 1 FROM bookmarks b
            WHERE b.user_id = ${userId} AND b.platform = f.platform AND b.id = f.post_id
          )
        ORDER BY rank
        LIMIT ${limit}
      `)
    : db.all<{ platform: string; post_id: string; rank: number }>(sql`
        SELECT platform, post_id, bm25(post_text_fts) AS rank
        FROM post_text_fts
        WHERE post_text_fts MATCH ${match}
        ORDER BY rank
        LIMIT ${limit}
      `)
  return rows.map((r) => ({ key: `${r.platform}:${r.post_id}`, score: -r.rank }))
}
