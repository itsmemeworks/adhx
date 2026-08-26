import { NextRequest } from 'next/server'
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
 * user-scoped one. The response is a cheap local SQLite read backed by
 * `rank.ts`'s own 60s in-process cache, mirrored here with matching
 * `Cache-Control` headers.
 */
export const dynamic = 'force-dynamic'

const DEFAULT_WINDOW: RankWindow = 'week'
const MIN_LIMIT = 1
const MAX_LIMIT = 50
const DEFAULT_LIMIT = 24

export async function GET(request: NextRequest) {
  const limited = publicReadRateLimit(request)
  if (limited) return limited

  try {
    const windowParam = request.nextUrl.searchParams.get('window')
    const window = windowParam ? slugToWindow(windowParam) : DEFAULT_WINDOW
    if (!window) {
      return fail('Invalid window', 400)
    }

    const limitParam = request.nextUrl.searchParams.get('limit')
    let limit = DEFAULT_LIMIT
    if (limitParam !== null) {
      const parsed = Number(limitParam)
      if (!Number.isFinite(parsed)) {
        return fail('Invalid limit', 400)
      }
      limit = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(parsed)))
    }

    const items = getCollectionLeaderboard({ window, limit })
    return ok(
      { items, window },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' } },
    )
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/collections/trending' })
  }
}
