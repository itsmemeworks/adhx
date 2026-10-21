import { NextResponse } from 'next/server'
import { withPhoneKey } from '@/lib/api/phone-auth'
import { changeAvatar, resetAvatar, type AvatarResult } from '@/lib/avatar/handler'

export const dynamic = 'force-dynamic'

function reply(result: AvatarResult): NextResponse {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

/**
 * POST /api/app/me/avatar — change your picture from the phone, the same
 * bodies as the web's `POST /api/account/avatar` → `{ avatarUrl, source }`:
 *
 * - `multipart/form-data`: `file` (JPEG, PNG, WebP, GIF or AVIF, ≤5 MB; a file
 *   sent without a type is judged by its bytes) and the crop `x`, `y` (the
 *   square's centre, 0–1) and `zoom` (1–4). An already-square JPEG goes with
 *   `x=0.5, y=0.5, zoom=1`.
 * - JSON `{ source: 'gob', colour }` or `{ source: 'x' }`.
 *
 * Errors (`{ error, code }`): `busy` 429 (30 an hour, shared with the web),
 * `too_big` 413, `bad_type` 415, `unreadable` 422, `no_file`, `bad_colour`,
 * `bad_request` 400, `no_x_picture` 409, `failed` 500.
 */
export const POST = withPhoneKey(async (request, { userId }) =>
  reply(
    await changeAvatar(request, userId, { endpoint: '/api/app/me/avatar', unnamedTypes: true }),
  ),
)

/** DELETE /api/app/me/avatar — back to the generated icon → `{ avatarUrl: null, source: 'generated' }`. */
export const DELETE = withPhoneKey(async (_request, { userId }) => reply(await resetAvatar(userId)))
