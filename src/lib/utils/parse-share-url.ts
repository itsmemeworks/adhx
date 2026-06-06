import { extractYouTubeId } from '@/lib/media/youtube'

/**
 * Parse a shared link (Android PWA share target) into the ADHX preview path.
 *
 * Supports every platform ADHX previews: X/Twitter, Instagram, TikTok, and
 * YouTube. Returns the clean on-ADHX path to redirect to, or null when the URL
 * isn't a recognised post/video link.
 */
export function parseShareUrl(url: string): { path: string } | null {
  const trimmed = url.trim()

  const tweet = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/(\w{1,15})\/status\/(\d+)/i,
  )
  if (tweet) return { path: `/${tweet[1]}/status/${tweet[2]}` }

  const reel = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reels?|p)\/([A-Za-z0-9_-]+)/i,
  )
  if (reel) return { path: `/reels/${reel[1]}` }

  const tiktok = trimmed.match(
    /(?:https?:\/\/)?(?:www\.|vm\.|m\.)?tiktok\.com\/@([A-Za-z0-9._]{1,30})\/video\/(\d{6,25})/i,
  )
  if (tiktok) return { path: `/@${tiktok[1]}/video/${tiktok[2]}` }

  if (/(?:youtube\.com|youtu\.be)/i.test(trimmed)) {
    const ytId = extractYouTubeId(trimmed)
    if (ytId) return { path: `/shorts/${ytId}` }
  }

  return null
}
