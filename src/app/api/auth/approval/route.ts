import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { getCurrentUserId, getWaitingAccount, renewSessionCookie } from '@/lib/auth/session'
import { waitingFor } from '@/lib/auth/approval'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * GET /api/auth/approval — the one endpoint (with /invite/waiting) that an
 * account still waiting to be let in may use:
 * `{ approval: 'pending' | 'declined', username, admin, inviter }`. An
 * approved session gets `{ approval: 'approved' }`; anyone else 401.
 */
export async function GET() {
  const waiting = await getWaitingAccount()
  if (waiting) {
    const user = db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, waiting.userId))
      .get()
    const names = waitingFor(waiting.userId)
    const response = NextResponse.json(
      {
        approval: waiting.approval,
        username: user?.username ?? null,
        admin: names.admin,
        inviter: names.inviter,
      },
      { headers: NO_STORE },
    )
    // They may wait days: keep the session they joined with alive.
    await renewSessionCookie(response)
    return response
  }
  if (await getCurrentUserId()) {
    return NextResponse.json({ approval: 'approved' }, { headers: NO_STORE })
  }
  return NextResponse.json({ approval: null }, { status: 401, headers: NO_STORE })
}
