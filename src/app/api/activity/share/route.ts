import { NextRequest, NextResponse } from 'next/server'
import { recordSharePulse } from '@/lib/activity/record'
import { isAllowedActivityOrigin } from '@/lib/activity/origin'
import { getCurrentUserId } from '@/lib/auth/session'
import { activityWriteLimit } from '@/lib/rate-limit'

const PLATFORMS = new Set(['twitter', 'instagram', 'tiktok', 'youtube'])
const ID_MAX = 80

/**
 * POST /api/activity/share — record that someone sent/downloaded a post.
 *
 * Body is identifiers only: `{ platform, id }`. Display text, thumbnails,
 * and avatars are copied server-side from an existing pulse/bookmark row.
 * Unknown posts are a silent 204 (we never let the client invent a trending
 * card). `userId` is stored when a session exists and never returned.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!isAllowedActivityOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const limited = activityWriteLimit(request)
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

  const { platform, id } = body as { platform?: unknown; id?: unknown }
  if (typeof platform !== 'string' || !PLATFORMS.has(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
  }
  if (typeof id !== 'string' || !id || id.length > ID_MAX) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const userId = await getCurrentUserId()
  recordSharePulse({ platform, bookmarkId: id, userId })
  return new NextResponse(null, { status: 204 })
}
