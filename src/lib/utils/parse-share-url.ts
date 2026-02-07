/**
 * Parse a tweet URL from a shared link.
 * Extracts username and tweet ID from x.com or twitter.com URLs.
 */
export function parseShareUrl(url: string): { username: string; id: string } | null {
  const match = url.trim().match(
    /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/(\w{1,15})\/status\/(\d+)/i
  )
  if (!match) return null
  return { username: match[1], id: match[2] }
}
