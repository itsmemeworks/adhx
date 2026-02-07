import { NextRequest, NextResponse } from 'next/server'
import { fetchTweetData, type FxTwitterResponse } from '@/lib/media/fxembed'
import { articleBlocksToMarkdown } from '@/lib/utils/article-text'

type FxTweet = NonNullable<FxTwitterResponse['tweet']>

/**
 * Build a clean JSON response from FxTwitter tweet data.
 */
function buildTweetResponse(tweet: FxTweet) {
  // Convert article content to markdown if present
  let articleContent: string | null = null
  if (tweet.article?.content?.blocks) {
    const entityMap = Array.isArray(tweet.article.content.entityMap)
      ? (tweet.article.content.entityMap as Array<{ key: string; value: unknown }>).reduce(
          (acc: Record<string, unknown>, item) => {
            acc[item.key] = item.value
            return acc
          },
          {}
        )
      : tweet.article.content.entityMap || {}

    const mediaEntities = tweet.article.media_entities?.reduce(
      (acc: Record<string, { url: string; width?: number; height?: number }>, entity) => {
        if (entity.media_id && entity.media_info?.original_img_url) {
          acc[entity.media_id] = {
            url: entity.media_info.original_img_url,
            width: entity.media_info.original_img_width,
            height: entity.media_info.original_img_height,
          }
        }
        return acc
      },
      {}
    )

    articleContent = articleBlocksToMarkdown(
      tweet.article.content.blocks,
      entityMap as Record<string, never>,
      mediaEntities
    )
  }

  const response: Record<string, unknown> = {
    id: tweet.id,
    url: tweet.url,
    text: tweet.text,
    author: {
      name: tweet.author.name,
      username: tweet.author.screen_name,
      avatarUrl: tweet.author.avatar_url,
    },
    createdAt: tweet.created_at,
    engagement: {
      replies: tweet.replies,
      retweets: tweet.retweets,
      likes: tweet.likes,
      views: tweet.views ?? null,
    },
  }

  // Media
  const photos = tweet.media?.photos || []
  const videos = tweet.media?.videos || []
  if (photos.length > 0 || videos.length > 0) {
    response.media = {
      photos: photos.map((p) => ({ url: p.url, width: p.width, height: p.height })),
      videos: videos.map((v) => ({
        url: v.url,
        thumbnailUrl: v.thumbnail_url,
        width: v.width,
        height: v.height,
        duration: v.duration,
      })),
    }
  }

  // Article
  if (tweet.article) {
    response.article = {
      title: tweet.article.title,
      previewText: tweet.article.preview_text || null,
      coverImageUrl: tweet.article.cover_media?.media_info?.original_img_url || null,
      content: articleContent,
    }
  }

  // Quote tweet
  if (tweet.quote) {
    response.quoteTweet = {
      id: tweet.quote.id,
      url: tweet.quote.url,
      text: tweet.quote.text,
      author: {
        name: tweet.quote.author.name,
        username: tweet.quote.author.screen_name,
        avatarUrl: tweet.quote.author.avatar_url,
      },
      createdAt: tweet.quote.created_at,
    }
  }

  // External link
  if (tweet.external) {
    response.externalLink = {
      url: tweet.external.expanded_url || tweet.external.url,
      displayUrl: tweet.external.display_url,
      title: tweet.external.title || null,
      description: tweet.external.description || null,
      thumbnailUrl: tweet.external.thumbnail_url || null,
    }
  }

  return response
}

/**
 * GET /api/share/tweet/[username]/[id]
 *
 * Public endpoint returning clean JSON for a tweet.
 * No authentication required. Data sourced from FxTwitter API.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string; id: string }> }
) {
  const { username, id } = await params

  // Validate username (Twitter handles: 1-15 alphanumeric + underscore)
  if (!/^\w{1,15}$/.test(username)) {
    return NextResponse.json(
      { error: 'Invalid username' },
      { status: 400 }
    )
  }

  // Validate tweet ID (numeric only)
  if (!/^\d+$/.test(id)) {
    return NextResponse.json(
      { error: 'Invalid tweet ID' },
      { status: 400 }
    )
  }

  try {
    const data = await fetchTweetData(username, id)

    if (!data?.tweet) {
      return NextResponse.json(
        { error: 'Tweet not found' },
        { status: 404 }
      )
    }

    const response = buildTweetResponse(data.tweet)

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    console.error('Error fetching tweet:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tweet' },
      { status: 500 }
    )
  }
}
