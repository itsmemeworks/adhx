import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { react } from '@/lib/moments/react'

/**
 * POST /api/moments/{slug}/react `{ emoji | text, platform, id }` — a reaction
 * while tuned in: one of 😂 🔥 😭 👀 💀 ❤️, or a few words (≤40 characters,
 * control characters dropped, shown as text only). Signed in only,
 * rate-limited per person: it goes out as a `reaction` event to the members
 * watching this moment, and is kept on the post (`post_reactions`, same id) so
 * it replays later for members who can see the post. → `{ id, at }`.
 */
export const dynamic = 'force-dynamic'

export const POST = withAuth(
  async (request: NextRequest, userId, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params
    const body = await request.json().catch(() => null)
    const result = await react(userId, slug, body)
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        {
          status: result.status,
          headers: {
            'Cache-Control': 'no-store',
            ...(result.retryAfter ? { 'Retry-After': String(result.retryAfter) } : {}),
          },
        },
      )
    }
    return NextResponse.json(
      { id: result.id, at: result.at },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  },
)
