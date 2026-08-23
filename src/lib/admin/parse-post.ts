import { detectPlatformPost, type PlatformId, type PlatformPost } from '@/lib/platform/url'

const PREVIEW_PATHS: Array<{
  re: RegExp
  platform: PlatformId
  id: (m: RegExpMatchArray) => string
  author?: (m: RegExpMatchArray) => string
}> = [
  {
    re: /^\/(\w{1,15})\/status\/(\d+)\/?$/i,
    platform: 'twitter',
    id: (m) => m[2],
    author: (m) => m[1],
  },
  { re: /^\/reels?\/([A-Za-z0-9_-]+)\/?$/i, platform: 'instagram', id: (m) => m[1] },
  {
    re: /^\/@([A-Za-z0-9._]{1,30})\/video\/(\d{6,25})\/?$/i,
    platform: 'tiktok',
    id: (m) => m[2],
    author: (m) => m[1],
  },
  { re: /^\/shorts\/([A-Za-z0-9_-]{11})\/?$/i, platform: 'youtube', id: (m) => m[1] },
]

const SHORTHAND = /^(twitter|instagram|tiktok|youtube)\s*[:/]\s*(\S+)$/i

function pathFromInput(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('/')) return trimmed.split('?')[0]
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    return url.pathname
  } catch {
    return null
  }
}

/**
 * Accept a source URL, an on-ADHX preview path/URL, or `platform:id`.
 */
export function parseAdminPostRef(raw: string): PlatformPost | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const detected = detectPlatformPost(trimmed)
  if (detected) return detected

  const shorthand = trimmed.match(SHORTHAND)
  if (shorthand) {
    const platform = shorthand[1].toLowerCase() as PlatformId
    const id = shorthand[2]
    return { platform, id, previewPath: `/${platform}/${id}` }
  }

  const path = pathFromInput(trimmed)
  if (!path) return null
  for (const spec of PREVIEW_PATHS) {
    const m = path.match(spec.re)
    if (!m) continue
    const id = spec.id(m)
    const author = spec.author?.(m)
    return {
      platform: spec.platform,
      id,
      author,
      previewPath: path,
    }
  }
  return null
}
