import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { revokeInvite } from '@/lib/auth/invites'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/app/invites/{id} — revoke one of your unused invites →
 * `{ ok: true }`; 404 `not_found` when it isn't yours, or is used or gone.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return withPhoneKey(async (_request, { userId }) => {
    if (!revokeInvite(id, userId, false)) {
      return appError(404, 'not_found', 'That invite doesn’t work any more.')
    }
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  })(request)
}
