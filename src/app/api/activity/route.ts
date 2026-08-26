import { ok } from '@/lib/api/response'
import { getTrendingItems, LIVE_WINDOW_HOURS } from '@/lib/trending/query'
import { publicReadRateLimit } from '@/lib/rate-limit'
import type { NextResponse } from 'next/server'

/**
 * GET /api/activity — the public, anonymous pulse for the landing + Discover.
 *
 * Thin wrapper over `getTrendingItems()` (the single audited choke point for
 * the anonymity invariant — `userId` is never selected there). Returns the
 * most recent community actions, enriched with save/trend counts, content type,
 * and resolved thumbnails. Responses are never stored by intermediaries so
 * each request revalidates current moderation; the data layer retains only a
 * moderation-gated burst cache.
 *
 * Accepts an optional `?offset=` for `DiscoverFeed`'s infinite scroll — it
 * pages over the deduped, newest-first sequence (see `getTrendingItems`),
 * appending older posts as the user scrolls. `offset=0` (the default) is the
 * live "first page" the 12s poll also uses.
 *
 * On error we deliberately return an empty pulse (200) rather than a 500 — a
 * pulse-read failure should degrade quietly, never break the landing/Discover.
 */
export const dynamic = 'force-dynamic'

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function GET(request?: Request) {
  if (request) {
    const limited = publicReadRateLimit(request)
    if (limited) return noStore(limited)
  }

  try {
    const offsetParam = request ? new URL(request.url).searchParams.get('offset') : null
    const parsedOffset = offsetParam ? parseInt(offsetParam, 10) : 0
    const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0

    // Slice the bounded canonical trending window at LIMIT 30, with no platform
    // filter and only the last LIVE_WINDOW_HOURS. This endpoint IS the
    // theater's live feed, whose window must match `getTheaterFeed` or the
    // first poll would append out-of-window posts the seed deliberately omitted.
    const { items, savedToday, recentActivity, hasMore } = await getTrendingItems({
      offset,
      withinHours: LIVE_WINDOW_HOURS,
    })
    return noStore(ok({ items, savedToday, recentActivity, hasMore }))
  } catch {
    return noStore(ok({ items: [], savedToday: 0, recentActivity: 0, hasMore: false }))
  }
}
