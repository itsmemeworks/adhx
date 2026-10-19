import { NextResponse } from 'next/server'
import { withPhoneKey } from '@/lib/api/phone-auth'
import { peopleView } from '@/lib/people/view'

/**
 * GET /api/app/people → { members, isAdmin, canInvite, inviteMode, requests? }:
 * the same shape as the web's `GET /api/people`. `requests` for admins only.
 */
export const GET = withPhoneKey(async (_request, { userId }) => {
  return NextResponse.json(await peopleView(userId), { headers: { 'Cache-Control': 'no-store' } })
})
