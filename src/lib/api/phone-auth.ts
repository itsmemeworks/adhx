import { NextResponse } from 'next/server'
import { accessKeyFromHeader } from '@/lib/auth/access-keys'

/**
 * The phone app's routes (`/api/app/*`) sign requests with a phone key
 * (`Authorization: Bearer adhx_…`, scope `phone`) instead of a session cookie.
 */

export interface PhoneCaller {
  userId: string
  keyId: string
  name: string
}

/** The phone key's account, or null (unknown key, wrong scope, banned or not-yet-approved account). */
export async function phoneCaller(request: Request): Promise<PhoneCaller | null> {
  const row = accessKeyFromHeader(request.headers.get('authorization'), 'phone')
  if (!row) return null
  const { readUserBan } = await import('@/lib/admin/moderation')
  const ban = readUserBan(row.userId)
  if (!ban.ok || ban.value) return null
  // An account still waiting to be let in is signed out here too.
  const { accountApproval } = await import('@/lib/auth/account-state')
  if ((await accountApproval(row.userId)) !== 'approved') return null
  const caller = { userId: row.userId, keyId: row.id, name: row.name }
  // Last seen, the kind of phone and opens, for admins (throttled, counts only).
  const { notePhoneRequest } = await import('@/lib/people/last-seen')
  notePhoneRequest(caller, request.headers.get('user-agent'))
  return caller
}

/** An app error: plain words to show, plus a code the app branches on. */
export function appError(status: number, code: string, error: string): NextResponse {
  return NextResponse.json(
    { error, code },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}),
      },
    },
  )
}

export function badKey(): NextResponse {
  return appError(
    401,
    'bad_key',
    'This phone isn’t connected any more. Connect it again from Settings → Phone app.',
  )
}

/** Wrap a route so it only runs for a valid phone key. */
export function withPhoneKey(
  handler: (request: Request, caller: PhoneCaller) => Promise<Response> | Response,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const caller = await phoneCaller(request)
    if (!caller) return badKey()
    return handler(request, caller)
  }
}

/**
 * Wrap a route so it runs for a valid phone key or a signed-in session (the
 * web can read the same data). A request that brings a key uses only the
 * key: a bad one is refused even when a session cookie is present.
 */
export function withPhoneKeyOrSession<C = unknown>(
  handler: (request: Request, userId: string, ctx: C) => Promise<Response> | Response,
): (request: Request, ctx?: C) => Promise<Response> {
  return async (request: Request, ctx?: C) => {
    if (request.headers.get('authorization')) {
      const caller = await phoneCaller(request)
      if (!caller) return badKey()
      return handler(request, caller.userId, ctx as C)
    }
    const { getCurrentUserId } = await import('@/lib/auth/session')
    const userId = await getCurrentUserId()
    if (!userId) return appError(401, 'signed_out', 'Sign in, or connect this phone first.')
    return handler(request, userId, ctx as C)
  }
}
