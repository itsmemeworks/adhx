import type { FeedItem } from './types'
import type { ContentType } from '@/components/matter'
import { TYPE_META } from '@/components/matter'
import { inferContentType, type ContentSignals } from '@/lib/content-type'

/** Map a saved FeedItem onto the shared inferrer. */
export function feedItemSignals(item: FeedItem): ContentSignals {
  const primary = item.media?.[0]
  return {
    platform: item.platform,
    category: item.category,
    isXArticle: !!item.isXArticle,
    hasArticleBlocks: !!(item.articleContent?.blocks && item.articleContent.blocks.length > 0),
    hasArticlePreview: !!(
      item.articlePreview &&
      (item.articlePreview.title || item.articlePreview.description)
    ),
    hasFirstClassMedia: !!primary,
    primaryMediaType: primary?.mediaType,
    hasVideo: primary?.mediaType === 'video' || primary?.mediaType === 'animated_gif',
    hasPhoto: primary?.mediaType === 'photo',
    thumbnailUrl: primary?.thumbnailUrl ?? item.articlePreview?.imageUrl ?? null,
  }
}

/** Map a FeedItem to one of the four Matter content types. */
export function feedItemType(item: FeedItem): ContentType {
  return inferContentType(feedItemSignals(item))
}

/** A short, single-line title for list/bento rows. */
export function feedItemTitle(item: FeedItem): string {
  if (item.articlePreview?.title) return item.articlePreview.title
  const body = (item.text || '').trim()
  if (body) {
    return (
      body
        .split('\n')[0]
        .replace(/^[^\w@#]+/, '')
        .slice(0, 80) || body.slice(0, 80)
    )
  }
  return TYPE_META[feedItemType(item)].label
}

/** Distinguishing, whitespace-normalized excerpt for control accessible names. */
export function feedItemAccessibleExcerpt(item: FeedItem, maxLength = 72): string {
  const raw =
    item.articlePreview?.title ||
    item.text ||
    item.quoteContext?.text ||
    `${TYPE_META[feedItemType(item)].label} ${item.id}`
  const normalized = raw.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}

/** Shared content-specific description used by feed action controls. */
export function feedItemAccessibleDescription(item: FeedItem): string {
  const type = feedItemType(item)
  const author = item.authorName?.trim() || (item.author ? `@${item.author}` : 'saved post')
  return `${type} by ${author}: ${feedItemAccessibleExcerpt(item)}`
}

/** Selection-mode name shared across grid, list, and bento views. */
export function feedItemSelectionLabel(
  item: FeedItem,
  selected: boolean,
  selectionName?: string,
): string {
  const target = selectionName ? `#${selectionName}` : 'selection'
  return `${selected ? 'Remove' : 'Add'} ${feedItemAccessibleDescription(item)} ${
    selected ? 'from' : 'to'
  } ${target}`
}

/** First media thumbnail (or article cover), if any. */
export function feedItemThumb(item: FeedItem): string | null {
  return item.media?.[0]?.thumbnailUrl || item.articlePreview?.imageUrl || null
}
