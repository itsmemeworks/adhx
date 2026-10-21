import { NextResponse } from 'next/server'
import { appError } from '@/lib/api/phone-auth'
import { hasRecentLoginToken } from '@/lib/auth/account'
import { createPhoneCode, dropPhoneCode } from '@/lib/auth/phone-signin'
import { sendSignInCodeEmail, signInDelivery } from '@/lib/email/magic-link'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { isValidEmail } from '@/lib/utils/email'

export const dynamic = 'force-dynamic'

/** Codes asked for from one address (network), and for one email, per window. */
const IP_LIMIT = { windowMs: 10 * 60_000, max: 20 }
const EMAIL_LIMIT = { windowMs: 60 * 60_000, max: 6 }

function busy(resetMs: number): NextResponse {
  const response = appError(429, 'busy', 'Lots of tries just now. Give it a few minutes.')
  response.headers.set('Retry-After', Math.ceil(resetMs / 1000).toString())
  return response
}

/**
 * POST /api/app/signin `{ email, name? }` — email a 6-digit code to sign this
 * phone in (`POST /api/app/signin/verify`). No key: the email is the proof.
 * Existing accounts only, and it always answers `{ ok: true }` for a
 * well-formed address, so nobody can learn which addresses have accounts.
 *
 * Errors (`{ error, code }`): `bad_email` 400; `too_soon` 429 (one code a
 * minute per address, shared with the magic link); `busy` 429 (per network
 * and per address, with `Retry-After`); `no_email` 503 when this ADHX can't
 * send email (use a pairing code instead); `send_failed` 503.
 * In development without email, the code is printed in the server log.
 */
export async function POST(request: Request) {
  const ip = checkRateLimit(`app-signin:ip:${getClientIp(request)}`, IP_LIMIT)
  if (ip.limited) return busy(ip.resetMs)

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isValidEmail(email)) return appError(400, 'bad_email', 'Enter a valid email address.')

  const delivery = signInDelivery()
  if (delivery !== 'email' && delivery !== 'log') {
    return appError(
      503,
      'no_email',
      'This ADHX doesn’t send email. Connect with a code from Settings → Phone app on the website instead.',
    )
  }
  if (await hasRecentLoginToken(email)) {
    return appError(429, 'too_soon', 'Wait a minute before asking for another code.')
  }
  const perEmail = checkRateLimit(`app-signin:email:${email}`, EMAIL_LIMIT)
  if (perEmail.limited) return busy(perEmail.resetMs)

  const { code, userId, tokenHash } = createPhoneCode(email)
  // No account (or banned, or waiting): a stand-in code nobody receives.
  if (userId) {
    const sent = await sendSignInCodeEmail({ email, code })
    if (!sent.ok) {
      dropPhoneCode(tokenHash)
      return appError(503, 'send_failed', 'Couldn’t send the email. Try again shortly.')
    }
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
