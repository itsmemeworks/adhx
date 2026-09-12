'use client'

import { cn } from '@/lib/utils'

/** Watch history is a visible choice, independent of the playback repeat button. */
export function TheaterWatchFilter({
  value,
  onChange,
}: {
  value: 'all' | 'unwatched'
  onChange: (value: 'all' | 'unwatched') => void
}) {
  return (
    <div
      role="group"
      aria-label="Watch history"
      className="inline-flex items-center gap-0.5 rounded-full border border-white/15 bg-black/40 p-1 backdrop-blur-md"
    >
      {(['all', 'unwatched'] as const).map((filter) => (
        <button
          key={filter}
          type="button"
          aria-pressed={value === filter}
          onClick={() => onChange(filter)}
          className={cn(
            'min-h-11 rounded-full sm:min-h-9 px-3 text-xs font-semibold transition-colors',
            value === filter ? 'bg-white text-[#1c1917]' : 'text-white/65 hover:text-white',
          )}
        >
          {filter === 'all' ? 'All' : 'Unwatched'}
        </button>
      ))}
    </div>
  )
}
