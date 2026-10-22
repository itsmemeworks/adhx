import { sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { captureException } from '@/lib/sentry'
import { loadPostDocument } from './posts'
import type { PostKey } from './queue'

/**
 * Keyword side of hybrid search: SQLite FTS5 over the same post text the
 * model reads (`documents.ts`; never tags). One row per post.
 */

const MAX_TOKENS = 12

/** Replace this post's keyword text. */
export function indexPostText(platform: string, postId: string, body: string): void {
  runInTransaction(() => {
    db.run(sql`DELETE FROM post_text_fts WHERE rowid IN (
      SELECT row_id FROM post_text_keys WHERE platform = ${platform} AND post_id = ${postId}
    )`)
    db.run(sql`DELETE FROM post_text_keys WHERE platform = ${platform} AND post_id = ${postId}`)
    if (body.trim()) {
      const inserted = db.run(
        sql`INSERT INTO post_text_fts (platform, post_id, body) VALUES (${platform}, ${postId}, ${body})`,
      )
      db.run(sql`INSERT INTO post_text_keys(row_id, platform, post_id)
        VALUES(${inserted.lastInsertRowid}, ${platform}, ${postId})`)
    }
  })
}

export function hasPostText(platform: string, postId: string): boolean {
  const rows = db.all<{ one: number }>(
    sql`SELECT 1 AS one FROM post_text_keys WHERE platform = ${platform} AND post_id = ${postId} LIMIT 1`,
  )
  return rows.length > 0
}

/** Index shared post content immediately, without waiting for model inference. */
export async function indexSavedPosts(keys: PostKey[]): Promise<number> {
  const unique = new Map(keys.map((key) => [`${key.platform || 'twitter'}:${key.postId}`, key]))
  let indexed = 0
  for (const key of unique.values()) {
    const platform = key.platform || 'twitter'
    const loaded = await loadPostDocument(platform, key.postId)
    if (!loaded) continue
    indexPostText(platform, key.postId, loaded.doc.keywords)
    indexed++
    if (indexed % 50 === 0) await new Promise((resolve) => setImmediate(resolve))
  }
  return indexed
}

/**
 * Catch up all saved posts missing keyword text, including saves made while
 * the model was disabled or before FTS existed. No embeddings are required.
 * Re-running after a restart only visits missing rows.
 */
export async function backfillKeywordIndex(): Promise<number> {
  const rows = db.all<{ platform: string; postId: string }>(sql`
    SELECT platform, id AS postId FROM bookmarks
    EXCEPT
    SELECT platform, post_id AS postId FROM post_text_keys
  `)
  return indexSavedPosts(rows)
}

const keywordStartup = globalThis as unknown as { __adhxKeywordBackfill?: Promise<void> }

/** Start a model-free catch-up once per web process, without delaying startup. */
export function startKeywordIndex(): void {
  if (process.env.NODE_ENV === 'test' || process.env['VITEST']) return
  keywordStartup.__adhxKeywordBackfill ??= backfillKeywordIndex()
    .then(() => undefined)
    .catch((error) => {
      keywordStartup.__adhxKeywordBackfill = undefined
      captureException(error, { endpoint: 'semantic.keywordBackfill' })
    })
}

/**
 * Little words that are in almost every post. OR-ed in, they let a post that
 * shares only "a" or "the" with the query come back as a match (in a small
 * library it's often the best keyword hit there is).
 */
const FILLER = new Set(
  'a an the and or but of to in on at by for with from about into as is are was were be been being it its this that these those i me my you your we our they their he him she his her them us some something any thing one has have had do does did so than then just very'.split(
    ' ',
  ),
)

/**
 * What an apostrophe leaves behind: "brother's" → "brother", "don't" → "don".
 * Without this the tokenizer splits off a lone "s" (or "t", "ll" …) that
 * matches every possessive in the library.
 */
const CLITIC = /(?<=[\p{L}\p{N}])['’ʼ](?:s|t|d|m|ll|re|ve)(?![\p{L}\p{N}])/giu

/** A single letter on its own says nothing ("s", "x"); a lone digit can ("3 cats"). */
function isLoneLetter(token: string): boolean {
  return token.length === 1 && /\p{L}/u.test(token)
}

/**
 * Build an FTS5 query from free text. Every token is quoted (so user input
 * can never use FTS syntax) and OR-ed; bm25 already favours posts matching
 * more of them. The last token is a prefix while the person is still typing.
 * Filler words are left out unless that's all there is.
 */
export function ftsQuery(input: string): string | null {
  const tokens = queryTokens(input)
  if (tokens.length === 0) return null
  return tokens.map((t) => (t.prefix ? `"${t.token}"*` : `"${t.token}"`)).join(' OR ')
}

/**
 * The words a keyword search looks for, the last one a prefix while typing.
 * Possessive and contraction endings, lone letters and filler are dropped;
 * if nothing is left, the filler words stand in (a search for "the who").
 */
export function queryTokens(input: string): { token: string; prefix: boolean }[] {
  const all = (
    input
      .toLowerCase()
      .replace(CLITIC, '')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  ).filter((t) => !isLoneLetter(t))
  const meaningful = all.filter((t) => !FILLER.has(t))
  const tokens = (meaningful.length ? meaningful : all).slice(0, MAX_TOKENS)
  const typing = !/\s$/.test(input)
  return tokens.map((token, i) => ({
    token,
    prefix: typing && i === tokens.length - 1 && token.length >= 2,
  }))
}

/** Words of a text the way FTS (`unicode61 remove_diacritics 2`) sees them. */
export function textTokens(text: string): Set<string> {
  return new Set(
    text
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [],
  )
}

/** How many of the query's words this text contains. */
export function tokenHits(
  words: Set<string>,
  tokens: { token: string; prefix: boolean }[],
): number {
  let hits = 0
  for (const { token, prefix } of tokens) {
    const bare = token.normalize('NFKD').replace(/\p{M}/gu, '')
    if (words.has(bare) || (prefix && [...words].some((w) => w.startsWith(bare)))) hits++
  }
  return hits
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
