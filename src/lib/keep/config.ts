import path from 'path'
import { envSetting, setting, settingOff, storedSetting } from '../settings/value'

/**
 * Kept media: ADHX downloads every saved post's pictures, video and sound
 * once, in the best quality the source offers, and serves them itself.
 *
 * - `KEEP_MEDIA=off` turns downloading off (files already kept still serve).
 * - `MEDIA_DIR`: where files live. Defaults to `media/` next to the database,
 *   so the one `/data` volume holds both.
 * - `YTDLP_PATH`: the yt-dlp binary (default `yt-dlp` on PATH).
 * - `KEEP_MAX_FILESIZE`: largest single file yt-dlp will fetch (default `4G`).
 * - `KEEP_CONCURRENCY`: posts downloaded at once (default 2).
 * - `KEEP_BACKFILL=off`: only download posts saved from now on (leave the
 *   existing library on the proxies; useful on a small disk).
 * - `KEEP_MIN_FREE_GB`: pause downloading while the media disk has less than
 *   this much free space (default 2).
 * - `KEEP_H264=off`: keep videos in whatever codec the source sent. By default
 *   a VP9, AV1 or HEVC download is re-encoded to H.264 at the same size so
 *   Safari, Chrome and Firefox all play it.
 *
 * The KEEP_* switches can also be changed in Admin → System (saved values
 * win, see `settings/extras.ts`), so read them on every use.
 */

export function keepEnabled(): boolean {
  if (settingOff('KEEP_MEDIA')) return false
  if (process.env.NODE_ENV === 'test' || process.env['VITEST']) return false
  return true
}

export function mediaDir(): string {
  const fromEnv = process.env['MEDIA_DIR']
  if (fromEnv) return path.resolve(fromEnv)
  const dbPath = process.env['DATABASE_PATH']
  if (dbPath) return path.join(path.dirname(path.resolve(dbPath)), 'media')
  return path.resolve('./data/media')
}

export function ytdlpPath(): string {
  return process.env['YTDLP_PATH'] || 'yt-dlp'
}

/**
 * Cookies from a browser signed in to the networks (Netscape `cookies.txt`),
 * for posts they only show to signed-in viewers. Pasted in Admin → System
 * (stored encrypted, `ytdlpCookiesText`) wins over a file named by the
 * environment's `YTDLP_COOKIES` (`ytdlpCookies`, a path). Unset: none.
 */
export function ytdlpCookiesText(): string | null {
  return storedSetting('YTDLP_COOKIES')
}

export function ytdlpCookies(): string | null {
  return envSetting('YTDLP_COOKIES')
}

export function hasYtdlpCookies(): boolean {
  return !!(ytdlpCookiesText() || ytdlpCookies())
}

export function maxFileSize(): string {
  const raw = setting('KEEP_MAX_FILESIZE')
  return raw && /^\d+(\.\d+)?[KMG]?$/i.test(raw) ? raw : '4G'
}

export function keepConcurrency(): number {
  const n = Number.parseInt(setting('KEEP_CONCURRENCY') ?? '', 10)
  return Number.isFinite(n) && n >= 1 && n <= 8 ? n : 2
}

export function keepH264(): boolean {
  return !settingOff('KEEP_H264')
}

export function keepBackfill(): boolean {
  return !settingOff('KEEP_BACKFILL')
}

export function keepMinFreeBytes(): number {
  const n = Number.parseFloat(setting('KEEP_MIN_FREE_GB') ?? '')
  return (Number.isFinite(n) && n >= 0 ? n : 2) * 1024 ** 3
}
