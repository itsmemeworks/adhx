import { NextResponse } from 'next/server'
import { withPhoneKey } from '@/lib/api/phone-auth'
import { getAlerts } from '@/lib/moments/alert-handlers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/app/alerts — forming groups you rang the bell on that went live:
 * `{ alerts: [{ id, slug, title, at }] }` (unseen, newest first, at most 20,
 * 24 hours). The phone shows a notification per alert, then
 * `POST /api/app/alerts/seen`.
 */
export const GET = withPhoneKey(async (_request, { userId }) => {
  const result = getAlerts(userId)
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
})
