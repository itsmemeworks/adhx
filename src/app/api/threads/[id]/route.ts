import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkMedia } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'
import { fetchTweet } from '@/lib/twitter/client'
import { fetchTweetData } from '@/lib/media/fxembed'
import { buildMediaUrls } from '@/lib/media/fxembed'
import type { ThreadItem, ThreadResponse, MediaItem } from '@/components/feed/types'

const MAX_THREAD_LENGTH = 25 // Prevent runaway traversal

/**
 * GET /api/threads/[id] - Fetch the thread chain for a bookmark
 *
 * Traverses up the reply chain to build a complete thread view.
 * Returns tweets from oldest (thread start) to newest (the bookmarked tweet).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Get the starting bookmark
    const [bookmark] = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, id)))
      .limit(1)

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    // If this tweet isn't a reply, return just itself
    if (!bookmark.isReply || !bookmark.inReplyToTweetId) {
      return NextResponse.json({
        thread: [await bookmarkToThreadItem(bookmark, userId, 1, 'bookmarked')],
        currentPosition: 1,
        isComplete: true,
        isSelfThread: true,
      } satisfies ThreadResponse)
    }

    // Build the thread chain by traversing up
    const threadChain: ThreadItem[] = []
    const visitedIds = new Set<string>([id])
    let currentTweetId: string | null = bookmark.inReplyToTweetId
    let isSelfThread = true
    let isComplete = false
    let position = 1

    // First, add the bookmarked tweet at the end
    const bookmarkedItem = await bookmarkToThreadItem(bookmark, userId, 0, 'bookmarked')

    while (currentTweetId && threadChain.length < MAX_THREAD_LENGTH) {
      // Prevent infinite loops
      if (visitedIds.has(currentTweetId)) {
        isComplete = true
        break
      }
      visitedIds.add(currentTweetId)

      // Check if we have this tweet in our collection
      const [existingBookmark] = await db
        .select()
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, currentTweetId)))
        .limit(1)

      if (existingBookmark) {
        // Check if still same author (self-thread)
        if (existingBookmark.author !== bookmark.author) {
          isSelfThread = false
          // Include this one as thread start but stop
          threadChain.unshift(await bookmarkToThreadItem(existingBookmark, userId, position, 'external'))
          isComplete = true
          break
        }

        threadChain.unshift(await bookmarkToThreadItem(existingBookmark, userId, position, 'bookmarked'))
        currentTweetId = existingBookmark.inReplyToTweetId
        position++
      } else {
        // Fetch from API - try FxTwitter first (faster), fall back to Twitter API
        const tweetData = await fetchTweetFromAnySource(userId, currentTweetId, bookmark.author)

        if (!tweetData) {
          // Can't fetch, thread is incomplete
          break
        }

        // Convert fetched media to MediaItem format
        const mediaItems = tweetData.media?.map(m => ({
          id: m.id,
          mediaType: m.mediaType,
          width: null,
          height: null,
          url: m.url,
          thumbnailUrl: m.thumbnailUrl,
          shareUrl: `https://x.com/${tweetData.author}/status/${tweetData.id}`,
        })) || null

        // Check if this is still a self-reply
        if (tweetData.author !== bookmark.author) {
          isSelfThread = false
          // Include as thread start
          threadChain.unshift({
            id: tweetData.id,
            text: tweetData.text,
            author: tweetData.author,
            authorName: tweetData.authorName,
            authorProfileImageUrl: tweetData.authorProfileImageUrl,
            createdAt: tweetData.createdAt,
            media: mediaItems,
            source: 'external',
            position,
          })
          isComplete = true
          break
        }

        threadChain.unshift({
          id: tweetData.id,
          text: tweetData.text,
          author: tweetData.author,
          authorName: tweetData.authorName,
          authorProfileImageUrl: tweetData.authorProfileImageUrl,
          createdAt: tweetData.createdAt,
          media: mediaItems,
          source: 'fetched',
          position,
        })

        currentTweetId = tweetData.inReplyToTweetId ?? null
        position++
      }
    }

    // If we exited because currentTweetId is null, we reached the thread start
    if (!currentTweetId) {
      isComplete = true
    }

    // Add the bookmarked tweet
    threadChain.push(bookmarkedItem)

    // Now traverse DOWN - find tweets that reply to the current one (and continue the chain)
    // Only look in the user's collection (don't fetch from API for children)
    let childTweetId: string | null = id
    const childChain: ThreadItem[] = []

    while (childTweetId && childChain.length < MAX_THREAD_LENGTH) {
      // Find tweets in collection that reply to this one
      const [childBookmark] = await db
        .select()
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.inReplyToTweetId, childTweetId)
          )
        )
        .limit(1)

      if (!childBookmark) {
        break // No more children in collection
      }

      // Prevent infinite loops
      if (visitedIds.has(childBookmark.id)) {
        break
      }
      visitedIds.add(childBookmark.id)

      // Check if still same author for self-thread determination
      if (childBookmark.author !== bookmark.author) {
        isSelfThread = false
      }

      childChain.push(await bookmarkToThreadItem(childBookmark, userId, 0, 'bookmarked'))
      childTweetId = childBookmark.id
    }

    // Combine: parents + current + children
    const fullThread = [...threadChain, ...childChain]

    // Update positions to be 1-indexed from start
    fullThread.forEach((item, idx) => {
      item.position = idx + 1
    })

    // Current position is where the original bookmark is (after parents, before children)
    const currentPosition = threadChain.length

    return NextResponse.json({
      thread: fullThread,
      currentPosition,
      isComplete,
      isSelfThread,
    } satisfies ThreadResponse)
  } catch (error) {
    console.error('Failed to fetch thread:', error)
    return NextResponse.json(
      { error: 'Failed to fetch thread' },
      { status: 500 }
    )
  }
}

/**
 * Convert a bookmark to a ThreadItem
 */
