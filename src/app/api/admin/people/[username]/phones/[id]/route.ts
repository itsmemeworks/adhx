import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin/guard'
import { removeMemberPhone } from '@/lib/admin/boards/people'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** DELETE /api/admin/people/{username}/phones/{id} (admins): remove one of their phones. Audited. */
export const DELETE = withAdmin(
  async (
    _request: NextRequest,
    actor,
    ctx: { params: Promise<{ username: string; id: string }> },
  ) => {
    const { username, id } = await ctx.params
    const result = removeMemberPhone(actor.userId, decodeURIComponent(username), id)
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: NO_STORE },
      )
    }
    return NextResponse.json({ removed: true }, { headers: NO_STORE })
  },
)
