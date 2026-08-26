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

import { unstable_cache } from 'next/cache'
import { makeHostAllowlist, buildAllowlistedUrl } from '@/lib/media/proxy'
import { decodeHtmlEntities } from '@/lib/utils/html-entities'
import { fetchWithTimeout } from '@/lib/utils/fetch-timeout'

const MIRRORS = [
  (process.env.TNKTOK_API_BASE?.trim() || 'https://tnktok.com').replace(/\/$/, ''),
] as const

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
 * (never `.includes()` — that's the classic SSRF footgun), https only.
 */
export const isAllowedVideoUrl = makeHostAllowlist(
  ALLOWED_VIDEO_HOSTS.flatMap((host) => [host, `.${host}`]),
)

/** Hostname is tiktok.com or a subdomain of it (never `.includes()`). */
function isTikTokHost(hostname: string): boolean {
  return hostname === 'tiktok.com' || hostname.endsWith('.tiktok.com')
}

/**
 * Allowlist hosts for `resolveTikTokUrl`'s redirect-following fetches.
 *
 * All EXACT hosts, deliberately — the short-link resolver only ever deals
 * with the small, known TikTok share-link family (bare domain, `www.`, `m.`,
 * and the `vm.`/`vt.` short-link hosts), so every one of these can be
 * enumerated instead of falling back to a `.tiktok.com` wildcard. That keeps
 * `buildAllowlistedUrl` on its exact-match branch, where the rebuilt fetch
 * URL's host is one of these string literals rather than anything derived
 * from the input — the barrier shape static analysis actually recognizes.
 */
const TIKTOK_HOSTS = [
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
]

/** Canonical `@handle/video/{id}` anywhere in a string. */
const CANONICAL_RE = /tiktok\.com\/@([A-Za-z0-9._]{1,30})\/video\/(\d{6,25})/i

/**
 * Short links carry a shortcode, not the video id:
 *   vm.tiktok.com/ZNRvLPpVV   vt.tiktok.com/...   www.tiktok.com/t/{code}
 * They 30x-redirect to the canonical `@user/video/{id}` URL.
 */
export function isTikTokShortLink(input: string): boolean {
  try {
    const u = new URL(input.startsWith('http') ? input : `https://${input}`)
    if (!isTikTokHost(u.hostname)) return false
    return /^(vm|vt)\./i.test(u.hostname) || /^\/t\/[A-Za-z0-9]+/i.test(u.pathname)
  } catch {
    return false
  }
}

/**
 * Resolve any TikTok URL (canonical or short link) to `{ handle, videoId }`.
 *
 * Canonical URLs are parsed without a network call. Short links are followed
 * via manual redirects; every hop must stay on a tiktok.com host (SSRF guard),
 * and we cap the chain so a redirect loop can't hang the request.
 */
export async function resolveTikTokUrl(
  input: string,
): Promise<{ handle: string; videoId: string } | null> {
  const direct = input.match(CANONICAL_RE)
  if (direct) return { handle: direct[1], videoId: direct[2] }

  // `buildAllowlistedUrl` parses the input, validates the host against
  // `TIKTOK_HOSTS`, and returns a URL string REBUILT from the validated
  // parsed components — not the raw input — so every fetch target below is
  // provably derived from a checked host, never straight from user input.
  let current = buildAllowlistedUrl(
    input.startsWith('http') ? input : `https://${input}`,
    TIKTOK_HOSTS,
  )
  if (!current) return null

  for (let hop = 0; hop < 5; hop++) {
    let res: Response
    try {
      res = await fetchWithTimeout(current, 8_000, {
        method: 'GET',
        redirect: 'manual',
        // A browser-ish UA — TikTok serves a bot challenge to obvious crawlers.
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ADHXBot/1.0)' },
      })
    } catch {
      return null
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return null
      let nextAbsolute: string
      try {
        nextAbsolute = new URL(loc, current).toString()
      } catch {
        return null
      }
      // don't follow off-platform — same validate-then-rebuild as above
      const safeNext = buildAllowlistedUrl(nextAbsolute, TIKTOK_HOSTS)
      if (!safeNext) return null
      const m = safeNext.match(CANONICAL_RE)
      if (m) return { handle: m[1], videoId: m[2] }
      current = safeNext
      continue
    }

    // Landed on a non-redirect; canonical may be in the final URL.
    const m = current.match(CANONICAL_RE)
    return m ? { handle: m[1], videoId: m[2] } : null
  }
  return null
}

