import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { parseWatchedBody, recordWatched } from '@/lib/watch/record'
import { checkRateLimit } from '@/lib/rate-limit'
import { captureException } from '@/lib/sentry'

const LIMIT = { windowMs: 60_000, max: 120 }

/**
 * POST /api/app/watched `{ posts: [{ platform, id, plays, finishes, seconds }] }`
 * (at most 50) — what the phone's player tallied since its last batch → 204.
 * Added to the member's watch counts; posts they can't see are left out.
 * Same counts as the web's `POST /api/watched`.
 */
export const POST = withPhoneKey(async (request, { userId }) => {
  const parsed = parseWatchedBody(await request.json().catch(() => null))
  if ('error' in parsed) return appError(400, 'bad_posts', parsed.error)
  if (checkRateLimit(`watched:${userId}`, LIMIT).limited) {
    return appError(429, 'busy', 'Lots of requests just now. Give it a moment.')
  }
  try {
    recordWatched(userId, parsed.posts)
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    captureException(error, { endpoint: '/api/app/watched' })
    return appError(500, 'failed', 'That didn’t save just now. Try again.')
  }
})
