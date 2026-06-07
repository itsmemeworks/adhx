import { detectPlatformPost } from '@/lib/platform/url'

/**
 * Parse a shared link (Android PWA share target) into the ADHX preview path.
 *
 * Supports every platform ADHX previews: X/Twitter, Instagram, TikTok, and
 * YouTube. Returns the clean on-ADHX path to redirect to, or null when the URL
 * isn't a recognised post/video link.
 *
 * Thin adapter over the shared {@link detectPlatformPost} detector — the
 * per-platform URL patterns live there as the single source of truth.
 */
export function parseShareUrl(url: string): { path: string } | null {
  const result = detectPlatformPost(url)
  return result ? { path: result.previewPath } : null
}
