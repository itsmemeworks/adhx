/**
 * Hostname-based domain check — the safe replacement for
 * `url.toLowerCase().includes('domain.com')`-style validation.
 *
 * A substring check is bypassable: `evildomain.com.attacker.com` and
 * `https://attacker.com/redirect?to=domain.com` both satisfy `.includes()`
 * without the URL actually pointing at `domain.com`. This parses the URL and
 * matches the *hostname* only — exact match or a `.`-prefixed suffix (a real
 * subdomain), never a raw substring.
 *
 * Accepts protocol-less input by defaulting to `https://` so callers that
 * previously ran a bare `.includes()` on unprefixed text keep working.
 */
export function isHostOrSubdomainOf(url: string, domains: string[]): boolean {
  try {
    const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`)
    const hostname = parsed.hostname.toLowerCase()
    return domains.some(
      (domain) =>
        hostname === domain.toLowerCase() || hostname.endsWith(`.${domain.toLowerCase()}`),
    )
  } catch {
    return false
  }
}
