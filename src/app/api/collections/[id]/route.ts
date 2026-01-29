import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { collections, collectionTweets } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'
import { nanoid } from '@/lib/utils'

// GET /api/collections/[id] - Get a single collection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    const [collection] = await db
      .select({
        id: collections.id,
        name: collections.name,
        description: collections.description,
        color: collections.color,
        icon: collections.icon,
        shareCode: collections.shareCode,
        isPublic: collections.isPublic,
        createdAt: collections.createdAt,
        updatedAt: collections.updatedAt,
        tweetCount: sql<number>`(
          SELECT COUNT(*) FROM collection_tweets
          WHERE collection_tweets.collection_id = ${collections.id}
          AND collection_tweets.user_id = ${userId}
        )`.as('tweet_count'),
      })
      .from(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .limit(1)

    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    return NextResponse.json({ collection })
  } catch (error) {
    console.error('Error fetching collection:', error)
    return NextResponse.json({ error: 'Failed to fetch collection' }, { status: 500 })
  }
}

// PATCH /api/collections/[id] - Update a collection
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { name, description, color, icon, isPublic } = body

    // Verify ownership
    const [existing] = await db
      .select()
      .from(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .limit(1)

    if (!existing) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const updates: Partial<typeof existing> = {
      updatedAt: new Date().toISOString(),
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
      }
      updates.name = name.trim()
    }

    if (description !== undefined) {
      updates.description = description?.trim() || null
    }

    if (color !== undefined) {
      updates.color = color || null
    }

    if (icon !== undefined) {
      updates.icon = icon || null
    }

    if (isPublic !== undefined) {
      updates.isPublic = isPublic
      // Generate share code if making public and doesn't have one
      if (isPublic && !existing.shareCode) {
        updates.shareCode = nanoid(10)
      }
    }

    const [updated] = await db
      .update(collections)
      .set(updates)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .returning()

    return NextResponse.json({ collection: updated })
  } catch (error) {
    console.error('Error updating collection:', error)
    return NextResponse.json({ error: 'Failed to update collection' }, { status: 500 })
  }
}

// DELETE /api/collections/[id] - Delete a collection
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params

    // Verify ownership
    const [existing] = await db
      .select()
      .from(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))
      .limit(1)

    if (!existing) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    // Delete collection tweets first (foreign key constraint)
    await db
      .delete(collectionTweets)
      .where(and(eq(collectionTweets.collectionId, id), eq(collectionTweets.userId, userId)))

    // Delete collection
    await db
      .delete(collections)
      .where(and(eq(collections.id, id), eq(collections.userId, userId)))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting collection:', error)
    return NextResponse.json({ error: 'Failed to delete collection' }, { status: 500 })
  }
}
