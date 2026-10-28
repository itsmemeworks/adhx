import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { findOrCreateUserForEmail, getAccount } from '@/lib/auth/account'
import { claimOwnership, hasAdmin } from '@/lib/auth/allowlist'
import { matchesSetupCode } from '@/lib/auth/setup-code'
import { setSessionCookie } from '@/lib/auth/session'
import { appUrl, configuredAppUrl, rememberAppUrl } from '@/lib/routes/app-url'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { isValidEmail } from '@/lib/utils/email'

/**
 * `POST /api/setup { code, email }`: the first person with the setup code
 * becomes the owner (admin) of this ADHX and is signed in, no email needed.
 * The code is in the server log or the host's dashboard (`SETUP_CODE`), so
 * reaching a fresh server first isn't enough to take it over. When nothing
 * names this server's address, the address they set it up from is kept.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const limited =
    checkRateLimit(`setup:${ip}`, { windowMs: 10 * 60_000, max: 10 }).limited ||
    checkRateLimit('setup:all', { windowMs: 10 * 60_000, max: 60 }).limited
  if (limited) {
    return NextResponse.json({ error: 'Too many tries. Wait a few minutes.' }, { status: 429 })
  }

  if (hasAdmin()) {
    return NextResponse.json(
      { error: 'This ADHX already has an owner. Sign in instead.' },
      { status: 409 },
    )
  }

  // Before setup nothing may name this address yet, so the browser's own
  // origin is the one to trust; another site's form is still refused.
  const origin = request.headers.get('origin')
  const crossSite = request.headers.get('sec-fetch-site') === 'cross-site'
  if (crossSite || (configuredAppUrl() && origin !== appUrl())) {
    return NextResponse.json({ error: 'Open this page on your ADHX itself.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as { code?: unknown; email?: unknown }
  const code = typeof body?.code === 'string' ? body.code : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!matchesSetupCode(code)) {
    return NextResponse.json({ error: 'That setup code isn’t right.' }, { status: 403 })
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const { userId, username } = await findOrCreateUserForEmail(email)
  if (!claimOwnership(userId)) {
    return NextResponse.json(
      { error: 'Someone finished setting up this ADHX first. Sign in instead.' },
      { status: 409 },
    )
  }
  db.update(users).set({ approval: 'approved' }).where(eq(users.id, userId)).run()
  if (origin && rememberAppUrl(origin)) console.warn(`[setup] This ADHX's address is ${appUrl()}`)
  console.warn(`[setup] ${email} is now the owner of this ADHX`)

  const account = await getAccount(userId)
  const next = account?.user.usernameChosen ? '/now' : '/welcome?returnTo=%2Fnow'
  const response = NextResponse.json({ next })
  response.headers.set('Cache-Control', 'no-store')
  await setSessionCookie(response, { userId, username })
  return response
}
