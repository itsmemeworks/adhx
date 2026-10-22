import { postKeyBatches, postKeyWhere } from '@/lib/db/post-keys'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { postEmbeddings } from '@/lib/db/schema'
import { segmentScores, type SegmentScore } from '@/lib/processing/segment-search'
import { SEMANTIC_MODEL_VERSION, type UnderstandingKind } from './config'
import { cosine, fromBlob } from './vectors'

/**
 * In-memory nearest-neighbour index over `post_embeddings`, one per kind.
 *
 * EmbeddingGemma vectors are Matryoshka-trained, so the first 256 of 768
 * dimensions (re-normalised) rank almost as well at a third of the memory
 * (~1KB per post per kind). Candidates found here are re-scored with the full
 * stored vectors before anything is returned.
 *
 * The index keeps itself current by reading rows changed since its last
 * refresh (keyset on `created_at, rowid`), so new understanding shows up in
 * search within seconds without any coupling to the jobs process.
 */

export const INDEX_DIMS = 256
const REFRESH_EVERY_MS = 2_000
const PAGE = 2_000

type KindIndex = {
  keys: string[]
  slots: Map<string, number>
  data: Float32Array
  alive: Uint8Array
}

type IndexState = {
  model: string
  kinds: Record<UnderstandingKind, KindIndex>
  watermark: { at: string; rowid: number }
  lastRefresh: number
  refreshing: Promise<void> | null
}

function emptyKind(): KindIndex {
  return {
    keys: [],
    slots: new Map(),
    data: new Float32Array(1024 * INDEX_DIMS),
    alive: new Uint8Array(1024),
  }
}

function emptyState(): IndexState {
  return {
    model: SEMANTIC_MODEL_VERSION,
    kinds: { text: emptyKind(), image: emptyKind(), video: emptyKind() },
    watermark: { at: '', rowid: 0 },
    lastRefresh: 0,
    refreshing: null,
  }
}

const g = globalThis as unknown as { __adhxVectorIndex?: IndexState }

function state(): IndexState {
  if (!g.__adhxVectorIndex || g.__adhxVectorIndex.model !== SEMANTIC_MODEL_VERSION) {
    g.__adhxVectorIndex = emptyState()
  }
  return g.__adhxVectorIndex
}

/** First `INDEX_DIMS` dimensions, re-normalised to unit length. */
export function truncate(vector: Float32Array): Float32Array {
  const out = vector.slice(0, INDEX_DIMS)
  let norm = 0
  for (let i = 0; i < out.length; i++) norm += out[i] * out[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < out.length; i++) out[i] /= norm
  return out
}

function put(index: KindIndex, key: string, vector: Float32Array | null): void {
  let slot = index.slots.get(key)
  if (slot === undefined) {
    if (!vector) return
    slot = index.keys.length
    if (slot >= index.alive.length) {
      const data = new Float32Array(index.data.length * 2)
      data.set(index.data)
      const alive = new Uint8Array(index.alive.length * 2)
      alive.set(index.alive)
      index.data = data
      index.alive = alive
    }
    index.keys.push(key)
    index.slots.set(key, slot)
  }
  if (vector) {
    index.data.set(truncate(vector), slot * INDEX_DIMS)
    index.alive[slot] = 1
  } else {
    index.alive[slot] = 0
  }
}

async function load(s: IndexState): Promise<void> {
  for (;;) {
    const rows = db.all<{
      rowid: number
      platform: string
      post_id: string
      kind: string
      status: string
      vector: Buffer | null
      created_at: string
    }>(sql`
      SELECT rowid, platform, post_id, kind, status, vector, created_at
      FROM post_embeddings
      WHERE model = ${s.model}
        AND (created_at > ${s.watermark.at} OR (created_at = ${s.watermark.at} AND rowid > ${s.watermark.rowid}))
      ORDER BY created_at, rowid
      LIMIT ${PAGE}
    `)
    for (const row of rows) {
      const index = s.kinds[row.kind as UnderstandingKind]
      if (index) {
        const key = `${row.platform}:${row.post_id}`
        put(index, key, row.status === 'ok' && row.vector ? fromBlob(row.vector) : null)
      }
      s.watermark = { at: row.created_at, rowid: row.rowid }
    }
    if (rows.length < PAGE) return
    // Yield between pages so a cold start on a large table never blocks
    // the event loop for long.
    await new Promise((resolve) => setImmediate(resolve))
  }
}

