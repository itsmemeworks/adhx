'use client'

import { Check, Play, Image as ImageIcon, Type as TypeIcon, FileText, Quote } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { PlatformGlyph, type ContentType } from '@/components/matter'
import { inferType } from '@/lib/trending/filter'
import type { TheaterItem } from './types'
import { theaterItemKey } from './types'

/**
 * Rail feed rows + the seen spine (spec §5). Ordering is whatever `items`
 * already is (recency) — never re-sorted here. Seen state is computed per
 * row via `isSeen`, but only once `seenReady` (SSR parity: everything renders
 * unseen until hydration settles).
 */

export interface UpNextListProps {
  items: TheaterItem[]
  currentKey: string | null
  isSeen: (key: string) => boolean
  /** Ready flag from useSeenSet — render everything unseen until true (SSR parity). */
  seenReady: boolean
  /** Keys that arrived via polling after mount (accent treatment). */
  freshKeys: ReadonlySet<string>
  /** Items newer than last visit and unseen. 0 = show "you're all caught up". */
  newCount: number
  onSelect: (key: string) => void
  /** Optional layout override for the scroll container — Rail passes `flex-1`. */
  className?: string
}

const TYPE_TILE: Record<ContentType, { bg: string; icon: React.ComponentType<{ size?: number }> }> =
  {
    video: { bg: 'bg-type-video/15 text-type-video', icon: Play },
    photo: { bg: 'bg-type-photo/15 text-type-photo', icon: ImageIcon },
    text: { bg: 'bg-type-text/15 text-type-text', icon: TypeIcon },
    article: { bg: 'bg-type-article/15 text-type-article', icon: FileText },
    quote: { bg: 'bg-type-quote/15 text-type-quote', icon: Quote },
  }

function Thumb({ item, fresh }: { item: TheaterItem; fresh: boolean }) {
  const type = inferType(item)
  const tile = TYPE_TILE[type]
  const Icon = tile.icon
  return (
    <div className="relative h-12 w-[72px] flex-none overflow-hidden rounded-md bg-inset">
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className={cn('flex h-full w-full items-center justify-center', tile.bg)}>
          <Icon size={16} />
        </div>
      )}
      {fresh && (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-clay ring-2 ring-surface" />
      )}
    </div>
  )
}

function Row({
  item,
  isCurrent,
  isNext,
  seen,
  fresh,
  onSelect,
}: {
  item: TheaterItem
  isCurrent: boolean
  isNext: boolean
  seen: boolean
  fresh: boolean
  onSelect: (key: string) => void
}) {
  const key = theaterItemKey(item)
  const caption = (item.text || '').trim()
  const handle = item.author ? item.author.replace(/^@+/, '') : ''

  return (
    <button
      type="button"
      onClick={() => onSelect(key)}
      aria-current={isCurrent ? 'true' : undefined}
      className={cn(
        'group flex w-full items-start gap-2.5 rounded-lg border-l-2 px-2.5 py-2.5 text-left transition-colors',
        isCurrent ? 'border-clay bg-inset' : 'border-transparent hover:bg-inset/60',
        !isCurrent && seen && 'opacity-60',
        !isCurrent && fresh && 'bg-clay/[0.07]',
      )}
    >
      <Thumb item={item} fresh={fresh && !isCurrent} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <PlatformGlyph platform={item.platform} size={11} className="text-ink-3 flex-none" />
          <span className="font-mono text-[10.5px] text-ink-3" suppressHydrationWarning>
            {formatCompactRelativeTime(item.createdAt)}
          </span>
          <div className="ml-auto flex flex-none items-center gap-1.5">
            {isNext && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-clay">
                next ↓
              </span>
            )}
            {!isCurrent && !isNext && seen && <Check size={11} className="text-done" />}
          </div>
        </div>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink">
          {caption || (handle ? `@${handle}` : 'Saved post')}
        </p>
      </div>
    </button>
  )
}

export function UpNextList({
  items,
  currentKey,
  isSeen,
  seenReady,
  freshKeys,
  newCount,
  onSelect,
  className,
}: UpNextListProps) {
  // Per-row seen flags (SSR-safe: everything false until seenReady).
  const seenFlags = items.map((item) => seenReady && isSeen(theaterItemKey(item)))

  // Divider goes right after the LAST unseen row, not necessarily contiguous —
  // an older item can stay unseen while a newer one gets marked seen out of order.
  let lastUnseenIndex = -1
  if (seenReady && newCount > 0) {
    for (let i = seenFlags.length - 1; i >= 0; i--) {
      if (!seenFlags[i]) {
        lastUnseenIndex = i
        break
      }
    }
  }

  const currentIndex = currentKey ? items.findIndex((it) => theaterItemKey(it) === currentKey) : -1

  return (
    <div className={cn('overflow-y-auto', className)}>
      {seenReady && newCount > 0 && (
        <div className="px-3 pb-2 pt-3 text-[11.5px] font-semibold text-ink-2">
          {newCount} new since your last visit
        </div>
      )}
      {seenReady && newCount === 0 && items.length > 0 && (
        <div className="px-3 pb-2 pt-3 text-[11.5px] text-ink-3">
          You&rsquo;re all caught up — Top today
        </div>
      )}

      <div className="flex flex-col gap-1 px-2">
        {items.map((item, i) => {
          const key = theaterItemKey(item)
          const isCurrent = i === currentIndex
          const isNext = currentIndex >= 0 && i === currentIndex + 1
          const row = (
            <Row
              key={key}
              item={item}
              isCurrent={isCurrent}
              isNext={isNext}
              seen={seenFlags[i]}
              fresh={freshKeys.has(key)}
              onSelect={onSelect}
            />
          )
          if (i === lastUnseenIndex) {
            return (
              <div key={`${key}-divider`} className="contents">
                {row}
                <div
                  role="separator"
                  className="my-1 flex items-center gap-2 px-2.5 text-[10.5px] font-medium uppercase tracking-wide text-ink-3"
                >
                  <span className="h-px flex-1 bg-hairline" />
                  You&rsquo;re caught up
                  <span className="h-px flex-1 bg-hairline" />
                </div>
              </div>
            )
          }
          return row
        })}
      </div>
    </div>
  )
}
