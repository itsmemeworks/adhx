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
