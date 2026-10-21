import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { linkOnlyAnswer } from '@/lib/processing/doing-actions'

export const dynamic = 'force-dynamic'

/**
 * POST /api/activity/processing/link-only { platform, id } → { ok }: "Keep the
 * link only" for a download that gave up (people who saved it). It stops
 * asking; Retry undoes it.
 */
export const POST = withAuth(async (request: NextRequest, userId) => {
  const result = linkOnlyAnswer(userId, await request.json().catch(() => null))
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
})
