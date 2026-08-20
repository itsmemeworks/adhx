import { NextRequest, NextResponse } from 'next/server'
import { consumeLoginToken, findOrCreateUserForEmail, linkEmailToUser } from '@/lib/auth/account'
import { setSessionCookie } from '@/lib/auth/session'
import { isSafeReturnUrl } from '@/lib/auth/return-url'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// GET /api/auth/email/callback?token=... - consumes a magic-link token.
// intent 'signin' creates/finds the account and starts a session.
// intent 'change' links a new email to the requesting user's account and
// does NOT touch the session.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/?auth_error=invalid_link', BASE_URL))
  }

  const row = await consumeLoginToken(token)
  if (!row) {
    return NextResponse.redirect(new URL('/?auth_error=invalid_link', BASE_URL))
  }

  if (row.intent === 'change') {
    if (!row.userId) {
      return NextResponse.redirect(new URL('/?auth_error=invalid_link', BASE_URL))
    }
    const result = await linkEmailToUser(row.userId, row.email)
    if ('error' in result) {
      return NextResponse.redirect(new URL('/settings?auth_error=email_in_use', BASE_URL))
    }
    return NextResponse.redirect(new URL('/settings?email_changed=1', BASE_URL))
  }

  const { userId, username } = await findOrCreateUserForEmail(row.email)
  const destination = row.returnTo && isSafeReturnUrl(row.returnTo) ? row.returnTo : '/'
  const response = NextResponse.redirect(new URL(destination, BASE_URL))
  await setSessionCookie(response, { userId, username })
  return response
}
