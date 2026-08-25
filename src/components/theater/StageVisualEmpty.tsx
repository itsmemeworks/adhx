'use client'

/**
 * Live type filter with nothing to play. Not StageWaiting ("caught up") —
 * the queue isn't exhausted, it's filtered. One action: show every type.
 */

import { Images } from 'lucide-react'
import { StageHeadline } from './stage-primitives'

export function StageVisualEmpty({
  headline,
  onShowAll,
}: {
  headline: string
  onShowAll: () => void
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#08070a] px-6 text-center">
      <Images size={22} className="text-white/40" aria-hidden />
      <StageHeadline>
        <span>{headline}</span>
      </StageHeadline>
      <button
        type="button"
        onClick={onShowAll}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-white/25 bg-white/[0.14] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
      >
        <span>Show every post</span>
      </button>
    </div>
  )
}
