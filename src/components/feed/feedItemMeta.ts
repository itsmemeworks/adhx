import type { FeedItem } from './types'
import type { ContentType } from '@/components/matter'
import { TYPE_META } from '@/components/matter'

/** Map a FeedItem to one of the five Matter content types. */
export function feedItemType(item: FeedItem): ContentType {
  if (item.isXArticle || item.articlePreview) return 'article'
  const m = item.media?.[0]
  if (m?.mediaType === 'video' || m?.mediaType === 'animated_gif') return 'video'
  if (m) return 'photo'
  if (item.isQuote) return 'quote'
  return 'text'
}

/** A short, single-line title for list/bento rows. */
export function feedItemTitle(item: FeedItem): string {
  if (item.articlePreview?.title) return item.articlePreview.title
  const body = (item.text || '').trim()
  if (body) {
    return body.split('\n')[0].replace(/^[^\w@#]+/, '').slice(0, 80) || body.slice(0, 80)
  }
  return TYPE_META[feedItemType(item)].label
}

/** First media thumbnail (or article cover), if any. */
export function feedItemThumb(item: FeedItem): string | null {
  return item.media?.[0]?.thumbnailUrl || item.articlePreview?.imageUrl || null
}
