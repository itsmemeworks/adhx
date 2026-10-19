import { NextResponse } from 'next/server'
import { withPhoneKey } from '@/lib/api/phone-auth'
import { isDoingScope, processingActivity } from '@/lib/processing/doing'

/** GET /api/app/doing?scope=all|mine|needs — the web's `/api/activity/processing`, for the phone. */
export const GET = withPhoneKey(async (request, { userId }) => {
  const raw = new URL(request.url).searchParams.get('scope')
  return NextResponse.json(await processingActivity(userId, isDoingScope(raw) ? raw : 'all'), {
    headers: { 'Cache-Control': 'no-store' },
  })
})
