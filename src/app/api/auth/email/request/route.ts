import { NextRequest, NextResponse } from 'next/server'
import { createLoginToken, hasRecentLoginToken, invalidateLoginToken } from '@/lib/auth/account'
import { sendMagicLinkEmail } from '@/lib/email/magic-link'
import { isValidEmail } from '@/lib/utils/email'
import { isSafeReturnUrl } from '@/lib/auth/return-url'

// POST /api/auth/email/request - kick off an email sign-in.
// Always returns { ok: true } for a well-formed email (even when sending
// silently no-ops downstream) so this endpoint can't be used to enumerate
// which addresses have accounts.
export async function POST(request: NextRequest) {
  let body: { email?: unknown; returnTo?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  }

  const returnTo =
    typeof body.returnTo === 'string' && isSafeReturnUrl(body.returnTo) ? body.returnTo : undefined

  if (await hasRecentLoginToken(email)) {
    return NextResponse.json(
      { error: 'Please wait a minute before requesting another link' },
      { status: 429 },
    )
  }

  const token = await createLoginToken({ email, intent: 'signin', returnTo })
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const url = new URL('/api/auth/email/callback', base)
  url.searchParams.set('token', token)

  const result = await sendMagicLinkEmail({ email, url: url.toString(), intent: 'signin' })
  if (!result.ok) {
    // Release the rate-limit hold so the user can retry immediately after a
    // transient send failure instead of hitting the 60s "wait a minute" wall.
    await invalidateLoginToken(token)
    return NextResponse.json(
      { error: 'Could not send sign-in email. Try again shortly.' },
      { status: 503 },
    )
  }

  return NextResponse.json({ ok: true })
}
