import { NextRequest, NextResponse } from 'next/server'
import { recordPreviewPulse } from '@/lib/activity/record'
import { isLikelyBot } from '@/lib/activity/bot'
import { getCurrentUserId } from '@/lib/auth/session'
import { mediaRateLimit } from '@/lib/rate-limit'
import { metrics } from '@/lib/sentry'

const PLATFORMS = new Set(['twitter', 'instagram', 'tiktok', 'youtube'])
const ID_MAX = 80

/**
 * POST /api/activity/preview — record that someone staged a post on the
 * theater stage (the client fires this after ~2s of dwell, automatically —
 * so bots are filtered here rather than relying on the client to behave).
 *
 * Body is identifiers only: `{ platform, id }`. Display text, thumbnails,
 * and avatars are copied server-side from an existing pulse/bookmark row.
 * Unknown posts are a silent 204 (we never let the client invent a trending
 * card). `userId` is stored when a session exists and never returned.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const limited = mediaRateLimit(request, { windowMs: 60_000, max: 30 })
  if (limited) return limited

  if (isLikelyBot(request.headers.get('user-agent'))) {
    return new NextResponse(null, { status: 204 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { platform, id } = body as { platform?: unknown; id?: unknown }
  if (typeof platform !== 'string' || !PLATFORMS.has(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
  }
  if (typeof id !== 'string' || !id || id.length > ID_MAX) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const userId = await getCurrentUserId()
  recordPreviewPulse({ platform, bookmarkId: id, userId })
  metrics.theaterPreviewPulse(platform)
  return new NextResponse(null, { status: 204 })
}
