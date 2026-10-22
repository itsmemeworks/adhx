import { execFile } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { ffmpegPath } from '@/lib/media/ffmpeg'
import { maxFileSize, mediaDir, ytdlpCookies, ytdlpPath } from './config'
import { parseProgressLine, PROGRESS_TEMPLATE } from './progress'

/**
 * yt-dlp, the downloader linktokeep-style tools use: one extractor per site,
 * then the best formats it finds, merged with ffmpeg.
 *
 * Always run with an argument list (no shell), with `--` before the URL so a
 * URL can never be read as an option.
 */

const INFO_TIMEOUT_MS = 90_000
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000

/**
 * Highest resolution first. At the same resolution prefer H.264 + AAC, which
 * every browser plays, over VP9/AV1/HEVC; then the higher bitrate.
 */
const VIDEO_FORMAT = 'bv*+ba/b'
const VIDEO_SORT = 'res,fps,vcodec:h264,acodec:aac,br'

export class YtdlpError extends Error {
  constructor(
    message: string,
    /** Nothing to download here (no video, gone, private): don't retry. */
    readonly permanent = false,
  ) {
    super(message)
  }
}

export interface YtdlpFormat {
  vcodec?: string | null
  acodec?: string | null
  height?: number | null
}

export interface YtdlpInfo {
  id?: string
  title?: string | null
  description?: string | null
  uploader?: string | null
  uploader_id?: string | null
  channel?: string | null
  timestamp?: number | null
  upload_date?: string | null
  duration?: number | null
  thumbnail?: string | null
  webpage_url?: string | null
  extractor_key?: string
  formats?: YtdlpFormat[]
  entries?: YtdlpInfo[] | null
  _type?: string
}

const PERMANENT = [
  /no video formats found/i,
  /unsupported url/i,
  /video (?:is )?unavailable/i,
  /private video/i,
  /this video (?:has been|is) (?:removed|deleted|no longer available)/i,
  /does not exist/i,
  /\b404\b/,
  /there is no video in this/i,
  /not a video/i,
  /drm protected/i,
]

const SIGN_IN_ONLY = [
  // TikTok: "This post may not be comfortable for some audiences. Log in for access."
  /comfortable for some audiences|log ?in for access/i,
  // YouTube's age gate.
  /confirm your age|age.?restricted/i,
  // Instagram, Facebook and the rest.
  /login required|only available (?:for|to) registered users|you must log ?in|log ?in to (?:continue|view|see)/i,
  // What yt-dlp adds to any extractor's "needs an account" error.
  /--cookies-from-browser or --cookies for the authentication/i,
]

/**
 * The network only shows this post to signed-in viewers: TikTok's "may not be
 * comfortable for some audiences", age-gated YouTube, Instagram's and
 * Facebook's login walls. It exists; a cookies file (`YTDLP_COOKIES`) lets the
 * server see it. A private post is something else (only its followers see it).
 */
export function isSignInOnly(message: string): boolean {
  return !/\bprivate\b/i.test(message) && SIGN_IN_ONLY.some((re) => re.test(message))
}

/** yt-dlp's error says there's nothing to download here (gone, private, no video, DRM). */
export function isPermanent(message: string): boolean {
  return PERMANENT.some((re) => re.test(message))
}

/** Call `onLine` for each whole line yt-dlp writes, as it writes it. */
function eachLine(onLine: (line: string) => void): (chunk: Buffer | string) => void {
  let rest = ''
  return (chunk) => {
    const lines = (rest + chunk.toString()).split(/\r?\n|\r/)
    rest = lines.pop() ?? ''
    for (const line of lines) onLine(line)
  }
}

/**
 * A private copy of the owner's cookies file for one run: yt-dlp writes the
 * cookies it ends with back to the file it's given, and runs overlap. No
 * file (or none readable): run without, as if it were unset.
 */
async function cookiesCopy(): Promise<{ file: string; remove: () => Promise<void> } | null> {
  const source = ytdlpCookies()
  if (!source) return null
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'adhx-cookies-'))
  const remove = () => fs.rm(dir, { recursive: true, force: true })
  try {
    const file = path.join(dir, 'cookies.txt')
    await fs.copyFile(source, file)
    await fs.chmod(file, 0o600)
    return { file, remove }
  } catch {
    await remove()
    return null
  }
}

async function run(
  args: string[],
  timeoutMs: number,
  onLine?: (line: string) => void,
): Promise<string> {
  const cookies = await cookiesCopy()
  try {
    return await exec(cookies ? ['--cookies', cookies.file, ...args] : args, timeoutMs, onLine)
  } finally {
    await cookies?.remove()
  }
}

