/**
 * XP and Level calculation system for ADHX gamification
 *
 * Uses a polynomial curve for leveling - early levels are quick to achieve
 * while higher levels require progressively more XP. This keeps new users
 * engaged while giving long-term users goals to work toward.
 */

// XP awarded for different actions
export const XP_VALUES = {
  // Core actions
  READ_BOOKMARK: 5, // Mark as read
  SAVE_BOOKMARK: 3, // Save new bookmark
  TAG_BOOKMARK: 2, // Add tag
  CREATE_COLLECTION: 10, // Create collection
  ADD_TO_COLLECTION: 2, // Add bookmark to collection

  // Streak bonuses (multiplied by streak length, capped)
  STREAK_BONUS_PER_DAY: 1, // Extra XP per day of current streak
  STREAK_BONUS_CAP: 10, // Max streak bonus
} as const

// Level thresholds - using a polynomial curve
// Level N requires: 100 * N^1.5 total XP
// This means: L1=100, L2=283, L3=520, L5=1118, L10=3162, L20=8944
export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0
  return Math.floor(100 * Math.pow(level, 1.5))
}

// Calculate level from total XP
export function calculateLevel(totalXp: number): number {
  // Binary search for level
  let low = 1
  let high = 100 // Max level cap

  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (xpRequiredForLevel(mid) <= totalXp) {
      low = mid
    } else {
      high = mid - 1
    }
  }

  return low
}

// Get XP progress within current level
export function getLevelProgress(totalXp: number): {
  level: number
  currentLevelXp: number // XP needed to reach current level
  nextLevelXp: number // XP needed to reach next level
  progressXp: number // XP earned toward next level
  progressPercent: number // 0-100
} {
  const level = calculateLevel(totalXp)
  const currentLevelXp = xpRequiredForLevel(level)
  const nextLevelXp = xpRequiredForLevel(level + 1)
  const progressXp = totalXp - currentLevelXp
  const xpForNextLevel = nextLevelXp - currentLevelXp
  const progressPercent = Math.min(100, Math.floor((progressXp / xpForNextLevel) * 100))

  return {
    level,
    currentLevelXp,
    nextLevelXp,
    progressXp,
    progressPercent,
  }
}

// Calculate XP to award for an action with streak bonus
export function calculateActionXp(action: keyof typeof XP_VALUES, currentStreak: number = 0): number {
  const baseXp = XP_VALUES[action]

  // Apply streak bonus for read actions
  if (action === 'READ_BOOKMARK' && currentStreak > 0) {
    const streakBonus = Math.min(currentStreak, XP_VALUES.STREAK_BONUS_CAP) * XP_VALUES.STREAK_BONUS_PER_DAY
    return baseXp + streakBonus
  }

  return baseXp
}

// Level titles for display
export const LEVEL_TITLES: Record<number, string> = {
  1: 'Bookmark Novice',
  2: 'Link Collector',
  3: 'Web Wanderer',
  4: 'Info Hunter',
  5: 'Digital Curator',
  10: 'Knowledge Keeper',
  15: 'Archive Master',
  20: 'Internet Sage',
  25: 'Omniscient Reader',
  50: 'Legendary Hoarder',
}

// Get title for a level (finds the highest matching tier)
export function getLevelTitle(level: number): string {
  const tiers = Object.keys(LEVEL_TITLES)
    .map(Number)
    .sort((a, b) => b - a)

  for (const tier of tiers) {
    if (level >= tier) {
      return LEVEL_TITLES[tier]
    }
  }

  return LEVEL_TITLES[1]
}

// Format XP with "K" suffix for large numbers
export function formatXp(xp: number): string {
  if (xp >= 10000) {
    return `${(xp / 1000).toFixed(1)}K`
  }
  return xp.toLocaleString()
}
