import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { userProfiles, oauthTokens, userGamification, userAchievements, collections, bookmarks, readStatus } from '@/lib/db/schema'
import { eq, and, count } from 'drizzle-orm'
import { ALL_ACHIEVEMENTS } from '@/lib/gamification'

/**
 * GET /api/profile/[username]
 *
 * Get a public user profile by username
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params

  try {
    // Find user by username
    const [oauth] = await db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.username, username))

    if (!oauth) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userId = oauth.userId

    // Get profile settings
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId))

    // Check if profile is public
    if (!profile?.isPublic) {
      return NextResponse.json({ error: 'Profile is private' }, { status: 403 })
    }

    // Base profile data
    const response: Record<string, unknown> = {
      userId,
      username: oauth.username,
      profileImageUrl: oauth.profileImageUrl,
      displayName: profile.displayName ?? oauth.username,
      bio: profile.bio ?? '',
    }

    // Include stats if enabled
    if (profile.showStats) {
      const [gamification] = await db.select().from(userGamification).where(eq(userGamification.userId, userId))

      // Count total bookmarks
      const [bookmarksCount] = await db
        .select({ count: count() })
        .from(bookmarks)
        .where(eq(bookmarks.userId, userId))

      // Count read bookmarks
      const [readCount] = await db
        .select({ count: count() })
        .from(readStatus)
        .where(eq(readStatus.userId, userId))

      response.stats = {
        level: gamification?.level ?? 1,
        totalXp: gamification?.totalXp ?? 0,
        currentStreak: gamification?.currentStreak ?? 0,
        longestStreak: gamification?.longestStreak ?? 0,
        lifetimeRead: gamification?.lifetimeRead ?? 0,
        lifetimeBookmarked: gamification?.lifetimeBookmarked ?? 0,
        totalBookmarks: bookmarksCount?.count ?? 0,
        readBookmarks: readCount?.count ?? 0,
      }
    }

    // Include achievements if enabled
    if (profile.showAchievements) {
      const achievements = await db
        .select()
        .from(userAchievements)
        .where(eq(userAchievements.userId, userId))

      const unlockedIds = new Set(achievements.map((a) => a.achievementId))

      response.achievements = {
        unlocked: ALL_ACHIEVEMENTS.filter((a) => unlockedIds.has(a.id)).map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          icon: a.icon,
          category: a.category,
        })),
        unlockedCount: achievements.length,
        totalAchievements: ALL_ACHIEVEMENTS.length,
      }
    }

    // Include public collections
    const publicCollections = await db
      .select()
      .from(collections)
      .where(and(eq(collections.userId, userId), eq(collections.isPublic, true)))

    response.publicCollections = publicCollections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      color: c.color,
      icon: c.icon,
    }))

    return NextResponse.json(response)
  } catch (error) {
    console.error('Failed to fetch public profile:', error)
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 })
  }
}
