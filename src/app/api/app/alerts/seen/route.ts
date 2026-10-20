import { NextResponse } from 'next/server'
import { withPhoneKey } from '@/lib/api/phone-auth'
import { postAlertsSeen } from '@/lib/moments/alert-handlers'

/** POST /api/app/alerts/seen `{ ids: ["a1", …] }` → `{ ok: true }`. */
export const POST = withPhoneKey(async (request, { userId }) => {
  const result = postAlertsSeen(userId, await request.json().catch(() => null))
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
})
