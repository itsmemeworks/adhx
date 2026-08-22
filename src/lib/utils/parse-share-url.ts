import { detectPlatformPost } from '@/lib/platform/url'

/**
 * TikTok's native share sheet hands over a SHORT link
 * (`vm.tiktok.com/<code>`, `vt.tiktok.com/<code>`, or `tiktok.com/t/<code>`),
 * not the canonical `/@user/video/<id>` URL that {@link detectPlatformPost}
 * matches. We can't resolve it in the browser (cross-origin redirect), so we
 * route it through `/api/tiktok/resolve`, which follows it server-side and
 * 307s to the preview. (Instagram/X/YouTube share canonical-ish links that the
 * detector already handles.)
 */
const TIKTOK_SHORTLINK =
  /https?:\/\/(?:(?:vm|vt)\.tiktok\.com\/[A-Za-z0-9]+|(?:www\.)?tiktok\.com\/t\/[A-Za-z0-9]+)/i

/**
 * Pull the first http(s) URL out of the shared payload. Android share intents
 * (notably TikTok) frequently deliver the link inside the `text` field — often
 * wrapped in a caption like "check this out https://vm.tiktok.com/ZM…/" — rather
 * than as a clean `url`. Checks the fields in order of reliability and extracts
 * an embedded URL when the whole field isn't one.
 */
export function extractSharedUrl(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue
    const trimmed = candidate.trim()
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    const embedded = trimmed.match(/https?:\/\/[^\s]+/i)
    if (embedded) return embedded[0]
  }
  return null
}

/**
 * Parse a shared link (Android PWA share target) into the destination to
 * redirect to.
 *
 * Returns the clean on-ADHX preview path for X/Twitter, Instagram, TikTok, and
 * YouTube post/video links; for a TikTok short link it returns the resolver
 * endpoint (which 307s to the preview). `null` when the URL isn't recognised.
 *
 * Thin adapter over the shared {@link detectPlatformPost} detector — the
 * per-platform URL patterns live there as the single source of truth.
 */
export function parseShareUrl(url: string): { path: string } | null {
  const result = detectPlatformPost(url)
  if (result) return { path: result.previewPath }

  const short = matchTikTokShortLink(url)
  if (short) {
    return { path: `/api/tiktok/resolve?url=${encodeURIComponent(short)}&go=1` }
  }

  return null
}

/**
 * Pull the TikTok short-link substring out of `url`, or `null` if it isn't
 * one. Exposed separately (rather than only inside `parseShareUrl`'s
 * pre-built `path` string) so a caller that needs a HARD navigation to the
 * `/api/tiktok/resolve` route — because it can't be handled by the client
 * router — can rebuild that URL itself from a constant prefix/suffix with
 * only this extracted substring passed through `encodeURIComponent`, instead
 * of assigning a pre-concatenated string to `location.href`.
 */
export function matchTikTokShortLink(url: string): string | null {
  const short = url.match(TIKTOK_SHORTLINK)
  return short ? short[0] : null
}

/**
 * Guards a `window.location.href` (or router) assignment built from
 * pasted/shared text against unsafe navigation targets. Blocks
 * protocol-relative ("//evil.com") and scheme-based ("javascript:", "data:")
 * strings — the way a "we only ever build internal `/paths`" assumption
 * turns into a DOM-XSS/open-redirect sink if a caller's parsing ever slips.
 * Internal preview/resolver paths are plain `/segment/segment` with any
 * embedded link passed through `encodeURIComponent`, so a real one never
 * contains a literal `:` or starts with `//`.
 */
export function isSafeInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes(':')
}

/** The subset of Next's `useRouter()` this module needs — kept minimal so callers don't have to import Next's router type. */
export interface PastedLinkRouter {
  push: (href: string) => void
}

/**
 * Resolve pasted/typed text to its on-ADHX destination and navigate there.
 * Returns whether a supported link was found (and navigation started).
 *
 * The single source of truth for the CodeQL-hardened navigation shape used
 * by every "paste a link" surface (the landing page's hero input and
 * `PasteLinkButton`). A
 * TikTok short link resolves via an `/api` route that 307s to the preview
 * server-side — the client router can't follow that cross-route redirect, so
 * that branch alone needs a hard navigation, built from a constant
 * prefix/suffix with only the extracted link passed through
 * `encodeURIComponent` (never a pre-concatenated string assigned straight to
 * `location.href`). Everything else is a real app route, navigated via the
 * given router and guarded by `isSafeInternalPath` — clipboard/pasted text is
 * user-controlled input flowing into navigation, the exact sink CodeQL flags,
 * so the guard stays even though `parseShareUrl` only ever builds safe paths.
 */
export function navigateToPastedLink(router: PastedLinkRouter, raw: string): boolean {
  const trimmed = raw.trim()

  const shortLink = matchTikTokShortLink(trimmed)
  if (shortLink) {
    window.location.href = `/api/tiktok/resolve?url=${encodeURIComponent(shortLink)}&go=1`
    return true
  }

  const result = parseShareUrl(trimmed)
  if (result && isSafeInternalPath(result.path)) {
    router.push(result.path)
    return true
  }
  return false
}
