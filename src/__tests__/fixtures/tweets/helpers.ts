/**
 * Test helpers for converting FxTwitter fixtures to component-ready formats
 */

import type { FxTwitterResponse } from '@/lib/media/fxembed'
import type { FeedItem, MediaItem, QuoteContext, ArticlePreview, ArticleContent } from '@/components/feed/types'
import { determineCategory, buildQuoteContext, buildArticleContent, buildArticlePreview } from '@/lib/tweets/processor'

/**
 * Convert an FxTwitterResponse fixture to a FeedItem for component testing.
 * This mirrors the transformation that happens when tweets are stored and retrieved.
 */
export function fxTwitterToFeedItem(response: FxTwitterResponse): FeedItem {
  const tweet = response.tweet!
  const category = determineCategory(tweet)

  // Build media items
  const media: MediaItem[] = []

  if (tweet.media?.photos) {
    tweet.media.photos.forEach((photo, index) => {
      media.push({
        id: `${tweet.id}_photo_${index}`,
        mediaType: 'photo',
        width: photo.width,
        height: photo.height,
        url: photo.url,
        thumbnailUrl: photo.url,
        shareUrl: `https://d.fixupx.com/${tweet.author.screen_name}/status/${tweet.id}/photo/${index + 1}`,
      })
    })
  }

  if (tweet.media?.videos) {
    tweet.media.videos.forEach((video, index) => {
      media.push({
        id: `${tweet.id}_video_${index}`,
        mediaType: 'video',
        width: video.width,
        height: video.height,
        url: video.url,
        thumbnailUrl: video.thumbnail_url,
        shareUrl: video.url,
      })
    })
  }

  // Build quote context
  let quoteContext: QuoteContext | null = null
  if (tweet.quote) {
    const rawQuoteContext = buildQuoteContext(tweet.quote)
    if (rawQuoteContext) {
      quoteContext = {
        tweetId: rawQuoteContext.tweetId,
        author: rawQuoteContext.author,
        authorName: rawQuoteContext.authorName ?? undefined,
        authorProfileImageUrl: rawQuoteContext.authorProfileImageUrl ?? undefined,
        text: rawQuoteContext.text,
        media: rawQuoteContext.media,
        article: rawQuoteContext.article ? {
          url: rawQuoteContext.article.url,
          title: rawQuoteContext.article.title,
          description: rawQuoteContext.article.description,
          imageUrl: rawQuoteContext.article.imageUrl,
        } : undefined,
        external: rawQuoteContext.external ? {
          url: rawQuoteContext.external.url,
          title: rawQuoteContext.external.title,
          description: rawQuoteContext.external.description,
          imageUrl: rawQuoteContext.external.imageUrl,
        } : undefined,
      }
    }
  }

  // Build article preview and content
  let articlePreview: ArticlePreview | null = null
  let articleContent: ArticleContent | null = null

  if (tweet.article) {
    const preview = buildArticlePreview(tweet.article, tweet.author.screen_name, tweet.id)
    articlePreview = {
      title: preview.title,
      description: preview.description,
      imageUrl: preview.imageUrl,
      url: preview.url,
      domain: preview.domain,
    }

    const content = buildArticleContent(tweet.article)
    if (content) {
      articleContent = {
        blocks: content.blocks,
        entityMap: content.entityMap as ArticleContent['entityMap'],
        mediaEntities: content.mediaEntities,
      }
    }
  }

  // Build external link article preview (for non-X-Article external links)
  if (!articlePreview && tweet.external && category === 'article') {
    articlePreview = {
      title: tweet.external.title || null,
      description: tweet.external.description || null,
      imageUrl: tweet.external.thumbnail_url || null,
      url: tweet.external.expanded_url || tweet.external.url,
      domain: tweet.external.display_url?.split('/')[0] || null,
    }
  }

  return {
    id: tweet.id,
    author: tweet.author.screen_name,
    authorName: tweet.author.name,
    authorProfileImageUrl: tweet.author.avatar_url,
    text: tweet.text,
    tweetUrl: tweet.url,
    createdAt: tweet.created_at,
    processedAt: new Date().toISOString(),
    category,
    isRead: false,
    isQuote: !!tweet.quote,
    quoteContext,
    quotedTweetId: tweet.quote?.id,
    media: media.length > 0 ? media : null,
    links: null,
    articlePreview,
    articleContent,
    isXArticle: !!tweet.article,
    tags: [],
  }
}
