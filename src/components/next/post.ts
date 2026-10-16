/**
 * Read-only view helpers that map a saved `FeedItem` onto what the next_ui
 * cards and stages draw. Pure — no React — so they are unit-testable and
 * shared by every primitive in `src/components/next`.
 */
import type { FeedItem } from '@/components/feed/types'
import { feedItemType } from '@/components/feed/feedItemMeta'
import { decodeHtmlEntities } from '@/components/feed/text-rendering'
import { proxiedPhotoSrc } from '@/lib/media/fxembed'
import { formatDurationMs } from '@/lib/utils/format'
import { domainFromUrl } from '@/lib/theater/link-preview'

/** The five shapes the redesign draws. A quote/text post is a `post`. */
export type NextPostKind = 'video' | 'gif' | 'photo' | 'post' | 'article'

export function nextPostKind(item: FeedItem): NextPostKind {
  const type = feedItemType(item)
  if (type === 'video') {
    return item.media?.[0]?.mediaType === 'animated_gif' ? 'gif' : 'video'
  }
  if (type === 'photo') return 'photo'
  if (type === 'article') return 'article'
  return 'post'
}

/** Image src for the media at `index`. X photos go through the same-origin proxy (pbs.twimg.com 403s hotlinks). */
export function mediaImageSrc(item: FeedItem, index = 0): string | null {
  const m = item.media?.[index]
  if (!m) return null
  const isTwitter = (item.platform ?? 'twitter') === 'twitter'
  if (isTwitter && m.mediaType === 'photo' && item.author && item.id) {
    return proxiedPhotoSrc(item.author, item.id, index + 1)
  }
  return m.thumbnailUrl || m.url || null
}

/** A second source to try when the first image fails. */
export function mediaFallbackSrc(item: FeedItem, index = 0): string | null {
  const m = item.media?.[index]
  if (!m) return null
  return m.originalUrl || (m.thumbnailUrl !== mediaImageSrc(item, index) ? m.thumbnailUrl : null)
}

/** The cover image for any kind (article: its preview image first). */
export function postCoverSrc(item: FeedItem): string | null {
  if (nextPostKind(item) === 'article') {
    return item.articlePreview?.imageUrl || mediaImageSrc(item, 0)
  }
  return mediaImageSrc(item, 0)
}

/** Photo sources in album order. */
export function photoSources(item: FeedItem): string[] {
  const out: string[] = []
  item.media?.forEach((m, i) => {
    if (m.mediaType !== 'photo') return
    const src = mediaImageSrc(item, i)
    if (src) out.push(src)
  })
  return out
}

/** width / height of the primary media, or null when unknown. */
export function mediaAspect(item: FeedItem): number | null {
  const m = item.media?.[0]
  if (!m?.width || !m?.height) return null
  return m.width / m.height
}

const VERTICAL_PLATFORMS = new Set(['tiktok', 'youtube', 'instagram'])

/** Portrait (or square-ish) media → tall layouts. Unknown size on a vertical-first platform counts as tall. */
export function isTallMedia(item: FeedItem): boolean {
  const aspect = mediaAspect(item)
  if (aspect === null) return VERTICAL_PLATFORMS.has(item.platform ?? 'twitter')
  return aspect <= 1.05
}

/** `0:41`-style label for the primary video, or null. */
export function postDurationLabel(item: FeedItem): string | null {
  return formatDurationMs(item.media?.[0]?.durationMs)
}

const SHORT_LINK_RE = /https?:\/\/t\.co\/\w+/g

/** Post text for display: entities decoded, t.co short links dropped, whitespace tidied. */
export function postText(item: FeedItem): string {
  return decodeHtmlEntities(item.text || '')
    .replace(SHORT_LINK_RE, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

export interface PostAuthor {
  /** Display name, falling back to the handle. */
  name: string
  /** `@handle`. */
  handle: string
  avatarUrl: string | null
}

export function postAuthor(item: FeedItem): PostAuthor {
  const handle = item.author ? `@${item.author}` : ''
  return {
    name: item.authorName?.trim() || handle || 'Someone',
    handle,
    avatarUrl: item.authorProfileImageUrl ?? null,
  }
}

/** Headline for an article card/stage. */
export function articleHeadline(item: FeedItem): string {
  const title = item.articlePreview?.title?.trim()
  if (title) return decodeHtmlEntities(title)
  const text = postText(item)
  return text.split('\n')[0].slice(0, 120) || 'Article'
}

/** The article's first lines: its description, else the opening body blocks, else the post text. */
export function articleLede(item: FeedItem, maxChars = 320): string {
  const description = item.articlePreview?.description?.trim()
  let lede = description ? decodeHtmlEntities(description) : ''
  if (!lede && item.articleContent?.blocks?.length) {
    lede = item.articleContent.blocks
      .filter((b) => b.type !== 'atomic' && b.text.trim())
      .slice(0, 4)
      .map((b) => b.text.trim())
      .join(' ')
  }
  if (!lede) {
    const text = postText(item)
    lede = text === articleHeadline(item) ? '' : text
  }
  if (lede.length <= maxChars) return lede
  return `${lede.slice(0, maxChars - 1).trimEnd()}…`
}

const X_HOST_RE = /(?:^|\.)(?:x|twitter)\.com$/i

/** The first off-X link's domain, for the post card's link chip. */
export function postLinkDomain(item: FeedItem): string | null {
  for (const link of item.links ?? []) {
    const domain = link.domain || domainFromUrl(link.expandedUrl)
    if (domain && !X_HOST_RE.test(domain)) return domain.replace(/^www\./i, '')
  }
  return null
}
