import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin/guard'
import { personBoard, setAdminRole } from '@/lib/admin/boards/people'
import { handleRouteError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

type Ctx = { params: Promise<{ username: string }> }

/** GET /api/admin/people/{username} (admins): one person's numbers (board 10.10). */
export const GET = withAdmin(async (_request: NextRequest, actor, ctx: Ctx) => {
  const { username } = await ctx.params
  try {
    const person = personBoard(actor.userId, decodeURIComponent(username))
    if (!person) {
      return NextResponse.json(
        { error: 'No one by that name.' },
        { status: 404, headers: NO_STORE },
      )
    }
    return NextResponse.json(person, { headers: NO_STORE })
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/admin/people', userId: actor.userId })
  }
})

/**
 * POST /api/admin/people/{username} { role: 'admin' | 'user' } (admins):
 * make someone an admin, or take it away. Audited. 409 when it would leave
 * the server without an admin, or for someone kept out.
 */
export const POST = withAdmin(async (request: NextRequest, actor, ctx: Ctx) => {
  const { username } = await ctx.params
  const body = (await request.json().catch(() => null)) as { role?: unknown } | null
  if (body?.role !== 'admin' && body?.role !== 'user') {
    return NextResponse.json({ error: 'role is admin or user' }, { status: 400, headers: NO_STORE })
  }
  const result = setAdminRole(actor.userId, decodeURIComponent(username), body.role === 'admin')
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE })
  }
  return NextResponse.json({ role: result.role }, { headers: NO_STORE })
})
