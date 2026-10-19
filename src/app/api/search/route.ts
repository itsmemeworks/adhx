import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { checkRateLimit } from '@/lib/rate-limit'
import { findPosts } from '@/lib/semantic/find'
import { TUNING, type SearchScope, type SearchType } from '@/lib/semantic/search'

const MAX_QUERY = 200
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
    const result = await findPosts({ q, scope, type, wordsOnly, userId, limit, offset, refine })
    return noStore(NextResponse.json(result))
  } catch (error) {
    return noStore(
      handleRouteError(error, { endpoint: '/api/search', userId, message: 'Search failed' }),
    )
  }
})
