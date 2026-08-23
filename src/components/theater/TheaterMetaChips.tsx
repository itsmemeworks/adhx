'use client'

import { Flame } from 'lucide-react'

export function FlameChip({ trendCount }: { trendCount: number }) {
  if (trendCount < 2) return null
  return (
    <span className="inline-flex min-h-[32px] flex-none items-center gap-1 rounded-full bg-black/40 px-2.5 text-[11px] font-bold text-orange-300 backdrop-blur-sm">
      <Flame size={11} className="text-orange-400" fill="currentColor" />
      <span>{trendCount}</span>
    </span>
  )
}
