/**
 * Validates a post-login `returnUrl` as a same-origin relative path.
 *
 * Require a relative path and reject control characters before URL parsing:
 * browsers strip tabs/newlines, which can turn `/\t/evil.com` into an
 * off-site redirect. Check the parsed origin as well as the raw prefix.
 */
export function isSafeReturnUrl(url: string | null | undefined): url is string {
  if (!url || !/^\/(?![/\\])/.test(url) || /\p{Cc}/u.test(url)) return false

  // A fixed base keeps this helper usable in both server and client code.
  const base = 'https://return-url.invalid'
  try {
    return new URL(url, base).origin === base
  } catch {
    return false
  }
}
