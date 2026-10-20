import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { oauthTokens, userPreferences, users } from '@/lib/db/schema'
import { mediaDir } from '@/lib/keep/config'
import { gobSvg, type GobColour } from './gob'
import { AVATAR_URL_PREFIX } from './paths'

export { AVATAR_URL_PREFIX }

/**
 * Your picture (Settings → You → Change picture). Uploads and camera shots
 * are re-encoded here: never stored as sent. The crop is applied on the
 * server from the posted numbers, clamped, so a client can't ask for anything
 * outside the photo. Files live in `MEDIA_DIR/avatars/<userId>-<hash>.jpg`
 * and are served by `/api/files/avatar/<hash>` to members only. The hash is
 * the address (it changes with every new picture), so the account id never
 * reaches a client.
 *
 * `users.avatar_url` holds what to show and `user_preferences.avatarSource`
 * where it came from: `upload`, `gob`, `x` or `generated` (no picture:
 * a face made from the username). `memberAvatar()` in people/savers.ts reads
 * both, so saver faces follow.
 */

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const AVATAR_SIZE = 512
/** Pictures bigger than this many pixels are refused before decoding. */
const MAX_INPUT_PIXELS = 50_000_000
export const MAX_ZOOM = 4

export type AvatarSource = 'upload' | 'gob' | 'x' | 'generated'

export const AVATAR_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const
export type AvatarType = (typeof AVATAR_TYPES)[number]

/** Where to crop: the centre of the square (0–1 across the photo) and how far zoomed in (1 = the whole short side). */
export interface Crop {
  x: number
  y: number
  zoom: number
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Whatever was posted, as a crop that stays inside the photo. */
export function clampCrop(raw: { x?: unknown; y?: unknown; zoom?: unknown } = {}): Crop {
  return {
    x: Math.min(1, Math.max(0, num(raw.x, 0.5))),
    y: Math.min(1, Math.max(0, num(raw.y, 0.5))),
    zoom: Math.min(MAX_ZOOM, Math.max(1, num(raw.zoom, 1))),
  }
}

/** The crop rectangle in pixels for a photo this size: a square, always inside it. */
export function cropRect(
  width: number,
  height: number,
  crop: Crop,
): { left: number; top: number; size: number } {
  const size = Math.max(1, Math.floor(Math.min(width, height) / crop.zoom))
  const left = Math.round(Math.min(width - size, Math.max(0, crop.x * width - size / 2)))
  const top = Math.round(Math.min(height - size, Math.max(0, crop.y * height - size / 2)))
  return { left, top, size }
}

/** What the bytes really are (never trust the declared type alone). */
export function sniffImageType(buf: Buffer): AvatarType | null {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp'
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif'
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12)
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
  }
  return null
}

export class AvatarError extends Error {
  constructor(
    readonly code: 'too_big' | 'bad_type' | 'unreadable',
    message: string,
  ) {
    super(message)
  }
}

/**
 * A 512px square JPEG from an uploaded photo: turned the right way up, cropped
 * where asked (clamped), resized, flattened onto the warm dark and stripped of
 * its metadata (no location, no camera details).
 */
export async function renderAvatar(input: Buffer, crop: Crop): Promise<Buffer> {
  if (input.length > AVATAR_MAX_BYTES) throw new AvatarError('too_big', 'That photo is over 5 MB.')
  if (!sniffImageType(input)) {
    throw new AvatarError('bad_type', 'Use a JPEG, PNG, WebP, GIF or AVIF photo.')
  }
  try {
    // Decode once, upright, so the crop is measured on what people see.
    const upright = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, pages: 1 })
      .rotate()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const { width, height, channels } = upright.info
    const rect = cropRect(width, height, crop)
    return await sharp(upright.data, { raw: { width, height, channels } })
      .extract({ left: rect.left, top: rect.top, width: rect.size, height: rect.size })
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .flatten({ background: '#1a1814' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()
  } catch {
    throw new AvatarError('unreadable', 'That photo couldn’t be read. Try another.')
  }
}

/** A Gob in this colour, as the same 512px JPEG. */
export async function renderGob(colour: GobColour): Promise<Buffer> {
  return sharp(Buffer.from(gobSvg(colour, AVATAR_SIZE)))
    .resize(AVATAR_SIZE, AVATAR_SIZE)
    .jpeg({ quality: 90 })
    .toBuffer()
}

