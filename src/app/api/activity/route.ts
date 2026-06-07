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
 * On error we deliberately return an empty pulse (200) rather than a 500 — a
 * pulse-read failure should degrade quietly, never break the landing/Discover.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Same defaults as before: FETCH 80 → dedup → LIMIT 30, no platform filter.
    const { items, savedToday } = await getTrendingItems()
    return ok(
      { items, savedToday },
      { headers: { 'Cache-Control': 'public, max-age=5, stale-while-revalidate=15' } },
    )
  } catch {
    return ok({ items: [], savedToday: 0 })
  }
}
