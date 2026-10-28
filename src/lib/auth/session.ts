import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'
import { accountApproval, type Approval } from './account-state'
import { serverSecret } from './server-secret'
import { appUrl } from '@/lib/routes/app-url'

const SESSION_COOKIE_NAME = 'adhx_session'
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

const getSecretKey = () => new TextEncoder().encode(serverSecret())

/**
 * Secure cookies need HTTPS. A home server reached at http://192.168.1.10:3000
 * (or http://localhost) would otherwise never keep anyone signed in.
 */
const secureCookies = () => process.env.NODE_ENV === 'production' && !appUrl().startsWith('http:')

export interface Session {
  userId: string
  username: string
}

/**
 * Get the current user's session from cookies
 * Returns null if no valid session exists
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)

  if (!sessionCookie?.value) {
    return null
  }

  try {
    // Verify JWT signature and decode
    const { payload } = await jwtVerify(sessionCookie.value, getSecretKey())

    if (!payload.userId || typeof payload.userId !== 'string') {
      return null
    }

    return {
      userId: payload.userId,
      username: payload.username as string,
    }
  } catch {
    return null
  }
}

/**
 * The session's account and whether it has been let in: a valid JWT for an
 * account that exists and isn't banned. Null otherwise.
 */
async function sessionAccount(): Promise<{ userId: string; approval: Approval } | null> {
  const session = await getSession()
  if (!session?.userId) {
    // The public demo: everyone without a session is its demo person.
    const { demoVisitorId } = await import('@/lib/demo/visitor')
    const visitor = demoVisitorId()
    return visitor ? { userId: visitor, approval: 'approved' } : null
  }
  const approval = await accountApproval(session.userId)
  if (!approval) return null
  const { readUserBan } = await import('@/lib/admin/moderation')
  const ban = readUserBan(session.userId)
  // Authentication fails closed: a valid JWT is not enough to authorize a
  // request unless the moderation store confirms this account is not banned.
  if (!ban.ok || ban.value) return null
  return { userId: session.userId, approval }
}

/**
 * Get the current user ID from session
 * Returns null if no valid session exists, and for an account that is still
 * waiting to be let in (or was declined): that person is signed out
 * everywhere except the waiting page and its status endpoint, which use
 * `getWaitingUserId()`.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const account = await sessionAccount()
  return account?.approval === 'approved' ? account.userId : null
}

/**
 * For the waiting page and `/api/auth/approval` only: the account behind this
 * session when it is NOT let in yet (pending or declined), with its state.
 * Null for approved accounts (they use `getCurrentUserId()`) and strangers.
 */
export async function getWaitingAccount(): Promise<{
  userId: string
  approval: Exclude<Approval, 'approved'>
} | null> {
  const account = await sessionAccount()
  if (!account || account.approval === 'approved') return null
  return { userId: account.userId, approval: account.approval }
}

/**
 * Set a session cookie for the authenticated user
 * Uses JWT signing to prevent tampering
 */
export async function setSessionCookie(response: NextResponse, session: Session): Promise<void> {
  const token = await new SignJWT({
    userId: session.userId,
    username: session.username,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecretKey())

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })
}

/** A session older than this is re-signed when its owner comes back. */
const RENEW_AFTER_SECONDS = 24 * 60 * 60

/**
 * Keep an active session alive: re-sign a valid cookie that is more than a
 * day old, so it lasts 30 days from the last visit rather than from sign-in.
 * Accounts made from an invite may have no email to sign back in with.
 * Only call this after `getCurrentUserId()` (or `getWaitingAccount()`) has
 * accepted the session.
 */
export async function renewSessionCookie(response: NextResponse): Promise<boolean> {
  const cookieStore = await cookies()
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!value) return false
  try {
    const { payload } = await jwtVerify(value, getSecretKey())
    if (!payload.userId || typeof payload.userId !== 'string') return false
    const issuedAt = typeof payload.iat === 'number' ? payload.iat : 0
    if (Date.now() / 1000 - issuedAt < RENEW_AFTER_SECONDS) return false
    await setSessionCookie(response, {
      userId: payload.userId,
      username: payload.username as string,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Clear the session cookie (logout)
 */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}
