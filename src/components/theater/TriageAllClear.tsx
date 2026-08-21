'use client'

/**
 * Triage mode's end-of-queue done-state (docs/specs/unified-theater-triage.md
 * §2) — deliberately NOT `<StageWaiting/>` (that's the live-pulse "waiting
 * for new sends" stage; triage's queue is a fixed snapshot that's genuinely
 * finished, not "more is coming"). Ported from the deleted `CollectionRail`'s
 * `FinishedPanel`.
 */

import { Flame, PartyPopper } from 'lucide-react'
import { StageHeadline } from './stage-primitives'

export interface TriageAllClearProps {
  total: number
  streak: { current: number; longest: number }
  onClose: () => void
}

export function TriageAllClear({ total, streak, onClose }: TriageAllClearProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#08070a] px-6 text-center">
      <PartyPopper className="h-10 w-10 text-clay" />
      <StageHeadline>{total > 0 ? 'All caught up' : 'Nothing to triage'}</StageHeadline>
      {total > 0 ? (
        <p className="text-sm text-white/60">
          You processed {total} {total === 1 ? 'item' : 'items'}.
        </p>
      ) : (
        <p className="text-sm text-white/60">Your unread queue is empty. Nice.</p>
      )}
      {streak.current > 0 && (
        <p className="flex items-center justify-center gap-1.5 font-semibold text-orange-300">
          <Flame className="h-4 w-4" fill="currentColor" /> {streak.current}-day streak
        </p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="mt-2 min-h-[44px] rounded-full bg-clay-grad px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-opacity hover:opacity-90"
      >
        Close
      </button>
    </div>
  )
}
