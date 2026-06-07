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
 * Build the inline, range-aware streaming `Response` shared by the video
 * proxies. Copies through the upstream status (200/206) and the standard
 * streaming headers (Content-Type, Accept-Ranges, Cache-Control, and
 * Content-Length / Content-Range when present).
 *
 * Forward the incoming `Range` header on the upstream fetch yourself; this
 * helper only mirrors the upstream response back to the client.
 */
export function streamingResponse(
  upstream: Response,
  opts?: { cacheControl?: string; contentType?: string },
): Response {
  const headers: Record<string, string> = {
    'Content-Type': upstream.headers.get('content-type') || opts?.contentType || 'video/mp4',
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
