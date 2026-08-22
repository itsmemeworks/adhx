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
    isQuote: !!item.isQuote,
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

/** Map a FeedItem to one of the five Matter content types. */
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

/** First media thumbnail (or article cover), if any. */
export function feedItemThumb(item: FeedItem): string | null {
  return item.media?.[0]?.thumbnailUrl || item.articlePreview?.imageUrl || null
}
