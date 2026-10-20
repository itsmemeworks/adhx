import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { postAlertsSeen } from '@/lib/moments/alert-handlers'

/** POST /api/moments/alerts/seen `{ ids: ["a1", …] }` → `{ ok: true }`. Your own alerts only. */
export const POST = withAuth(async (request: NextRequest, userId) => {
  const result = postAlertsSeen(userId, await request.json().catch(() => null))
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
})
