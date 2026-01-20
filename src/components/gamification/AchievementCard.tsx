'use client'

import * as LucideIcons from 'lucide-react'
import { type Achievement, type AchievementCategory } from '@/lib/gamification/achievements'

interface AchievementCardProps {
  achievement: Achievement & { unlocked: boolean; unlockedAt?: string }
  compact?: boolean
}

// Get icon component from lucide-react by name
function getIcon(iconName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (LucideIcons as any)[iconName]
  return IconComponent || LucideIcons.Award
}

// Category colors
const CATEGORY_COLORS: Record<AchievementCategory, { bg: string; text: string; border: string }> = {
  bookmarking: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
  },
  reading: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-600 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
  },
  streaks: {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800',
  },
  organization: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
  },
  curation: {
    bg: 'bg-pink-100 dark:bg-pink-900/30',
    text: 'text-pink-600 dark:text-pink-400',
    border: 'border-pink-200 dark:border-pink-800',
  },
}

export function AchievementCard({ achievement, compact = false }: AchievementCardProps) {
  const Icon = getIcon(achievement.icon)
  const colors = CATEGORY_COLORS[achievement.category]

  if (compact) {
    return (
      <div
        className={`relative p-2 rounded-lg border transition-all ${
          achievement.unlocked
            ? `${colors.bg} ${colors.border}`
            : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-50'
        }`}
        title={`${achievement.name}: ${achievement.description}`}
      >
        <Icon className={`h-6 w-6 ${achievement.unlocked ? colors.text : 'text-gray-400'}`} />
        {!achievement.unlocked && (
          <div className="absolute inset-0 flex items-center justify-center">
            <LucideIcons.Lock className="h-3 w-3 text-gray-400" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={`relative p-4 rounded-xl border transition-all ${
        achievement.unlocked
          ? `${colors.bg} ${colors.border}`
          : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            achievement.unlocked ? colors.bg : 'bg-gray-200 dark:bg-gray-700'
          }`}
        >
          <Icon
            className={`h-6 w-6 ${
              achievement.unlocked ? colors.text : 'text-gray-400 dark:text-gray-500'
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4
              className={`font-semibold ${
                achievement.unlocked
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {achievement.name}
            </h4>
            {achievement.unlocked && (
              <span className="text-xs px-1.5 py-0.5 bg-white/50 dark:bg-black/20 rounded-full">
                +{achievement.xpReward} XP
              </span>
            )}
          </div>
          <p
            className={`text-sm mt-0.5 ${
              achievement.unlocked
                ? 'text-gray-600 dark:text-gray-300'
                : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {achievement.description}
          </p>
          {achievement.unlocked && achievement.unlockedAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Locked overlay */}
      {!achievement.unlocked && (
        <div className="absolute top-2 right-2">
          <LucideIcons.Lock className="h-4 w-4 text-gray-400 dark:text-gray-500" />
        </div>
      )}
    </div>
  )
}
