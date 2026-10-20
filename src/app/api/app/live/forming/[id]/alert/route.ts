import { NextResponse } from 'next/server'
import { withPhoneKey } from '@/lib/api/phone-auth'
import { setFormingAlert, type AlertResult } from '@/lib/moments/alert-handlers'

export const dynamic = 'force-dynamic'

function reply(result: AlertResult): NextResponse {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function idFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split('/')
  return decodeURIComponent(parts[parts.length - 2] ?? '')
}

/**
 * PUT /api/app/live/forming/{id}/alert → `{ alert: true }`; DELETE →
 * `{ alert: false }`. 404 `forming_gone` when that group no longer exists.
 * When it goes live the phone finds it in `GET /api/app/alerts`.
 */
export const PUT = withPhoneKey(async (request, { userId }) =>
  reply(await setFormingAlert(userId, idFrom(request), true)),
)

export const DELETE = withPhoneKey(async (request, { userId }) =>
  reply(await setFormingAlert(userId, idFrom(request), false)),
)
