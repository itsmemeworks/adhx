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

import { LiveDot } from '@/components/matter'

export interface StageWaitingProps {
  /** Ambient stat shown in quiet mono — omitted entirely when zero/absent. */
  savedToday?: number
}

export function StageWaiting({ savedToday }: StageWaitingProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#08070a] px-6 text-center">
      <LiveDot />
      <h2 className="font-serif text-2xl leading-tight text-white sm:text-3xl">
        You&rsquo;re all caught up
      </h2>
      <p className="text-sm text-white/50">waiting for new sends&hellip;</p>
      {!!savedToday && (
        <p className="font-mono text-[11px] text-white/30">{savedToday} saved today</p>
      )}
    </div>
  )
}
