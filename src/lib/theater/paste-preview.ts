/**
 * Paste-to-preview (desktop theater): turn whatever the user pasted into an
 * on-ADHX preview path. Thin composition of the PWA share-target helpers —
 * `extractSharedUrl` pulls the first http(s) URL out of free text (captions,
 * "check this out <link>" messages), `parseShareUrl` maps all four platforms
 * to their preview path (TikTok short links resolve via the `/api/tiktok/
 * resolve?…&go=1` redirect path, which needs a full `window.location`
 * navigation — same rule as `/share`).
 */

import { extractSharedUrl, parseShareUrl } from '@/lib/utils/parse-share-url'

/**
 * Pure: the app path to navigate to for pasted text, or null when the text
 * carries no supported link. Accepts raw URLs, protocol-less URLs are NOT
 * accepted here (matches the share-target behavior — a pasted bare
 * "x.com/user/status/1" is ambiguous with ordinary text).
 */
export function resolvePastedLink(text: string): string | null {
  const url = extractSharedUrl(text)
  if (!url) return null
  return parseShareUrl(url)?.path ?? null
}
