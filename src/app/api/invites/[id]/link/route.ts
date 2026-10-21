import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { isAdminUserId } from '@/lib/admin/guard'
import { checkRateLimit } from '@/lib/rate-limit'
import { inviteUrl, renewInviteLink } from '@/lib/auth/invites'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * POST /api/invites/[id]/link → { id, url, expiresAt }: a fresh link for an
 * invite that still works (your own, or any for an admin). Only the token's
 * hash is stored, so the old link can't be shown again; it stops working and
 * the new one is shown once. Same id, code and expiry.
 */
export const POST = withAuth(async (_request, userId, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const limit = checkRateLimit(`invites:link:${userId}`, { windowMs: 60 * 60 * 1000, max: 60 })
  if (limit.limited) {
    return NextResponse.json(
      { error: 'That’s a lot of new links. Try again in a bit.' },
      { status: 429, headers: NO_STORE },
    )
  }
  const renewed = renewInviteLink(id, userId, await isAdminUserId(userId))
  if (!renewed) {
    return NextResponse.json(
      { error: 'That invite doesn’t work any more.' },
      { status: 404, headers: NO_STORE },
    )
  }
  return NextResponse.json(
    { id: renewed.id, url: inviteUrl(renewed.token), expiresAt: renewed.expiresAt },
    { headers: NO_STORE },
  )
})
