import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { parseWatchedBody, recordWatched, WatchBatchConflict } from '@/lib/watch/record'
import { checkRateLimit } from '@/lib/rate-limit'

const LIMIT = { windowMs: 60_000, max: 120 }

/**
 * POST /api/watched `{ posts: [{ platform, id, plays, finishes, seconds }] }`
 * (at most 50) — what the theater tallied since its last batch → 204. Added
 * to the member's watch counts; posts they can't see are left out.
 */
export const POST = withAuth(async (request: NextRequest, userId) => {
  const parsed = parseWatchedBody(await request.json().catch(() => null))
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (checkRateLimit(`watched:${userId}`, LIMIT).limited) {
    return NextResponse.json({ error: 'Lots of requests just now.' }, { status: 429 })
  }
  try {
    recordWatched(userId, parsed.posts, new Date(), parsed.batchId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof WatchBatchConflict)
      return NextResponse.json({ error: error.message }, { status: 400 })
    return handleRouteError(error, {
      endpoint: '/api/watched',
      userId,
      message: 'Failed to count watching',
    })
  }
})
