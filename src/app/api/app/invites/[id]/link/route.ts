import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { inviteUrl, renewInviteLink } from '@/lib/auth/invites'

export const dynamic = 'force-dynamic'

/**
 * POST /api/app/invites/{id}/link → `{ id, url, expiresAt }`: a fresh link for
 * one of your invites that still works ("Share again"). The link sent before
 * stops working; same id, code and expiry. 404 `not_found` when it's used,
 * revoked, expired or not yours; 429 `busy` (60 an hour, shared with the web).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return withPhoneKey(async (_request, { userId }) => {
    const limit = checkRateLimit(`invites:link:${userId}`, { windowMs: 60 * 60 * 1000, max: 60 })
    if (limit.limited)
      return appError(429, 'busy', 'That’s a lot of new links. Try again in a bit.')
    const renewed = renewInviteLink(id, userId, false)
    if (!renewed) return appError(404, 'not_found', 'That invite doesn’t work any more.')
    return NextResponse.json(
      { id: renewed.id, url: inviteUrl(renewed.token), expiresAt: renewed.expiresAt },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  })(request)
}