export function isValidUsername(username: string): boolean {
  // Accept with or without leading `@`
  const trimmed = username.startsWith('@') ? username.slice(1) : username
  return USERNAME_PATTERN.test(trimmed)
}

export function isValidVideoId(id: string): boolean {
  return ID_PATTERN.test(id)
}

type MirrorResult =
  | { kind: 'resolved'; metadata: TikTokMetadata }
  | { kind: 'permanent-miss' }
  | { kind: 'transient-failure'; cause?: unknown }

class TransientTikTokMetadataError extends Error {
  constructor(cause?: unknown) {
    super('TikTok metadata mirror failed transiently', { cause })
    this.name = 'TransientTikTokMetadataError'
  }
}

/**
 * Resolve a TikTok video's direct MP4 URL + metadata via a TnkTok mirror.
 *
 * Wrapped in `unstable_cache` (keyed by username+id, revalidate 3600) rather than
 * per-fetch `next.revalidate`: the mirror scrape streams the response body with a
 * manual reader and early-bails at `</head>`, which the fetch-level Data Cache
 * can't cache, so we cache the resolved metadata instead. Repeat crawler hits to
 * the same id reuse it.
 */
const fetchCachedTikTokMetadata = unstable_cache(
  async (username: string, videoId: string): Promise<TikTokMetadata | null> => {
    const handle = username.startsWith('@') ? username.slice(1) : username
    let sawTransientFailure = false
    let transientCause: unknown

    for (const mirror of MIRRORS) {
      const result = await tryMirror(`${mirror}/@${handle}/video/${videoId}`)
      if (result.kind === 'resolved') return result.metadata
      if (result.kind === 'transient-failure') {
        sawTransientFailure = true
        transientCause = result.cause
      }
    }

    // Throw from inside the cache callback so a temporary mirror failure is
    // never persisted as the one-hour negative result.
    if (sawTransientFailure) {
      throw new TransientTikTokMetadataError(transientCause)
    }
    return null
  },
  ['tiktok-video-metadata'],
  { revalidate: 3600 },
)

/**
 * Public compatibility wrapper: callers still receive Metadata|null. Invalid
 * input bypasses both the cache and network; transient failures are caught only
 * after they have escaped the cache callback.
 */
export async function fetchTikTokMetadata(
  username: string,
  videoId: string,
): Promise<TikTokMetadata | null> {
  if (!isValidUsername(username) || !isValidVideoId(videoId)) return null

  try {
    return await fetchCachedTikTokMetadata(username, videoId)
  } catch {
    return null
  }
}

async function tryMirror(url: string): Promise<MirrorResult> {
  try {
    const response = await fetchWithTimeout(url, 8_000, {
      headers: { 'User-Agent': 'Twitterbot/1.0', Accept: 'text/html' },
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

    let html = ''
    const decoder = new TextDecoder()
    const maxBytes = 256 * 1024
    let bytesRead = 0
    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      const remaining = maxBytes - bytesRead
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value
      bytesRead += chunk.byteLength
      html += decoder.decode(chunk, { stream: true })
      if (html.includes('</head>')) break
      if (value.byteLength > remaining) break
    }
    reader.cancel().catch(() => {})

    const metadata = parseTikTokOg(html)
    return metadata
      ? { kind: 'resolved', metadata }
      : // A 200 without usable OG data can be a truncated/challenge response
        // or a changed mirror template, so it is not proof of permanent absence.
        { kind: 'transient-failure' }
  } catch (cause) {
    return { kind: 'transient-failure', cause }
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
