/**
 * Canonical on-ADHX preview path for a piece of content.
 *
 * Pure, dependency-free (no DB, no server-only imports) so it's safe to import
 * from client components. `record.ts` re-exports this for server callers; the
 * feed/triage Share buttons import it directly without dragging in
 * better-sqlite3.
 */
export function previewPath(platform: string, author: string, id: string): string {
  // TikTok handles are stored with their leading "@", so strip any leading
  // "@" before re-prefixing — otherwise the path doubles up (/@@handle/...).
  const handle = author.replace(/^@+/, '')
  if (platform === 'instagram') return `/reels/${id}`
  if (platform === 'tiktok') return `/@${handle}/video/${id}`
  if (platform === 'youtube') return `/shorts/${id}`
  return `/${handle}/status/${id}`
}

/**
 * The original source-platform URL for a post — the inverse of {@link previewPath},
 * used to link back to the content on its native platform. Returns null when we
 * can't build one (no id). Same dependency-free guarantees as previewPath.
 */
export function sourceUrl(platform: string, author: string, id: string): string | null {
  if (!id) return null
  const handle = author.replace(/^@+/, '')
  if (platform === 'instagram') return `https://www.instagram.com/reel/${id}/`
  if (platform === 'tiktok') return `https://www.tiktok.com/@${handle}/video/${id}`
  if (platform === 'youtube') return `https://www.youtube.com/shorts/${id}`
  // X accepts any handle (and `i` when unknown) and redirects to the canonical URL.
  return `https://x.com/${handle || 'i'}/status/${id}`
}
