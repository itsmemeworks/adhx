import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { markSeen, parseViewBody } from '@/lib/feed/views'
import { checkRateLimit } from '@/lib/rate-limit'
import { captureException } from '@/lib/sentry'

const LIMIT = { windowMs: 60_000, max: 120 }

/**
 * POST /api/app/seen `{ posts: [{ platform, id }] }` (at most 50) — the
 * phone's "seen" (2s on screen, or swiped past) → 204. Same list as the web's
 * `POST /api/views`, so New is caught up on both.
 */
export const POST = withPhoneKey(async (request, { userId }) => {
  const parsed = parseViewBody(await request.json().catch(() => null))
  if ('error' in parsed) return appError(400, 'bad_posts', parsed.error)
  if (checkRateLimit(`views:${userId}`, LIMIT).limited) {
    return appError(429, 'busy', 'Lots of requests just now. Give it a moment.')
  }
  try {
    markSeen(userId, parsed.posts)
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    captureException(error, { endpoint: '/api/app/seen' })
    return appError(500, 'failed', 'That didn’t save just now. Try again.')
  }
})
