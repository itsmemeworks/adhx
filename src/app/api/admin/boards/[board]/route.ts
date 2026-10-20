import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin/guard'
import { isAdminBoard, loadAdminBoard } from '@/lib/admin/boards'
import { handleRouteError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * GET /api/admin/boards/{overview|people|posts|channels|live|analytics|processing|moderation|invites}
 * [?range=today|week|month|all] (admins): one admin section's numbers.
 * Counts include Just for me saves; their posts are never listed.
 */
export const GET = withAdmin(
  async (request: NextRequest, actor, ctx: { params: Promise<{ board: string }> }) => {
    const { board } = await ctx.params
    if (!isAdminBoard(board)) {
      return NextResponse.json({ error: 'No such section' }, { status: 404, headers: NO_STORE })
    }
    try {
      const data = await loadAdminBoard(
        board,
        request.nextUrl.searchParams.get('range'),
        actor.userId,
      )
      return NextResponse.json(data, { headers: NO_STORE })
    } catch (error) {
      return handleRouteError(error, {
        endpoint: `/api/admin/boards/${board}`,
        userId: actor.userId,
      })
    }
  },
)
