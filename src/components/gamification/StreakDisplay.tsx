'use client'

import { Flame, Calendar } from 'lucide-react'
import { getStreakMessage, isStreakAtRisk } from '@/lib/gamification/streaks'

interface StreakDisplayProps {
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
}

export function StreakDisplay({ currentStreak, longestStreak, lastActiveDate }: StreakDisplayProps) {
  const atRisk = isStreakAtRisk(lastActiveDate, currentStreak)
  const message = getStreakMessage(currentStreak)

  return (
    <div className="p-4 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Flame icon with animation for active streaks */}
          <div className={`relative ${currentStreak > 0 ? 'animate-pulse' : ''}`}>
            <Flame
              className={`h-10 w-10 ${
                currentStreak > 0
                  ? 'text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]'
                  : 'text-gray-300 dark:text-gray-600'
              }`}
            />
            {atRisk && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full animate-ping" />
            )}
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900 dark:text-white">
                {currentStreak}
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                day{currentStreak !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-sm text-orange-600 dark:text-orange-400">{message}</p>
          </div>
        </div>

        {/* Longest streak badge */}
        {longestStreak > 0 && (
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-gray-400">Best streak</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {longestStreak}
            </p>
          </div>
        )}
      </div>

      {atRisk && (
        <div className="mt-3 p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
          <p className="text-xs text-amber-700 dark:text-amber-300 text-center">
            🔥 Read a bookmark today to keep your streak!
          </p>
        </div>
      )}
    </div>
  )
}
