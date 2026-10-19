import { and, eq, inArray, like, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarkLinks, bookmarkMedia, bookmarks, postEmbeddings } from '@/lib/db/schema'
import { seenBy } from '@/lib/people/savers'
import { readModeratedPostKeys } from '@/lib/admin/moderation'
import { SEMANTIC_MODEL_VERSION, type UnderstandingKind } from './config'
import { queryPrompt } from './documents'
import { withoutGone } from './gone'
import { keywordSearch } from './keywords'
import { embedQuery } from './supervisor'
import { nearest, refreshIndex } from './vector-index'
import { fromBlob } from './vectors'

/**
 * Hybrid search over saved posts: the query's meaning is compared with each
 * post's words, picture and video, keywords are matched with FTS5, and the
 * signals are fused on standardised scores (see `TUNING`).
 *
 * Scope `mine` searches only the viewer's saves. Scope `everyone` searches
 * everyone's saves: results are post keys only, filtered to posts with at
 * least one visible save (`visibleSave`: not private, not quoted, saver not
 * banned) — or the viewer's own save — and not hidden by moderation (the same
 * publication rules as the public pulse). Names are attached later, and only
 * for signed-in members (`loadSearchItems`).
 */

export type SearchScope = 'mine' | 'everyone'
/** Same vocabulary as the feed's `filter`. */
export type SearchType = 'all' | 'videos' | 'photos' | 'text' | 'articles'
export type MatchSignal = 'words' | 'picture' | 'video' | 'keywords'

export interface SearchRequest {
  q: string
  scope: SearchScope
  type: SearchType
  /** Match on what posts say only (no pictures or video). */
  wordsOnly: boolean
  userId: string
  limit: number
  offset: number
}

/**
 * How sure the match is, in words people get: `strong` (it's the thing),
 * `good` (very likely), `related` (close in meaning, not exactly it — e.g. a
 * chameleon for "frog").
 */
export type MatchStrength = 'strong' | 'good' | 'related'

export interface SearchHit {
  key: string
  platform: string
  postId: string
  score: number
  /** Which signals put this post in the results, strongest first. */
  matched: MatchSignal[]
  strength: MatchStrength
}

/**
 * Strength from the fused score. On real saves the wanted post scored 2.2–8;
 * frogs for "frog" scored 4.2–5.0 and a chameleon 2.9. Without meaning
 * (keywords only) every hit used the exact words, so it is at least good.
 */
export function strengthOf(score: number, understood = true): MatchStrength {
  if (!understood) return score >= TUNING.keywordStrongScore ? 'strong' : 'good'
  if (score >= TUNING.strongScore) return 'strong'
  if (score >= TUNING.goodScore) return 'good'
  return 'related'
}

export interface SearchResult {
  hits: SearchHit[]
  /** Hits available beyond this page (bounded by the candidate pool). */
  total: number
  /** False when meaning could not be used (model warming up or down): keywords only. */
  understood: boolean
  /** The best hit is a real match, not just the nearest thing. */
  close: boolean
}

export interface SearchDeps {
  embed?: (prompt: string) => Promise<Float32Array>
}

/**
 * Fusion tuning, chosen on the evaluation queries (see WORKLOG). Raw cosines
 * sit in a narrow band whose level differs by query and by kind, so each
 * vector score is standardised against that query's similarity to every
 * candidate of the kind (a z-score). A post scores its best weighted signal
 * plus a share of the others, plus keywords scaled to the best keyword match.
 */
export const TUNING = {
  pool: 200,
  typedPool: 800,
  weights: { words: 1, picture: 0.9, video: 0.9 } as Record<'words' | 'picture' | 'video', number>,
  keywords: 1,
  others: 0.25,
  /** A signal is reported as matched at or above this standardised score. */
  matchedAt: 2,
  /**
   * Results below this are dropped (when meaning was used). On the evaluation
   * queries the wanted post never scored under 2.2; rank 30 sits near 1–1.8.
   */
  minScore: 1.5,
  /** A best hit at or above this counts as a close match (the wanted post never scored under 2.2). */
  closeScore: 2.2,
  /**
   * A result led by words alone needs more: short meme captions otherwise
   * match any query a little. The wanted post never scored under 2.2.
   */
  minWordsScore: 1.9,
  /** Match strength cut-offs (see `strengthOf`). */
  strongScore: 3.5,
  goodScore: 2.6,
  keywordStrongScore: 1.6,
}

type VectorList = { hits: { key: string; score: number }[]; mean: number; std: number }

const KIND_SIGNAL: Record<UnderstandingKind, MatchSignal> = {
  text: 'words',
  image: 'picture',
  video: 'video',
}

const CHUNK = 400

function split(key: string): { platform: string; postId: string } {
  const at = key.indexOf(':')
  return { platform: key.slice(0, at), postId: key.slice(at + 1) }
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK))
  return out
}

