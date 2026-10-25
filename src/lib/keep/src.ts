/**
 * Same-origin addresses for a post's kept files. Safe on the client (no
 * server imports). `/api/files` serves the kept file, or until it's
 * downloaded, hands off to the network's proxy where there is one.
 */

export type MediaSlot = `${'video' | 'photo' | 'audio'}-${number}` | 'poster'

export function keptSrc(
  platform: string,
  postId: string,
  slot: MediaSlot,
  author?: string | null,
  { download = false }: { download?: boolean } = {},
): string {
  const params = new URLSearchParams()
  // Only X and TikTok need the author to reach their proxies; leaving it off
  // elsewhere gives each file one address (one browser cache entry).
  if (author && (platform === 'twitter' || platform === 'tiktok' || !platform)) {
    params.set('a', author.replace(/^@+/, ''))
  }
  if (download) params.set('download', '1')
  // Retire URLs that older releases allowed caches to serve for a week.
  // Visibility is mutable, so this URL version always revalidates at origin.
  params.set('v', '2')
  const query = params.toString()
  return `/api/files/${encodeURIComponent(platform || 'twitter')}/${encodeURIComponent(postId)}/${slot}${query ? `?${query}` : ''}`
}

/** Legacy proxy for a slot that isn't kept yet, or null when there's none. */
export function proxySrc(
  platform: string,
  postId: string,
  slot: MediaSlot,
  author: string,
  download = false,
): string | null {
  const id = encodeURIComponent(postId)
  const a = encodeURIComponent(author)
  const m = slot.match(/^(video|photo|audio)-(\d+)$/)
  const kind = m?.[1] ?? 'poster'
  const index = Number(m?.[2] ?? 1)
  if (platform === 'twitter') {
    if (!author) return null
    if (kind === 'video') {
      return `/api/media/${download ? 'video/download' : 'video'}?author=${a}&tweetId=${id}&quality=hd${index > 1 ? `&index=${index}` : ''}`
    }
    if (kind === 'photo') {
      return `/api/media/image?author=${a}&tweetId=${id}&index=${index}${download ? '&download=1' : ''}`
    }
    return null
  }
  if (platform === 'tiktok') {
    if (kind === 'video' && author) {
      return `/api/media/tiktok/${download ? 'video/download' : 'video'}?username=${a}&id=${id}`
    }
    if (kind !== 'audio' && author) return `/api/media/tiktok/thumbnail?username=${a}&id=${id}`
    return null
  }
  if (platform === 'instagram') {
    if (kind === 'video')
      return `/api/media/instagram/${download ? 'video/download' : 'video'}?id=${id}`
    if (kind === 'photo') {
      return `/api/media/instagram/thumbnail?id=${id}&index=${index}${download ? '&download=1' : ''}`
    }
    if (kind === 'poster') return `/api/media/instagram/thumbnail?id=${id}`
  }
  return null
}
