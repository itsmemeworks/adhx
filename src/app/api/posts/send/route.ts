import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { getSendTargets, postSend, type HandlerResult } from '@/lib/sends/handlers'

export const dynamic = 'force-dynamic'

function reply(result: HandlerResult): NextResponse {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store', ...result.headers },
  })
}

/**
 * GET /api/posts/send?platform=&id= — "Or straight to your people": every
 * other member, with `has` (they already have a save of it) and `sent` (you
 * sent it to them). `{ sendable: false, people: [] }` when the only save you
 * can see is your own private one; 404 `not_found` when you can't see any.
 */
export const GET = withAuth(async (request: NextRequest, userId) =>
  reply(getSendTargets(userId, request.nextUrl.searchParams)),
)

/**
 * POST /api/posts/send `{ platform, id, to: [username], note? }` →
 * `{ sent: [username], skipped: [{ username, reason: has | sent | unknown }] }`.
 * The recipient sees it first in New ("Pete sent you this"). 60 a minute.
 */
export const POST = withAuth(async (request: NextRequest, userId) =>
  reply(postSend(userId, await request.json().catch(() => null))),
)
