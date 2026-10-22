import path from 'path'

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
 */

export function keepEnabled(): boolean {
  const flag = process.env['KEEP_MEDIA']
  if (flag === 'off' || flag === '0' || flag === 'false') return false
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
 * A cookies file from a browser signed in to the networks (Netscape
 * `cookies.txt`), for posts they only show to signed-in viewers. Unset: none.
 */
export function ytdlpCookies(): string | null {
  return process.env['YTDLP_COOKIES']?.trim() || null
}

export function maxFileSize(): string {
  const raw = process.env['KEEP_MAX_FILESIZE']
  return raw && /^\d+(\.\d+)?[KMG]?$/i.test(raw) ? raw : '4G'
}

export function keepConcurrency(): number {
  const n = Number.parseInt(process.env['KEEP_CONCURRENCY'] ?? '', 10)
  return Number.isFinite(n) && n >= 1 && n <= 8 ? n : 2
}

export function keepH264(): boolean {
  const flag = process.env['KEEP_H264']
  return !(flag === 'off' || flag === '0' || flag === 'false')
}

export function keepBackfill(): boolean {
  const flag = process.env['KEEP_BACKFILL']
  return !(flag === 'off' || flag === '0' || flag === 'false')
}

export function keepMinFreeBytes(): number {
  const n = Number.parseFloat(process.env['KEEP_MIN_FREE_GB'] ?? '')
  return (Number.isFinite(n) && n >= 0 ? n : 2) * 1024 ** 3
}