async function savedKeys(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ platform: bookmarks.platform, id: bookmarks.id })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
  return new Set(rows.map((r) => `${r.platform}:${r.id}`))
}

/**
 * Posts allowed in `everyone` results: at least one visible save (never a
 * private-only or quoted-only post), or the viewer's own save. Signed out
 * (`viewerId` empty) only visible saves count. Fails closed if moderation
 * can't be read.
 */
export async function publishable(keys: string[], viewerId = ''): Promise<Set<string>> {
  const moderated = readModeratedPostKeys()
  if (!moderated.ok) throw moderated.error
  const wanted = new Set(keys)
  const ok = new Set<string>()
  for (const part of chunks([...new Set(keys.map((k) => split(k).postId))])) {
    const rows = await db
      .selectDistinct({ platform: bookmarks.platform, id: bookmarks.id })
      .from(bookmarks)
      .where(and(seenBy(viewerId), inArray(bookmarks.id, part)))
    for (const r of rows) {
      const key = `${r.platform}:${r.id}`
      if (wanted.has(key) && !moderated.value.has(key)) ok.add(key)
    }
  }
  return ok
}

/** Which posts match a content type, judged from any saver's copy (content is shared). */
async function ofType(keys: string[], type: SearchType): Promise<Set<string>> {
  if (type === 'all') return new Set(keys)
  const video = new Set<string>()
  const photo = new Set<string>()
  const article = new Set<string>()
  for (const part of chunks([...new Set(keys.map((k) => split(k).postId))])) {
    const [media, cats, links] = await Promise.all([
      db
        .selectDistinct({
          platform: bookmarkMedia.platform,
          id: bookmarkMedia.bookmarkId,
          type: bookmarkMedia.mediaType,
        })
        .from(bookmarkMedia)
        .where(inArray(bookmarkMedia.bookmarkId, part)),
      db
        .selectDistinct({ platform: bookmarks.platform, id: bookmarks.id })
        .from(bookmarks)
        .where(and(eq(bookmarks.category, 'article'), inArray(bookmarks.id, part))),
      db
        .selectDistinct({ platform: bookmarkLinks.platform, id: bookmarkLinks.bookmarkId })
        .from(bookmarkLinks)
        .where(
          and(
            inArray(bookmarkLinks.bookmarkId, part),
            or(
              like(bookmarkLinks.expandedUrl, '%/article/%'),
              like(bookmarkLinks.expandedUrl, '%/i/article/%'),
            ),
          ),
        ),
    ])
    for (const m of media) {
      const key = `${m.platform}:${m.id}`
      if (m.type === 'video' || m.type === 'animated_gif') video.add(key)
      else if (m.type === 'photo') photo.add(key)
    }
    for (const r of [...cats, ...links]) article.add(`${r.platform}:${r.id}`)
  }
  return new Set(
    keys.filter((k) => {
      if (type === 'videos') return video.has(k)
      if (type === 'photos') return photo.has(k)
      if (type === 'articles') return article.has(k)
      return !video.has(k) && !photo.has(k) && !article.has(k)
    }),
  )
}

/** Score-level fusion of vector lists and keyword hits. Exported for tests and evaluation. */
export function fuse(
  vectors: Partial<Record<'words' | 'picture' | 'video', VectorList>>,
  keywords: { key: string; score: number }[],
  tuning = TUNING,
): { key: string; score: number; matched: MatchSignal[] }[] {
  const parts = new Map<string, { signal: MatchSignal; s: number }[]>()
  const add = (key: string, signal: MatchSignal, s: number) => {
    const list = parts.get(key) ?? []
    list.push({ signal, s })
    parts.set(key, list)
  }
  for (const [signal, list] of Object.entries(vectors) as [
    'words' | 'picture' | 'video',
    VectorList,
  ][]) {
    if (!list.std) continue
    for (const hit of list.hits) {
      add(hit.key, signal, (tuning.weights[signal] * (hit.score - list.mean)) / list.std)
    }
  }
  const top = keywords[0]?.score ?? 0
  if (top > 0) {
    for (const hit of keywords)
      add(hit.key, 'keywords', (tuning.keywords * tuning.matchedAt * hit.score) / top)
  }
  return [...parts.entries()]
    .map(([key, list]) => {
      list.sort((a, b) => b.s - a.s)
      const [best, ...rest] = list
      const score = best.s + tuning.others * rest.reduce((n, p) => n + Math.max(0, p.s), 0)
      const matched = list.filter((p) => p.s >= tuning.matchedAt).map((p) => p.signal)
      return { key, score, matched: matched.length ? matched : [best.signal] }
    })
    .sort((a, b) => b.score - a.score)
}

