import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { isAdminUserId } from '@/lib/admin/guard'
import { revokeInvite } from '@/lib/auth/invites'

export const dynamic = 'force-dynamic'

/** DELETE /api/invites/[id] — revoke an unused invite (your own, or any for an admin). */
export const DELETE = withAuth(
  async (_request, userId, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const revoked = revokeInvite(id, userId, await isAdminUserId(userId))
    if (!revoked) {
      return NextResponse.json({ error: 'No such invite' }, { status: 404 })
    }
    return NextResponse.json(
      { revoked: true },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  },
)
