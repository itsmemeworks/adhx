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

/** The phone key's account, or null (unknown key, wrong scope, banned account). */
export async function phoneCaller(request: Request): Promise<PhoneCaller | null> {
  const row = accessKeyFromHeader(request.headers.get('authorization'), 'phone')
  if (!row) return null
  const { readUserBan } = await import('@/lib/admin/moderation')
  const ban = readUserBan(row.userId)
  if (!ban.ok || ban.value) return null
  return { userId: row.userId, keyId: row.id, name: row.name }
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
