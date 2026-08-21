'use client'

import { useState } from 'react'
import {
  Check,
  Play,
  Image as ImageIcon,
  Type as TypeIcon,
  FileText,
  Quote,
  Repeat,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { PlatformGlyph, type ContentType } from '@/components/matter'
import { inferType } from '@/lib/trending/filter'
import { instagramWarmSrc, prefetchPlayback } from './usePlaybackSource'
import { stripShortLinksForPreview } from './TheaterText'
import type { TheaterItem } from './types'
import { theaterItemKey } from './types'

/** Instagram rows warmed this session (by key) — hover-warm fires at most once per row. */
const warmedRows = new Set<string>()

/** Warm an Instagram row's mirror on hover, at most once per session per item. */
export function warmOnHover(item: TheaterItem) {
  if (!instagramWarmSrc(item)) return
  const key = theaterItemKey(item)
  if (warmedRows.has(key)) return
  warmedRows.add(key)
  prefetchPlayback(item)
}

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
  /**
   * Whether this list owns its own vertical scroll (`overflow-y-auto`).
   * Default `true` (the mobile bottom-sheet relies on this). The desktop
   * rail passes `false` since it now owns a single shared scroll container
   * spanning the now-playing text and this list together.
   */
  ownScroll?: boolean
  /**
   * When set, collapses the list to at most this many rows (or through the
   * current item's row and its "next ↓" row, whichever is larger, so a
   * viewer who's navigated deep never loses sight of where they are) behind
   * a "Show all" toggle. Omit to always render every row (mobile default).
   */
  collapsedCount?: number
  /**
   * shared-post-repeat: the current row is pinned and repeating rather than
   * about to auto-advance — shown as a small Repeat tag in the current row's
   * tag slot (where a non-current row would show "next ↓" or a seen check).
   */
  repeatCurrent?: boolean
}

export const TYPE_TILE: Record<
  ContentType,
  { bg: string; icon: React.ComponentType<{ size?: number }> }
> = {
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
  repeatCurrent,
}: {
  item: TheaterItem
  isCurrent: boolean
  isNext: boolean
  seen: boolean
  fresh: boolean
  onSelect: (key: string) => void
  repeatCurrent?: boolean
}) {
  const key = theaterItemKey(item)
  const caption = stripShortLinksForPreview((item.text || '').trim())
  const handle = item.author ? item.author.replace(/^@+/, '') : ''

  return (
    <button
      type="button"
      onClick={() => onSelect(key)}
      onMouseEnter={() => warmOnHover(item)}
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
            {isCurrent && repeatCurrent ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-clay">
                <Repeat size={10} aria-hidden />
                repeat
              </span>
            ) : isNext ? (
              <span className="text-[10px] font-bold uppercase tracking-wide text-clay">
                next ↓
              </span>
            ) : (
              !isCurrent && seen && <Check size={11} className="text-done" />
            )}
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
  ownScroll = true,
  collapsedCount,
  repeatCurrent,
}: UpNextListProps) {
  const [expanded, setExpanded] = useState(false)

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

  // Collapsed cutoff always covers the current row + its "next ↓" row, even
  // if the viewer has navigated past `collapsedCount` items already. The
  // divider above only ever falls within this prefix, so slicing preserves
  // its index unchanged.
  const cutoff = collapsedCount != null ? Math.max(collapsedCount, currentIndex + 2) : items.length
  const showToggle = collapsedCount != null && items.length > cutoff
  const visibleItems = collapsedCount != null && !expanded ? items.slice(0, cutoff) : items
  const hiddenCount = items.length - cutoff

  return (
    <div className={cn(ownScroll && 'overflow-y-auto', className)}>
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
        {visibleItems.map((item, i) => {
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
              repeatCurrent={isCurrent && repeatCurrent}
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

      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-h-[44px] w-full items-center justify-center text-[12.5px] font-semibold text-ink-3 transition-colors hover:text-ink"
        >
          {expanded ? 'Show less' : `Show all · ${hiddenCount} more`}
        </button>
      )}
    </div>
  )
}
