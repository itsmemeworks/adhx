import { NextResponse } from 'next/server'
import { withPhoneKey } from '@/lib/api/phone-auth'
import { getSendTargets, postSend, type HandlerResult } from '@/lib/sends/handlers'

export const dynamic = 'force-dynamic'

function reply(result: HandlerResult): NextResponse {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store', ...result.headers },
  })
}

/**
 * GET /api/app/send?platform=&id= — the phone send sheet's "Or straight to
 * your people": `{ sendable, people: [{ username, name, avatarUrl, has, sent }] }`
 * (404 `not_found` when you can't see the post).
 */
export const GET = withPhoneKey(async (request, { userId }) =>
  reply(getSendTargets(userId, new URL(request.url).searchParams)),
)

/**
 * POST /api/app/send `{ platform, id, to: [username], note? }` →
 * `{ sent, skipped }`; 429 `busy` with `Retry-After` past 60 a minute.
 */
export const POST = withPhoneKey(async (request, { userId }) =>
  reply(postSend(userId, await request.json().catch(() => null))),
)