export async function searchPosts(
  request: SearchRequest,
  deps: SearchDeps = {},
): Promise<SearchResult> {
  const q = request.q.trim()
  if (!q) return { hits: [], total: 0, understood: true, close: false }
  const pool = request.type === 'all' ? TUNING.pool : TUNING.typedPool
  const mine = request.scope === 'mine' ? await savedKeys(request.userId) : undefined

  const embed = deps.embed ?? embedQuery
  const [vector] = await Promise.all([embed(queryPrompt(q)).catch(() => null), refreshIndex()])

  const keywords = keywordSearch(request.q, pool, mine ? request.userId : undefined)
  const vectors: Partial<Record<'words' | 'picture' | 'video', VectorList>> = {}
  if (vector) {
    const kinds: UnderstandingKind[] = request.wordsOnly ? ['text'] : ['text', 'image', 'video']
    for (const kind of kinds) {
      vectors[KIND_SIGNAL[kind] as 'words' | 'picture' | 'video'] = await nearest(
        kind,
        vector,
        pool,
        mine,
      )
    }
  }

  let ranked = fuse(vectors, keywords)
  if (vector) {
    ranked = ranked.filter(
      (r) => r.score >= (r.matched[0] === 'words' ? TUNING.minWordsScore : TUNING.minScore),
    )
  }
  ranked = await allowedOnly(ranked, {
    mine: !!mine,
    type: request.type,
    userId: request.userId,
  })

  const page = ranked.slice(request.offset, request.offset + request.limit)
  return {
    hits: page.map((r) => ({
      ...r,
      ...split(r.key),
      strength: strengthOf(r.score, vector !== null),
    })),
    total: ranked.length,
    understood: vector !== null,
    // Without meaning, keyword hits are exact words: close by definition.
    close: ranked.length > 0 && (vector === null || ranked[0].score >= TUNING.closeScore),
  }
}

/** Gone posts out, then scope (everyone: bans + moderation) and content-type filters, in rank order. */
async function allowedOnly<T extends { key: string }>(
  ranked: T[],
  opts: { mine: boolean; type: SearchType; userId: string },
): Promise<T[]> {
  let out = await withoutGone(ranked)
  if (!opts.mine && out.length > 0) {
    const allowed = await publishable(
      out.map((r) => r.key),
      opts.userId,
    )
    out = out.filter((r) => allowed.has(r.key))
  }
  if (opts.type !== 'all' && out.length > 0) {
    const allowed = await ofType(
      out.map((r) => r.key),
      opts.type,
    )
    out = out.filter((r) => allowed.has(r.key))
  }
  return out
}

export interface SimilarRequest {
  platform: string
  postId: string
  scope: SearchScope
  type: SearchType
  userId: string
  limit: number
}

/**
 * Posts like this one ("More like this", "Stick to this vibe"): its own
 * words, picture and video vectors are each compared with the same kind
 * across posts, standardised and fused like a search. The post itself is
 * never returned. Empty when the post has not been understood yet.
 */
export async function similarPosts(request: SimilarRequest): Promise<SearchResult> {
  const self = `${request.platform}:${request.postId}`
  // Only from a post the caller may know is saved: a visible save, or their
  // own. A private-only post must not even read as "understood" to others.
  const [known] = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.platform, request.platform),
        eq(bookmarks.id, request.postId),
        seenBy(request.userId),
      ),
    )
    .limit(1)
  if (!known) {
    return { hits: [], total: 0, understood: false, close: false }
  }
  const rows = await db
    .select({ kind: postEmbeddings.kind, vector: postEmbeddings.vector })
    .from(postEmbeddings)
    .where(
      and(
        eq(postEmbeddings.platform, request.platform),
        eq(postEmbeddings.postId, request.postId),
        eq(postEmbeddings.model, SEMANTIC_MODEL_VERSION),
        eq(postEmbeddings.status, 'ok'),
      ),
    )
  if (rows.length === 0) return { hits: [], total: 0, understood: false, close: false }
  await refreshIndex()
  const pool = request.type === 'all' ? TUNING.pool : TUNING.typedPool
  const mine = request.scope === 'mine' ? await savedKeys(request.userId) : undefined
  const vectors: Partial<Record<'words' | 'picture' | 'video', VectorList>> = {}
  for (const row of rows) {
    const vector = fromBlob(row.vector as Buffer | null)
    const kind = row.kind as UnderstandingKind
    if (!vector || !KIND_SIGNAL[kind]) continue
    const found = await nearest(kind, vector, pool + 1, mine)
    vectors[KIND_SIGNAL[kind] as 'words' | 'picture' | 'video'] = {
      ...found,
      hits: found.hits.filter((h) => h.key !== self),
    }
  }
  let ranked = fuse(vectors, []).filter((r) => r.score >= TUNING.minScore)
  ranked = await allowedOnly(ranked, {
    mine: !!mine,
    type: request.type,
    userId: request.userId,
  })
  return {
    hits: ranked
      .slice(0, request.limit)
      .map((r) => ({ ...r, ...split(r.key), strength: strengthOf(r.score) })),
    total: ranked.length,
    understood: true,
    close: ranked.length > 0 && ranked[0].score >= TUNING.closeScore,
  }
}
