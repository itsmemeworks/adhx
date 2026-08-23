import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin/guard'
import { getAdminOverview } from '@/lib/admin/query'
import { parseAnalyticsWindow } from '@/lib/analytics/query'
import { handleRouteError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAdmin(async (request: NextRequest, actor) => {
  try {
    const window = parseAnalyticsWindow(request.nextUrl.searchParams.get('window'))
    return NextResponse.json(getAdminOverview(window), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/admin/overview', userId: actor.userId })
  }
})
