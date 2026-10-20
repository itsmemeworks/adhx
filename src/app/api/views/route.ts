import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { markSeen, parseViewBody } from '@/lib/feed/views'
import { checkRateLimit } from '@/lib/rate-limit'

const LIMIT = { windowMs: 60_000, max: 120 }

/**
 * POST /api/views `{ posts: [{ platform, id }] }` (at most 50) — mark posts
 * seen (on stage for 2s, or skipped) → 204. Idempotent: a post keeps the
 * time it was first seen. New leaves seen posts out.
 */
export const POST = withAuth(async (request: NextRequest, userId) => {
  const body = await request.json().catch(() => null)
  const parsed = parseViewBody(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (checkRateLimit(`views:${userId}`, LIMIT).limited) {
    return NextResponse.json({ error: 'Lots of requests just now.' }, { status: 429 })
  }
  try {
    markSeen(userId, parsed.posts)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/views',
      userId,
      message: 'Failed to mark seen',
    })
  }
})
