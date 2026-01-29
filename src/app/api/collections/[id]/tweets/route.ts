import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { collections, collectionTweets, bookmarks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'

// POST /api/collections/[id]/tweets - Add a tweet to a collection
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id: collectionId } = await params
    const body = await request.json()
    const { bookmarkId, notes } = body

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

    // Verify bookmark exists and belongs to user
    const [bookmark] = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)))
      .limit(1)

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    // Check if already in collection
    const [existing] = await db
      .select()
      .from(collectionTweets)
      .where(
        and(
          eq(collectionTweets.userId, userId),
          eq(collectionTweets.collectionId, collectionId),
          eq(collectionTweets.bookmarkId, bookmarkId)
        )
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
              eq(collectionTweets.bookmarkId, bookmarkId)
            )
          )
      }
      return NextResponse.json({ success: true, alreadyExists: true })
    }

    // Add to collection
    await db.insert(collectionTweets).values({
      userId,
      collectionId,
      bookmarkId,
      addedAt: new Date().toISOString(),
      notes: notes?.trim() || null,
    })

    // Update collection's updatedAt
    await db
      .update(collections)
      .set({ updatedAt: new Date().toISOString() })
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error adding tweet to collection:', error)
    return NextResponse.json({ error: 'Failed to add tweet to collection' }, { status: 500 })
  }
}

// DELETE /api/collections/[id]/tweets - Remove a tweet from a collection
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id: collectionId } = await params
    const body = await request.json()
    const { bookmarkId } = body

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

    // Remove from collection
    await db
      .delete(collectionTweets)
      .where(
        and(
          eq(collectionTweets.userId, userId),
          eq(collectionTweets.collectionId, collectionId),
          eq(collectionTweets.bookmarkId, bookmarkId)
        )
      )

    // Update collection's updatedAt
    await db
      .update(collections)
      .set({ updatedAt: new Date().toISOString() })
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing tweet from collection:', error)
    return NextResponse.json({ error: 'Failed to remove tweet from collection' }, { status: 500 })
  }
}

// GET /api/collections/[id]/tweets - Get collections for a specific bookmark
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // In this case, id is the bookmarkId (used for checking which collections contain a tweet)
    const { id: bookmarkId } = await params
    const url = new URL(request.url)
    const mode = url.searchParams.get('mode')

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
            eq(collectionTweets.bookmarkId, bookmarkId)
          )
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
        addedAt: collectionTweets.addedAt,
        notes: collectionTweets.notes,
      })
      .from(collectionTweets)
      .where(
        and(
          eq(collectionTweets.userId, userId),
          eq(collectionTweets.collectionId, collectionId)
        )
      )

    return NextResponse.json({ tweets })
  } catch (error) {
    console.error('Error fetching collection tweets:', error)
    return NextResponse.json({ error: 'Failed to fetch collection tweets' }, { status: 500 })
  }
}
