import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { postExtractedText, type PostExtractedText } from '@/lib/db/schema'
import { extractVersion, type ExtractKind } from './config'

/**
 * Words read out of a post's media on this server (`post_extracted_text`):
 * what is said in its video or sound and the text on its pictures or
 * frames. Keyed by post, never by saver, like `post_embeddings`.
 */

export interface ExtractedWords {
  speech: string | null
  screen: string | null
}

export const NO_EXTRACTED: ExtractedWords = { speech: null, screen: null }

export type ExtractStatus = 'ok' | 'none' | 'failed'

export function getExtracted(
  platform: string,
  postId: string,
  kind: ExtractKind,
): PostExtractedText | undefined {
  return db
    .select()
    .from(postExtractedText)
    .where(
      and(
        eq(postExtractedText.platform, platform),
        eq(postExtractedText.postId, postId),
        eq(postExtractedText.kind, kind),
      ),
    )
    .limit(1)
    .all()[0]
}

/** True when the stored row already reflects this content with the current extractor. */
export function extractedCurrent(
  row: PostExtractedText | undefined,
  kind: ExtractKind,
  contentHash: string | null,
): boolean {
  if (!row || row.model !== extractVersion(kind)) return false
  if (contentHash === null) return row.status === 'none'
  return row.contentHash === contentHash
}

function wordsOf(rows: Pick<PostExtractedText, 'kind' | 'status' | 'text'>[]): ExtractedWords {
  const out: ExtractedWords = { speech: null, screen: null }
  for (const row of rows) {
    // `failed` rows can carry words from an earlier successful run.
    if (row.status === 'none' || !row.text) continue
    if (row.kind === 'speech') out.speech = row.text
    else if (row.kind === 'screen') out.screen = row.text
  }
  return out
}

/** The searchable words for one post (any extractor version: old words beat none). */
export function extractedWords(platform: string, postId: string): ExtractedWords {
  const rows = db
    .select({
      kind: postExtractedText.kind,
      status: postExtractedText.status,
      text: postExtractedText.text,
    })
    .from(postExtractedText)
    .where(and(eq(postExtractedText.platform, platform), eq(postExtractedText.postId, postId)))
    .all()
  return wordsOf(rows)
}

/** Many posts at once (`platform:id` keys), for labelling search results. */
export function extractedWordsFor(keys: string[]): Map<string, ExtractedWords> {
  const out = new Map<string, ExtractedWords>()
  const wanted = new Set(keys)
  const ids = [...new Set(keys.map((k) => k.slice(k.indexOf(':') + 1)))]
  for (let i = 0; i < ids.length; i += 400) {
    const rows = db
      .select({
        platform: postExtractedText.platform,
        postId: postExtractedText.postId,
        kind: postExtractedText.kind,
        status: postExtractedText.status,
        text: postExtractedText.text,
      })
      .from(postExtractedText)
      .where(
        and(
          inArray(postExtractedText.postId, ids.slice(i, i + 400)),
          isNotNull(postExtractedText.text),
        ),
      )
      .all()
    const grouped = new Map<string, typeof rows>()
    for (const row of rows) {
      const key = `${row.platform}:${row.postId}`
      if (!wanted.has(key)) continue
      grouped.set(key, [...(grouped.get(key) ?? []), row])
    }
    for (const [key, list] of grouped) out.set(key, wordsOf(list))
  }
  return out
}

/**
 * Store one extraction. Returns true when the post's searchable words changed
 * (new words, different words, or words gone), so the caller re-indexes its
 * keywords and re-queues its text vector. Synchronous: safe inside a
 * transaction.
 */
export function saveExtracted(input: {
  platform: string
  postId: string
  kind: ExtractKind
  contentHash: string | null
  status: ExtractStatus
  text?: string | null
  language?: string | null
  error?: string | null
}): boolean {
  const before = getExtracted(input.platform, input.postId, input.kind)
  const previous = before?.text ?? null
  // A failed attempt keeps whatever words an earlier run found (still searchable).
  const text =
    input.status === 'ok' ? (input.text ?? null) : input.status === 'failed' ? previous : null
  const values = {
    platform: input.platform,
    postId: input.postId,
    kind: input.kind,
    model: extractVersion(input.kind),
    contentHash: input.contentHash ?? '',
    status: input.status,
    text,
    language:
      input.status === 'ok' ? (input.language ?? null) : text ? (before?.language ?? null) : null,
    error: input.error ? input.error.slice(0, 500) : null,
    createdAt: new Date().toISOString(),
  }
  db.insert(postExtractedText)
    .values(values)
    .onConflictDoUpdate({
      target: [postExtractedText.platform, postExtractedText.postId, postExtractedText.kind],
      set: {
        model: values.model,
        contentHash: values.contentHash,
        status: values.status,
        text: values.text,
        language: values.language,
        error: values.error,
        createdAt: values.createdAt,
      },
    })
    .run()
  return previous !== text
}
