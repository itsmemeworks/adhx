'use client'

import { X } from 'lucide-react'
import { ConnectWithX } from '@/components/matter'

/**
 * A single, quiet in-grid CTA card interleaved into the signed-out /trending
 * feed (see `shouldInsertCtaAfter` in `@/lib/discover/interleave-cta`).
 *
 * Same slot shape as `DiscoverCard` (rounded-card, hairline border, surface
 * background, fills its grid cell) so it doesn't disturb the masonry/
 * equal-height grid. Deliberately calm: no animation, no counters, one style.
 */
export function DiscoverCtaCard({
  onConnect,
  onDismiss,
}: {
  onConnect: () => void
  onDismiss: () => void
}) {
  return (
    <div className="relative flex h-full min-h-[200px] flex-col justify-center gap-3 rounded-card border border-hairline bg-surface p-5 shadow-m-sm">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 rounded-full p-1.5 text-ink-3 transition-colors hover:text-ink-2"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="pr-6 text-[15px] leading-snug text-ink">Like what you&apos;re seeing?</p>
      <p className="text-[14px] leading-snug text-ink-2">
        Connect with X to start your own collection.
      </p>
      <button
        type="button"
        onClick={onConnect}
        className="mt-1 inline-flex w-fit items-center gap-2 rounded-[10px] bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition-opacity hover:opacity-90"
      >
        <ConnectWithX size={14} />
      </button>
    </div>
  )
}
