'use client'

import { displayTagCount } from '@/lib/utils/tag'

/**
 * Number on the theater Tag button. Action-row name chips were dropped —
 * the count is the only on-stage signal that a post is tagged.
 */
export function TheaterTagCount({
  count,
  variant = 'inline',
}: {
  count: number
  variant?: 'inline' | 'badge'
}) {
  const n = displayTagCount(count)
  if (n <= 0) return null
  if (variant === 'badge') {
    return (
      <span
        className="absolute right-0 top-0 flex h-[15px] min-w-[15px] -translate-y-0.5 translate-x-0.5 items-center justify-center rounded-full bg-clay px-0.5 text-[9px] font-semibold leading-none text-white"
        aria-hidden
      >
        {n}
      </span>
    )
  }
  return <span className="tabular-nums text-[11px] font-semibold text-clay">{n}</span>
}
