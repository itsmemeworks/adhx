import { NextResponse } from 'next/server'
import { withPhoneKey } from '@/lib/api/phone-auth'
import { getReactions, postReaction, type HandlerResult } from '@/lib/reactions/handlers'

export const dynamic = 'force-dynamic'

function reply(result: HandlerResult): NextResponse {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store', ...result.headers },
  })
}

/**
 * GET /api/app/reactions?platform=&id= — the reactions kept on a post:
 * `{ reactions: [{ id, emoji, text, at, saver: { username, name, avatarUrl,
 * isYou } }] }`, oldest first, the newest 100. 404 `not_found` when you can't
 * see any save of it. Replay them when the post settles.
 */
export const GET = withPhoneKey(async (request, { userId }) =>
  reply(getReactions(userId, new URL(request.url).searchParams)),
)

/**
 * POST /api/app/reactions `{ platform, id, emoji }` or `{ platform, id, text }`
 * → `{ id, at }`. Errors: `bad_reaction`, `bad_text`, `bad_post`, `not_found`,
 * `busy` (429 with `Retry-After`).
 */
export const POST = withPhoneKey(async (request, { userId }) =>
  reply(postReaction(userId, await request.json().catch(() => null))),
)
