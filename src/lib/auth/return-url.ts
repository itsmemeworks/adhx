/**
 * Validates a post-login `returnUrl` as a same-origin relative path.
 *
 * `returnUrl.startsWith('/')` alone is not sufficient: browsers treat a
 * leading `//` or `/\` as a protocol-relative URL, so `new URL('//evil.com',
 * BASE_URL)` resolves to `https://evil.com/` — an open redirect. Only a
 * single leading `/` not followed by another `/` or `\` is safe.
 */
export function isSafeReturnUrl(url: string | null | undefined): url is string {
  if (!url) return false
  return /^\/(?![/\\])/.test(url)
}
