import { TwitterApi, UserV2 } from 'twitter-api-v2'
import {
  getStoredTokens,
  isTokenExpired,
  refreshAccessToken,
  saveTokens,
} from '@/lib/auth/oauth'

const CLIENT_ID = process.env.TWITTER_CLIENT_ID!
const CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET!

export interface TwitterMedia {
  mediaKey: string
  type: 'photo' | 'video' | 'animated_gif'
  url?: string
  previewUrl?: string
  width?: number
  height?: number
  durationMs?: number
}

export interface TwitterBookmark {
  id: string
  text: string
  authorId: string
  author?: {
    id: string
    username: string
    name: string
  }
  createdAt?: string
  entities?: {
    urls?: Array<{
      url: string
      expandedUrl: string
      displayUrl: string
    }>
    mentions?: Array<{
      username: string
      id: string
    }>
  }
  referencedTweets?: Array<{
    type: 'quoted' | 'replied_to' | 'retweeted'
    id: string
  }>
  attachments?: Record<string, unknown>
  media?: TwitterMedia[]
  publicMetrics?: {
    likeCount: number
    retweetCount: number
    replyCount: number
  }
}

export interface FetchBookmarksResult {
  bookmarks: TwitterBookmark[]
  nextToken?: string
  resultCount: number
}

// Get authenticated Twitter client for a specific user
export async function getTwitterClient(userId: string): Promise<TwitterApi> {
  const tokens = await getStoredTokens(userId)

  if (!tokens) {
    throw new Error('Not authenticated. Please connect your Twitter account.')
  }

  // Check if token needs refresh
  if (isTokenExpired(tokens.expiresAt)) {
    console.log('Token expired, refreshing...')
    const newTokens = await refreshAccessToken(
      tokens.refreshToken,
      CLIENT_ID,
      CLIENT_SECRET
    )

    // Save new tokens
    await saveTokens(
      tokens.userId,
      tokens.username || '',
      tokens.profileImageUrl || null,
      newTokens.accessToken,
      newTokens.refreshToken,
      newTokens.expiresIn,
      '' // scopes don't change
    )

    return new TwitterApi(newTokens.accessToken)
  }

  return new TwitterApi(tokens.accessToken)
}

// Fetch bookmarks from Twitter API v2
export async function fetchBookmarks(
  userId: string,
  options: {
    maxResults?: number
    paginationToken?: string
  } = {}
): Promise<FetchBookmarksResult> {
  const { maxResults = 100, paginationToken } = options
  const client = await getTwitterClient(userId)

  const tokens = await getStoredTokens(userId)
  if (!tokens) {
    throw new Error('Not authenticated')
  }

  // Fetch bookmarks with expansions
  const response = await client.v2.bookmarks({
    max_results: Math.min(maxResults, 100),
    pagination_token: paginationToken,
    'tweet.fields': [
      'created_at',
      'author_id',
      'entities',
      'referenced_tweets',
      'attachments',
      'public_metrics',
      'note_tweet',
    ],
    'user.fields': ['username', 'name', 'profile_image_url'],
    expansions: ['author_id', 'referenced_tweets.id', 'attachments.media_keys'],
    'media.fields': ['url', 'preview_image_url', 'type', 'width', 'height', 'duration_ms'],
  })

  // Build user lookup map
  const users = new Map<string, UserV2>()
  if (response.includes?.users) {
    for (const user of response.includes.users) {
      users.set(user.id, user)
    }
  }

  // Build media lookup map
  const mediaMap = new Map<string, TwitterMedia>()
  if (response.includes?.media) {
    for (const media of response.includes.media) {
      mediaMap.set(media.media_key, {
        mediaKey: media.media_key,
        type: media.type as 'photo' | 'video' | 'animated_gif',
        url: media.url || (media as any).preview_image_url,
        previewUrl: (media as any).preview_image_url,
        width: media.width,
        height: media.height,
        durationMs: (media as any).duration_ms,
      })
    }
  }

  // Transform tweets to our format
  const bookmarks: TwitterBookmark[] = (response.data.data || []).map((tweet) => {
    const author = users.get(tweet.author_id || '')

    // Get media for this tweet
    const mediaKeys = (tweet.attachments as any)?.media_keys as string[] | undefined
    const tweetMedia = mediaKeys
      ?.map((key) => mediaMap.get(key))
      .filter((m): m is TwitterMedia => m !== undefined)

    // For long tweets (>280 chars), Twitter returns full text in note_tweet
    const fullText = (tweet as any).note_tweet?.text || tweet.text

    return {
      id: tweet.id,
      text: fullText,
      authorId: tweet.author_id || '',
      author: author
        ? {
            id: author.id,
            username: author.username,
            name: author.name,
          }
        : undefined,
      createdAt: tweet.created_at,
      entities: tweet.entities
        ? {
            urls: tweet.entities.urls?.map((u) => ({
              url: u.url,
              expandedUrl: u.expanded_url,
              displayUrl: u.display_url,
            })),
            mentions: tweet.entities.mentions?.map((m) => ({
              username: m.username,
              id: m.id,
            })),
          }
        : undefined,
      referencedTweets: tweet.referenced_tweets?.map((rt) => ({
        type: rt.type as 'quoted' | 'replied_to' | 'retweeted',
        id: rt.id,
      })),
      attachments: tweet.attachments as Record<string, unknown> | undefined,
      media: tweetMedia,
      publicMetrics: tweet.public_metrics
        ? {
            likeCount: tweet.public_metrics.like_count,
            retweetCount: tweet.public_metrics.retweet_count,
            replyCount: tweet.public_metrics.reply_count,
          }
        : undefined,
    }
  })

  return {
    bookmarks,
    nextToken: response.data.meta?.next_token,
    resultCount: response.data.meta?.result_count || 0,
  }
}

