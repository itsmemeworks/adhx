import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId, getSession } from '@/lib/auth/session'
import { isAllowedActivityOrigin } from '@/lib/activity/origin'
import { analyticsWriteLimit } from '@/lib/rate-limit'
import { recordPostAnalytic, recordAnalytic } from '@/lib/analytics/record'
import { resolveTrustedAnalyticsPost } from '@/lib/analytics/existence'
import { getAnalyticsSummary, parseAnalyticsWindow } from '@/lib/analytics/query'
import {
  isClientAnalyticEventName,
  isAnalyticPlatform,
  isAnalyticSource,
  isAnalyticSurface,
} from '@/lib/analytics/events'

export const dynamic = 'force-dynamic'

const ID_MAX = 80
const TAG_MAX = 15

/**
 * POST /api/analytics — client UI events (copy / open / send / shortcut).
 * Body is identifiers + allowlisted dimensions only.
 */
export async function POST(request: NextRequest) {
  if (!isAllowedActivityOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const limited = analyticsWriteLimit(request)
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { name, platform, id, surface, source, tag } = body as Record<string, unknown>
  if (!isClientAnalyticEventName(name)) {
    return NextResponse.json({ error: 'Unknown event' }, { status: 400 })
  }
  if (surface !== undefined && !isAnalyticSurface(surface)) {
    return NextResponse.json({ error: 'Invalid surface' }, { status: 400 })
  }
  if (source !== undefined && !isAnalyticSource(source)) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
  }
  if (tag !== undefined && (typeof tag !== 'string' || tag.length > TAG_MAX)) {
    return NextResponse.json({ error: 'Invalid tag' }, { status: 400 })
  }
  if (name.startsWith('post.')) {
    if (!isAnalyticPlatform(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
    }
    if (typeof id !== 'string' || !id.trim() || id.trim().length > ID_MAX) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }
  }

  const [session, userId] = await Promise.all([getSession(), getCurrentUserId()])
  // A verifiable session that authentication refuses (banned/deleted actor
  // or unavailable account/moderation state) is not an anonymous visitor.
  if (session?.userId && !userId) {
    return new NextResponse(null, { status: 204 })
  }

  if (name.startsWith('post.')) {
    // The validation above narrows these at runtime. Keep the canonical
    // identity local so all persistence and dedupe use the trimmed id.
    if (!isAnalyticPlatform(platform) || typeof id !== 'string') {
      return NextResponse.json({ error: 'Invalid post identity' }, { status: 400 })
    }
    const bookmarkId = id.trim()
    const trustedPost = resolveTrustedAnalyticsPost(platform, bookmarkId, session?.userId ?? userId)
    if (!trustedPost) {
      return new NextResponse(null, { status: 204 })
    }

    recordPostAnalytic(name as 'post.send' | 'post.copy' | 'post.open', {
      userId,
      platform,
      bookmarkId,
      contentType: trustedPost.contentType,
      surface: typeof surface === 'string' ? surface : null,
      source: typeof source === 'string' ? source : null,
      tag: typeof tag === 'string' ? tag : null,
    })
  } else {
    recordAnalytic({
      name,
      userId,
      surface: typeof surface === 'string' ? surface : null,
      source: typeof source === 'string' ? source : null,
    })
  }

  return new NextResponse(null, { status: 204 })
}

/**
 * GET /api/analytics?window=today|week|month|all
 *
 * Aggregate growth numbers. Never includes userId. Same anonymity rule as
 * `/api/trending` — useful for future leaderboards and for curling prod.
 */
export async function GET(request: NextRequest) {
  const window = parseAnalyticsWindow(request.nextUrl.searchParams.get('window'))
  return NextResponse.json(getAnalyticsSummary(window), {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
  })
}
