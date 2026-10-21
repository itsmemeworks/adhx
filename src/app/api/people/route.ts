import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { requireAdmin } from '@/lib/admin/guard'
import { writeAudit } from '@/lib/admin/moderation'
import { isInviteMode, setInviteMode } from '@/lib/auth/invites'
import { peopleView } from '@/lib/people/view'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * GET /api/people → { members, isAdmin, canInvite, inviteMode, requests? }:
 * Settings → Your people. `requests` (people waiting to be let in) and banned
 * members only for admins.
 */
export const GET = withAuth(async (_request, userId) => {
  return NextResponse.json(await peopleView(userId), { headers: NO_STORE })
})

/**
 * PATCH /api/people { inviteMode: 'admin' | 'approve' | 'anyone' } (admins):
 * who can invite. Stored on the server; `INVITES=members` is only the first
 * default.
 */
export const PATCH = withAuth(async (request: NextRequest, userId) => {
  const gate = await requireAdmin(userId)
  if (!gate.ok) return gate.response
  const body = (await request.json().catch(() => null)) as { inviteMode?: unknown } | null
  if (!isInviteMode(body?.inviteMode)) {
    return NextResponse.json(
      { error: 'Pick admin, approve or anyone.' },
      { status: 400, headers: NO_STORE },
    )
  }
  setInviteMode(body.inviteMode)
  writeAudit(userId, 'set_invite_mode', { mode: body.inviteMode })
  return NextResponse.json({ inviteMode: body.inviteMode }, { headers: NO_STORE })
})
