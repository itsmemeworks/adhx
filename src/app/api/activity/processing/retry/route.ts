import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { retryAnswer } from '@/lib/processing/doing-actions'

export const dynamic = 'force-dynamic'

/** POST /api/activity/processing/retry { platform, id } → { retried } (people who saved it). */
export const POST = withAuth(async (request: NextRequest, userId) => {
  const result = await retryAnswer(userId, await request.json().catch(() => null))
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
})
