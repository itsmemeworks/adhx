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
