import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { collections, collectionTweets, bookmarks, bookmarkMedia } from '@/lib/db/schema'
import { eq, inArray, desc } from 'drizzle-orm'
import { resolveMediaUrl, getShareableUrl, getThumbnailUrl } from '@/lib/media/fxembed'

// GET /api/share/[code] - Public access to a shared collection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params

    // Find collection by share code
    const [collection] = await db
      .select()
      .from(collections)
      .where(eq(collections.shareCode, code))
      .limit(1)

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    // Check if collection is public
    if (!collection.isPublic) {
      return NextResponse.json({ error: 'This collection is private' }, { status: 403 })
    }

    // Get tweets in collection
    const collectionTweetRecords = await db
      .select()
      .from(collectionTweets)
      .where(eq(collectionTweets.collectionId, collection.id))
      .orderBy(desc(collectionTweets.addedAt))

    const bookmarkIds = collectionTweetRecords.map((ct) => ct.bookmarkId)

    if (bookmarkIds.length === 0) {
      return NextResponse.json({
        id: collection.id,
        name: collection.name,
        description: collection.description,
        color: collection.color,
        icon: collection.icon,
        tweets: [],
        tweetCount: 0,
      })
    }

    // Get bookmarks
    const bookmarkResults = await db
      .select()
      .from(bookmarks)
      .where(inArray(bookmarks.id, bookmarkIds))

    // Get media for all bookmarks
    const mediaResults = await db
      .select()
      .from(bookmarkMedia)
      .where(inArray(bookmarkMedia.bookmarkId, bookmarkIds))

    // Build tweet objects with media (no read status for public view)
    const tweets = bookmarkResults.map((bookmark) => {
      const media = mediaResults
        .filter((m) => m.bookmarkId === bookmark.id)
        .map((m, index) => {
          const mediaType = m.mediaType as 'photo' | 'video' | 'animated_gif'
          const urlOptions = {
            tweetId: bookmark.id,
            author: bookmark.author,
            mediaType,
            mediaIndex: index + 1,
          }
          return {
            id: m.id,
            mediaType: m.mediaType,
            width: m.width,
            height: m.height,
            url: resolveMediaUrl(urlOptions),
            thumbnailUrl: getThumbnailUrl({ ...urlOptions, previewUrl: m.previewUrl || undefined }),
            shareUrl: getShareableUrl(urlOptions),
          }
        })

      const collectionTweet = collectionTweetRecords.find((ct) => ct.bookmarkId === bookmark.id)

      return {
        id: bookmark.id,
        author: bookmark.author,
        authorName: bookmark.authorName,
        text: bookmark.text,
        tweetUrl: bookmark.tweetUrl,
        createdAt: bookmark.createdAt,
        category: bookmark.category,
        media,
        addedAt: collectionTweet?.addedAt,
        notes: collectionTweet?.notes,
      }
    })

    // Sort by addedAt order from collectionTweetRecords
    const sortedTweets = bookmarkIds.map((id) => tweets.find((t) => t.id === id)).filter(Boolean)

    return NextResponse.json({
      id: collection.id,
      name: collection.name,
      description: collection.description,
      color: collection.color,
      icon: collection.icon,
      tweets: sortedTweets,
      tweetCount: sortedTweets.length,
    })
  } catch (error) {
    console.error('Error fetching shared collection:', error)
    return NextResponse.json({ error: 'Failed to fetch collection' }, { status: 500 })
  }
}
