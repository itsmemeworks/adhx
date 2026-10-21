import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { getReactions, postReaction, type HandlerResult } from '@/lib/reactions/handlers'

export const dynamic = 'force-dynamic'

function reply(result: HandlerResult): NextResponse {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store', ...result.headers },
  })
}

/**
 * GET /api/posts/reactions?platform=&id= — the reactions kept on a post, for
 * members who can see it: `{ reactions: [{ id, emoji, text, at, saver:
 * { username, name, avatarUrl, isYou } }] }`, oldest first, the newest 100.
 * 404 `not_found` when you can't see any save of it; none on a hidden post.
 */
export const GET = withAuth(async (request: NextRequest, userId) =>
  reply(getReactions(userId, request.nextUrl.searchParams)),
)

/**
 * POST /api/posts/reactions `{ platform, id, emoji }` (one of 😂 🔥 😭 👀 💀 ❤️)
 * or `{ platform, id, text }` (≤40 characters, shown as text only) → `{ id, at }`.
 * Same per-person limits as Live: 429 `busy` with `Retry-After`.
 */
export const POST = withAuth(async (request: NextRequest, userId) =>
  reply(postReaction(userId, await request.json().catch(() => null))),
)
