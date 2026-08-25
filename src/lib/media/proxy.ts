/**
 * Shared helper for the media proxy routes — an SSRF allowlist factory.
 *
 * The video/photo proxies all fetch third-party CDN URLs (Twitter, TikTok)
 * server-side to bypass CORS / 403 blocks. Every one of them must validate the
 * upstream host with an EXACT match or a dot-prefixed suffix, NEVER
 * `.includes()` (which would allow `evil.twimg.com.attacker.com`). This factory
 * captures that rule once so it can't drift across the proxies that use it.
 */

/**
 * Build an SSRF allowlist predicate from a list of trusted hosts.
 *
 * Each entry is either an exact hostname (e.g. `'video.twimg.com'`) or a
 * dot-prefixed suffix (e.g. `'.twimg.com'`) matching that domain's subdomains.
 *
 * The returned predicate parses the URL, requires `https:`, and accepts the
 * host only on an exact match or a `hostname.endsWith(suffix)` match. It never
 * uses `.includes()` and returns `false` on any parse error.
 *
 * @param hosts Exact hosts (`'video.twimg.com'`) and/or suffixes (`'.twimg.com'`).
 * @returns A `(url: string) => boolean` predicate safe for SSRF gating.
 */
export function makeHostAllowlist(hosts: string[]): (url: string) => boolean {
  return (url: string): boolean => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:') return false
      return hosts.some((host) =>
        host.startsWith('.') ? parsed.hostname.endsWith(host) : parsed.hostname === host,
      )
    } catch {
      return false
    }
  }
}

/**
 * Validate `input` against `hosts` (same rule as `makeHostAllowlist`: https
 * only, exact host or dot-prefixed subdomain match) and, on success, return a
 * URL string REBUILT from validated components — never the original input
 * string.
 *
 * Two tiers, in order:
 *
 * 1. EXACT host match: the rebuilt URL's host is the matching *array element
 *    of `hosts` itself* — a hardcoded string literal from the caller's
 *    allowlist constant, never a value copied from `parsed.hostname`. This is
 *    the barrier shape CodeQL's request-forgery query actually recognizes
 *    (proven by the `fxembed.ts` `fetchTweetData` fix: a constant host with
 *    only path/query built from validated input) — a boolean-returning
 *    predicate like `makeHostAllowlist(...)` does NOT sever the taint on a
 *    fetch URL built from `parsed.hostname`, because the check only gates
 *    *whether* the fetch happens, not *what* string flows into it.
 * 2. DOT-SUFFIX (wildcard subdomain) match: the leaf label truly is
 *    caller-controlled (that's the point of a wildcard entry — the API
 *    doesn't know every real subdomain in advance, e.g. `api.twitter.com`
 *    under `.twitter.com`), so it can't be swapped for a constant. It's
 *    instead validated with an anchored hostname-label regex and spliced in
 *    front of the constant suffix. This narrows but does not fully eliminate
 *    the taint a static analyzer will see on this branch — the label itself
 *    is still derived from `input`. Prefer exact entries in `hosts` wherever
 *    the real set of upstream hosts is small and enumerable.
 *
 * Returns `null` when the URL fails to parse, isn't `https:`, or its host
 * isn't in the allowlist.
 */
export function buildAllowlistedUrl(input: string, hosts: string[]): string | null {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null

  const exactHost = hosts.find((host) => !host.startsWith('.') && host === parsed.hostname)
  if (exactHost) {
    return `https://${exactHost}${parsed.pathname}${parsed.search}`
  }

  const suffix = hosts.find((host) => host.startsWith('.') && parsed.hostname.endsWith(host))
  if (suffix) {
    const label = parsed.hostname.slice(0, parsed.hostname.length - suffix.length)
    if (
      label.length > 0 &&
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(
        label,
      )
    ) {
      return `https://${label}${suffix}${parsed.pathname}${parsed.search}`
    }
  }

  return null
}

/**
 * Twitter media CDN hosts (video + image). Each base host is listed in both its
 * exact and dot-prefixed-subdomain form, matching the `host === d || host
 * endsWith('.'+d)` checks the video proxies previously hand-rolled.
 */
export const TWITTER_MEDIA_HOSTS = [
  'video.twimg.com',
  '.video.twimg.com',
  'pbs.twimg.com',
  '.pbs.twimg.com',
  'abs.twimg.com',
  '.abs.twimg.com',
]

/** SSRF allowlist for Twitter video/image CDN URLs (`*.twimg.com`). */
export const isAllowedTwitterMediaUrl = makeHostAllowlist(TWITTER_MEDIA_HOSTS)

/**
 * Hosts allowed for the HLS playlist/segment proxies. Broader than
 * `TWITTER_MEDIA_HOSTS` (any `*.twimg.com` subdomain, plus `twitter.com` for
 * playlist URLs that reference it) — this reproduces the hand-rolled checks
 * the HLS routes used before they were migrated to `makeHostAllowlist`.
 */
export const TWITTER_HLS_HOSTS = ['video.twimg.com', '.twimg.com', 'twitter.com', '.twitter.com']

/** SSRF allowlist for Twitter HLS playlist/segment URLs. HTTPS-only. */
export const isAllowedHlsUrl = makeHostAllowlist(TWITTER_HLS_HOSTS)

/**
 * Validate a Twitter handle (1–15 word chars). Used to sanitise the
 * user-provided `author` query param before it's interpolated into the
 * FxTwitter API URL, so a malicious value can't steer the server-side request.
 */