function exec(args: string[], timeoutMs: number, onLine?: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      ytdlpPath(),
      args,
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout)
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return reject(new YtdlpError('yt-dlp is not installed (set YTDLP_PATH)'))
        }
        const line =
          stderr
            .split('\n')
            .filter((l) => /error/i.test(l))
            .pop() ||
          stderr.trim().split('\n').pop() ||
          error.message
        const message = line.replace(/^ERROR:\s*/, '').slice(0, 500)
        reject(new YtdlpError(message, isPermanent(message)))
      },
    )
    if (onLine) {
      // Progress goes to stderr in quiet mode (`--print` implies it), stdout otherwise.
      child.stdout?.on('data', eachLine(onLine))
      child.stderr?.on('data', eachLine(onLine))
    }
  })
}

async function commonArgs(): Promise<string[]> {
  return [
    '--no-progress',
    '--no-warnings',
    '--no-color',
    '--socket-timeout',
    '30',
    '--retries',
    '3',
    '--fragment-retries',
    '3',
    '--cache-dir',
    path.join(mediaDir(), '.cache', 'yt-dlp'),
    '--ffmpeg-location',
    await ffmpegPath(),
    // YouTube needs a JavaScript runtime for its player challenges; yt-dlp
    // only looks for Deno unless told. The Node running ADHX is always here.
    '--js-runtimes',
    `node:${process.execPath}`,
  ]
}

/** What's at a link, without downloading. */
export async function ytdlpInfo(
  target: string,
  { timeoutMs = INFO_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<YtdlpInfo> {
  const out = await run(
    [...(await commonArgs()), '--dump-single-json', '--flat-playlist', '--', target],
    timeoutMs,
  )
  return JSON.parse(out) as YtdlpInfo
}

/** True when nothing at the link has a picture track (a song, a podcast). */
export function isAudioOnly(info: YtdlpInfo): boolean {
  const entries = info.entries?.length ? info.entries : [info]
  const formats = entries.flatMap((e) => e.formats ?? [])
  return (
    formats.length > 0 &&
    formats.every((f) => !f.vcodec || f.vcodec === 'none') &&
    formats.some((f) => f.acodec && f.acodec !== 'none')
  )
}

export interface Downloaded {
  /** 1-based position in the post. */
  index: number
  file: string
  poster: string | null
}

/**
 * Download everything at `target` into `dir`, best quality first: video as
 * MP4 (merged), audio in its original container, plus each item's thumbnail
 * as JPEG. Returns the files in post order.
 */
export async function ytdlpDownload(
  target: string,
  dir: string,
  { audio = false, onProgress }: { audio?: boolean; onProgress?: (percent: number) => void } = {},
): Promise<Downloaded[]> {
  const prefix = audio ? 'a' : 'v'
  const common = await commonArgs()
  const args = [
    ...(onProgress
      ? [
          ...common.filter((a) => a !== '--no-progress'),
          '--progress',
          '--newline',
          '--progress-template',
          PROGRESS_TEMPLATE,
        ]
      : common),
    '--yes-playlist',
    '--no-mtime',
    '--max-filesize',
    maxFileSize(),
    '--write-thumbnail',
    '--convert-thumbnails',
    'jpg',
    '-o',
    path.join(dir, `${prefix}%(playlist_index|1)s.%(ext)s`),
    '-o',
    `thumbnail:${path.join(dir, `t%(playlist_index|1)s.%(ext)s`)}`,
    '--print',
    'after_move:filepath',
  ]
  if (audio) {
    args.push('-f', 'bestaudio/best')
  } else {
    args.push('-f', VIDEO_FORMAT, '-S', VIDEO_SORT, '--merge-output-format', 'mp4')
  }
  args.push('--', target)
  const out = await run(
    args,
    DOWNLOAD_TIMEOUT_MS,
    onProgress &&
      ((line) => {
        const percent = parseProgressLine(line)
        if (percent !== null) onProgress(percent)
      }),
  )
  const files = out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const results: Downloaded[] = []
  for (const file of files) {
    const m = path.basename(file).match(/^[av](\d+)\./)
    if (!m) continue
    const index = Number(m[1])
    const poster = path.join(dir, `t${index}.jpg`)
    results.push({
      index,
      file,
      poster: await fs
        .access(poster)
        .then(() => poster)
        .catch(() => null),
    })
  }
  if (results.length === 0) {
    throw new YtdlpError('Nothing was downloaded (too large, or no media at this link)', true)
  }
  return results.sort((a, b) => a.index - b.index)
}
