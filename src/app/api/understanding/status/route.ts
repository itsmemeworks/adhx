import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { ensureUserBackfill, getUnderstandingStatus } from '@/lib/semantic'

export const dynamic = 'force-dynamic'

// GET /api/understanding/status — how much of this user's saves can be
// searched by meaning yet (words / photos / videos), plus what is being
// understood right now when it is one of this user's own saves.
export const GET = withAuth(async (_request, userId) => {
  try {
    await ensureUserBackfill(userId)
    const status = await getUnderstandingStatus(userId)
    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/understanding/status',
      userId,
      message: 'Failed to load status',
    })
  }
})
