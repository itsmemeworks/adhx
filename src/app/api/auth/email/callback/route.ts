import { NextRequest, NextResponse } from 'next/server'
import {
  consumeLoginToken,
  findOrCreateUserForEmail,
  getAccount,
  linkEmailToUser,
  readLoginToken,
} from '@/lib/auth/account'
import { setSessionCookie } from '@/lib/auth/session'
import { isSafeReturnUrl } from '@/lib/auth/return-url'
import { recordAnalytic } from '@/lib/analytics/record'
import { isUserBanned } from '@/lib/admin/moderation'
import { claimOwnership, mayGetHeldLink, mayUseEmail } from '@/lib/auth/allowlist'
import { signInDelivery } from '@/lib/email/magic-link'
import { loginLinkPage } from '@/lib/auth/link-page'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const INVALID_LINK =
  'This link has expired or has already been used. Request a new link and open it in the browser where you want to sign in.'

async function confirmationToken(request: NextRequest): Promise<string | null> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
      'application/x-www-form-urlencoded' ||
    !request.body
  )
    return null
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let body = ''
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 1024) {
        await reader.cancel()
        return null
      }
      body += decoder.decode(value, { stream: true })
    }
    return new URLSearchParams(body + decoder.decode()).get('token')
  } finally {
    reader.releaseLock()
  }
}

// GET (including automatic HEAD) never spends the link. Messaging previews
// and security scanners must not create accounts or capture the session.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const row = token ? await readLoginToken(token) : null
  if (!row) return loginLinkPage({ error: INVALID_LINK, status: 410 })
  return loginLinkPage({ token: token!, intent: row.intent })
}

// Only an explicit same-origin form submission consumes the bearer token.
export async function POST(request: NextRequest) {
  if (
    request.headers.get('origin') !== new URL(BASE_URL).origin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    return loginLinkPage({
      error: 'Open your sign-in link in this browser, then press Sign in.',
      status: 403,
    })
  }
  let token: string | null
  try {
    token = await confirmationToken(request)
  } catch {
    return loginLinkPage({ error: INVALID_LINK, status: 400 })
  }
  const row = token ? await consumeLoginToken(token) : null
  if (!row) return loginLinkPage({ error: INVALID_LINK, status: 410 })

  if (row.intent === 'change') {
    if (!row.userId) {
      return loginLinkPage({ error: INVALID_LINK, status: 410 })
    }
    const result = await linkEmailToUser(row.userId, row.email)
    if ('error' in result) {
      return NextResponse.redirect(new URL('/settings?auth_error=email_in_use', BASE_URL), 303)
    }
    return NextResponse.redirect(new URL('/settings?email_changed=1', BASE_URL), 303)
  }

  // The allowlist can change between asking for a link and using it.
  const heldLinks = signInDelivery() === 'admin'
  if (heldLinks ? !mayGetHeldLink(row.email) : !mayUseEmail(row.email)) {
    return loginLinkPage({
      error: 'This ADHX is for invited people. Ask whoever runs it to add your email.',
      status: 403,
    })
  }
  const { userId, username } = await findOrCreateUserForEmail(row.email)
  if (isUserBanned(userId)) {
    return loginLinkPage({
      error: 'This account cannot sign in. Contact whoever runs this ADHX.',
      status: 403,
    })
  }
  if (heldLinks && claimOwnership(userId)) {
    console.warn(`[sign-in] ${row.email} is now the admin of this ADHX`)
  }
  recordAnalytic({ name: 'auth.complete', userId, source: 'email' })
  const destination = row.returnTo && isSafeReturnUrl(row.returnTo) ? row.returnTo : '/'
  // Resume unfinished onboarding too, including accounts made by an old
  // callback preview before the recipient actually used their browser.
  const account = await getAccount(userId)
  const target = !account?.user.usernameChosen
    ? `/welcome?returnTo=${encodeURIComponent(destination)}`
    : destination
  const response = NextResponse.redirect(new URL(target, BASE_URL), 303)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  await setSessionCookie(response, { userId, username })
  return response
}
