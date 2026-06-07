import { NextRequest } from 'next/server'
import { ok, handleRouteError } from '@/lib/api/response'
import { getTrendingItems } from '@/lib/trending/query'
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