/** Bring the index up to date (at most every couple of seconds). */
export function refreshIndex(force = false): Promise<void> {
  const s = state()
  if (s.refreshing) return s.refreshing
  if (!force && Date.now() - s.lastRefresh < REFRESH_EVERY_MS) return Promise.resolve()
  s.refreshing = load(s).finally(() => {
    s.lastRefresh = Date.now()
    s.refreshing = null
  })
  return s.refreshing
}

export interface VectorHit {
  key: string
  score: number
}

export interface NearestResult {
  hits: VectorHit[]
  /** Mean and spread of this query's similarity to every candidate of the kind. */
  mean: number
  std: number
}

/**
 * Top `k` posts of one kind by similarity to `query` (a full 768-dim query
 * vector), optionally only among `allow`. Scores are full-vector cosines.
 * Also returns the background distribution over all candidates, which is
 * what makes scores comparable across kinds and queries.
 */
export async function nearest(
  kind: UnderstandingKind,
  query: Float32Array,
  k: number,
  allow?: ReadonlySet<string>,
): Promise<NearestResult> {
  const index = state().kinds[kind]
  const q = truncate(query)
  const best: VectorHit[] = []
  let floor = -Infinity
  let count = 0
  let sum = 0
  let sumSq = 0
  const segments = kind === 'video' ? await segmentScores(query, truncate, allow) : undefined
  const seenSegments = new Set<string>()
  const consider = (key: string, score: number) => {
    count++
    sum += score
    sumSq += score * score
    if (best.length < k) {
      best.push({ key, score })
      if (best.length === k) {
        best.sort((a, b) => b.score - a.score)
        floor = best[k - 1].score
      }
    } else if (score > floor) {
      // Insert in order, drop the last.
      let i = k - 1
      while (i > 0 && best[i - 1].score < score) {
        best[i] = best[i - 1]
        i--
      }
      best[i] = { key, score }
      floor = best[k - 1].score
    }
  }
  const n = index.keys.length
  for (let slot = 0; slot < n; slot++) {
    if (!index.alive[slot]) continue
    const key = index.keys[slot]
    if (allow && !allow.has(key)) continue
    const offset = slot * INDEX_DIMS
    let score = 0
    for (let i = 0; i < INDEX_DIMS; i++) score += q[i] * index.data[offset + i]
    const segment = segments?.get(key)
    if (segment) {
      score = Math.max(score, segment.score)
      seenSegments.add(key)
    }
    consider(key, score)
  }
  for (const [key, segment] of segments ?? []) {
    if (!seenSegments.has(key)) consider(key, segment.score)
  }
  if (best.length < k) best.sort((a, b) => b.score - a.score)
  return {
    hits: await rescore(kind, query, best, segments),
    ...background(kind, count, sum, sumSq),
  }
}

/**
 * How a query's similarity to a kind is usually spread, measured over 465
 * saved posts and 25 everyday queries (the mean moved ±0.02 between queries,
 * the spread ±0.004). Stands in for the posts a small library doesn't have yet.
 */
export const BACKGROUND_PRIOR: Record<UnderstandingKind, { mean: number; std: number }> = {
  text: { mean: 0.586, std: 0.043 },
  image: { mean: 0.578, std: 0.036 },
  video: { mean: 0.615, std: 0.033 },
}

let priorOverride: { mean: number; std: number } | null = null

/** Tests with made-up vectors: a prior that fits them. Null puts the real one back. */
export function __setBackgroundPrior(prior: { mean: number; std: number } | null): void {
  priorOverride = prior
}

/** The prior counts as this many posts. */
export const PRIOR_WEIGHT = 20

