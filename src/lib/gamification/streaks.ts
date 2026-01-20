/**
 * Streak tracking for ADHX gamification
 *
 * Streaks count consecutive days of activity (reading bookmarks).
 * A day counts as active if the user marks at least one bookmark as read.
 */

// Get today's date as YYYY-MM-DD in user's local timezone
export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0]
}

// Get yesterday's date as YYYY-MM-DD
export function getYesterdayDateString(): string {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return yesterday.toISOString().split('T')[0]
}

// Calculate days between two date strings
export function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA)
  const b = new Date(dateB)
  const diffTime = Math.abs(b.getTime() - a.getTime())
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

export interface StreakUpdate {
  newStreak: number
  longestStreak: number
  streakBroken: boolean
  isNewDay: boolean
}

/**
 * Calculate updated streak based on last activity date
 *
 * Rules:
 * - Same day: No change
 * - Yesterday: Increment streak
 * - 2+ days ago: Reset to 1
 */
export function calculateStreakUpdate(
  currentStreak: number,
  longestStreak: number,
  lastActiveDate: string | null
): StreakUpdate {
  const today = getTodayDateString()

  // First activity ever
  if (!lastActiveDate) {
    return {
      newStreak: 1,
      longestStreak: Math.max(longestStreak, 1),
      streakBroken: false,
      isNewDay: true,
    }
  }

  // Already active today
  if (lastActiveDate === today) {
    return {
      newStreak: currentStreak,
      longestStreak,
      streakBroken: false,
      isNewDay: false,
    }
  }

  const yesterday = getYesterdayDateString()
  const daysSinceActive = daysBetween(lastActiveDate, today)

  // Active yesterday - extend streak
  if (lastActiveDate === yesterday || daysSinceActive === 1) {
    const newStreak = currentStreak + 1
    return {
      newStreak,
      longestStreak: Math.max(longestStreak, newStreak),
      streakBroken: false,
      isNewDay: true,
    }
  }

  // Missed a day - streak broken, start fresh
  return {
    newStreak: 1,
    longestStreak, // Keep the record
    streakBroken: currentStreak > 0,
    isNewDay: true,
  }
}

// Generate activity data for the last N days (for calendar heatmap)
export interface ActivityDay {
  date: string // YYYY-MM-DD
  active: boolean
}

export function generateActivityCalendar(activeDates: Set<string>, days: number = 30): ActivityDay[] {
  const result: ActivityDay[] = []
  const today = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]

    result.push({
      date: dateStr,
      active: activeDates.has(dateStr),
    })
  }

  return result
}

// Get streak message for display
export function getStreakMessage(streak: number): string {
  if (streak === 0) return 'Start your streak today!'
  if (streak === 1) return 'Day 1 - Great start!'
  if (streak < 7) return `${streak} days - Keep it going!`
  if (streak < 14) return `${streak} days - Week streak!`
  if (streak < 30) return `${streak} days - You're on fire!`
  if (streak < 100) return `${streak} days - Incredible!`
  return `${streak} days - Legendary!`
}

// Check if streak is at risk (last active was yesterday, need activity today)
export function isStreakAtRisk(lastActiveDate: string | null, currentStreak: number): boolean {
  if (!lastActiveDate || currentStreak === 0) return false

  const yesterday = getYesterdayDateString()
  return lastActiveDate === yesterday
}
