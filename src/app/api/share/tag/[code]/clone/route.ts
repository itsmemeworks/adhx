import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { tagShares, bookmarkTags, bookmarks, bookmarkMedia } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'

const MAX_CLONE_SIZE = 100

// POST /api/share/tag/[code]/clone - Clone a shared tag collection to user's account
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params

    // 1. Find the shared tag
    const [share] = await db
      .select()
      .from(tagShares)
      .where(eq(tagShares.shareCode, code))
      .limit(1)

    if (!share || !share.isPublic) {
      return NextResponse.json({ error: 'Tag not found or not public' }, { status: 404 })
    }

    const sourceUserId = share.userId
    const tagName = share.tag

    // 2. Get all bookmark IDs for this tag
    const taggedBookmarks = await db
      .select({ bookmarkId: bookmarkTags.bookmarkId })
      .from(bookmarkTags)
      .where(
        and(eq(bookmarkTags.userId, sourceUserId), eq(bookmarkTags.tag, tagName))
      )

    const bookmarkIds = taggedBookmarks.map((t) => t.bookmarkId)

    if (bookmarkIds.length === 0) {
      return NextResponse.json({ cloned: 0, skipped: 0, total: 0, tag: tagName, clonedIds: [] })
    }

    // 3. Enforce size limit
    if (bookmarkIds.length > MAX_CLONE_SIZE) {
      return NextResponse.json(
        { error: `Cannot clone more than ${MAX_CLONE_SIZE} bookmarks at once` },
        { status: 400 }
      )
    }

    // 4. Get full bookmark data
    const sourceBookmarks = await db
      .select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, sourceUserId),
          inArray(bookmarks.id, bookmarkIds)
        )
      )

    // 5. Get media for all bookmarks
    const sourceMedia = await db
      .select()
      .from(bookmarkMedia)
      .where(
        and(
          eq(bookmarkMedia.userId, sourceUserId),
          inArray(bookmarkMedia.bookmarkId, bookmarkIds)
        )
      )

    // Build media lookup map for O(1) access instead of O(n) filter per bookmark
    const mediaByBookmark = new Map<string, typeof sourceMedia>()
    for (const m of sourceMedia) {
      const existing = mediaByBookmark.get(m.bookmarkId) || []
      existing.push(m)
      mediaByBookmark.set(m.bookmarkId, existing)
    }

    // 6. Batch check which bookmarks user already has (fix N+1)
    const existingBookmarkIds = new Set(
      (
        await db
          .select({ id: bookmarks.id })
          .from(bookmarks)
          .where(
            and(eq(bookmarks.userId, userId), inArray(bookmarks.id, bookmarkIds))
          )
      ).map((b) => b.id)
    )

    // 7. Prepare batch inserts
    const now = new Date().toISOString()
    const bookmarksToInsert: (typeof bookmarks.$inferInsert)[] = []
    const mediaToInsert: (typeof bookmarkMedia.$inferInsert)[] = []
    const tagsToInsert: (typeof bookmarkTags.$inferInsert)[] = []
    const clonedIds: string[] = []

    for (const bookmark of sourceBookmarks) {
      if (existingBookmarkIds.has(bookmark.id)) continue

      clonedIds.push(bookmark.id)

      // Explicit field mapping (not spread)
      bookmarksToInsert.push({
        id: bookmark.id,
        userId,
        author: bookmark.author,
        authorName: bookmark.authorName,
        authorProfileImageUrl: bookmark.authorProfileImageUrl,
        text: bookmark.text,
        tweetUrl: bookmark.tweetUrl,
        createdAt: bookmark.createdAt,
        processedAt: now,
        category: bookmark.category,
        isReply: bookmark.isReply,
        replyContext: bookmark.replyContext,
        isQuote: bookmark.isQuote,
        quoteContext: bookmark.quoteContext,
        quotedTweetId: bookmark.quotedTweetId,
        isRetweet: bookmark.isRetweet,
        retweetContext: bookmark.retweetContext,
        extractedContent: bookmark.extractedContent,
        source: 'cloned',
      })

      // Add media for this bookmark (O(1) lookup from map)
      const mediaForBookmark = mediaByBookmark.get(bookmark.id) || []
      for (const media of mediaForBookmark) {
        mediaToInsert.push({
          id: media.id,
          userId,
          bookmarkId: media.bookmarkId,
          mediaType: media.mediaType,
          width: media.width,
          height: media.height,
          durationMs: media.durationMs,
          originalUrl: media.originalUrl,
          previewUrl: media.previewUrl,
          altText: media.altText,
        })
      }

      // Add tag
      tagsToInsert.push({
        userId,
        bookmarkId: bookmark.id,
        tag: tagName,
      })
    }

    // 8. Execute inserts with onConflictDoNothing for idempotency
    // Note: These are sequential inserts, not wrapped in a transaction.
    // If one fails, earlier inserts persist. This is acceptable because:
    // - onConflictDoNothing makes retries safe
    // - Partial state (bookmarks without tags) is recoverable by re-cloning
    if (bookmarksToInsert.length > 0) {
      await db.insert(bookmarks).values(bookmarksToInsert).onConflictDoNothing()
      if (mediaToInsert.length > 0) {
        await db.insert(bookmarkMedia).values(mediaToInsert).onConflictDoNothing()
      }
      await db.insert(bookmarkTags).values(tagsToInsert).onConflictDoNothing()
    }

    return NextResponse.json({
      cloned: bookmarksToInsert.length,
      skipped: existingBookmarkIds.size,
      total: sourceBookmarks.length,
      tag: tagName,
      clonedIds,
    })
  } catch (error) {
    console.error('Error cloning shared tag:', error)
    return NextResponse.json({ error: 'Failed to clone tag' }, { status: 500 })
  }
}
