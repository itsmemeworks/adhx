import { ok } from '@/lib/api/response'
import { getTrendingItems } from '@/lib/trending/query'

/**
 * GET /api/activity — the public, anonymous pulse for the landing + Discover.
 *
 * Thin wrapper over `getTrendingItems()` (the single audited choke point for
 * the anonymity invariant — `userId` is never selected there). Returns the
 * most recent community actions, enriched with save/trend counts, content type,
 * and resolved thumbnails. Short cache + SWR keeps it lively without hammering
 * the DB.
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

export async function GET(request?: Request) {
  try {
    const offsetParam = request ? new URL(request.url).searchParams.get('offset') : null
    const parsedOffset = offsetParam ? parseInt(offsetParam, 10) : 0
    const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0

    // Same defaults as before: FETCH 80 → dedup → LIMIT 30, no platform filter.
    const { items, savedToday, recentActivity, hasMore } = await getTrendingItems({ offset })
    return ok(
      { items, savedToday, recentActivity, hasMore },
      { headers: { 'Cache-Control': 'public, max-age=5, stale-while-revalidate=15' } },
    )
  } catch {
    return ok({ items: [], savedToday: 0, recentActivity: 0, hasMore: false })
  }
}
