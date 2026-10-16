import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { checkRateLimit } from '@/lib/rate-limit'
import { loadSearchItems } from '@/lib/semantic/items'
import { similarPosts, type SearchScope, type SearchType } from '@/lib/semantic/search'

const SCOPES: readonly SearchScope[] = ['mine', 'everyone']
const TYPES: readonly SearchType[] = ['all', 'videos', 'photos', 'text', 'articles']
const ID = /^[A-Za-z0-9_-]{1,64}$/
const PLATFORM = /^[a-z]{1,16}$/
const LIMIT = { windowMs: 60_000, max: 120 }

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

/**
 * GET /api/search/similar?platform=&id=&scope=&type=&limit= — posts like
 * this one, for the theater's "More like this" and "Stick to this vibe".
 * Same response shape and the same scope rules as `/api/search`.
 */
export const GET = withAuth(async (request: NextRequest, userId) => {
  const params = request.nextUrl.searchParams
  const platform = params.get('platform') ?? 'twitter'
  const postId = params.get('id') ?? ''
  const scope = (params.get('scope') ?? 'mine') as SearchScope
  const type = (params.get('type') ?? 'all') as SearchType
  if (
    !PLATFORM.test(platform) ||
    !ID.test(postId) ||
    !SCOPES.includes(scope) ||
    !TYPES.includes(type)
  ) {
    return noStore(NextResponse.json({ error: 'Invalid post, scope or type' }, { status: 400 }))
  }
  const limit = Math.min(60, Math.max(1, Number.parseInt(params.get('limit') ?? '30', 10) || 30))

  const limited = checkRateLimit(`search-similar:${userId}`, LIMIT)
  if (limited.limited) {
    return noStore(
      NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': Math.ceil(limited.resetMs / 1000).toString() } },
      ),
    )
  }

  try {
    const result = await similarPosts({ platform, postId, scope, type, userId, limit })
    const items = await loadSearchItems(result.hits, userId)
    return noStore(
      NextResponse.json({
        items,
        total: result.total,
        understood: result.understood,
        close: result.close,
        refined: false,
        nextOffset: null,
      }),
    )
  } catch (error) {
    return noStore(
      handleRouteError(error, {
        endpoint: '/api/search/similar',
        userId,
        message: 'Similar search failed',
      }),
    )
  }
})
