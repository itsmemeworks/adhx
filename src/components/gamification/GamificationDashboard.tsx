'use client'

import { useState, useEffect } from 'react'
import { Trophy, BookOpen, Bookmark, Tags, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { LevelBadge } from './LevelBadge'
import { StreakDisplay } from './StreakDisplay'
import { AchievementCard } from './AchievementCard'
import { type Achievement, type AchievementCategory } from '@/lib/gamification/achievements'

interface GamificationProfile {
  level: number
  totalXp: number
  xpToNextLevel: number
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
  lifetimeRead: number
  lifetimeBookmarked: number
  lifetimeTagged: number
  uniqueTags: number
  collections: number
  publicCollections: number
  achievements: (Achievement & { unlocked: boolean; unlockedAt?: string })[]
  unlockedCount: number
  totalAchievements: number
}

const CATEGORY_LABELS: Record<AchievementCategory, { label: string; icon: React.ReactNode }> = {
  bookmarking: { label: 'Bookmarking', icon: <Bookmark className="h-4 w-4" /> },
  reading: { label: 'Reading', icon: <BookOpen className="h-4 w-4" /> },
  streaks: { label: 'Streaks', icon: <Trophy className="h-4 w-4" /> },
  organization: { label: 'Organization', icon: <Tags className="h-4 w-4" /> },
  curation: { label: 'Curation', icon: <Trophy className="h-4 w-4" /> },
}

export function GamificationDashboard() {
  const [profile, setProfile] = useState<GamificationProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedCategory, setExpandedCategory] = useState<AchievementCategory | null>(null)

  useEffect(() => {
    fetchProfile()
  }, [])

  async function fetchProfile() {
    try {
      setLoading(true)
      const response = await fetch('/api/gamification')
      if (!response.ok) throw new Error('Failed to fetch gamification data')
      const data = await response.json()
      setProfile(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-xl" />
        <div className="h-48 bg-gray-200 dark:bg-gray-800 rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>{error}</p>
        <button
          onClick={fetchProfile}
          className="mt-2 text-purple-500 hover:text-purple-600 flex items-center gap-1 mx-auto"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    )
  }

  if (!profile) return null

  // Group achievements by category
  const achievementsByCategory = profile.achievements.reduce(
    (acc, achievement) => {
      if (!acc[achievement.category]) {
        acc[achievement.category] = []
      }
      acc[achievement.category].push(achievement)
      return acc
    },
    {} as Record<AchievementCategory, typeof profile.achievements>
  )

  return (
    <div className="space-y-6">
      {/* Level and XP */}
      <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl">
        <LevelBadge level={profile.level} totalXp={profile.totalXp} />
      </div>

      {/* Streak */}
      <StreakDisplay
        currentStreak={profile.currentStreak}
        longestStreak={profile.longestStreak}
        lastActiveDate={profile.lastActiveDate}
      />

      {/* Lifetime Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl text-center">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {profile.lifetimeRead}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Read</p>
        </div>
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-center">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {profile.lifetimeBookmarked}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Bookmarked</p>
        </div>
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-center">
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {profile.lifetimeTagged}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Tagged</p>
        </div>
      </div>

      {/* Achievements */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Achievements
          </h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {profile.unlockedCount} / {profile.totalAchievements}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
            style={{ width: `${(profile.unlockedCount / profile.totalAchievements) * 100}%` }}
          />
        </div>

        {/* Categories */}
        <div className="space-y-2">
          {(Object.keys(achievementsByCategory) as AchievementCategory[]).map((category) => {
            const achievements = achievementsByCategory[category]
            const unlockedInCategory = achievements.filter((a) => a.unlocked).length
            const isExpanded = expandedCategory === category
            const categoryInfo = CATEGORY_LABELS[category]

            return (
              <div key={category} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : category)}
                  className="w-full p-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {categoryInfo.icon}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {categoryInfo.label}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ({unlockedInCategory}/{achievements.length})
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  )}
                </button>

                {isExpanded && (
                  <div className="p-3 space-y-2 bg-white dark:bg-gray-900">
                    {achievements.map((achievement) => (
                      <AchievementCard key={achievement.id} achievement={achievement} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