export function avatarDir(): string {
  return path.join(mediaDir(), 'avatars')
}

/** Account ids are X ids or `u_<hex>`; anything else is made filename-safe. */
function filePrefix(userId: string): string {
  return `${userId.replace(/[^A-Za-z0-9_-]/g, '_')}-`
}

const HASH = /^[a-f0-9]{16}$/

/** The picture's address on this server, or null when `avatarUrl` isn't one of ours. */
export function localAvatarHash(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl?.startsWith(AVATAR_URL_PREFIX)) return null
  const hash = avatarUrl.slice(AVATAR_URL_PREFIX.length)
  return HASH.test(hash) ? hash : null
}

/** The file for a picture address, when it's someone's current picture. */
export function avatarFileFor(hash: string): string | null {
  if (!HASH.test(hash)) return null
  const owner = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.avatarUrl, `${AVATAR_URL_PREFIX}${hash}`))
    .get()
  return owner ? path.join(avatarDir(), `${filePrefix(owner.id)}${hash}.jpg`) : null
}

/** Delete this account's picture files, except `keepHash`'s. Never throws. */
export async function removeAvatarFiles(userId: string, keepHash?: string): Promise<number> {
  const prefix = filePrefix(userId)
  let removed = 0
  let names: string[]
  try {
    names = await fs.readdir(avatarDir())
  } catch {
    return 0
  }
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith('.jpg')) continue
    if (keepHash && name === `${prefix}${keepHash}.jpg`) continue
    // Only `<prefix><16 hex>.jpg`: another account's id can't share this prefix.
    if (!HASH.test(name.slice(prefix.length, -4))) continue
    await fs.rm(path.join(avatarDir(), name), { force: true }).catch(() => {})
    removed++
  }
  return removed
}

function setAvatarSource(userId: string, source: AvatarSource): void {
  const now = new Date().toISOString()
  db.insert(userPreferences)
    .values({ userId, key: 'avatarSource', value: source, updatedAt: now })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.key],
      set: { value: source, updatedAt: now },
    })
    .run()
}

/** Save a rendered picture as this account's, and remove the one it replaces. */
export async function storeAvatar(
  userId: string,
  jpeg: Buffer,
  source: 'upload' | 'gob',
): Promise<string> {
  const hash = crypto.createHash('sha256').update(userId).update(jpeg).digest('hex').slice(0, 16)
  const dir = avatarDir()
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `${filePrefix(userId)}${hash}.jpg`)
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`
  await fs.writeFile(tmp, jpeg)
  await fs.rename(tmp, file)
  const url = `${AVATAR_URL_PREFIX}${hash}`
  db.update(users).set({ avatarUrl: url }).where(eq(users.id, userId)).run()
  setAvatarSource(userId, source)
  await removeAvatarFiles(userId, hash)
  return url
}

/** The X profile photo stored with this account's X connection, if any. */
export function xPictureFor(userId: string): string | null {
  const row = db
    .select({ url: oauthTokens.profileImageUrl })
    .from(oauthTokens)
    .where(eq(oauthTokens.userId, userId))
    .get()
  return row?.url || null
}

/** Use the X photo again. False when this account has no X photo. */
export async function useXPicture(userId: string): Promise<string | false> {
  const url = xPictureFor(userId)
  if (!url) return false
  db.update(users).set({ avatarUrl: url }).where(eq(users.id, userId)).run()
  setAvatarSource(userId, 'x')
  await removeAvatarFiles(userId)
  return url
}

/** No picture: a face made from the username. Removes any stored picture. */
export async function removePicture(userId: string): Promise<void> {
  // Keep the X photo's address for "Use your X picture"; drop our own file's.
  const current = db
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  if (localAvatarHash(current?.avatarUrl)) {
    db.update(users)
      .set({ avatarUrl: xPictureFor(userId) })
      .where(and(eq(users.id, userId), eq(users.avatarUrl, current!.avatarUrl!)))
      .run()
  }
  setAvatarSource(userId, 'generated')
  await removeAvatarFiles(userId)
}
