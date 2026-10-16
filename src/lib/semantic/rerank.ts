import type { FeedItemResponse } from '@/lib/feed/build-item'
import { buildPostDocument } from './documents'
import { askJev, jevAvailable } from './jev'

/**
 * Optional second pass over the best few results with Jev (TypeSafe's
 * decision model): one graded `score` question per candidate, answered in a
 * single call. Only the query and PUBLIC post content are sent (never tags,
 * never who saved it). Any failure or timeout returns the fused order.
 */

const TIMEOUT_MS = 3_000
const CACHE_SIZE = 200
const DESCRIPTION_CHARS = 600
export const RERANK_TOP = 20

const LEVELS = [
  'unrelated',
  'loosely related',
  'related',
  'very likely what they want',
  'exactly what they are looking for',
]

/**
 * Jev reads words only. A post found by its picture or video may say nothing
 * about what it shows, so its fused rank keeps more weight (see `blend`).
 */
export const RERANK_TUNING = { fusedWeight: 1, visualFusedWeight: 2.5 }

export interface RerankCandidate {
  key: string
  item: FeedItemResponse
  /** True when the post was matched on its picture or video rather than words. */
  visual: boolean
}

const g = globalThis as unknown as { __adhxRerankCache?: Map<string, Map<string, number>> }
const cache = (g.__adhxRerankCache ??= new Map())

export function rerankAvailable(): boolean {
  return jevAvailable()
}

/** What Jev is told about one post: its own public words and what kind of post it is. */
export function describe(item: FeedItemResponse): string {
  const media = item.media ?? []
  const kind = media.some((m) => m.mediaType === 'video' || m.mediaType === 'animated_gif')
    ? 'a video post'
    : media.some((m) => m.mediaType === 'photo')
      ? 'a photo post'
      : item.isXArticle || item.articlePreview
        ? 'an article or link'
        : 'a text post'
  // Cutting mid-emoji leaves a lone surrogate, which Jev rejects (400).
  const words = buildPostDocument(item)
    .keywords.replace(/\s+/g, ' ')
    .slice(0, DESCRIPTION_CHARS)
    .toWellFormed()
  return `This is ${kind}. ${words || '(no words)'}`
}

async function scoreWithJev(
  query: string,
  candidates: RerankCandidate[],
): Promise<Map<string, number>> {
  const ids = candidates.map((_, i) => `p${i + 1}`)
  const answers = await askJev(
    { query },
    Object.fromEntries(
      candidates.map((c, i) => [
        ids[i],
        {
          type: 'score' as const,
          instructions: `How well does this saved post match what the person is searching for? Post: ${describe(c.item)}`,
          criteria: LEVELS,
        },
      ]),
    ),
    TIMEOUT_MS,
  )
  const scores = new Map<string, number>()
  candidates.forEach((c, i) => {
    const score = answers[ids[i]]?.score
    if (typeof score === 'number' && Number.isFinite(score)) scores.set(c.key, score)
  })
  if (scores.size === 0) throw new Error('Jev returned no scores')
  return scores
}

/**
 * Combine Jev's 0–4 relevance with the fused order (0–1, best = 1). Exported
 * for tests and evaluation.
 */
export function blend(
  candidates: RerankCandidate[],
  scores: Map<string, number>,
  tuning = RERANK_TUNING,
): RerankCandidate[] {
  const n = candidates.length
  return candidates
    .map((c, rank) => {
      const fused = n > 1 ? 1 - rank / (n - 1) : 1
      const jev = scores.get(c.key)
      const weight = c.visual ? tuning.visualFusedWeight : tuning.fusedWeight
      // Unscored candidates keep their place relative to a middling score.
      return { c, value: (jev ?? 2) + weight * fused }
    })
    .sort((a, b) => b.value - a.value)
    .map((x) => x.c)
}

const LEVELS_UP = ['related', 'good', 'strong'] as const
type Strength = (typeof LEVELS_UP)[number]

/**
 * Jev's 0–4 relevance as a match strength, for matches made on words alone.
 * It may raise a match freely but lower it by one level at most: a short
 * caption like "#nibs #squirrel" can read as weak to Jev while being exactly it.
 */
export function jevStrength(score: number, fused: Strength = 'related'): Strength {
  const jev: Strength = score >= 3 ? 'strong' : score >= 2 ? 'good' : 'related'
  const floor = Math.max(0, LEVELS_UP.indexOf(fused) - 1)
  return LEVELS_UP[Math.max(LEVELS_UP.indexOf(jev), floor)]
}

/** Rerank the first `RERANK_TOP` candidates. Returns null when Jev is unavailable or fails. */
export async function rerank(
  query: string,
  candidates: RerankCandidate[],
): Promise<{ order: RerankCandidate[]; scores: Map<string, number> } | null> {
  if (!rerankAvailable() || candidates.length < 2) return null
  const top = candidates.slice(0, RERANK_TOP)
  const cacheKey = `${query.trim().toLowerCase()}\n${top.map((c) => c.key).join(',')}`
  let scores = cache.get(cacheKey)
  if (!scores) {
    try {
      scores = await scoreWithJev(query.trim(), top)
    } catch {
      return null
    }
    cache.set(cacheKey, scores)
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string)
  }
  return { order: [...blend(top, scores), ...candidates.slice(RERANK_TOP)], scores }
}
