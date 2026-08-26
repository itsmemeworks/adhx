import { NextRequest, type NextResponse } from 'next/server'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { getCollectionLeaderboard, slugToWindow, type RankWindow } from '@/lib/discovery/rank'
import { publicReadRateLimit } from '@/lib/rate-limit'

/**
 * GET /api/collections/trending — public, anonymous Discovery leaderboard JSON.
 *
 * A thin wrapper over `getCollectionLeaderboard()` (the single audited choke
 * point for the Discovery anonymity invariant — see `src/lib/discovery/rank.ts`;
 * `collectionEvents.viewerId` is never selected there, and entries carry only
 * a public curator `username`, never a raw `userId`).
 *
 * `?window=` accepts a `RANK_WINDOWS` slug (`today` / `week` / `month` /
 * `all-time`), defaulting to `week`; an unrecognised slug is a 400.
 * `?limit=` clamps to 1–50, defaulting to 24.
 *
 * Rate-limited generously (120 req/min/IP), same backstop-not-throttle
 * posture as `/api/trending` — this is a crawlable public surface, not a
 * user-scoped one. Responses are never stored by intermediaries; `rank.ts`'s
 * bounded in-process cache revalidates current bans, post moderation, and
 * playlist visibility before every hit.
 */
export const dynamic = 'force-dynamic'

const DEFAULT_WINDOW: RankWindow = 'week'
const MIN_LIMIT = 1
const MAX_LIMIT = 50
const DEFAULT_LIMIT = 24

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function GET(request: NextRequest) {
  const limited = publicReadRateLimit(request)
  if (limited) return noStore(limited)

  try {
    const windowParam = request.nextUrl.searchParams.get('window')
    const window = windowParam ? slugToWindow(windowParam) : DEFAULT_WINDOW
    if (!window) {
      return noStore(fail('Invalid window', 400))
    }

    const limitParam = request.nextUrl.searchParams.get('limit')
    let limit = DEFAULT_LIMIT
    if (limitParam !== null) {
      const parsed = Number(limitParam)
      if (!Number.isFinite(parsed)) {
        return noStore(fail('Invalid limit', 400))
      }
      limit = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(parsed)))
    }

    const items = getCollectionLeaderboard({ window, limit })
    return noStore(ok({ items, window }))
  } catch (error) {
    return noStore(handleRouteError(error, { endpoint: '/api/collections/trending' }))
  }
}
