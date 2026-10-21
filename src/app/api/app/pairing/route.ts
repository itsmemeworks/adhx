import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { createPairCode } from '@/lib/auth/phone-pairing'

/**
 * POST /api/app/pairing — a one-time code for connecting the phone app
 * (Settings → Phone app shows it as a QR code). Works once, for 10 minutes;
 * a new one cancels the old one.
 */
export const POST = withAuth(async (_request, userId) => {
  const response = NextResponse.json(createPairCode(userId), { status: 201 })
  response.headers.set('Cache-Control', 'no-store')
  return response
})
