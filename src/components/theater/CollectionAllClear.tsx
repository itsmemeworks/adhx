'use client'

/**
 * Collection mode's end-of-queue done-state (docs/specs/unified-theater-collection.md
 * §2) — deliberately NOT `<StageWaiting/>` (that's the live-pulse "waiting
 * for new sends" stage; the collection theater's queue is a fixed snapshot that's genuinely
 * finished, not "more is coming"). Ported from the deleted `CollectionRail`'s
 * `FinishedPanel`.
 */

import { PartyPopper, Repeat } from 'lucide-react'
import { useRef } from 'react'
import { PasteLinkButton } from '@/components/PasteLinkButton'
import { StageHeadline } from './stage-primitives'
import { useTheaterActionHotkeys } from './useTheaterActionHotkeys'

export interface CollectionAllClearProps {
  total: number
  unwatched?: boolean
  onShowAll?: () => void
  onClose: () => void
  /** Repeat the queue from the top — same offer as Live's waiting stage. */
  onKeepPlaying?: () => void
}

export function CollectionAllClear({
  total,
  unwatched = false,
  onShowAll,
  onClose,
  onKeepPlaying,
}: CollectionAllClearProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  useTheaterActionHotkeys('any', rootRef)

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#08070a] px-6 text-center"
    >
      <PartyPopper className="h-10 w-10 text-clay" />
      <StageHeadline>
        {total === 0
          ? 'Save your first favourite'
          : unwatched
            ? 'All caught up'
            : 'End of your queue'}
      </StageHeadline>
      {total > 0 ? (
        <p className="text-sm text-white/60">
          {unwatched
            ? 'Turn off Hide watched to see your watched saves.'
            : 'Your saves are still here. Play them again whenever you like.'}
        </p>
      ) : (
        <p className="text-sm text-white/60">
          Paste a social link. Watch it here. Send the video to your mates.
        </p>
      )}
      {total === 0 && (
        <div className="flex flex-col items-center gap-3">
          <PasteLinkButton />
          <a
            href="/live"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-white underline underline-offset-4"
          >
            Watch Discover
          </a>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {unwatched && total > 0 && onShowAll ? (
          <button
            type="button"
            onClick={onShowAll}
            className="min-h-[44px] rounded-full bg-white/15 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Show all
          </button>
        ) : (
          onKeepPlaying && (
            <button
              type="button"
              onClick={onKeepPlaying}
              data-theater-action="keep-playing"
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-white/25 bg-white/[0.14] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
            >
              <Repeat size={15} />
              <span>Keep playing</span>
            </button>
          )
        )}
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] rounded-full bg-clay-grad px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-opacity hover:opacity-90"
        >
          Open library
        </button>
      </div>
    </div>
  )
}
