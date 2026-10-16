import { NextRequest, NextResponse } from 'next/server'
import { isSafeReturnUrl } from '@/lib/auth/return-url'
import { NEXT_UI_COOKIE, NEXT_UI_COOKIE_MAX_AGE, parseFlagValue } from '@/lib/next-ui/flag'

/**
 * GET /api/next-ui?value=0|1&to=/path — switch this browser between the
 * redesign and the previous look, then go to `to`. A server-set cookie so
 * the choice sticks on pages that never run the client hook (the old UI).
 * `value` missing or unrecognised clears the choice (back to the default).
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const value = parseFlagValue(params.get('value'))
  const to = params.get('to')
  const target = isSafeReturnUrl(to) ? to : value === false ? '/saved' : '/'
  // A relative Location keeps the host the person is on (behind the proxy,
  // or 127.0.0.1 vs localhost in dev, `request.url` can name another origin).
  const response = new NextResponse(null, { status: 307, headers: { Location: target } })
  if (value === null) {
    response.cookies.delete(NEXT_UI_COOKIE)
  } else {
    response.cookies.set(NEXT_UI_COOKIE, value ? '1' : '0', {
      path: '/',
      maxAge: NEXT_UI_COOKIE_MAX_AGE,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  }
  return response
}
