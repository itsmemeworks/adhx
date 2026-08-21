import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { chooseUsername, isUsernameTaken } from '@/lib/auth/account'
import { sanitizeUsername } from '@/lib/auth/username-rules'
import { setSessionCookie } from '@/lib/auth/session'

// POST /api/auth/username (authed) - claim or change a username. Used by
// the `/welcome` first-claim prompt and the Settings chooser (up to
// MAX_USERNAME_CHANGES additional changes — see chooseUsername()).
// On success, re-issues the session cookie so the JWT's `username` claim
// stays in sync with the new value.
export const POST = withAuth(async (req: NextRequest, userId: string) => {
  let body: { username?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const raw = typeof body.username === 'string' ? body.username : ''
  const result = await chooseUsername(userId, raw)

  if ('error' in result) {
    const status = result.error === 'invalid' ? 400 : 409
    return NextResponse.json({ error: result.error }, { status })
  }

  const response = NextResponse.json({
    ok: true,
    username: result.username,
    changesRemaining: result.changesRemaining,
  })
  await setSessionCookie(response, { userId, username: result.username })
  return response
})

// GET /api/auth/username?check=<name> (authed) - live availability check for
// the /welcome chooser UI. No enumeration concern: usernames are public by
// nature (they're the /t/{username}/ handle).
export const GET = withAuth(async (req: NextRequest, userId: string) => {
  const raw = req.nextUrl.searchParams.get('check') ?? ''
  const sanitized = sanitizeUsername(raw)

  if (sanitized.length < 3) {
    return NextResponse.json({ available: false, sanitized })
  }

  const taken = await isUsernameTaken(sanitized, userId)
  return NextResponse.json({ available: !taken, sanitized })
})
