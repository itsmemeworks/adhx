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
} from './store'
import { isGobColour } from './gob'

/**
 * Changing your picture, shared by the web (`/api/account/avatar`, session)
 * and the phones (`/api/app/me/avatar`, phone key): the same bodies, the same
 * rate budget and the same `{ error, code }` errors. Each route only adds its
 * own auth and headers.
 */

export type AvatarResult = { status: number; body: unknown }

/** Room for the form's other fields around a 5 MB photo. */
const MAX_BODY = AVATAR_MAX_BYTES + 64 * 1024

/** Types a phone may send when it doesn't name one; the bytes are still sniffed. */
const UNNAMED = new Set(['', 'application/octet-stream'])

function fail(status: number, code: string, error: string): AvatarResult {
  return { status, body: { error, code } }
}

/**
 * POST — change your picture → `{ avatarUrl, source }`.
 *
 * - `multipart/form-data` with `file` (JPEG, PNG, WebP, GIF or AVIF, ≤5 MB)
 *   and the crop: `x`, `y` (the square's centre, 0–1 across the photo) and
 *   `zoom` (1–4). Re-encoded to a 512px JPEG; the crop is clamped here.
 * - JSON `{ source: 'gob', colour: 'blue' | 'teal' | 'coral' | 'lime' }`: a Gob face.
 * - JSON `{ source: 'x' }`: your X photo (409 `no_x_picture` without one).
 *
 * `unnamedTypes`: also take a file sent without a type (phones), relying on
 * the bytes alone, which `renderAvatar` always checks.
 */
export async function changeAvatar(
  request: Request,
  userId: string,
  opts: { endpoint: string; unnamedTypes?: boolean },
): Promise<AvatarResult> {
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
      const named = (AVATAR_TYPES as readonly string[]).includes(file.type)
      if (!named && !(opts.unnamedTypes && UNNAMED.has(file.type))) {
        return fail(415, 'bad_type', 'Use a JPEG, PNG, WebP, GIF or AVIF photo.')
      }
      const crop = clampCrop({ x: form.get('x'), y: form.get('y'), zoom: form.get('zoom') })
      const jpeg = await renderAvatar(Buffer.from(await file.arrayBuffer()), crop)
      const avatarUrl = await storeAvatar(userId, jpeg, 'upload')
      return { status: 200, body: { avatarUrl, source: 'upload' } }
    }

    const body = (await request.json().catch(() => null)) as {
      source?: unknown
      colour?: unknown
    } | null
    if (body?.source === 'gob') {
      if (!isGobColour(body.colour)) return fail(400, 'bad_colour', 'Pick a colour.')
      const avatarUrl = await storeAvatar(userId, await renderGob(body.colour), 'gob')
      return { status: 200, body: { avatarUrl, source: 'gob' } }
    }
    if (body?.source === 'x') {
      const avatarUrl = await useXPicture(userId)
      if (!avatarUrl) return fail(409, 'no_x_picture', 'Connect X first to use your X picture.')
      return { status: 200, body: { avatarUrl, source: 'x' } }
    }
    return fail(400, 'bad_request', 'Send a photo, a Gob colour or your X picture.')
  } catch (error) {
    if (error instanceof AvatarError) {
      const status = error.code === 'too_big' ? 413 : error.code === 'bad_type' ? 415 : 422
      return fail(status, error.code, error.message)
    }
    captureException(error, { endpoint: opts.endpoint, userId })
    return fail(500, 'failed', 'Couldn’t save your picture. Try again.')
  }
}

/** DELETE — no picture: a face made from your username. */
export async function resetAvatar(userId: string): Promise<AvatarResult> {
  await removePicture(userId)
  return { status: 200, body: { avatarUrl: null, source: 'generated' } }
}
