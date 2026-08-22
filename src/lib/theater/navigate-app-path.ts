/**
 * Navigate to an app-internal path only. `resolvePastedLink` already only
 * builds root-relative app paths, but the pasted text is user/clipboard
 * input, so the sink enforces the invariant too (defense-in-depth, and what
 * proves it to CodeQL: no `javascript:` scheme can survive the leading-`/`
 * requirement, no protocol-relative `//host` escape, and the resolved URL
 * must land on this origin).
 */
export function navigateToAppPath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) return
  const dest = new URL(path, window.location.origin)
  if (dest.origin !== window.location.origin) return
  window.location.assign(dest.toString())
}
