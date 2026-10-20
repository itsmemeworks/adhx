import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import path from 'node:path'

/** Resolve an absolute executable: yt-dlp's --ffmpeg-location does not search PATH. */
export async function ffmpegPath(): Promise<string> {
  const configured = process.env['FFMPEG_PATH']
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const candidates = configured
    ? [path.resolve(configured)]
    : (process.env['PATH'] || '')
        .split(path.delimiter)
        .filter(Boolean)
        .map((directory) => path.resolve(directory, name))
  for (const candidate of candidates) {
    try {
      if (!(await stat(candidate)).isFile()) continue
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      // A missing/non-executable entry must not hide a later valid PATH entry.
    }
  }
  throw new Error(
    'FFmpeg is unavailable. Install a maintained FFmpeg or set FFMPEG_PATH to its executable.',
  )
}
