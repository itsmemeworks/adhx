/**
 * Instagram metadata via InstaFix-style mirrors.
 *
 * Instagram has no public JSON API for Reel content. InstaFix mirrors
 * (toinstagram.com, uuinstagram.com, and forks) serve HTML with OpenGraph
 * tags — the Instagram analog of FxTwitter.
 *
 * Two real-world quirks this module handles:
 *
 * 1. The `og:video` URL is **relative** (e.g. `/videos/{id}/1`) and points
 *    back to the mirror's own streaming endpoint. Direct Instagram CDN URLs
 *    return 403 to any client that isn't Instagram-authenticated, so we have
 *    no choice but to proxy through the mirror.
 *
 * 2. InstaFix has a known issue where `/reel/` variants sometimes fail to
 *    render while `/p/` works (upstream issue #93), so we try both per
 *    mirror before falling through.
 *
 * The upstream project (Wikidepia/InstaFix) was archived 2026-04-02 and
 * individual mirrors come and go. We treat any video URL not on our trust
 * list as hostile (SSRF guard).
 */

// Ordered by observed reliability as of 2026-04-21.
const MIRRORS = ['https://toinstagram.com', 'https://uuinstagram.com'] as const

// Hosts we trust to return a streamable MP4. Direct CDN hosts are here for
// completeness (some mirrors do serve direct links), but in practice the
// mirror's own /videos/ proxy is what works.
const ALLOWED_VIDEO_HOSTS = [
  'cdninstagram.com',
  'fbcdn.net',
  'toinstagram.com',
  'uuinstagram.com',
] as const

const ID_PATTERN = /^[A-Za-z0-9_-]{5,20}$/

export interface ReelMetadata {
  /** A streamable URL — either an Instagram CDN link or a trusted mirror's video proxy. */
  videoUrl: string
  imageUrl?: string
  title?: string
  description?: string
  /** Instagram handle, e.g. `@username`, when the mirror exposes it. */
  author?: string
}

/**
 * Whether a URL points at a trusted video source — either Meta's CDN or
 * one of the mirror video proxies. Exact-match or dot-prefixed subdomain
 * (never `.includes()` — that's an SSRF footgun).
 */
export function isAllowedVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    return ALLOWED_VIDEO_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    )
  } catch {
    return false
  }
}

/** Validate a Reel id shape without hitting the network. */
export function isValidReelId(id: string): boolean {
  return ID_PATTERN.test(id)
}

/**
 * Resolve a Reel's direct video URL + metadata via an InstaFix mirror.
 *
 * We try `/p/` first (more reliable per upstream issue #93), then `/reels/`,
 * per mirror. First mirror that yields a trusted video URL wins.
 */
export async function fetchReelMetadata(id: string): Promise<ReelMetadata | null> {
  if (!isValidReelId(id)) return null

  for (const mirror of MIRRORS) {
    for (const path of [`/p/${id}`, `/reels/${id}`]) {
      const meta = await tryMirror(mirror, path)
      if (meta) return meta
    }
  }
  return null
}

async function tryMirror(mirror: string, path: string): Promise<ReelMetadata | null> {
  try {
    const response = await fetch(`${mirror}${path}`, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        'User-Agent': 'Twitterbot/1.0',
        Accept: 'text/html',
      },
      redirect: 'follow',
    })

    if (!response.ok) return null
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) return null

    const reader = response.body?.getReader()
    if (!reader) return null

    let html = ''
    const decoder = new TextDecoder()
    const maxBytes = 256 * 1024
    while (html.length < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      if (html.includes('</head>')) break
    }
    reader.cancel().catch(() => {})

    return parseReelOg(html, mirror)
  } catch {
    return null
  }
}

function parseReelOg(html: string, mirrorOrigin: string): ReelMetadata | null {
  const rawVideo =
    getMeta(html, 'og:video:secure_url') ||
    getMeta(html, 'og:video') ||
    getMeta(html, 'twitter:player:stream')

  if (!rawVideo) return null

  // Mirror OG tags typically use a path like `/videos/{id}/1` — resolve
  // against the mirror origin so the caller gets an absolute URL.
  const resolved = resolveAgainstOrigin(rawVideo, mirrorOrigin)
  if (!resolved || !isAllowedVideoUrl(resolved)) return null

  return {
    videoUrl: resolved,
    imageUrl: pickAbsolute(
      getMeta(html, 'og:image') || getMeta(html, 'twitter:image'),
      mirrorOrigin,
    ),
    title: getMeta(html, 'og:title') || getMeta(html, 'twitter:title'),
    description: getMeta(html, 'og:description') || getMeta(html, 'twitter:description'),
    author: parseAuthor(getMeta(html, 'twitter:title')),
  }
}

function resolveAgainstOrigin(url: string, origin: string): string | null {
  try {
    return new URL(url, origin).toString()
  } catch {
    return null
  }
}

function pickAbsolute(url: string | undefined, origin: string): string | undefined {
  if (!url) return undefined
  const resolved = resolveAgainstOrigin(url, origin)
  return resolved || undefined
}

function parseAuthor(twitterTitle: string | undefined): string | undefined {
  if (!twitterTitle) return undefined
  const match = twitterTitle.match(/@([A-Za-z0-9._]+)/)
  return match ? `@${match[1]}` : undefined
}

function getMeta(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']` +
      `|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
    'i',
  )
  const match = html.match(pattern)
  if (!match) return undefined
  return decodeHtmlEntities(match[1] || match[2])
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
}
