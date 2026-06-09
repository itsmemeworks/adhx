/**
 * Knowledge Graph — node thumbnail resolution.
 *
 * Picks ONE image for a save's circular node, platform-aware, mirroring how
 * `/api/feed` builds thumbnails (IG/TikTok need their signed-poster proxies;
 * Twitter uses FxEmbed; YouTube uses ytimg). Priority: media → article hero →
 * author avatar.
 */
import { getThumbnailUrl } from '@/lib/media/fxembed'

export interface NodeThumbInput {
  platform: string
  id: string
  author: string
  /** First media row's type (null = no media). */
  mediaType: string | null
  previewUrl: string | null
  /** Article cover image, if any. */
  articleImageUrl: string | null
  /** Author avatar (fallback for text/quote). */
  avatarUrl: string | null
}

export function nodeThumbnail(i: NodeThumbInput): string | null {
  if (i.mediaType) {
    if (i.platform === 'instagram') {
      return `/api/media/instagram/thumbnail?id=${encodeURIComponent(i.id)}`
    }
    if (i.platform === 'tiktok') {
      return `/api/media/tiktok/thumbnail?username=${encodeURIComponent(i.author)}&id=${encodeURIComponent(i.id)}`
    }
    if (i.platform === 'youtube') {
      return `https://i.ytimg.com/vi/${i.id}/hqdefault.jpg`
    }
    // twitter / default — FxEmbed
    const mt =
      i.mediaType === 'video' || i.mediaType === 'animated_gif' || i.mediaType === 'photo'
        ? (i.mediaType as 'video' | 'animated_gif' | 'photo')
        : 'photo'
    return getThumbnailUrl({
      tweetId: i.id,
      author: i.author,
      mediaType: mt,
      mediaIndex: 1,
      previewUrl: i.previewUrl ?? undefined,
    })
  }
  if (i.articleImageUrl) return i.articleImageUrl
  return i.avatarUrl || null
}
