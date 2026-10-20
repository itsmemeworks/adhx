import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { getAlerts } from '@/lib/moments/alert-handlers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/moments/alerts — groups you asked about that went live:
 * `{ alerts: [{ id, slug, title, at }] }`, unseen only, newest first, at most
 * 20, for 24 hours. Mark them with `POST /api/moments/alerts/seen`.
 */
export const GET = withAuth(async (_request, userId) => {
  const result = getAlerts(userId)
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
})
