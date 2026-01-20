'use client'

import { getLevelProgress, getLevelTitle, formatXp } from '@/lib/gamification/xp'

interface LevelBadgeProps {
  level: number
  totalXp: number
  showProgress?: boolean
}

export function LevelBadge({ level, totalXp, showProgress = true }: LevelBadgeProps) {
  const progress = getLevelProgress(totalXp)
  const title = getLevelTitle(level)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {/* Level badge */}
        <div className="relative">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg">
            <span className="text-2xl font-bold text-white">{level}</span>
          </div>
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-full bg-purple-500/30 blur-md -z-10" />
        </div>

        <div className="flex-1">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">{title}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {formatXp(totalXp)} XP total
          </p>
        </div>
      </div>

      {showProgress && (
        <div className="mt-1">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>Level {level}</span>
            <span>Level {level + 1}</span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full transition-all duration-500"
              style={{ width: `${progress.progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
            {formatXp(progress.progressXp)} / {formatXp(progress.nextLevelXp - progress.currentLevelXp)} XP to next level
          </p>
        </div>
      )}
    </div>
  )
}
