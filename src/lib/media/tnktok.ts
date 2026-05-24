/**
 * TikTok video metadata via TnkTok / fxTikTok mirrors.
 *
 * TikTok has no public JSON API for arbitrary videos. fxTikTok-style mirrors
 * (`tnktok.com`) serve HTML with OpenGraph tags including a direct MP4 URL —
 * same pattern as FxTwitter and InstaFix. The mirror's `/generate/video/{id}.mp4`
 * endpoint 302-redirects to the real TikTok CDN with proper signing.
 *
 * vxtiktok.com is dead ("Due to a legal request, this service is no longer
 * available."), so the mirror list is short. Direct TikTok CDN URLs work for
 * GET (unlike Instagram's 403-gated CDN), so we can stream straight through.
 */

const MIRRORS = ['https://tnktok.com'] as const

const ALLOWED_VIDEO_HOSTS = [
  // Mirror video endpoint (redirects to TikTok CDN)
  'tnktok.com',
  // TikTok CDN domains the mirror 302's to
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
] as const

const USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/
const ID_PATTERN = /^\d{6,25}$/

export interface TikTokMetadata {
  videoUrl: string
  title?: string
  description?: string
  /** Display name parsed from `og:title` (e.g. "Sophie Rain"). */
  authorName?: string
  /** Handle from `twitter:creator` (e.g. "@sophieraiin"). */
  author?: string
}

/**
 * SSRF allowlist for the streaming proxy. Exact-match or dot-prefixed subdomain
 * (never `.includes()` — that's the classic SSRF footgun).
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

export function isValidUsername(username: string): boolean {
  // Accept with or without leading `@`
  const trimmed = username.startsWith('@') ? username.slice(1) : username
  return USERNAME_PATTERN.test(trimmed)
}

export function isValidVideoId(id: string): boolean {
  return ID_PATTERN.test(id)
}

/**
 * Resolve a TikTok video's direct MP4 URL + metadata via a TnkTok mirror.
 */
export async function fetchTikTokMetadata(
  username: string,
  videoId: string,
): Promise<TikTokMetadata | null> {
  if (!isValidUsername(username) || !isValidVideoId(videoId)) return null
  const handle = username.startsWith('@') ? username.slice(1) : username

  for (const mirror of MIRRORS) {
    const meta = await tryMirror(`${mirror}/@${handle}/video/${videoId}`)
    if (meta) return meta
  }
  return null
}

async function tryMirror(url: string): Promise<TikTokMetadata | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { 'User-Agent': 'Twitterbot/1.0', Accept: 'text/html' },
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

    return parseTikTokOg(html)
  } catch {
    return null
  }
}

function parseTikTokOg(html: string): TikTokMetadata | null {
  const videoUrl =
    getMeta(html, 'og:video') ||
    getMeta(html, 'twitter:player:stream') ||
    getMeta(html, 'twitter:player')

  if (!videoUrl || !isAllowedVideoUrl(videoUrl)) return null

  const rawTitle = getMeta(html, 'og:title') || getMeta(html, 'twitter:title')
  const author =
    getMeta(html, 'twitter:creator') ||
    getMeta(html, 'twitter:site') ||
    parseHandleFromTitle(rawTitle)

  return {
    videoUrl,
    title: rawTitle,
    description: getMeta(html, 'og:description') || getMeta(html, 'twitter:description'),
    authorName: stripHandleFromTitle(rawTitle),
    author,
  }
}

/** tnktok's og:title is e.g. "Sophie Rain (@sophieraiin)" — extract the @handle. */
function parseHandleFromTitle(title: string | undefined): string | undefined {
  if (!title) return undefined
  const m = title.match(/@([A-Za-z0-9._]+)/)
  return m ? `@${m[1]}` : undefined
}

/** Strip "(@handle)" suffix from og:title to get just the display name. */
function stripHandleFromTitle(title: string | undefined): string | undefined {
  if (!title) return undefined
  return title.replace(/\s*\(@[A-Za-z0-9._]+\)\s*$/, '').trim() || undefined
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
