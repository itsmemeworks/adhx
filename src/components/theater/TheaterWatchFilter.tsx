'use client'

import { cn } from '@/lib/utils'

export interface TheaterWatchFilterProps {
  value: 'all' | 'unwatched'
  onChange: (value: 'all' | 'unwatched') => void
}

/** A filter-panel row, independent of navigation and playback repeat. */
export function TheaterWatchFilter({ value, onChange }: TheaterWatchFilterProps) {
  return (
    <div
      role="group"
      aria-label="Watch history"
      className="flex w-full flex-wrap items-center gap-1.5 border-t border-hairline pt-2"
    >
      <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-ink-3">
        Watch history
      </span>
      {(['all', 'unwatched'] as const).map((filter) => (
        <button
          key={filter}
          type="button"
          aria-pressed={value === filter}
          data-quick-filter-option
          onClick={() => onChange(filter)}
          className={cn(
            'min-h-9 rounded-full px-3 text-[11px] font-semibold transition-colors',
            value === filter ? 'bg-clay text-white' : 'bg-inset text-ink-2 hover:text-ink',
          )}
        >
          {filter === 'all' ? 'All' : 'Unwatched'}
        </button>
      ))}
    </div>
  )
}
