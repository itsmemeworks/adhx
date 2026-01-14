import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'

const SESSION_COOKIE_NAME = 'adhx_session'
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

// Use environment variable or fallback to a derived key (should be set in production)
const getSecretKey = () => {
  const secret = process.env.SESSION_SECRET || process.env.TWITTER_CLIENT_SECRET || 'adhx-default-secret-change-in-production'
  return new TextEncoder().encode(secret)
}

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
 * Get the current user ID from session
 * Returns null if no valid session exists
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession()
  return session?.userId ?? null
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
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })
}

/**
 * Clear the session cookie (logout)
 */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}

/**
 * Require authentication - returns userId or throws/redirects
 * Use in API routes that require auth
 */
export async function requireAuth(): Promise<string> {
  const userId = await getCurrentUserId()
  if (!userId) {
    throw new Error('Unauthorized')
  }
  return userId
}
