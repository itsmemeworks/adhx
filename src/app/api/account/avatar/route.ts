import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { captureException } from '@/lib/sentry'
import {
  AVATAR_MAX_BYTES,
  AVATAR_TYPES,
  AvatarError,
  clampCrop,
  removePicture,
  renderAvatar,
  renderGob,
  storeAvatar,
  useXPicture,
} from '@/lib/avatar/store'
import { isGobColour } from '@/lib/avatar/gob'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
/** Room for the form's other fields around a 5 MB photo. */
const MAX_BODY = AVATAR_MAX_BYTES + 64 * 1024

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ error, code }, { status, headers: NO_STORE })
}

/**
 * POST /api/account/avatar — change your picture → `{ avatarUrl, source }`.
 *
 * - `multipart/form-data` with `file` (JPEG, PNG, WebP, GIF or AVIF, ≤5 MB)
 *   and the crop: `x`, `y` (the square's centre, 0–1 across the photo) and
 *   `zoom` (1–4). Re-encoded to a 512px JPEG; the crop is clamped here.
 * - JSON `{ source: 'gob', colour: 'blue' | 'teal' | 'coral' | 'lime' }`: a Gob face.
 * - JSON `{ source: 'x' }`: your X photo (409 `no_x_picture` without one).
 */
export const POST = withAuth(async (request: NextRequest, userId) => {
  const limit = checkRateLimit(`avatar:${userId}`, { windowMs: 60 * 60 * 1000, max: 30 })
  if (limit.limited) return fail(429, 'busy', 'That’s a lot of new pictures. Try again in a bit.')

  const type = request.headers.get('content-type') ?? ''
  try {
    if (type.startsWith('multipart/form-data')) {
      const length = Number(request.headers.get('content-length') ?? 0)
      if (length > MAX_BODY) return fail(413, 'too_big', 'That photo is over 5 MB.')
      const form = await request.formData().catch(() => null)
      const file = form?.get('file')
      if (!form || !(file instanceof Blob)) return fail(400, 'no_file', 'Pick a photo first.')
      if (file.size > AVATAR_MAX_BYTES) return fail(413, 'too_big', 'That photo is over 5 MB.')
      if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) {
        return fail(415, 'bad_type', 'Use a JPEG, PNG, WebP, GIF or AVIF photo.')
      }
      const crop = clampCrop({ x: form.get('x'), y: form.get('y'), zoom: form.get('zoom') })
      const jpeg = await renderAvatar(Buffer.from(await file.arrayBuffer()), crop)
      const avatarUrl = await storeAvatar(userId, jpeg, 'upload')
      return NextResponse.json({ avatarUrl, source: 'upload' }, { headers: NO_STORE })
    }

    const body = (await request.json().catch(() => null)) as {
      source?: unknown
      colour?: unknown
    } | null
    if (body?.source === 'gob') {
      if (!isGobColour(body.colour)) return fail(400, 'bad_colour', 'Pick a colour.')
      const avatarUrl = await storeAvatar(userId, await renderGob(body.colour), 'gob')
      return NextResponse.json({ avatarUrl, source: 'gob' }, { headers: NO_STORE })
    }
    if (body?.source === 'x') {
      const avatarUrl = await useXPicture(userId)
      if (!avatarUrl) return fail(409, 'no_x_picture', 'Connect X first to use your X picture.')
      return NextResponse.json({ avatarUrl, source: 'x' }, { headers: NO_STORE })
    }
    return fail(400, 'bad_request', 'Send a photo, a Gob colour or your X picture.')
  } catch (error) {
    if (error instanceof AvatarError) {
      const status = error.code === 'too_big' ? 413 : error.code === 'bad_type' ? 415 : 422
      return fail(status, error.code, error.message)
    }
    captureException(error, { endpoint: '/api/account/avatar', userId })
    return fail(500, 'failed', 'Couldn’t save your picture. Try again.')
  }
})

/** DELETE /api/account/avatar — no picture: a face made from your username. */
export const DELETE = withAuth(async (_request, userId) => {
  await removePicture(userId)
  return NextResponse.json({ avatarUrl: null, source: 'generated' }, { headers: NO_STORE })
})
