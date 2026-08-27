/**
 * Instagram post metadata — fetched directly from Instagram.
 *
 * History: ADHX used to resolve a streamable MP4 via InstaFix-style mirrors
 * (toinstagram.com / uuinstagram.com). Those mirrors are dead as of mid-2026 —
 * the upstream Wikidepia/InstaFix project was archived 2026-04-02 and the
 * forks now 302-redirect to instagram.com because Instagram cut off the
 * anonymous scraping they relied on. No drop-in replacement exists.
 *
 * Instagram serves a crawler-only Relay payload to Googlebot. Unlike the
 * OpenGraph fallback, it identifies image vs video posts and includes every
 * ordered carousel child. Video bytes still go through the vxinstagram MP4
 * registry (`src/lib/media/mirrors.ts`); this module only resolves metadata
 * and image/poster URLs.
 *
 * The `og:image` URL is a signed `*.cdninstagram.com` link that expires, so
 * callers that need a durable thumbnail should go through the thumbnail proxy
 * (`/api/media/instagram/thumbnail?id=`), which re-resolves it fresh.
 */

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { makeHostAllowlist } from '@/lib/media/proxy'
import { fetchWithTimeout } from '@/lib/utils/fetch-timeout'

// Hosts we trust to serve an Instagram image/poster (SSRF allowlist for the proxy).
const ALLOWED_IMAGE_HOSTS = ['cdninstagram.com', 'fbcdn.net'] as const

const ID_PATTERN = /^[A-Za-z0-9_-]{5,20}$/
const MAX_DOCUMENT_BYTES = 1_500_000
const MAX_DATA_SCRIPT_BYTES = 512_000
const MAX_JSON_NODES = 50_000

export interface InstagramMedia {
  type: 'photo' | 'video'
  /** Image itself for photos; poster for videos. Signed and expiring. */
  imageUrl?: string
  width?: number
  height?: number
  altText?: string
}

export interface InstagramMetadata {
  /** First image/poster, retained as the compatibility thumbnail field. */
  imageUrl?: string
  /** Cleaned caption text. */
  caption?: string
  /** Raw `og:description` (e.g. "34K likes, 419 comments - user on …: caption"). */
  description?: string
  /** Instagram handle, e.g. `@username`. */
  author?: string
  /** Display name, e.g. "Penny Lane". */
  authorName?: string
  /** Source publish time from the crawler payload. */
  takenAt?: string
  /** The stage/feed type for this post. Carousel containers are photo posts. */
  contentType: 'photo' | 'video'
  /** Ordered media children. Single posts contain one entry. */
  media: InstagramMedia[]
}

export type InstagramMetadataStatus =
  | { kind: 'resolved'; metadata: InstagramMetadata }
  | { kind: 'permanent-miss' }
  | { kind: 'transient-failure' }

export type InstagramPathHint = 'post' | 'reel'

/** @deprecated Use InstagramMetadata. Kept while callers migrate from Reel-only naming. */
export type ReelMetadata = InstagramMetadata
/** @deprecated Use InstagramMetadataStatus. */
export type ReelMetadataStatus = InstagramMetadataStatus

/**
 * Whether a URL points at a trusted Instagram image host. Exact-match or
 * dot-prefixed subdomain (never `.includes()` — that's an SSRF footgun), https only.
 */
export const isAllowedImageUrl = makeHostAllowlist(
  ALLOWED_IMAGE_HOSTS.flatMap((host) => [host, `.${host}`]),
)

/** Validate an Instagram shortcode without hitting the network. */
export function isValidInstagramId(id: string): boolean {
  return ID_PATTERN.test(id)
}

/** @deprecated Use isValidInstagramId. */
export const isValidReelId = isValidInstagramId

type InstagramResult =
  | { kind: 'resolved'; metadata: InstagramMetadata }
  | { kind: 'permanent-miss' }
  | { kind: 'transient-failure'; cause?: unknown }

