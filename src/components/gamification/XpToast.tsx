'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

interface XpToastProps {
  xp: number
  onComplete?: () => void
}

export function XpToast({ xp, onComplete }: XpToastProps) {
  const [visible, setVisible] = useState(true)
  const [animating, setAnimating] = useState(true)

  useEffect(() => {
    // Animate out after showing
    const hideTimer = setTimeout(() => {
      setAnimating(false)
    }, 1500)

    const removeTimer = setTimeout(() => {
      setVisible(false)
      onComplete?.()
    }, 2000)

    return () => {
      clearTimeout(hideTimer)
      clearTimeout(removeTimer)
    }
  }, [onComplete])

  if (!visible) return null

  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${
        animating ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-full shadow-lg shadow-purple-500/30">
        <Sparkles className="h-4 w-4 animate-pulse" />
        <span className="font-bold">+{xp} XP</span>
      </div>
    </div>
  )
}
