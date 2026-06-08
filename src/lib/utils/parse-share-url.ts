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

  const short = url.match(TIKTOK_SHORTLINK)
  if (short) {
    return { path: `/api/tiktok/resolve?url=${encodeURIComponent(short[0])}&go=1` }
  }

  return null
}