class TransientInstagramMetadataError extends Error {
  constructor(cause?: unknown) {
    super('Instagram metadata scrape failed transiently', { cause })
    this.name = 'TransientInstagramMetadataError'
  }
}

/**
 * Resolve a post's media, caption, and author from Instagram's crawler payload.
 * Returns null only when the post is unavailable (private/removed) or
 * Instagram served nothing usable.
 *
 * Wrapped in `unstable_cache` (keyed by id + requested route shape, revalidate
 * 3600) rather than per-fetch `next.revalidate`: the scrape streams the response
 * body with a manual reader, which the fetch-level Data Cache can't cache, so we
 * cache the resolved metadata instead. Repeat crawler hits reuse that result.
 */
async function resolveInstagramMetadata(
  id: string,
  pathHint: InstagramPathHint,
): Promise<InstagramMetadata | null> {
  let sawTransientFailure = false
  let transientCause: unknown
  const paths = pathHint === 'post' ? [`/p/${id}/`, `/reel/${id}/`] : [`/reel/${id}/`, `/p/${id}/`]

  for (const path of paths) {
    const result = await fetchFromInstagram(path)
    if (result.kind === 'resolved') return result.metadata
    if (result.kind === 'transient-failure') {
      sawTransientFailure = true
      transientCause = result.cause
    }
  }

  // Cache a miss only when both canonical paths explicitly answer 404/410.
  if (sawTransientFailure) {
    throw new TransientInstagramMetadataError(transientCause)
  }
  return null
}

const fetchCachedInstagramMetadata = unstable_cache(
  (id: string, pathHint: InstagramPathHint): Promise<InstagramMetadata | null> =>
    resolveInstagramMetadata(id, pathHint),
  ['instagram-post-metadata-v3'],
  { revalidate: 3600 },
)

export async function fetchInstagramMetadataStatus(
  id: string,
  pathHint: InstagramPathHint = 'reel',
): Promise<InstagramMetadataStatus> {
  if (!isValidInstagramId(id)) return { kind: 'permanent-miss' }
  try {
    const metadata = await fetchCachedInstagramMetadata(id, pathHint)
    return metadata ? { kind: 'resolved', metadata } : { kind: 'permanent-miss' }
  } catch {
    return { kind: 'transient-failure' }
  }
}

/**
 * Request-scoped memoization shared by generateMetadata and the preview RSC.
 * Cross-request result caching remains owned by fetchCachedReelMetadata.
 */
export const getInstagramMetadataStatus = cache(fetchInstagramMetadataStatus)
/** @deprecated Use getInstagramMetadataStatus. */
export const getReelMetadataStatus = getInstagramMetadataStatus

/**
 * Preserve the public Metadata|null contract. Invalid input avoids the cache
 * and network; transient errors are caught only after escaping the callback.
 */
export async function fetchInstagramMetadata(
  id: string,
  pathHint: InstagramPathHint = 'reel',
): Promise<InstagramMetadata | null> {
  const result = await fetchInstagramMetadataStatus(id, pathHint)
  return result.kind === 'resolved' ? result.metadata : null
}

/** Bypass the cross-request cache when a signed CDN image URL has expired. */
export async function fetchFreshInstagramMetadata(
  id: string,
  pathHint: InstagramPathHint = 'reel',
): Promise<InstagramMetadata | null> {
  if (!isValidInstagramId(id)) return null
  try {
    return await resolveInstagramMetadata(id, pathHint)
  } catch {
    return null
  }
}

/** @deprecated Use fetchInstagramMetadata. */
export const fetchReelMetadata = fetchInstagramMetadata
/** @deprecated Use fetchInstagramMetadataStatus. */
export const fetchReelMetadataStatus = fetchInstagramMetadataStatus

