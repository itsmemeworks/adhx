'use client'

import { StageGlass } from './StageGlass'

/** Display-only tags in the action row. Nothing renders without tags. */
export function TheaterTagChips({ tags, className }: { tags?: string[]; className?: string }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className={className ?? 'flex flex-wrap items-center gap-1.5'}>
      {tags.map((t) => (
        <StageGlass
          key={t}
          as="span"
          className="flex-none rounded-full border border-white/25 px-2 py-0.5 text-[10.5px] text-white/80"
        >
          #{t}
        </StageGlass>
      ))}
    </div>
  )
}
