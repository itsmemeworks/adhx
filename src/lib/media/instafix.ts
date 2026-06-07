/**
 * Instagram Reel/post metadata — Instagram-direct (degraded, no video).
 *
 * History: ADHX used to resolve a streamable MP4 via InstaFix-style mirrors
 * (toinstagram.com / uuinstagram.com). Those mirrors are dead as of mid-2026 —
 * the upstream Wikidepia/InstaFix project was archived 2026-04-02 and the
 * forks now 302-redirect to instagram.com because Instagram cut off the
 * anonymous scraping they relied on. No drop-in replacement exists.
 *
 * What still works: Instagram's own pages serve OpenGraph tags to bots
 * (Twitterbot UA) — `og:image` (thumbnail), `og:title`/`og:description`
 * (caption + engagement), and `twitter:title` (author). It does NOT expose
 * `og:video`. So we degrade gracefully: poster + caption + author + a
 * link out to Instagram. No inline playback, no MP4 download.
 *
 * The `og:image` URL is a signed `*.cdninstagram.com` link that expires, so
 * callers that need a durable thumbnail should go through the thumbnail proxy
 * (`/api/media/instagram/thumbnail?id=`), which re-resolves it fresh.
 */

import { unstable_cache } from 'next/cache'
import { makeHostAllowlist } from '@/lib/media/proxy'

// Hosts we trust to serve a Reel thumbnail (SSRF allowlist for the proxy).
const ALLOWED_IMAGE_HOSTS = ['cdninstagram.com', 'fbcdn.net'] as const

const ID_PATTERN = /^[A-Za-z0-9_-]{5,20}$/

export interface ReelMetadata {
  /** Thumbnail URL on a `*.cdninstagram.com` host (signed, expiring). */
  imageUrl?: string
  /** Cleaned caption text. */
  caption?: string
  /** Raw `og:description` (e.g. "34K likes, 419 comments - user on …: caption"). */
  description?: string
  /** Instagram handle, e.g. `@username`. */
  author?: string
  /** Display name, e.g. "Penny Lane". */
  authorName?: string
}

/**
 * Whether a URL points at a trusted Instagram image host. Exact-match or
 * dot-prefixed subdomain (never `.includes()` — that's an SSRF footgun), https only.
 */
export const isAllowedImageUrl = makeHostAllowlist(
  ALLOWED_IMAGE_HOSTS.flatMap((host) => [host, `.${host}`]),
)

/** Validate a Reel id shape without hitting the network. */
export function isValidReelId(id: string): boolean {
  return ID_PATTERN.test(id)
}

/**
 * Resolve a Reel's poster + caption + author from Instagram's own OG tags.
 * Returns null only when the post is unavailable (private/removed) or
 * Instagram served nothing usable.
 *
 * Wrapped in `unstable_cache` (keyed by id, revalidate 3600) rather than per-fetch
 * `next.revalidate`: the scrape streams the response body with a manual reader and
 * early-bails at `</head>`, which the fetch-level Data Cache can't cache, so we
 * cache the resolved metadata instead. Repeat crawler hits to the same id reuse it.
 */
export const fetchReelMetadata = unstable_cache(
  async (id: string): Promise<ReelMetadata | null> => {
    if (!isValidReelId(id)) return null

    for (const path of [`/reel/${id}/`, `/p/${id}/`]) {
      const meta = await fetchFromInstagram(path)
      if (meta) return meta
    }
    return null
  },
  ['instagram-reel-metadata'],
  { revalidate: 3600 },
)

async function fetchFromInstagram(path: string): Promise<ReelMetadata | null> {
  try {
    const response = await fetch(`https://www.instagram.com${path}`, {
      signal: AbortSignal.timeout(8_000),
      // Instagram serves OG tags to recognised crawlers, not to plain browsers.
      headers: { 'User-Agent': 'Twitterbot/1.0', Accept: 'text/html' },
      redirect: 'follow',
    })

    if (!response.ok) return null
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) return null

    const reader = response.body?.getReader()
    if (!reader) return null

    // Instagram's HTML is ~800KB but the OG tags live in <head>; bail early.
    let html = ''
    const decoder = new TextDecoder()
    const maxBytes = 512 * 1024
    while (html.length < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      if (html.includes('</head>')) break
    }
    reader.cancel().catch(() => {})

    return parseInstagramOg(html)
  } catch {
    return null
  }
}

function parseInstagramOg(html: string): ReelMetadata | null {
  const rawImage = getMeta(html, 'og:image') || getMeta(html, 'twitter:image')
  const ogTitle = getMeta(html, 'og:title')
  const twitterTitle = getMeta(html, 'twitter:title')
  const description = getMeta(html, 'og:description') || getMeta(html, 'twitter:description')

  // Nothing usable → treat as unavailable.
  if (!rawImage && !ogTitle && !description) return null

  const imageUrl = rawImage && isAllowedImageUrl(rawImage) ? rawImage : undefined

  return {
    imageUrl,
    caption: parseCaption(ogTitle) || description,
    description,
    author: parseHandle(twitterTitle) || parseHandle(ogTitle) || parseHandle(description),
    authorName: parseDisplayName(twitterTitle) || parseDisplayName(ogTitle),
  }
}

/**
 * og:title is e.g. `Penny Lane on Instagram: "PLEASE VOTE FOR ME…"`.
 * Strip the `<name> on Instagram:` prefix and surrounding quotes.
 */
function parseCaption(ogTitle: string | undefined): string | undefined {
  if (!ogTitle) return undefined
  let s = ogTitle.replace(/^.*?\s+on Instagram:\s*/i, '').trim()
  // Strip wrapping quotes only when the whole caption is quoted — don't clip a
  // caption that merely ends with a quote (e.g. `say "hi"`).
  if (/^["“]/.test(s) && /["”]$/.test(s)) {
    s = s.slice(1, -1).trim()
  }
  return s || undefined
}

/** Pull an `@handle` out of an OG string. */
function parseHandle(text: string | undefined): string | undefined {
  if (!text) return undefined
  const m = text.match(/@([A-Za-z0-9._]+)/)
  return m ? `@${m[1]}` : undefined
}

/**
 * Display name from `twitter:title` ("Penny Lane (@handle) • Instagram reel")
 * or `og:title` ("Penny Lane on Instagram: …").
 */
function parseDisplayName(title: string | undefined): string | undefined {
  if (!title) return undefined
  const paren = title.match(/^(.+?)\s*\(@[A-Za-z0-9._]+\)/)
  if (paren) return paren[1].trim() || undefined
  const onIg = title.match(/^(.+?)\s+on Instagram:/i)
  if (onIg) return onIg[1].trim() || undefined
  return undefined
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
  return (
    str
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&#x2F;/gi, '/')
      // Numeric entities (emoji etc.) — IG captions are full of these.
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => codePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)))
      // Ampersand last, so it doesn't corrupt the entities above.
      .replace(/&amp;/g, '&')
  )
}

function codePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return ''
  try {
    return String.fromCodePoint(n)
  } catch {
    return ''
  }
}