// Fetch all bookmarks with pagination
export async function fetchAllBookmarks(
  userId: string,
  options: {
    maxPages?: number
    onProgress?: (fetched: number, total: number) => void
  } = {}
): Promise<TwitterBookmark[]> {
  const { maxPages = 10, onProgress } = options
  const allBookmarks: TwitterBookmark[] = []
  let paginationToken: string | undefined
  let pageCount = 0

  do {
    const result = await fetchBookmarks(userId, {
      maxResults: 100,
      paginationToken,
    })

    allBookmarks.push(...result.bookmarks)
    paginationToken = result.nextToken
    pageCount++

    if (onProgress) {
      onProgress(allBookmarks.length, allBookmarks.length)
    }

    console.log(`Fetched page ${pageCount}: ${result.bookmarks.length} bookmarks`)

    // Small delay to avoid rate limiting
    if (paginationToken && pageCount < maxPages) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  } while (paginationToken && pageCount < maxPages)

  return allBookmarks
}

// Fetch a single tweet by ID (for reply/quote context)
export async function fetchTweet(userId: string, tweetId: string): Promise<TwitterBookmark | null> {
  try {
    const client = await getTwitterClient(userId)

    const response = await client.v2.singleTweet(tweetId, {
      'tweet.fields': ['created_at', 'author_id', 'entities', 'referenced_tweets', 'note_tweet'],
      'user.fields': ['username', 'name'],
      expansions: ['author_id'],
    })

    const tweet = response.data
    const author = response.includes?.users?.[0]

    // For long tweets (>280 chars), Twitter returns full text in note_tweet
    const fullText = (tweet as any).note_tweet?.text || tweet.text

    return {
      id: tweet.id,
      text: fullText,
      authorId: tweet.author_id || '',
      author: author
        ? {
            id: author.id,
            username: author.username,
            name: author.name,
          }
        : undefined,
      createdAt: tweet.created_at,
      referencedTweets: tweet.referenced_tweets?.map((rt) => ({
        type: rt.type as 'quoted' | 'replied_to' | 'retweeted',
        id: rt.id,
      })),
    }
  } catch (error) {
    console.error(`Failed to fetch tweet ${tweetId}:`, error)
    return null
  }
}
