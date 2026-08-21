import { NextRequest } from 'next/server'
import { ok, handleRouteError } from '@/lib/api/response'
import { getTrendingItems } from '@/lib/trending/query'
import { mediaRateLimit } from '@/lib/rate-limit'
import type { PlatformId } from '@/lib/platform/url'

/**
 * GET /api/trending — public, anonymous, cross-network real-time trending JSON.
 *
 * A thin wrapper over `getTrendingItems()` (the single audited choke point for
 * the anonymity invariant — `userId` is never selected there). Returns the same
 * enriched, anonymous items the Discover/landing pulse uses, ranked by trend
 * score (savers + previews).
 *
 * Optional `?platform=` filters to one network. The public slug `x` maps to the
 * internal `twitter` id; the canonical ids are also accepted.
 *
 * Rate-limited generously (120 req/min/IP) — this is a crawlable SEO/GEO
 * surface meant to be hit by search + AI crawlers, so the limit is a backstop
 * against hammering, not a throttle on legitimate traffic. The response is
 * also cheap (a single local SQLite read) and cached for 60s.
 */
export const dynamic = 'force-dynamic'

/** Accepts the public `x` slug or any canonical PlatformId; else undefined. */
function parsePlatform(value: string | null): PlatformId | undefined {
  if (!value) return undefined
  const v = value.toLowerCase()
  if (v === 'x' || v === 'twitter') return 'twitter'
  if (v === 'instagram' || v === 'tiktok' || v === 'youtube') return v
  return undefined
}

export async function GET(request: NextRequest) {
  const limited = mediaRateLimit(request, { windowMs: 60_000, max: 120 })
  if (limited) return limited

  try {
    const platform = parsePlatform(request.nextUrl.searchParams.get('platform'))
    const { items, savedToday } = await getTrendingItems({ platform })
    return ok(
      { items, savedToday },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' } },
    )
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/trending' })
  }
}
