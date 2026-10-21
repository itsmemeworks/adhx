import { NextResponse } from 'next/server'
import { appError } from '@/lib/api/phone-auth'
import { MAX_PHONE_KEYS } from '@/lib/auth/access-keys'
import { redeemPairCode } from '@/lib/auth/phone-pairing'

/**
 * POST /api/app/pair { code, name? } — the phone app spends a code from
 * Settings → Phone app for its phone key. No session: the code is the proof.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { code?: unknown; name?: unknown }
  const result = redeemPairCode(body?.code, body?.name)
  if (!result.ok) {
    return result.reason === 'too_many'
      ? appError(
          409,
          'too_many',
          `You can connect ${MAX_PHONE_KEYS} phones. Remove one in Settings → Phone app first.`,
        )
      : appError(
          400,
          'bad_code',
          'That code didn’t work. It may have run out or been used already. Make a new one in Settings → Phone app.',
        )
  }
  const response = NextResponse.json(
    { key: result.key, name: result.name, username: result.username },
    { status: 201 },
  )
  response.headers.set('Cache-Control', 'no-store')
  return response
}
