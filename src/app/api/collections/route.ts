import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { collections } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'

/**
 * GET /api/collections
 *
 * Get the current user's collections
 */
export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const userCollections = await db
      .select({
        id: collections.id,
        name: collections.name,
        description: collections.description,
        color: collections.color,
        icon: collections.icon,
        isPublic: collections.isPublic,
      })
      .from(collections)
      .where(eq(collections.userId, userId))

    return NextResponse.json({ collections: userCollections })
  } catch (error) {
    console.error('Failed to fetch collections:', error)
    return NextResponse.json({ error: 'Failed to fetch collections' }, { status: 500 })
  }
}
