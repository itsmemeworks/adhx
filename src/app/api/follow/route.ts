import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { userFollows, userProfiles } from '@/lib/db/schema'
import { eq, and, count } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'

/**
 * GET /api/follow?userId={userId}
 *
 * Check if current user is following a specific user
 * Also returns follower/following counts
 *
 * Note: This endpoint is partially public - follower counts are returned
 * for all users, but isFollowing requires authentication.
 */
export async function GET(request: NextRequest) {
  const currentUserId = await getCurrentUserId()

  const searchParams = request.nextUrl.searchParams
  const targetUserId = searchParams.get('userId')

  if (!targetUserId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  try {
    // Check if following (only if authenticated)
    let isFollowing = false
    if (currentUserId) {
      const [followRecord] = await db
        .select()
        .from(userFollows)
        .where(and(eq(userFollows.followerId, currentUserId), eq(userFollows.followingId, targetUserId)))
      isFollowing = !!followRecord
    }

    // Get follower count
    const [followerCount] = await db
      .select({ count: count() })
      .from(userFollows)
      .where(eq(userFollows.followingId, targetUserId))

    // Get following count
    const [followingCount] = await db
      .select({ count: count() })
      .from(userFollows)
      .where(eq(userFollows.followerId, targetUserId))

    return NextResponse.json({
      isFollowing,
      followers: followerCount?.count ?? 0,
      following: followingCount?.count ?? 0,
    })
  } catch (error) {
    console.error('Failed to check follow status:', error)
    return NextResponse.json({ error: 'Failed to check follow status' }, { status: 500 })
  }
}

/**
 * POST /api/follow
 *
 * Follow a user
 * Body: { userId: string }
 */
export async function POST(request: NextRequest) {
  const currentUserId = await getCurrentUserId()
  if (!currentUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { userId: targetUserId } = body

    if (!targetUserId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Can't follow yourself
    if (targetUserId === currentUserId) {
      return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })
    }

    // Check if target user exists and has a public profile
    const [targetProfile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, targetUserId))

    if (!targetProfile?.isPublic) {
      return NextResponse.json({ error: 'User not found or profile is private' }, { status: 404 })
    }

    // Check if already following
    const [existingFollow] = await db
      .select()
      .from(userFollows)
      .where(and(eq(userFollows.followerId, currentUserId), eq(userFollows.followingId, targetUserId)))

    if (existingFollow) {
      return NextResponse.json({ error: 'Already following this user' }, { status: 400 })
    }

    // Create follow record
    await db.insert(userFollows).values({
      followerId: currentUserId,
      followingId: targetUserId,
      createdAt: new Date().toISOString(),
    })

    // Get updated follower count
    const [followerCount] = await db
      .select({ count: count() })
      .from(userFollows)
      .where(eq(userFollows.followingId, targetUserId))

    return NextResponse.json({
      success: true,
      followers: followerCount?.count ?? 0,
    })
  } catch (error) {
    console.error('Failed to follow user:', error)
    return NextResponse.json({ error: 'Failed to follow user' }, { status: 500 })
  }
}

/**
 * DELETE /api/follow
 *
 * Unfollow a user
 * Body: { userId: string }
 */
export async function DELETE(request: NextRequest) {
  const currentUserId = await getCurrentUserId()
  if (!currentUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { userId: targetUserId } = body

    if (!targetUserId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Delete follow record
    await db
      .delete(userFollows)
      .where(and(eq(userFollows.followerId, currentUserId), eq(userFollows.followingId, targetUserId)))

    // Get updated follower count
    const [followerCount] = await db
      .select({ count: count() })
      .from(userFollows)
      .where(eq(userFollows.followingId, targetUserId))

    return NextResponse.json({
      success: true,
      followers: followerCount?.count ?? 0,
    })
  } catch (error) {
    console.error('Failed to unfollow user:', error)
    return NextResponse.json({ error: 'Failed to unfollow user' }, { status: 500 })
  }
}