/**
 * Mean and spread of a query's similarity over the candidates, blended with
 * `BACKGROUND_PRIOR`. With a handful of saves the library's own spread says
 * little (with n posts no score can stand more than √(n−1) above the rest,
 * so nothing would ever clear the bar). With hundreds the prior hardly moves it.
 */
export function background(
  kind: UnderstandingKind,
  count: number,
  sum: number,
  sumSq: number,
): { mean: number; std: number } {
  const prior = priorOverride ?? BACKGROUND_PRIOR[kind]
  const n = count + PRIOR_WEIGHT
  const mean = (sum + PRIOR_WEIGHT * prior.mean) / n
  // Pooled second moment of the library and the prior, around the blended mean.
  const second = (sumSq + PRIOR_WEIGHT * (prior.std ** 2 + prior.mean ** 2)) / n
  return { mean, std: Math.sqrt(Math.max(0, second - mean * mean)) }
}

/** Replace truncated scores with full-vector cosines and re-sort. */
async function rescore(
  kind: UnderstandingKind,
  query: Float32Array,
  hits: VectorHit[],
  segments?: ReadonlyMap<string, SegmentScore>,
): Promise<VectorHit[]> {
  if (hits.length === 0) return hits
  const full = new Map<string, Float32Array>()
  for (const part of postKeyBatches(hits.map((h) => h.key))) {
    const rows = await db
      .select({
        platform: postEmbeddings.platform,
        postId: postEmbeddings.postId,
        vector: postEmbeddings.vector,
      })
      .from(postEmbeddings)
      .where(
        and(
          eq(postEmbeddings.kind, kind),
          eq(postEmbeddings.model, SEMANTIC_MODEL_VERSION),
          eq(postEmbeddings.status, 'ok'),
          postKeyWhere(postEmbeddings.platform, postEmbeddings.postId, part),
        ),
      )
    for (const r of rows) {
      const vector = fromBlob(r.vector as Buffer | null)
      if (vector) full.set(`${r.platform}:${r.postId}`, vector)
    }
  }
  return hits
    .map((h) => {
      const v = full.get(h.key)
      const segment = segments?.get(h.key)
      const score = v ? cosine(query, v) : (segment?.fullScore ?? h.score)
      return { key: h.key, score: segment ? Math.max(score, segment.fullScore) : score }
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * One `INDEX_DIMS` vector per post: its words, picture and video vectors
 * averaged (whatever is understood), unit length. Null when nothing is.
 */
export function postVector(key: string): Float32Array | null {
  const s = state()
  let sum: Float32Array | null = null
  for (const kind of ['text', 'image', 'video'] as const) {
    const index = s.kinds[kind]
    const slot = index.slots.get(key)
    if (slot === undefined || !index.alive[slot]) continue
    sum ??= new Float32Array(INDEX_DIMS)
    const offset = slot * INDEX_DIMS
    for (let i = 0; i < INDEX_DIMS; i++) sum[i] += index.data[offset + i]
  }
  if (!sum) return null
  let norm = 0
  for (let i = 0; i < INDEX_DIMS; i++) norm += sum[i] * sum[i]
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < INDEX_DIMS; i++) sum[i] /= norm
  return sum
}

/**
 * Posts nearest a centre in `postVector` space (e.g. a moment's), best
 * first, skipping `exclude`. Scans every post with any understood kind.
 */
export function nearestPosts(
  centre: Float32Array,
  k: number,
  exclude: ReadonlySet<string> = new Set(),
): VectorHit[] {
  const keys = new Set<string>()
  for (const kind of ['text', 'image', 'video'] as const) {
    for (const key of state().kinds[kind].keys) keys.add(key)
  }
  const hits: VectorHit[] = []
  for (const key of keys) {
    if (exclude.has(key)) continue
    const v = postVector(key)
    if (!v) continue
    let score = 0
    for (let i = 0; i < INDEX_DIMS; i++) score += centre[i] * v[i]
    hits.push({ key, score })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, k)
}

/** Test-only: drop the in-memory index. */
export function __resetVectorIndex(): void {
  g.__adhxVectorIndex = undefined
}
