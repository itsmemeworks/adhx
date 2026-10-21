import { NextResponse } from 'next/server'
import { appError } from '@/lib/api/phone-auth'
import { MAX_PHONE_KEYS } from '@/lib/auth/access-keys'
import { verifyPhoneCode } from '@/lib/auth/phone-signin'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { isValidEmail } from '@/lib/utils/email'

export const dynamic = 'force-dynamic'

const IP_LIMIT = { windowMs: 10 * 60_000, max: 60 }

/**
 * POST /api/app/signin/verify `{ email, code, name? }` → 201 `{ key, name,
 * username }`, exactly like `POST /api/app/pair`. `name` is this phone's name.
 *
 * Errors (`{ error, code }`): `bad_code` 400 (wrong code; the fifth wrong try
 * burns it), `expired` 410 (no live code: past 15 minutes, used, or burned:
 * ask for a new one), `bad_email` 400, `too_many` 409 (10 phones already),
 * `busy` 429 per network. Unknown, banned and waiting accounts get the same
 * answers as a wrong code.
 */
export async function POST(request: Request) {
  const ip = checkRateLimit(`app-signin-verify:ip:${getClientIp(request)}`, IP_LIMIT)
  if (ip.limited) {
    const response = appError(429, 'busy', 'Lots of tries just now. Give it a few minutes.')
    response.headers.set('Retry-After', Math.ceil(ip.resetMs / 1000).toString())
    return response
  }
  const body = (await request.json().catch(() => null)) as {
    email?: unknown
    code?: unknown
    name?: unknown
  } | null
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isValidEmail(email)) return appError(400, 'bad_email', 'Enter a valid email address.')

  const result = verifyPhoneCode(email, body?.code, body?.name)
  if (!result.ok) {
    if (result.reason === 'expired') {
      return appError(410, 'expired', 'That code has run out. Ask for a new one.')
    }
    if (result.reason === 'too_many') {
      return appError(
        409,
        'too_many',
        `You can connect ${MAX_PHONE_KEYS} phones. Remove one in Settings → Phone app first.`,
      )
    }
    return appError(400, 'bad_code', 'That code isn’t right. Check the email and try again.')
  }
  return NextResponse.json(
    { key: result.key, name: result.name, username: result.username },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  )
}
