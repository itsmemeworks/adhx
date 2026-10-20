import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { toPhonePost } from '@/lib/app/phone-post'
import { checkRateLimit } from '@/lib/rate-limit'
import { findPosts } from '@/lib/semantic/find'
import type { SearchScope, SearchType } from '@/lib/semantic/search'
import { captureException } from '@/lib/sentry'
import { noteSearch } from '@/lib/admin/counts'

const MAX_QUERY = 200
const TYPES: readonly SearchType[] = ['all', 'videos', 'photos', 'text', 'articles']
const SCOPES: readonly SearchScope[] = ['mine', 'everyone']
// A phone searches as you type (debounced), so a little more than an assistant.
const LIMIT = { windowMs: 60_000, max: 120 }
const REFINE_LIMIT = { windowMs: 60_000, max: 30 }

function int(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/**
 * GET /api/app/search?q=… — search saves by meaning from the phone app:
 * `{ items, total, understood, close, nextOffset }`. Pictures and video frames
 * are matched as well as words. Each item names its `savers`.
 *
 * - `scope`: `mine` (default, your saves) or `everyone` (everyone's saves; never
 *   other people's private ones).
 *
 * - `understood: false`: meaning isn't ready on this ADHX; these matched on words.
 * - `close: false`: nothing matched closely; these are the nearest.
 * - `type`: all (default), videos, photos, text, articles. `offset`, `limit` (1–40).
 */
export const GET = withPhoneKey(async (request, { userId }) => {
  const params = new URL(request.url).searchParams
  const q = (params.get('q') ?? '').trim().slice(0, MAX_QUERY)
  if (!q) return appError(400, 'no_query', 'Say what to look for.')
  const type = (params.get('type') ?? 'all') as SearchType
  if (!TYPES.includes(type)) {
    return appError(400, 'bad_type', `type must be one of ${TYPES.join(', ')}.`)
  }
  const scope = (params.get('scope') ?? 'mine') as SearchScope
  if (!SCOPES.includes(scope)) {
    return appError(400, 'bad_scope', `scope must be one of ${SCOPES.join(', ')}.`)
  }
  const limit = int(params.get('limit'), 30, 1, 40)
  const offset = int(params.get('offset'), 0, 0, 800)

  const limited = checkRateLimit(`app-search:${userId}`, LIMIT)
  if (limited.limited) {
    const response = appError(429, 'busy', 'Lots of searches just now. Give it a moment.')
    response.headers.set('Retry-After', Math.ceil(limited.resetMs / 1000).toString())
    return response
  }
  const refine = offset === 0 && !checkRateLimit(`search-refine:${userId}`, REFINE_LIMIT).limited

  try {
    const result = await findPosts({
      q,
      scope,
      type,
      wordsOnly: false,
      userId,
      limit,
      offset,
      refine,
    })
    if (offset === 0) {
      noteSearch(userId, {
        mode: result.understood ? 'meaning' : 'words',
        found: result.items.length > 0 && result.close !== false,
      })
    }
    return NextResponse.json(
      {
        items: result.items.map((item) => toPhonePost(item, true)),
        total: result.total,
        understood: result.understood,
        close: result.close,
        nextOffset: result.nextOffset,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    captureException(error, { endpoint: '/api/app/search' })
    return appError(500, 'failed', 'Search didn’t work just now. Try again.')
  }
})