export function isValidTweetAuthor(author: string): boolean {
  return /^[A-Za-z0-9_]{1,15}$/.test(author)
}

/** Validate a numeric tweet/status id (sanitises the `tweetId` query param). */
export function isValidTweetId(tweetId: string): boolean {
  return /^\d+$/.test(tweetId)
}

/**
 * Build the inline, range-aware streaming `Response` shared by the video
 * proxies. Copies through the upstream status (200/206) and the standard
 * streaming headers (Content-Type, Accept-Ranges, Cache-Control, and
 * Content-Length / Content-Range when present).
 *
 * Forward the incoming `Range` header on the upstream fetch yourself; this
 * helper only mirrors the upstream response back to the client.
 *
 * `opts.contentType`, when given, OVERRIDES the upstream Content-Type — use it
 * when a mirror/CDN mislabels an MP4 (e.g. `application/octet-stream`) so the
 * `<video>` element still recognises it. Otherwise the upstream type is used.
 */
export function streamingResponse(
  upstream: Response,
  opts?: { cacheControl?: string; contentType?: string },
): Response {
  const headers: Record<string, string> = {
    'Content-Type': opts?.contentType || upstream.headers.get('content-type') || 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': opts?.cacheControl ?? 'public, max-age=3600',
  }

  const contentLength = upstream.headers.get('content-length')
  if (contentLength) headers['Content-Length'] = contentLength

  const contentRange = upstream.headers.get('content-range')
  if (contentRange) headers['Content-Range'] = contentRange

  return new Response(upstream.body, { status: upstream.status, headers })
}

/**
 * Build an attachment `Response` shared by the video download proxies. Sets
 * `Content-Disposition: attachment` with the given filename and passes through
 * `Content-Length` (for download-progress UI) when the upstream provides it.
 */
export function downloadResponse(upstream: Response, filename: string): Response {
  const headers = new Headers()
  headers.set('Content-Type', 'video/mp4')
  headers.set('Content-Disposition', `attachment; filename="${filename}"`)

  const contentLength = upstream.headers.get('Content-Length')
  if (contentLength) headers.set('Content-Length', contentLength)

  return new Response(upstream.body, { headers })
}

/**
 * Build an attachment `Response` for an image download (the `downloadResponse`
 * counterpart for images — unlike video downloads, the upstream Content-Type
 * varies by format, so it's passed through instead of hardcoded).
 */
export function imageDownloadResponse(
  upstream: Response,
  filename: string,
  fallbackContentType = 'image/jpeg',
): Response {
  const headers = new Headers()
  headers.set('Content-Type', upstream.headers.get('content-type') || fallbackContentType)
  headers.set('Content-Disposition', `attachment; filename="${filename}"`)

  const contentLength = upstream.headers.get('content-length')
  if (contentLength) headers.set('Content-Length', contentLength)

  return new Response(upstream.body, { headers })
}

/**
 * A tweet FxTwitter reports as gone (401 for a deleted/suspended/private
 * account, 404 for a deleted tweet) is gone for everyone, not a transient
 * proxy error — that's the distinction from a 5xx/429 FxTwitter hiccup, which
 * keeps the existing throw-and-500 behavior. Cached negatively (separately
 * from each route's positive URL/info cache) so retries and repeat viewers of
 * a dead tweet across the three FxTwitter-resolving video routes (video,
 * video/info, video/download) don't keep re-hitting FxTwitter for content
 * that will never come back. Shorter TTL than the positive caches (1h) since
 * a suspended account or a mistaken removal can be reversed.
 */
const GONE_TWEET_CACHE_TTL = 10 * 60 * 1000 // 10 minutes
const goneTweetCache = new Map<string, number>()

/** FxTwitter's "this content is gone" statuses. */
export function isFxTwitterGoneStatus(status: number): boolean {
  return status === 401 || status === 404
}

/** Has `key` (`${author}/${tweetId}`) been recently marked gone? */
export function isTweetGoneCached(key: string): boolean {
  const ts = goneTweetCache.get(key)
  if (ts === undefined) return false
  if (Date.now() - ts > GONE_TWEET_CACHE_TTL) {
    goneTweetCache.delete(key)
    return false
  }
  return true
}

/** Record that FxTwitter reported `key` (`${author}/${tweetId}`) as gone. */
export function markTweetGone(key: string): void {
  goneTweetCache.set(key, Date.now())

  if (goneTweetCache.size > 1000) {
    const now = Date.now()
    for (const [k, ts] of goneTweetCache.entries()) {
      if (now - ts > GONE_TWEET_CACHE_TTL) {
        goneTweetCache.delete(k)
      }
    }
  }
}

/**
 * 410 Gone response for a tweet FxTwitter reports as deleted/private/
 * suspended — distinct from the generic 500 thrown for an actual proxy
 * error, so clients (and Sentry) can tell "will never load" from "broken".
 */
export function goneResponse(reason: string = 'This post is no longer available on X'): Response {
  return new Response(JSON.stringify({ error: 'unavailable', reason }), {
    status: 410,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * 1-based album index for tweet photos/videos (`?index=`). Twitter caps a
 * post at 4 media; anything else is treated as the first item.
 */
export function parseTweetMediaIndex(raw: string | null): number {
  const n = parseInt(raw || '1', 10)
  return Number.isFinite(n) && n >= 1 && n <= 4 ? n : 1
}
