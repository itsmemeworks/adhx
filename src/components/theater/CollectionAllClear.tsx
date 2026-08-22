'use client'

/**
 * Collection mode's end-of-queue done-state (docs/specs/unified-theater-collection.md
 * §2) — deliberately NOT `<StageWaiting/>` (that's the live-pulse "waiting
 * for new sends" stage; the collection theater's queue is a fixed snapshot that's genuinely
 * finished, not "more is coming"). Ported from the deleted `CollectionRail`'s
 * `FinishedPanel`.
 */

import { PartyPopper } from 'lucide-react'
import { StageHeadline } from './stage-primitives'

export interface CollectionAllClearProps {
  total: number
  onClose: () => void
}

export function CollectionAllClear({ total, onClose }: CollectionAllClearProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#08070a] px-6 text-center">
      <PartyPopper className="h-10 w-10 text-clay" />
      <StageHeadline>{total > 0 ? 'All caught up' : 'Nothing to review'}</StageHeadline>
      {total > 0 ? (
        <p className="text-sm text-white/60">
          You cleared {total} {total === 1 ? 'post' : 'posts'}.
        </p>
      ) : (
        <p className="text-sm text-white/60">Nothing waiting in your collection. Nice.</p>
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
