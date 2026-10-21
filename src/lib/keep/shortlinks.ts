import { fetchWithAllowlistedRedirects } from '@/lib/media/proxy'
import { isNetworkShortLink, NETWORK_SHORT_LINKS } from '@/lib/platform/networks'

/**
 * Share sheets often hand out short links (pin.it/…, reddit.com/r/x/s/…,
 * on.soundcloud.com/…). Follow them, staying on each network's own hosts, to
 * the post link ADHX recognises.
 */

export function isShortLink(url: string): boolean {
  return isNetworkShortLink(url)
}

/** The full link behind a short one, or null. */
export async function expandShortLink(url: string): Promise<string | null> {
  const input = url.trim()
  const rule = NETWORK_SHORT_LINKS.find((s) => s.test.test(input))
  if (!rule) return null
  try {
    const response = await fetchWithAllowlistedRedirects(input, {
      hosts: rule.hosts,
      timeoutMs: 10_000,
      maxRedirects: 5,
      init: { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ADHX/1.0)' } },
    })
    await response.body?.cancel()
    return response.url && response.url !== input ? response.url : null
  } catch {
    return null
  }
}
