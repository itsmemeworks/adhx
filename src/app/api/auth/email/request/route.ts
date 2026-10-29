import { NextRequest, NextResponse } from 'next/server'
import { createLoginToken, hasRecentLoginToken, invalidateLoginToken } from '@/lib/auth/account'
import { sendMagicLinkEmail, signInDelivery } from '@/lib/email/magic-link'
import { isValidEmail } from '@/lib/utils/email'
import { hasAdmin, mayGetHeldLink, mayUseEmail } from '@/lib/auth/allowlist'
import { isSafeReturnUrl } from '@/lib/auth/return-url'
import { recordAnalytic } from '@/lib/analytics/record'
import { loginTokenTtlMs } from '@/lib/auth/login-token-policy'
import { appUrl } from '@/lib/routes/app-url'

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

  // Held links follow mayGetHeldLink, which also lets the owner in before
  // there's an admin, even when their own email isn't on ALLOWED_EMAILS.
  if (signInDelivery() === 'admin' ? !mayGetHeldLink(email) : !mayUseEmail(email)) {
    return NextResponse.json(
      { error: 'This ADHX is for invited people. Ask whoever runs it for an invite link.' },
      { status: 403 },
    )
  }

  const returnTo =
    typeof body.returnTo === 'string' && isSafeReturnUrl(body.returnTo) ? body.returnTo : undefined

  if (await hasRecentLoginToken(email)) {
    return NextResponse.json(
      { error: 'Please wait a minute before requesting another link' },
      { status: 429 },
    )
  }

  // Nobody runs this ADHX yet: the link goes to the server log, and whoever
  // opens it becomes the admin.
  const setup = signInDelivery() === 'admin' && !hasAdmin()
  const token = await createLoginToken({
    email,
    intent: 'signin',
    returnTo,
    ttlMs: loginTokenTtlMs(signInDelivery()),
  })
  const base = appUrl()
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

  recordAnalytic({ name: 'auth.start', source: 'email' })
  // `admin`: the link waits for whoever runs this ADHX to hand it over.
  return NextResponse.json({
    ok: true,
    delivery: result.delivery ?? 'email',
    ...(setup ? { setup: true } : {}),
  })
}
