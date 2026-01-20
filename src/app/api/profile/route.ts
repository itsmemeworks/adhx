import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { userProfiles, oauthTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'

/**
 * GET /api/profile
 *
 * Get the current user's profile settings
 */
export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get profile settings
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId))

    // Get username from oauth tokens
    const [oauth] = await db.select().from(oauthTokens).where(eq(oauthTokens.userId, userId))

    return NextResponse.json({
      userId,
      username: oauth?.username,
      profileImageUrl: oauth?.profileImageUrl,
      displayName: profile?.displayName ?? oauth?.username,
      bio: profile?.bio ?? '',
      isPublic: profile?.isPublic ?? false,
      showStats: profile?.showStats ?? true,
      showAchievements: profile?.showAchievements ?? true,
      featuredCollectionId: profile?.featuredCollectionId ?? null,
    })
  } catch (error) {
    console.error('Failed to fetch profile:', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}

/**
 * PUT /api/profile
 *
 * Update the current user's profile settings
 */
export async function PUT(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { displayName, bio, isPublic, showStats, showAchievements, featuredCollectionId } = body

    // Validate bio length
    if (bio && bio.length > 160) {
      return NextResponse.json({ error: 'Bio must be 160 characters or less' }, { status: 400 })
    }

    // Check if profile exists
    const [existingProfile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId))

    const profileData = {
      displayName: displayName || null,
      bio: bio || null,
      isPublic: isPublic ?? false,
      showStats: showStats ?? true,
      showAchievements: showAchievements ?? true,
      featuredCollectionId: featuredCollectionId || null,
      updatedAt: new Date().toISOString(),
    }

    if (existingProfile) {
      // Update existing profile
      await db.update(userProfiles).set(profileData).where(eq(userProfiles.userId, userId))
    } else {
      // Create new profile
      await db.insert(userProfiles).values({
        userId,
        ...profileData,
        createdAt: new Date().toISOString(),
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update profile:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
