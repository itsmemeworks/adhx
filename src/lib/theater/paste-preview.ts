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
  return resolvePastedPost(text)?.path ?? null
}

/**
 * Same resolution, keeping the ORIGINAL url beside the path. The library's
 * paste-to-add needs both: `path` proves the text really is a supported post
 * link (so we never POST a playlist page or arbitrary text at the add
 * endpoint), while `url` is what `/api/bookmarks/add` actually takes.
 */
export interface PastedPost {
  /** The url as pasted — what the add endpoint resolves server-side. */
  url: string
  /** Its on-ADHX preview path — also the proof it's a supported post link. */
  path: string
}

export function resolvePastedPost(text: string): PastedPost | null {
  const url = extractSharedUrl(text)
  if (!url) return null
  const path = parseShareUrl(url)?.path
  return path ? { url, path } : null
}
