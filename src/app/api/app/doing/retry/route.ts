import { NextResponse } from 'next/server'
import { withPhoneKey } from '@/lib/api/phone-auth'
import { retryAnswer } from '@/lib/processing/doing-actions'

/** POST /api/app/doing/retry { platform, id } → { retried }: the web route, for the phone. */
export const POST = withPhoneKey(async (request, { userId }) => {
  const result = await retryAnswer(userId, await request.json().catch(() => null))
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
})
