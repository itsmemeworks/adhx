/**
 * Gamification system for ADHX
 *
 * Provides:
 * - XP and leveling
 * - Daily streaks
 * - Achievements
 */

export * from './achievements'
export * from './xp'
export * from './streaks'

import { db } from '@/lib/db'
import {
  userGamification,
  userAchievements,
  bookmarkTags,
  collections,
} from '@/lib/db/schema'
import { eq, count, countDistinct, and } from 'drizzle-orm'
import { nanoid } from '@/lib/utils'

import { ALL_ACHIEVEMENTS, getUnlockableAchievements, type UserStats, type Achievement } from './achievements'
import { calculateLevel, XP_VALUES, calculateActionXp } from './xp'
import { calculateStreakUpdate, getTodayDateString, type StreakUpdate } from './streaks'

// Get or initialize gamification data for a user
export async function getGamificationStats(userId: string) {
  const [stats] = await db.select().from(userGamification).where(eq(userGamification.userId, userId))

  if (!stats) {
    // Initialize stats for new user
    const newStats = {
      userId,
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      totalXp: 0,
      level: 1,
      lifetimeRead: 0,
      lifetimeBookmarked: 0,
      lifetimeTagged: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await db.insert(userGamification).values(newStats)
    return newStats
  }

  return stats
}

// Get user's unlocked achievements
export async function getUserAchievements(userId: string) {
  return db.select().from(userAchievements).where(eq(userAchievements.userId, userId))
}

// Get extended stats needed for achievement checking
export async function getExtendedStats(userId: string): Promise<UserStats> {
  const [gamificationStats] = await db.select().from(userGamification).where(eq(userGamification.userId, userId))

  // Count unique tags
  const [uniqueTagsResult] = await db
    .select({ count: countDistinct(bookmarkTags.tag) })
    .from(bookmarkTags)
    .where(eq(bookmarkTags.userId, userId))

  // Count collections
  const [collectionsResult] = await db
    .select({ count: count() })
    .from(collections)
    .where(eq(collections.userId, userId))

  // Count public collections
  const [publicCollectionsResult] = await db
    .select({ count: count() })
    .from(collections)
    .where(and(eq(collections.userId, userId), eq(collections.isPublic, true)))

  return {
    lifetimeBookmarked: gamificationStats?.lifetimeBookmarked ?? 0,
    lifetimeRead: gamificationStats?.lifetimeRead ?? 0,
    currentStreak: gamificationStats?.currentStreak ?? 0,
    longestStreak: gamificationStats?.longestStreak ?? 0,
    lifetimeTagged: gamificationStats?.lifetimeTagged ?? 0,
    uniqueTags: uniqueTagsResult?.count ?? 0,
    collections: collectionsResult?.count ?? 0,
    publicCollections: publicCollectionsResult?.count ?? 0,
  }
}

// Check and unlock achievements
export async function checkAndUnlockAchievements(
  userId: string
): Promise<{ newAchievements: Achievement[]; xpGained: number }> {
  const stats = await getExtendedStats(userId)
  const existingAchievements = await getUserAchievements(userId)
  const unlockedIds = new Set(existingAchievements.map((a) => a.achievementId))

  const unlockable = getUnlockableAchievements(stats, unlockedIds)

  if (unlockable.length === 0) {
    return { newAchievements: [], xpGained: 0 }
  }

  // Insert new achievements
  const now = new Date().toISOString()
  await db.insert(userAchievements).values(
    unlockable.map((achievement) => ({
      id: nanoid(),
      userId,
      achievementId: achievement.id,
      unlockedAt: now,
      progress: achievement.threshold,
    }))
  )

  // Calculate XP from achievements
  const xpGained = unlockable.reduce((total, a) => total + a.xpReward, 0)

  // Update total XP and level if achievements were unlocked
  if (xpGained > 0) {
    const [currentStats] = await db.select().from(userGamification).where(eq(userGamification.userId, userId))
    const newTotalXp = (currentStats?.totalXp ?? 0) + xpGained
    const newLevel = calculateLevel(newTotalXp)

    await db
      .update(userGamification)
      .set({
        totalXp: newTotalXp,
        level: newLevel,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(userGamification.userId, userId))
  }

  return { newAchievements: unlockable, xpGained }
}

// Record a read action and update gamification
export interface ReadActionResult {
  xpGained: number
  newLevel: number | null
  streakUpdate: StreakUpdate
  newAchievements: Achievement[]
}

export async function recordReadAction(userId: string): Promise<ReadActionResult> {
  // Get current stats
  const stats = await getGamificationStats(userId)

  // Calculate streak update
  const streakUpdate = calculateStreakUpdate(stats.currentStreak ?? 0, stats.longestStreak ?? 0, stats.lastActiveDate)

  // Calculate XP (with streak bonus for reads)
  const baseXp = calculateActionXp('READ_BOOKMARK', streakUpdate.newStreak)

  // Update gamification stats
  const newTotalXp = (stats.totalXp ?? 0) + baseXp
  const newLevel = calculateLevel(newTotalXp)
  const leveledUp = newLevel > (stats.level ?? 1)

  await db
    .update(userGamification)
    .set({
      totalXp: newTotalXp,
      level: newLevel,
      lifetimeRead: (stats.lifetimeRead ?? 0) + 1,
      currentStreak: streakUpdate.newStreak,
      longestStreak: streakUpdate.longestStreak,
      lastActiveDate: getTodayDateString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(userGamification.userId, userId))

  // Check for new achievements
  const { newAchievements, xpGained: achievementXp } = await checkAndUnlockAchievements(userId)

  return {
    xpGained: baseXp + achievementXp,
    newLevel: leveledUp ? newLevel : null,
    streakUpdate,
    newAchievements,
  }
}

// Record a bookmark save action
export async function recordBookmarkAction(userId: string): Promise<{ xpGained: number; newAchievements: Achievement[] }> {
  const stats = await getGamificationStats(userId)

  const xp = XP_VALUES.SAVE_BOOKMARK
  const newTotalXp = (stats.totalXp ?? 0) + xp
  const newLevel = calculateLevel(newTotalXp)

  await db
    .update(userGamification)
    .set({
      totalXp: newTotalXp,
      level: newLevel,
      lifetimeBookmarked: (stats.lifetimeBookmarked ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(userGamification.userId, userId))

  const { newAchievements, xpGained: achievementXp } = await checkAndUnlockAchievements(userId)

  return { xpGained: xp + achievementXp, newAchievements }
}

// Record a tag action
export async function recordTagAction(userId: string): Promise<{ xpGained: number; newAchievements: Achievement[] }> {
  const stats = await getGamificationStats(userId)

  const xp = XP_VALUES.TAG_BOOKMARK
  const newTotalXp = (stats.totalXp ?? 0) + xp
  const newLevel = calculateLevel(newTotalXp)

  await db
    .update(userGamification)
    .set({
      totalXp: newTotalXp,
      level: newLevel,
      lifetimeTagged: (stats.lifetimeTagged ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(userGamification.userId, userId))

  const { newAchievements, xpGained: achievementXp } = await checkAndUnlockAchievements(userId)

  return { xpGained: xp + achievementXp, newAchievements }
}

// Get complete gamification profile for API response
export async function getGamificationProfile(userId: string) {
  const stats = await getGamificationStats(userId)
  const achievements = await getUserAchievements(userId)
  const extendedStats = await getExtendedStats(userId)

  const unlockedIds = new Set(achievements.map((a) => a.achievementId))

  return {
    // Level and XP
    level: stats.level ?? 1,
    totalXp: stats.totalXp ?? 0,
    xpToNextLevel: calculateLevel((stats.level ?? 1) + 1) - (stats.totalXp ?? 0),

    // Streak
    currentStreak: stats.currentStreak ?? 0,
    longestStreak: stats.longestStreak ?? 0,
    lastActiveDate: stats.lastActiveDate,

    // Lifetime stats
    lifetimeRead: stats.lifetimeRead ?? 0,
    lifetimeBookmarked: stats.lifetimeBookmarked ?? 0,
    lifetimeTagged: stats.lifetimeTagged ?? 0,

    // Extended stats
    uniqueTags: extendedStats.uniqueTags,
    collections: extendedStats.collections,
    publicCollections: extendedStats.publicCollections,

    // Achievements
    achievements: ALL_ACHIEVEMENTS.map((achievement) => ({
      ...achievement,
      unlocked: unlockedIds.has(achievement.id),
      unlockedAt: achievements.find((a) => a.achievementId === achievement.id)?.unlockedAt,
    })),

    unlockedCount: achievements.length,
    totalAchievements: ALL_ACHIEVEMENTS.length,
  }
}
