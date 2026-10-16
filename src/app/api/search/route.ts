import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { checkRateLimit } from '@/lib/rate-limit'
import { loadSearchItems } from '@/lib/semantic/items'
import { stillLearning } from '@/lib/semantic/status'
import { jevStrength, rerank, RERANK_TOP } from '@/lib/semantic/rerank'
import { searchPosts, TUNING, type SearchScope, type SearchType } from '@/lib/semantic/search'

const MAX_QUERY = 200
/** Jev's 0–4 relevance under this means "unrelated" (its lowest level). */
const UNRELATED_JEV = 0.5
const DEFAULT_LIMIT = 30
const MAX_LIMIT = 60
const SCOPES: readonly SearchScope[] = ['mine', 'everyone']
const TYPES: readonly SearchType[] = ['all', 'videos', 'photos', 'text', 'articles']
/** Instant search fires per keystroke; refine (the Jev pass) is the costly call. */
const SEARCH_LIMIT = { windowMs: 60_000, max: 240 }
const REFINE_LIMIT = { windowMs: 60_000, max: 30 }

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function tooMany(resetMs: number): NextResponse {
  return noStore(
    NextResponse.json(
      { error: 'Too many searches' },
      { status: 429, headers: { 'Retry-After': Math.ceil(resetMs / 1000).toString() } },
    ),
  )
}

function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = value === null ? NaN : Number.parseInt(value, 10)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/**
 * GET /api/search — find saved posts by meaning.
 *
 * - `q`: what to look for (1–200 characters; a trailing space means the last
 *   word is finished, otherwise it also matches as a prefix).
 * - `scope`: `mine` (default) or `everyone` (posts anyone saved; never who).
 * - `type`: `all` (default), `videos`, `photos`, `text`, `articles`.
 * - `wordsOnly=1`: match on what posts say, not their pictures or video.
 * - `limit` (1–60, default 30), `offset` for the next page.
 * - `refine=1`: also rerank the first results with Jev. Slower (~0.3s); the
 *   UI shows instant results first and swaps in the refined order.
 */
export const GET = withAuth(async (request: NextRequest, userId) => {
  const params = request.nextUrl.searchParams
  const q = (params.get('q') ?? '').slice(0, MAX_QUERY)
  const scope = (params.get('scope') ?? 'mine') as SearchScope
  const type = (params.get('type') ?? 'all') as SearchType
  if (!SCOPES.includes(scope) || !TYPES.includes(type)) {
    return noStore(NextResponse.json({ error: 'Invalid scope or type' }, { status: 400 }))
  }
  const wordsOnly = params.get('wordsOnly') === '1' || params.get('wordsOnly') === 'true'
  const limit = intParam(params.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT)
  const offset = intParam(params.get('offset'), 0, 0, TUNING.typedPool)
  const refine = params.get('refine') === '1' && offset === 0

  const limited = checkRateLimit(`search:${userId}`, SEARCH_LIMIT)
  if (limited.limited) return tooMany(limited.resetMs)
  if (refine) {
    const refineLimited = checkRateLimit(`search-refine:${userId}`, REFINE_LIMIT)
    if (refineLimited.limited) return tooMany(refineLimited.resetMs)
  }

  try {
    if (!q.trim()) {
      return noStore(
        NextResponse.json({
          items: [],
          total: 0,
          understood: true,
          close: false,
          refined: false,
          nextOffset: null,
        }),
      )
    }
    const result = await searchPosts({ q, scope, type, wordsOnly, userId, limit, offset })
    let items = await loadSearchItems(result.hits, userId)
    let refined = false
    let dropped = 0
    if (refine && items.length > 1) {
      const before = items.length
      const reranked = await rerank(
        q,
        items.slice(0, RERANK_TOP).map((item) => ({
          key: `${item.post.platform}:${item.post.id}`,
          item: item.post,
          visual: item.matched[0] === 'picture' || item.matched[0] === 'video',
        })),
      )
      if (reranked) {
        const byKey = new Map(items.map((i) => [`${i.post.platform}:${i.post.id}`, i]))
        items = [...reranked.order.map((c) => byKey.get(c.key)!), ...items.slice(RERANK_TOP)]
        // Jev reads words, so it judges only matches made on words alone (never
        // one its picture or video also matched): it sets their strength, and
        // drops the ones it calls unrelated.
        const lead = items[0]
        items = items
          .map((i) => {
            const jev = reranked.scores.get(`${i.post.platform}:${i.post.id}`)
            const wordsOnly = i.matched.every((m) => m === 'words' || m === 'keywords')
            if (jev === undefined || !wordsOnly) return i
            if (jev < UNRELATED_JEV && i !== lead) return null
            return { ...i, strength: jevStrength(jev, i.strength) }
          })
          .filter((i): i is (typeof items)[number] => i !== null)
        dropped = before - items.length
        refined = true
      }
    }
    // Results whose picture/video isn't understood yet were matched on words alone.
    const learning = await stillLearning(items.map((i) => `${i.post.platform}:${i.post.id}`))
    items = items.map((i) =>
      learning.has(`${i.post.platform}:${i.post.id}`) ? { ...i, learning: true } : i,
    )
    const next = offset + result.hits.length
    return noStore(
      NextResponse.json({
        items,
        total: result.total - dropped,
        understood: result.understood,
        close: result.close,
        refined,
        nextOffset: next < result.total ? next : null,
      }),
    )
  } catch (error) {
    return noStore(
      handleRouteError(error, { endpoint: '/api/search', userId, message: 'Search failed' }),
    )
  }
})
