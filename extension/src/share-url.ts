/**
 * Which links the desktop extension will send to ADHX `/share?url=`.
 *
 * Kept as a small copy of the app's detector (`detectPlatformPost` +
 * TikTok short links) so the extension stays a standalone package — `/share`
 * is still the source of truth for routing once we land there.
 */

const TWITTER =
  /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter|vxtwitter|fxtwitter)\.com\/\w{1,15}\/status\/\d+/i
const INSTAGRAM = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reels?|p)\/[A-Za-z0-9_-]+/i
const TIKTOK =
  /(?:https?:\/\/)?(?:www\.|vm\.|m\.)?tiktok\.com\/@[A-Za-z0-9._]{1,30}\/video\/\d{6,25}/i
const TIKTOK_SHORT =
  /https?:\/\/(?:(?:vm|vt)\.tiktok\.com\/[A-Za-z0-9]+|(?:www\.)?tiktok\.com\/t\/[A-Za-z0-9]+)/i
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

export const DEFAULT_APP_ORIGIN = 'https://adhx.com'

export function isSupportedShareUrl(raw: string): boolean {
  if (/\s/.test(raw.trim())) return false
  const url = normalizeHttpUrl(raw)
  if (!url) return false
  if (TWITTER.test(url) || INSTAGRAM.test(url) || TIKTOK.test(url) || TIKTOK_SHORT.test(url)) {
    return true
  }
  return extractYouTubeId(url) !== null
}

/** First supported http(s) URL across tab / link / selected text. */
export function firstSupportedShareUrl(
  ...candidates: (string | null | undefined)[]
): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue
    const trimmed = candidate.trim()
    if (!/\s/.test(trimmed) && isSupportedShareUrl(trimmed)) {
      return normalizeHttpUrl(trimmed)
    }

    const embedded = trimmed.match(/https?:\/\/[^\s]+/i)
    if (embedded && isSupportedShareUrl(embedded[0])) return normalizeHttpUrl(embedded[0])
  }
  return null
}

export function shareTargetUrl(sourceUrl: string, origin = DEFAULT_APP_ORIGIN): string {
  const base = origin.replace(/\/$/, '')
  return `${base}/share?url=${encodeURIComponent(sourceUrl)}`
}

function normalizeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^\/\//.test(trimmed)) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null
  return `https://${trimmed}`
}

function extractYouTubeId(input: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(input.startsWith('http') ? input : `https://${input}`)
  } catch {
    return null
  }
  const host = parsed.hostname.replace(/^www\.|^m\./, '')
  if (host !== 'youtube.com') return null
  const path = parsed.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})(?:\/|$)/)
  return path && YOUTUBE_ID.test(path[1]) ? path[1] : null
}
