/**
 * How far along each running download is, in memory (the worker and the
 * routes share one process). Only yt-dlp downloads report it; a post that
 * isn't downloading right now has none.
 */

const g = globalThis as unknown as {
  __adhxKeepProgress?: Map<string, number>
  __adhxKeepConverting?: Set<string>
}
const progress = () => (g.__adhxKeepProgress ??= new Map())
/** Posts whose download is done and whose video is being re-encoded. */
const converting = () => (g.__adhxKeepConverting ??= new Set())
const keyOf = (platform: string, postId: string) => `${platform}:${postId}`

/**
 * Record a percent for a running download. It never goes backwards: a video
 * and its sound arrive one after the other, and a bar that drops back to 0
 * reads as broken.
 */
export function reportKeepProgress(platform: string, postId: string, percent: number): void {
  if (!Number.isFinite(percent)) return
  const key = keyOf(platform, postId)
  const clamped = Math.max(0, Math.min(99, Math.round(percent)))
  if (clamped > (progress().get(key) ?? -1)) progress().set(key, clamped)
}

/**
 * The download percent, or null when there is none — including while the
 * video is re-encoded afterwards, which can take minutes for a long 4K video
 * and would otherwise sit at 99%.
 */
export function keepProgress(platform: string, postId: string): number | null {
  const key = keyOf(platform, postId)
  if (converting().has(key)) return null
  return progress().get(key) ?? null
}

/** The download is done and the video is being re-encoded to H.264. */
export function reportKeepConverting(platform: string, postId: string): void {
  converting().add(keyOf(platform, postId))
}

export function isKeepConverting(platform: string, postId: string): boolean {
  return converting().has(keyOf(platform, postId))
}

export function clearKeepProgress(platform: string, postId: string): void {
  progress().delete(keyOf(platform, postId))
  converting().delete(keyOf(platform, postId))
}

/** The percent in one line of yt-dlp output made with `PROGRESS_TEMPLATE`, or null. */
export function parseProgressLine(line: string): number | null {
  const m = line.match(/ADHX-PROGRESS\s+([\d.]+)%/)
  return m ? Number(m[1]) : null
}

export const PROGRESS_TEMPLATE = 'download:ADHX-PROGRESS %(progress._percent_str)s'
