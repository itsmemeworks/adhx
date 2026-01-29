import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { collections } from '@/lib/db/schema'
import { eq, desc, sql } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'
import { nanoid } from '@/lib/utils'

// GET /api/collections - List user's collections with tweet counts
export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get collections with tweet counts
    const userCollections = await db
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
      .where(eq(collections.userId, userId))
      .orderBy(desc(collections.updatedAt), desc(collections.createdAt))

    return NextResponse.json({ collections: userCollections })
  } catch (error) {
    console.error('Error fetching collections:', error)
    return NextResponse.json({ error: 'Failed to fetch collections' }, { status: 500 })
  }
}

// POST /api/collections - Create a new collection
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, description, color, icon, isPublic } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const id = nanoid()
    const now = new Date().toISOString()

    // Generate share code if public
    const shareCode = isPublic ? nanoid(10) : null

    const [newCollection] = await db
      .insert(collections)
      .values({
        id,
        userId,
        name: name.trim(),
        description: description?.trim() || null,
        color: color || null,
        icon: icon || null,
        shareCode,
        isPublic: isPublic || false,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    return NextResponse.json({
      collection: {
        ...newCollection,
        tweetCount: 0,
      },
    })
  } catch (error) {
    console.error('Error creating collection:', error)
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 })
  }
}
