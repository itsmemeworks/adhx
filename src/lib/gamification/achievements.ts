/**
 * Achievement definitions for ADHX gamification system
 *
 * Achievements reward users for engagement milestones like bookmarking,
 * reading, maintaining streaks, and organizing their collections.
 */

export type AchievementCategory = 'bookmarking' | 'reading' | 'streaks' | 'organization' | 'curation'

export interface Achievement {
  id: string
  name: string
  description: string
  category: AchievementCategory
  icon: string // Lucide icon name
  threshold: number // Value needed to unlock
  xpReward: number
  // Which stat to check for this achievement
  statKey: 'lifetimeBookmarked' | 'lifetimeRead' | 'currentStreak' | 'longestStreak' | 'lifetimeTagged' | 'uniqueTags' | 'collections' | 'publicCollections'
}

// Bookmarking achievements - rewarding saving behavior
export const BOOKMARKING_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_save',
    name: 'First Save',
    description: 'Save your first bookmark',
    category: 'bookmarking',
    icon: 'Bookmark',
    threshold: 1,
    xpReward: 10,
    statKey: 'lifetimeBookmarked',
  },
  {
    id: 'bookmark_10',
    name: 'Getting Started',
    description: 'Save 10 bookmarks',
    category: 'bookmarking',
    icon: 'BookmarkPlus',
    threshold: 10,
    xpReward: 25,
    statKey: 'lifetimeBookmarked',
  },
  {
    id: 'bookmark_100',
    name: 'Collector',
    description: 'Save 100 bookmarks',
    category: 'bookmarking',
    icon: 'Library',
    threshold: 100,
    xpReward: 100,
    statKey: 'lifetimeBookmarked',
  },
  {
    id: 'bookmark_500',
    name: 'Archivist',
    description: 'Save 500 bookmarks',
    category: 'bookmarking',
    icon: 'Archive',
    threshold: 500,
    xpReward: 250,
    statKey: 'lifetimeBookmarked',
  },
  {
    id: 'bookmark_1000',
    name: 'Hoarder',
    description: 'Save 1,000 bookmarks',
    category: 'bookmarking',
    icon: 'Boxes',
    threshold: 1000,
    xpReward: 500,
    statKey: 'lifetimeBookmarked',
  },
]

// Reading achievements - rewarding actually reviewing saved content
export const READING_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_read',
    name: 'First Read',
    description: 'Mark your first bookmark as read',
    category: 'reading',
    icon: 'BookOpen',
    threshold: 1,
    xpReward: 10,
    statKey: 'lifetimeRead',
  },
  {
    id: 'reader_10',
    name: 'Casual Reader',
    description: 'Read 10 bookmarks',
    category: 'reading',
    icon: 'BookCheck',
    threshold: 10,
    xpReward: 25,
    statKey: 'lifetimeRead',
  },
  {
    id: 'reader_50',
    name: 'Avid Reader',
    description: 'Read 50 bookmarks',
    category: 'reading',
    icon: 'Glasses',
    threshold: 50,
    xpReward: 75,
    statKey: 'lifetimeRead',
  },
  {
    id: 'reader_100',
    name: 'Bookworm',
    description: 'Read 100 bookmarks',
    category: 'reading',
    icon: 'BookMarked',
    threshold: 100,
    xpReward: 150,
    statKey: 'lifetimeRead',
  },
  {
    id: 'reader_500',
    name: 'Scholar',
    description: 'Read 500 bookmarks',
    category: 'reading',
    icon: 'GraduationCap',
    threshold: 500,
    xpReward: 400,
    statKey: 'lifetimeRead',
  },
  {
    id: 'reader_1000',
    name: 'Sage',
    description: 'Read 1,000 bookmarks',
    category: 'reading',
    icon: 'Scroll',
    threshold: 1000,
    xpReward: 750,
    statKey: 'lifetimeRead',
  },
]

