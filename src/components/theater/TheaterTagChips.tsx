'use client'

import { cn } from '@/lib/utils'
import { STAGE_GLASS_FILL } from './stage-primitives'

/** Display-only tags in the action row. Nothing renders without tags. */
export function TheaterTagChips({ tags, className }: { tags?: string[]; className?: string }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className={className ?? 'flex flex-wrap items-center gap-1.5'}>
      {tags.map((t) => (
        <span
          key={t}
          className={cn(
            'flex-none rounded-full border border-white/25 px-2 py-0.5 text-[10.5px] text-white/80',
            STAGE_GLASS_FILL,
          )}
        >
          #{t}
        </span>
      ))}
    </div>
  )
}
