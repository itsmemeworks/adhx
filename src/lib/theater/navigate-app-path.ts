import { isPreviewPath, markPreviewOpenIntent } from '@/lib/theater/autosave-shared'

/**
 * Navigate to an app-internal path only. `resolvePastedLink` already only
 * builds root-relative app paths, but the pasted text is user/clipboard
 * input, so the sink enforces the invariant too (defense-in-depth, and what
 * proves it to CodeQL: no `javascript:` scheme can survive the leading-`/`
 * requirement, no protocol-relative `//host` escape, and the resolved URL
 * must land on this origin).
 *
 * This is a hard navigation (`location.assign`), so a signed-in landing on
 * the preview also qualifies as a document-open autosave. We still stamp
 * the paste intent so a later change to client routing keeps the same
 * "I pasted this" meaning.
 */
export function navigateToAppPath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) return
  const dest = new URL(path, window.location.origin)
  if (dest.origin !== window.location.origin) return
  const pathname = dest.pathname
  if (isPreviewPath(pathname) || pathname.startsWith('/api/tiktok/resolve')) {
    markPreviewOpenIntent('paste')
  }
  window.location.assign(dest.toString())
}
