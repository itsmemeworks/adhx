import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { userProfiles, oauthTokens, userGamification, userFollows } from '@/lib/db/schema'
import { eq, count, sql } from 'drizzle-orm'

/**
 * GET /api/discover
 *
 * Get public profiles for discovery
 * Query params:
 * - sort: 'recent' | 'followers' | 'level' | 'streak' (default: 'recent')
 * - search: username search query
 * - limit: number of results (default: 20, max: 50)
 * - offset: pagination offset (default: 0)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const sort = searchParams.get('sort') || 'recent'
  const search = searchParams.get('search')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
  const offset = parseInt(searchParams.get('offset') || '0')

  try {
    // Build base query with joins
    // Get all public profiles with their associated data
    const publicProfiles = await db
      .select({
        userId: userProfiles.userId,
        displayName: userProfiles.displayName,
        bio: userProfiles.bio,
        username: oauthTokens.username,
        profileImageUrl: oauthTokens.profileImageUrl,
        level: userGamification.level,
        totalXp: userGamification.totalXp,
        currentStreak: userGamification.currentStreak,
        createdAt: userProfiles.createdAt,
      })
      .from(userProfiles)
      .innerJoin(oauthTokens, eq(userProfiles.userId, oauthTokens.userId))
      .leftJoin(userGamification, eq(userProfiles.userId, userGamification.userId))
      .where(
        search
          ? sql`${userProfiles.isPublic} = 1 AND ${oauthTokens.username} LIKE ${`%${search}%`}`
          : eq(userProfiles.isPublic, true)
      )

    // Get follower counts for all profiles
    const followerCounts = await db
      .select({
        userId: userFollows.followingId,
        count: count(),
      })
      .from(userFollows)
      .groupBy(userFollows.followingId)

    // Create a map of follower counts
    const followerMap = new Map(followerCounts.map((f) => [f.userId, f.count]))

    // Add follower counts to profiles
    const profilesWithFollowers = publicProfiles.map((profile) => ({
      ...profile,
      followers: followerMap.get(profile.userId) ?? 0,
      displayName: profile.displayName ?? profile.username,
      level: profile.level ?? 1,
      totalXp: profile.totalXp ?? 0,
      currentStreak: profile.currentStreak ?? 0,
    }))

    // Sort profiles
    let sorted = profilesWithFollowers
    switch (sort) {
      case 'followers':
        sorted = sorted.sort((a, b) => b.followers - a.followers)
        break
      case 'level':
        sorted = sorted.sort((a, b) => b.level - a.level || b.totalXp - a.totalXp)
        break
      case 'streak':
        sorted = sorted.sort((a, b) => b.currentStreak - a.currentStreak)
        break
      case 'recent':
      default:
        sorted = sorted.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return dateB - dateA
        })
        break
    }

    // Paginate
    const paginated = sorted.slice(offset, offset + limit)

    return NextResponse.json({
      profiles: paginated.map((p) => ({
        userId: p.userId,
        username: p.username,
        displayName: p.displayName,
        profileImageUrl: p.profileImageUrl,
        bio: p.bio,
        level: p.level,
        currentStreak: p.currentStreak,
        followers: p.followers,
      })),
      total: sorted.length,
      hasMore: offset + limit < sorted.length,
    })
  } catch (error) {
    console.error('Failed to fetch discover profiles:', error)
    return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 })
  }
}