async function fetchFromInstagram(path: string): Promise<InstagramResult> {
  try {
    const origin = (process.env.INSTAGRAM_OG_BASE?.trim() || 'https://www.instagram.com').replace(
      /\/$/,
      '',
    )
    const response = await fetchWithTimeout(`${origin}${path}`, 8_000, {
      // Googlebot receives the Relay payload containing media type + carousel
      // children. Twitterbot only receives OpenGraph's first image.
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        Accept: 'text/html',
      },
      redirect: 'follow',
    })

    if (response.status === 404 || response.status === 410) {
      return { kind: 'permanent-miss' }
    }
    if (!response.ok) return { kind: 'transient-failure' }
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) return { kind: 'transient-failure' }

    const reader = response.body?.getReader()
    if (!reader) return { kind: 'transient-failure' }

    // Crawler HTML is usually 650–900KB; the Relay payload appears after
    // <head>. Bound the read so an upstream response cannot grow without limit.
    let html = ''
    const decoder = new TextDecoder()
    let bytesRead = 0
    while (bytesRead < MAX_DOCUMENT_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      const remaining = MAX_DOCUMENT_BYTES - bytesRead
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value
      bytesRead += chunk.byteLength
      html += decoder.decode(chunk, { stream: true })
      if (value.byteLength > remaining) break
    }
    reader.cancel().catch(() => {})

    const id = path.split('/').filter(Boolean).at(-1)
    const metadata = parseInstagramDocument(html, id, path)
    return metadata
      ? { kind: 'resolved', metadata }
      : // A 200 without usable tags may be a bot challenge, truncation, or a
        // changed document shape; it is not evidence that the post is gone.
        { kind: 'transient-failure' }
  } catch (cause) {
    return { kind: 'transient-failure', cause }
  }
}

export function parseInstagramDocument(
  html: string,
  expectedId?: string,
  requestedPath = '/p/',
): InstagramMetadata | null {
  const rich = parseInstagramRelay(html, expectedId)
  if (rich) return rich
  return parseInstagramOg(html, requestedPath)
}

interface RawInstagramMedia {
  code?: unknown
  media_type?: unknown
  __typename?: unknown
  if_not_gated_logged_out?: unknown
  user?: unknown
  caption?: unknown
  carousel_media?: unknown
  display_uri?: unknown
  image_versions2?: unknown
  original_width?: unknown
  original_height?: unknown
  accessibility_caption?: unknown
  taken_at?: unknown
}

function parseInstagramRelay(html: string, expectedId?: string): InstagramMetadata | null {
  const scriptPattern = /<script[^>]*\bdata-sjs\b[^>]*>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(scriptPattern)) {
    const json = match[1]
    if (
      !json ||
      json.length > MAX_DATA_SCRIPT_BYTES ||
      !json.includes('xig_polaris_media') ||
      (expectedId && !json.includes(`"code":"${expectedId}"`))
    ) {
      continue
    }

    try {
      const raw = findInstagramMedia(JSON.parse(json), expectedId)
      const parsed = raw && metadataFromRelay(raw)
      if (parsed) return parsed
    } catch {
      // A changed/malformed hydration script should fall back to OpenGraph,
      // not make an otherwise usable public post disappear.
    }
  }
  return null
}

function findInstagramMedia(root: unknown, expectedId?: string): RawInstagramMedia | null {
  const queue: unknown[] = [root]
  let visited = 0

  while (queue.length > 0 && visited < MAX_JSON_NODES) {
    const value = queue.pop()
    visited += 1
    if (!value || typeof value !== 'object') continue

    const candidate = value as RawInstagramMedia
    if (
      typeof candidate.code === 'string' &&
      (!expectedId || candidate.code === expectedId) &&
      candidate.if_not_gated_logged_out &&
      typeof candidate.if_not_gated_logged_out === 'object'
    ) {
      return candidate.if_not_gated_logged_out as RawInstagramMedia
    }

    for (const child of Object.values(value)) queue.push(child)
  }
  return null
}

