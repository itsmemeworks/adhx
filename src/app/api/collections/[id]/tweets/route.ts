import { NextRequest, NextResponse } from 'next/server'
import { db, runInTransaction } from '@/lib/db'
import { collections, collectionTweets, bookmarks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { withAuth } from '@/lib/api/with-auth'

function parsePlatform(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

// POST /api/collections/[id]/tweets - Add a tweet to a collection
export const POST = withAuth(
  async (request: NextRequest, userId, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: collectionId } = await params
      const body = await request.json()
      const { bookmarkId, notes } = body
      // `platform` is optional on the wire (existing clients don't send it) — when
      // absent we resolve it from the bookmark itself below. `bookmarks`' PK is
      // (userId, platform, id), so guessing the default 'twitter' here would
      // silently mis-file Instagram/TikTok/YouTube bookmarks under the wrong
      // platform and they'd vanish from platform-filtered collection reads.
      const requestedPlatform = parsePlatform(body.platform)

      if (!bookmarkId || typeof bookmarkId !== 'string') {
        return NextResponse.json({ error: 'bookmarkId is required' }, { status: 400 })
      }

      // Verify collection ownership
      const [collection] = await db
        .select()
        .from(collections)
        .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
        .limit(1)

      if (!collection) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
      }

      // Verify bookmark exists and belongs to user, resolving its real platform.
      const [bookmark] = await db
        .select()
        .from(bookmarks)
        .where(
          requestedPlatform
            ? and(
                eq(bookmarks.id, bookmarkId),
                eq(bookmarks.userId, userId),
                eq(bookmarks.platform, requestedPlatform),
              )
            : and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)),
        )
        .limit(1)

      if (!bookmark) {
        return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
      }

      const platform = bookmark.platform

      // Check if already in collection
      const [existing] = await db
        .select()
        .from(collectionTweets)
        .where(
          and(
            eq(collectionTweets.userId, userId),
            eq(collectionTweets.collectionId, collectionId),
            eq(collectionTweets.platform, platform),
            eq(collectionTweets.bookmarkId, bookmarkId),
          ),
        )
        .limit(1)

      if (existing) {
        // Update notes if provided
        if (notes !== undefined) {
          await db
            .update(collectionTweets)
            .set({ notes: notes?.trim() || null })
            .where(
              and(
                eq(collectionTweets.userId, userId),
                eq(collectionTweets.collectionId, collectionId),
                eq(collectionTweets.platform, platform),
                eq(collectionTweets.bookmarkId, bookmarkId),
              ),
            )
        }
        return NextResponse.json({ success: true, alreadyExists: true })
      }

      const now = new Date().toISOString()

      // Add to collection and bump the collection's updatedAt atomically.
      runInTransaction(() => {
        db.insert(collectionTweets)
          .values({
            userId,
            collectionId,
            platform,
            bookmarkId,
            addedAt: now,
            notes: notes?.trim() || null,
          })
          .run()

        db.update(collections)
          .set({ updatedAt: now })
          .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
          .run()
      })

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Error adding tweet to collection:', error)
      return NextResponse.json({ error: 'Failed to add tweet to collection' }, { status: 500 })
    }
  },
)

// DELETE /api/collections/[id]/tweets - Remove a tweet from a collection
export const DELETE = withAuth(
  async (request: NextRequest, userId, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id: collectionId } = await params
      const body = await request.json()
      const { bookmarkId } = body
      const requestedPlatform = parsePlatform(body.platform)

      if (!bookmarkId || typeof bookmarkId !== 'string') {
        return NextResponse.json({ error: 'bookmarkId is required' }, { status: 400 })
      }

      // Verify collection ownership
      const [collection] = await db
        .select()
        .from(collections)
        .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
        .limit(1)

      if (!collection) {
        return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
      }

      // Resolve the real platform for this bookmarkId, same as POST, so we remove
      // the correct composite-key row instead of matching (and masking) whatever
      // happens to share the numeric id on another platform.
      let platform = requestedPlatform

      if (!platform) {
        const [bookmark] = await db
          .select({ platform: bookmarks.platform })
          .from(bookmarks)
          .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)))
          .limit(1)
        platform = bookmark?.platform
      }

      if (!platform) {
        // Bookmark record no longer exists — fall back to whatever platform this
        // bookmarkId is actually stored under in the collection itself.
        const [existing] = await db
          .select({ platform: collectionTweets.platform })
          .from(collectionTweets)
          .where(
            and(
              eq(collectionTweets.userId, userId),
              eq(collectionTweets.collectionId, collectionId),
              eq(collectionTweets.bookmarkId, bookmarkId),
            ),
          )
          .limit(1)
        platform = existing?.platform
      }

      if (!platform) {
        // Nothing matches this bookmarkId in the collection — nothing to remove.
        return NextResponse.json({ success: true })
      }

      const now = new Date().toISOString()

      // Remove from collection and bump the collection's updatedAt atomically.
      runInTransaction(() => {
        db.delete(collectionTweets)
          .where(
            and(
              eq(collectionTweets.userId, userId),
              eq(collectionTweets.collectionId, collectionId),
              eq(collectionTweets.platform, platform as string),
              eq(collectionTweets.bookmarkId, bookmarkId),
            ),
          )
          .run()

        db.update(collections)
          .set({ updatedAt: now })
          .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
          .run()
      })

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Error removing tweet from collection:', error)
      return NextResponse.json({ error: 'Failed to remove tweet from collection' }, { status: 500 })
    }
  },
)

// GET /api/collections/[id]/tweets - Get collections for a specific bookmark
export const GET = withAuth(
  async (request: NextRequest, userId, { params }: { params: Promise<{ id: string }> }) => {
    try {
      // In this case, id is the bookmarkId (used for checking which collections contain a tweet)
      const { id: bookmarkId } = await params
      const url = new URL(request.url)
      const mode = url.searchParams.get('mode')
      const platform = parsePlatform(url.searchParams.get('platform'))

      // If mode=bookmark, return collections that contain this bookmark
      if (mode === 'bookmark') {
        const collectionMemberships = await db
          .select({
            collectionId: collectionTweets.collectionId,
          })
          .from(collectionTweets)
          .where(
            and(
              eq(collectionTweets.userId, userId),
              eq(collectionTweets.bookmarkId, bookmarkId),
              ...(platform ? [eq(collectionTweets.platform, platform)] : []),
            ),
          )

        return NextResponse.json({
          collectionIds: collectionMemberships.map((m) => m.collectionId),
        })
      }

      // Default: return tweets in collection (collectionId)
      const collectionId = bookmarkId // In default mode, the id is collectionId

      const tweets = await db
        .select({
          bookmarkId: collectionTweets.bookmarkId,
          platform: collectionTweets.platform,
          addedAt: collectionTweets.addedAt,
          notes: collectionTweets.notes,
        })
        .from(collectionTweets)
        .where(
          and(eq(collectionTweets.userId, userId), eq(collectionTweets.collectionId, collectionId)),
        )

      return NextResponse.json({ tweets })
    } catch (error) {
      console.error('Error fetching collection tweets:', error)
      return NextResponse.json({ error: 'Failed to fetch collection tweets' }, { status: 500 })
    }
  },
)
