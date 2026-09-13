'use client'

import { cn } from '@/lib/utils'

export interface TheaterWatchFilterProps {
  value: 'all' | 'unwatched'
  onChange: (value: 'all' | 'unwatched') => void
}

/** Watch filtering controls membership; Repeat only controls playback. */
export function TheaterWatchFilter({ value, onChange }: TheaterWatchFilterProps) {
  const checked = value === 'unwatched'
  return (
    <div className="w-full border-t border-hairline pt-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Hide watched"
        data-quick-filter-option
        onClick={() => onChange(checked ? 'all' : 'unwatched')}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-1 text-left text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay"
      >
        <span>
          <span className="block text-xs font-semibold">Hide watched</span>
          <span className="block text-[10px] text-ink-3">On this device</span>
        </span>
        <span
          aria-hidden
          className={cn(
            'flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors',
            checked ? 'bg-clay' : 'bg-white/20',
          )}
        >
          <span
            className={cn(
              'h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
              checked && 'translate-x-4',
            )}
          />
        </span>
      </button>
    </div>
  )
}
