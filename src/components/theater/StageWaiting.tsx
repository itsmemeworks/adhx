'use client'

/**
 * The virtual "end of feed" stage (theater-first.md waiting-stage addendum).
 * <TheaterShell/> swaps this in for <Stage/> entirely once the viewer
 * advances past the last live post — it is NOT routed through Stage's own
 * item-null branch (that's a different, more generic "nothing to play"
 * fallback used e.g. for a truly empty feed).
 *
 * Deliberately calm rather than a spinner: the feed WILL bring something new
 * — polling never stops — there's just nothing to autoplay right now. The
 * shell auto-exits this stage the moment a genuinely fresh item arrives.
 */

import { Repeat, RotateCcw } from 'lucide-react'
import { useRef } from 'react'
import { LiveDot } from '@/components/matter'
import { StageHeadline } from './stage-primitives'
import { useTheaterActionHotkeys } from './useTheaterActionHotkeys'

export interface StageWaitingProps {
  /** Ambient stat shown in quiet mono — omitted entirely when zero/absent. */
  savedToday?: number
  /**
   * The explicit re-watch (round 8, owner request): a deliberate navigation
   * back to the top of the queue instead of waiting. Omitted when there's
   * nothing to replay (an empty queue).
   */
  onReplay?: () => void
  /**
   * How many posts a re-watch would play. Shown on the button so the offer is
   * unambiguous — nothing in live mode ever replays a watched post on its own
   * (owner: "you would need to specifically click the re-watch button or hit
   * repeat"), so this is the one place the size of that queue is stated.
   */
  replayCount?: number
  /**
   * "Keep playing" — the standing choice, offered at the moment it matters:
   * the viewer has just run out of unwatched posts and is deciding what
   * happens next. Sets repeat to whole-queue (a preference that persists
   * across visits) and carries straight on, where `onReplay` is a one-shot
   * trip back to the top. Omitted where repeat isn't available.
   */
  onKeepPlaying?: () => void
}

export function StageWaiting({
  savedToday,
  onReplay,
  replayCount,
  onKeepPlaying,
}: StageWaitingProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  useTheaterActionHotkeys('any', rootRef)

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#08070a] px-6 text-center"
    >
      <LiveDot />
      <StageHeadline>You&rsquo;re all caught up</StageHeadline>
      <p className="text-sm text-white/50">waiting for new sends&hellip;</p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {onReplay && (
          <button
            type="button"
            onClick={onReplay}
            data-theater-action="replay"
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-white/25 bg-white/[0.14] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
          >
            <RotateCcw size={15} />
            <span>{replayCount ? `Re-watch all ${replayCount}` : 'Start from the beginning'}</span>
          </button>
        )}
        {onKeepPlaying && (
          <button
            type="button"
            onClick={onKeepPlaying}
            data-theater-action="keep-playing"
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-white/25 bg-white/[0.14] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
          >
            <Repeat size={15} />
            <span>Keep playing</span>
          </button>
        )}
      </div>
      {!!savedToday && (
        <p className="font-mono text-[11px] text-white/30">{savedToday} saved today</p>
      )}
    </div>
  )
}