// Streak achievements - rewarding consistent usage
export const STREAK_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'streak_3',
    name: 'On a Roll',
    description: 'Maintain a 3-day streak',
    category: 'streaks',
    icon: 'Flame',
    threshold: 3,
    xpReward: 30,
    statKey: 'currentStreak',
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: 'Maintain a 7-day streak',
    category: 'streaks',
    icon: 'Calendar',
    threshold: 7,
    xpReward: 75,
    statKey: 'currentStreak',
  },
  {
    id: 'streak_14',
    name: 'Fortnight Focus',
    description: 'Maintain a 14-day streak',
    category: 'streaks',
    icon: 'CalendarCheck',
    threshold: 14,
    xpReward: 150,
    statKey: 'currentStreak',
  },
  {
    id: 'streak_30',
    name: 'Monthly Master',
    description: 'Maintain a 30-day streak',
    category: 'streaks',
    icon: 'CalendarDays',
    threshold: 30,
    xpReward: 300,
    statKey: 'currentStreak',
  },
  {
    id: 'streak_100',
    name: 'Century Club',
    description: 'Maintain a 100-day streak',
    category: 'streaks',
    icon: 'Trophy',
    threshold: 100,
    xpReward: 1000,
    statKey: 'currentStreak',
  },
  {
    id: 'streak_365',
    name: 'Year of Dedication',
    description: 'Maintain a 365-day streak',
    category: 'streaks',
    icon: 'Crown',
    threshold: 365,
    xpReward: 5000,
    statKey: 'currentStreak',
  },
]

// Organization achievements - rewarding tagging behavior
export const ORGANIZATION_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_tag',
    name: 'Organized Mind',
    description: 'Add your first tag',
    category: 'organization',
    icon: 'Tag',
    threshold: 1,
    xpReward: 10,
    statKey: 'lifetimeTagged',
  },
  {
    id: 'tag_10',
    name: 'Tagger',
    description: 'Tag 10 bookmarks',
    category: 'organization',
    icon: 'Tags',
    threshold: 10,
    xpReward: 25,
    statKey: 'lifetimeTagged',
  },
  {
    id: 'tag_50',
    name: 'Taxonomist',
    description: 'Tag 50 bookmarks',
    category: 'organization',
    icon: 'FolderTree',
    threshold: 50,
    xpReward: 75,
    statKey: 'lifetimeTagged',
  },
  {
    id: 'unique_tags_10',
    name: 'Category Creator',
    description: 'Use 10 unique tags',
    category: 'organization',
    icon: 'Layers',
    threshold: 10,
    xpReward: 50,
    statKey: 'uniqueTags',
  },
]

// Curation achievements - rewarding collection creation
export const CURATION_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_collection',
    name: 'Curator',
    description: 'Create your first collection',
    category: 'curation',
    icon: 'FolderHeart',
    threshold: 1,
    xpReward: 25,
    statKey: 'collections',
  },
  {
    id: 'collections_5',
    name: 'Gallery Owner',
    description: 'Create 5 collections',
    category: 'curation',
    icon: 'FolderOpen',
    threshold: 5,
    xpReward: 75,
    statKey: 'collections',
  },
  {
    id: 'first_public_collection',
    name: 'Going Public',
    description: 'Create your first public collection',
    category: 'curation',
    icon: 'Globe',
    threshold: 1,
    xpReward: 50,
    statKey: 'publicCollections',
  },
]

// All achievements combined
export const ALL_ACHIEVEMENTS: Achievement[] = [
  ...BOOKMARKING_ACHIEVEMENTS,
  ...READING_ACHIEVEMENTS,
  ...STREAK_ACHIEVEMENTS,
  ...ORGANIZATION_ACHIEVEMENTS,
  ...CURATION_ACHIEVEMENTS,
]

// Map for quick lookup
export const ACHIEVEMENTS_MAP = new Map(ALL_ACHIEVEMENTS.map((a) => [a.id, a]))

// Get achievement by ID
export function getAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS_MAP.get(id)
}

// Get all achievements for a category
export function getAchievementsByCategory(category: AchievementCategory): Achievement[] {
  return ALL_ACHIEVEMENTS.filter((a) => a.category === category)
}

// Get unlockable achievements based on current stats
export interface UserStats {
  lifetimeBookmarked: number
  lifetimeRead: number
  currentStreak: number
  longestStreak: number
  lifetimeTagged: number
  uniqueTags: number
  collections: number
  publicCollections: number
}

export function getUnlockableAchievements(stats: UserStats, unlockedIds: Set<string>): Achievement[] {
  return ALL_ACHIEVEMENTS.filter((achievement) => {
    // Skip already unlocked
    if (unlockedIds.has(achievement.id)) return false

    // Check if threshold is met
    const statValue = stats[achievement.statKey]
    return statValue >= achievement.threshold
  })
}

// Calculate total XP from achievements
export function calculateAchievementXp(unlockedIds: string[]): number {
  return unlockedIds.reduce((total, id) => {
    const achievement = ACHIEVEMENTS_MAP.get(id)
    return total + (achievement?.xpReward ?? 0)
  }, 0)
}