async function bookmarkToThreadItem(
  bookmark: typeof bookmarks.$inferSelect,
  userId: string,
  position: number,
  source: 'bookmarked' | 'fetched' | 'external'
): Promise<ThreadItem> {
  // Fetch media for this bookmark
  let media: MediaItem[] | null = null

  if (source === 'bookmarked') {
    const bookmarkMediaItems = await db
      .select()
      .from(bookmarkMedia)
      .where(and(eq(bookmarkMedia.userId, userId), eq(bookmarkMedia.bookmarkId, bookmark.id)))

    if (bookmarkMediaItems.length > 0) {
      const builtMedia = buildMediaUrls(
        { id: bookmark.id, author: bookmark.author },
        bookmarkMediaItems.map(m => ({
          id: m.id,
          mediaType: m.mediaType,
          previewUrl: m.previewUrl,
          originalUrl: m.originalUrl,
        }))
      )
      // Transform to MediaItem format (type -> mediaType)
      media = builtMedia.map(m => ({
        id: m.id,
        mediaType: m.type,
        width: null,
        height: null,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl,
        shareUrl: m.shareUrl,
      }))
    }
  }

  return {
    id: bookmark.id,
    text: bookmark.text,
    author: bookmark.author,
    authorName: bookmark.authorName,
    authorProfileImageUrl: bookmark.authorProfileImageUrl,
    createdAt: bookmark.createdAt,
    media,
    source,
    position,
  }
}

/**
 * Media item for thread tweets (simplified version for fetched tweets)
 */
interface FetchedMedia {
  id: string
  mediaType: string
  url: string
  thumbnailUrl: string
}

/**
 * Fetch tweet data from FxTwitter or Twitter API
 */
async function fetchTweetFromAnySource(
  userId: string,
  tweetId: string,
  expectedAuthor: string
): Promise<{
  id: string
  text: string
  author: string
  authorName?: string | null
  authorProfileImageUrl?: string | null
  createdAt?: string | null
  inReplyToTweetId?: string | null
  media?: FetchedMedia[] | null
} | null> {
  // Try FxTwitter first (doesn't count against Twitter API rate limits)
  // Use 'i' as author since we might not know the actual author
  const fxData = await fetchTweetData('i', tweetId)

  if (fxData?.tweet) {
    const tweet = fxData.tweet
    const author = tweet.author.screen_name

    // Extract media from FxTwitter
    let media: FetchedMedia[] | null = null
    if (tweet.media?.all && tweet.media.all.length > 0) {
      media = tweet.media.all.map((m, idx) => ({
        id: `${tweetId}_${idx}`,
        mediaType: m.type || 'photo',
        url: m.type === 'video' || m.type === 'animated_gif'
          ? `/api/media/video?author=${author}&tweetId=${tweetId}&quality=full`
          : `https://d.fixupx.com/${author}/status/${tweetId}/photo/${idx + 1}`,
        thumbnailUrl: m.thumbnail_url || `https://d.fixupx.com/${author}/status/${tweetId}/photo/${idx + 1}`,
      }))
    }

    // FxTwitter provides replying_to_status for parent tweet ID
    return {
      id: tweet.id,
      text: tweet.text,
      author,
      authorName: tweet.author.name,
      authorProfileImageUrl: tweet.author.avatar_url,
      createdAt: tweet.created_at,
      inReplyToTweetId: tweet.replying_to_status || null,
      media,
    }
  }

  // Fall back to Twitter API (can get reply chain info)
  try {
    const tweet = await fetchTweet(userId, tweetId)
    if (tweet) {
      // Twitter API returns referencedTweets which includes replied_to
      const replyRef = tweet.referencedTweets?.find(rt => rt.type === 'replied_to')

      return {
        id: tweet.id,
        text: tweet.text,
        author: tweet.author?.username || expectedAuthor,
        authorName: tweet.author?.name,
        authorProfileImageUrl: null, // Twitter API v2 doesn't return this in single tweet
        createdAt: tweet.createdAt,
        inReplyToTweetId: replyRef?.id || null,
        media: null, // Twitter API v2 requires additional expansion for media
      }
    }
  } catch (error) {
    console.error('Failed to fetch tweet from Twitter API:', error)
  }

  return null
}
