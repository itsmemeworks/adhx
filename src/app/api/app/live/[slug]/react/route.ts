import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { react } from '@/lib/moments/react'

export const dynamic = 'force-dynamic'

/**
 * POST /api/app/live/{slug}/react `{ emoji | text, platform, id }` — a reaction
 * while tuned in: one of 😂 🔥 😭 👀 💀 ❤️, or a few words (≤40 characters,
 * control characters dropped; show it as text, never HTML). Rate-limited per
 * person and never stored; the members watching get it as a `reaction` event.
 * → `{ id, at }`. Errors: `bad_reaction`, `bad_text`, `bad_post`, `busy`, `no_moment`.
 */
export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  return withPhoneKey(async (req, { userId }) => {
    const body = await req.json().catch(() => null)
    const result = await react(userId, slug, body)
    if (!result.ok) {
      const response = appError(result.status, result.code, result.error)
      if (result.retryAfter) response.headers.set('Retry-After', String(result.retryAfter))
      return response
    }
    return NextResponse.json(
      { id: result.id, at: result.at },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  })(request)
}