function metadataFromRelay(raw: RawInstagramMedia): InstagramMetadata | null {
  const user = objectValue(raw.user)
  const caption = objectValue(raw.caption)
  const carousel = Array.isArray(raw.carousel_media) ? raw.carousel_media : null
  const sourceMedia = carousel?.length ? carousel : [raw]
  const media = sourceMedia
    .map((item) => mediaFromRelay(objectValue(item)))
    .filter((item): item is InstagramMedia => item !== null)

  if (media.length === 0) return null

  const isVideo = raw.media_type === 2 || raw.__typename === 'XIGPolarisVideoMedia'
  const takenAtSeconds = numberValue(raw.taken_at)
  const author = stringValue(user?.username)

  return {
    imageUrl: media[0]?.imageUrl,
    caption: stringValue(caption?.text),
    author: author ? `@${author}` : undefined,
    authorName: stringValue(user?.full_name),
    takenAt: takenAtSeconds ? new Date(takenAtSeconds * 1000).toISOString() : undefined,
    contentType: isVideo ? 'video' : 'photo',
    media,
  }
}

function mediaFromRelay(raw: Record<string, unknown> | null): InstagramMedia | null {
  if (!raw) return null
  const type =
    raw.media_type === 2 || raw.__typename === 'XIGPolarisVideoMedia'
      ? 'video'
      : raw.media_type === 1 || raw.__typename === 'XIGPolarisImageMedia'
        ? 'photo'
        : null
  if (!type) return null

  const imageVersions = objectValue(raw.image_versions2)
  const candidates = Array.isArray(imageVersions?.candidates) ? imageVersions.candidates : []
  const bestCandidate = candidates
    .map((candidate) => objectValue(candidate))
    .map((candidate) => ({
      url: stringValue(candidate?.url),
      width: numberValue(candidate?.width) ?? 0,
      height: numberValue(candidate?.height) ?? 0,
    }))
    .filter((candidate) => !!candidate.url && isAllowedImageUrl(candidate.url))
    .sort((a, b) => b.width * b.height - a.width * a.height)[0]
  const displayUrl = stringValue(raw.display_uri)
  const imageUrl =
    bestCandidate?.url || (displayUrl && isAllowedImageUrl(displayUrl) ? displayUrl : undefined)
  if (type === 'photo' && !imageUrl) return null

  return {
    type,
    imageUrl,
    width: numberValue(raw.original_width),
    height: numberValue(raw.original_height),
    altText: stringValue(raw.accessibility_caption),
  }
}

function parseInstagramOg(html: string, requestedPath: string): InstagramMetadata | null {
  const rawImage = getMeta(html, 'og:image') || getMeta(html, 'twitter:image')
  const ogTitle = getMeta(html, 'og:title')
  const twitterTitle = getMeta(html, 'twitter:title')
  const description = getMeta(html, 'og:description') || getMeta(html, 'twitter:description')
  const canonicalUrl = getMeta(html, 'og:url')

  // Nothing usable → treat as unavailable.
  if (!rawImage && !ogTitle && !description) return null

  const imageUrl = rawImage && isAllowedImageUrl(rawImage) ? rawImage : undefined
  const titleText = `${twitterTitle || ''} ${ogTitle || ''}`
  const contentType =
    /\bInstagram reel\b/i.test(titleText) ||
    /\/reels?\//i.test(canonicalUrl || '') ||
    (!canonicalUrl && /^\/reels?\//i.test(requestedPath))
      ? 'video'
      : 'photo'

  return {
    imageUrl,
    caption: parseCaption(ogTitle) || description,
    description,
    author: parseHandle(twitterTitle) || parseHandle(ogTitle) || parseHandle(description),
    authorName: parseDisplayName(twitterTitle) || parseDisplayName(ogTitle),
    contentType,
    media: imageUrl ? [{ type: contentType, imageUrl }] : [],
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
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
