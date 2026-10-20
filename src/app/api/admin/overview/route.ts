import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin/guard'
import { overviewBoard } from '@/lib/admin/boards/overview'
import { parseAdminRange } from '@/lib/admin/shared'
import { handleRouteError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAdmin(async (request: NextRequest, actor) => {
  try {
    // `range` (today | week | month | all); `window` is the older name.
    const params = request.nextUrl.searchParams
    const range = parseAdminRange(params.get('range') ?? params.get('window'))
    return NextResponse.json(await overviewBoard(range), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/admin/overview', userId: actor.userId })
  }
})
