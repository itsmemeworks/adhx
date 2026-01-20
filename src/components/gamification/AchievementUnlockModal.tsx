'use client'

import { useEffect, useState } from 'react'
import * as LucideIcons from 'lucide-react'

interface UnlockedAchievement {
  id: string
  name: string
  description: string
  icon: string
  xpReward: number
}

interface AchievementUnlockModalProps {
  achievements: UnlockedAchievement[]
  onClose: () => void
}

// Get icon component from lucide-react by name
function getIcon(iconName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (LucideIcons as any)[iconName]
  return IconComponent || LucideIcons.Award
}

export function AchievementUnlockModal({ achievements, onClose }: AchievementUnlockModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [animating, setAnimating] = useState(true)

  const currentAchievement = achievements[currentIndex]
  const hasMore = currentIndex < achievements.length - 1

  useEffect(() => {
    // Reset animation when showing new achievement
    setAnimating(true)
    const timer = setTimeout(() => setAnimating(false), 500)
    return () => clearTimeout(timer)
  }, [currentIndex])

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (hasMore) {
          setCurrentIndex((i) => i + 1)
        } else {
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasMore, onClose])

  if (!currentAchievement) return null

  const Icon = getIcon(currentAchievement.icon)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with celebration effect */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => (hasMore ? setCurrentIndex((i) => i + 1) : onClose())}
      />

      {/* Confetti/sparkle particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 bg-amber-400 rounded-full animate-ping"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${1 + Math.random()}s`,
            }}
          />
        ))}
      </div>

      {/* Modal content */}
      <div
        className={`relative bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/30 rounded-3xl p-8 max-w-sm w-full shadow-2xl border-2 border-amber-200 dark:border-amber-700 transition-all duration-500 ${
          animating ? 'scale-110 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        {/* Achievement count badge */}
        {achievements.length > 1 && (
          <div className="absolute top-4 right-4 px-2 py-1 bg-amber-200 dark:bg-amber-800 rounded-full text-xs font-medium text-amber-700 dark:text-amber-200">
            {currentIndex + 1} / {achievements.length}
          </div>
        )}

        {/* Trophy icon with glow */}
        <div className="relative mx-auto w-24 h-24 mb-6">
          <div className="absolute inset-0 bg-amber-400/50 rounded-full blur-xl animate-pulse" />
          <div className="relative w-full h-full bg-gradient-to-br from-amber-400 to-amber-600 rounded-full flex items-center justify-center shadow-lg">
            <Icon className="h-12 w-12 text-white" />
          </div>
        </div>

        {/* Text */}
        <div className="text-center">
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">
            Achievement Unlocked!
          </p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {currentAchievement.name}
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            {currentAchievement.description}
          </p>

          {/* XP reward */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-full shadow-lg">
            <LucideIcons.Sparkles className="h-4 w-4" />
            <span className="font-bold">+{currentAchievement.xpReward} XP</span>
          </div>
        </div>

        {/* Continue button */}
        <button
          onClick={() => (hasMore ? setCurrentIndex((i) => i + 1) : onClose())}
          className="w-full mt-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold transition-colors"
        >
          {hasMore ? 'Next Achievement' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
