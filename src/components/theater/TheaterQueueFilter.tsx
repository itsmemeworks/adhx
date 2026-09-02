'use client'

/**
 * Live and Saved type multi-select. Lives in the playlist (Queue /
 * up-next sheet), not the top bar. Empty selection is All — tap any mix
 * of videos, photos, or text (including articles). Playlists do not mount this.
 * Persists as `adhx-theater-types`.
 */

import { cn } from '@/lib/utils'
import type { ContentType } from '@/components/matter'
import {
  theaterQueueTypePillState,
  theaterQueueTypePillToggleTargets,
  THEATER_QUEUE_TYPE_PILLS,
} from './theater-math'

const PILL = 'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-150'

export function TheaterQueueFilter({
  selected,
  onToggle,
  onClear,
}: {
  selected: readonly ContentType[]
  onToggle: (type: ContentType) => void
  onClear: () => void
}) {
  const allOn = selected.length === 0
  return (
    <div
      role="group"
      aria-label="Playlist filter"
      data-theater-queue-filter=""
      className="flex flex-none flex-wrap items-center gap-1.5 px-4 pb-2"
    >
      <button
        type="button"
        aria-pressed={allOn}
        onClick={() => {
          if (!allOn) onClear()
        }}
        className={cn(
          PILL,
          allOn ? 'bg-clay-grad text-white shadow-glow' : 'bg-inset text-ink-2 hover:text-ink',
        )}
      >
        All
      </button>
      {THEATER_QUEUE_TYPE_PILLS.map((pill) => {
        const pressed = theaterQueueTypePillState(selected, pill.types)
        const active = pressed !== false
        return (
          <button
            key={pill.label}
            type="button"
            aria-pressed={pressed}
            onClick={() => {
              for (const type of theaterQueueTypePillToggleTargets(selected, pill.types)) {
                onToggle(type)
              }
            }}
            className={cn(
              PILL,
              active ? 'bg-clay-grad text-white shadow-glow' : 'bg-inset text-ink-2 hover:text-ink',
            )}
          >
            {pill.label}
          </button>
        )
      })}
    </div>
  )
}
