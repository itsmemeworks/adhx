import { NextResponse } from 'next/server'
import { withPhoneKey } from '@/lib/api/phone-auth'
import { isDoingScope, processingActivity } from '@/lib/processing/doing'

/** GET /api/app/doing?scope=all|mine|needs — the web's `/api/activity/processing`, for the phone. */
export const GET = withPhoneKey(async (request, { userId }) => {
  const params = new URL(request.url).searchParams
  const raw = params.get('scope')
  const view = await processingActivity(userId, isDoingScope(raw) ? raw : 'all', undefined, {
    summaryOnly: params.get('summary') === '1',
  })
  return NextResponse.json(params.get('summary') === '1' ? { summary: view.summary } : view, {
    headers: { 'Cache-Control': 'no-store' },
  })
})
