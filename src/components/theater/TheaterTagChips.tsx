'use client'

/** Display-only collection-tab tags. Nothing renders without tags. */
export function TheaterTagChips({ tags, className }: { tags?: string[]; className?: string }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className={className ?? 'flex flex-wrap items-center gap-1.5'}>
      {tags.map((t) => (
        <span
          key={t}
          className="flex-none rounded-full border border-white/12 bg-white/[.06] px-2 py-0.5 text-[10.5px] text-white/55"
        >
          #{t}
        </span>
      ))}
    </div>
  )
}
