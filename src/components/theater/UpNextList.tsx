'use client'

import { useEffect, useState } from 'react'
import { Check, Play, Image as ImageIcon, Type as TypeIcon, FileText, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addedToAdhxLabel, formatCompactRelativeTime, hasKnownTimestamp } from '@/lib/utils/format'
import { PlatformGlyph, type ContentType } from '@/components/matter'
import { inferType } from '@/lib/trending/filter'
import { instagramWarmSrc, prefetchPlayback } from './usePlaybackSource'
import { theaterRowCaption } from './TheaterText'
import type { TheaterItem } from './types'
import { theaterItemKey } from './types'
import { queueSectionHeading } from './theater-math'
import { THEATER_QUEUE_SCROLL_ATTR } from './useTheaterQueueOverlay'

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
 * Queue rows. The shell already hands a LIFO list (now playing first);
 * this list does not re-order. Repeat off: Now playing, Next, Seen.
 * Repeat: Now playing and Next.
 */

export interface UpNextListProps {
  items: TheaterItem[]
  currentKey: string | null
  isSeen: (key: string) => boolean
  /** Ready flag from useSeenSet — render everything unseen until true (SSR parity). */
  seenReady: boolean
  /** Keys that arrived via polling after mount (accent treatment). */
  freshKeys: ReadonlySet<string>
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
  /** First Seen row (Repeat off). `-1` or omit = no Seen section. */
  seenStartIndex?: number
}

export const TYPE_TILE: Record<
  ContentType,
  { bg: string; icon: React.ComponentType<{ size?: number }> }
> = {
  video: { bg: 'bg-type-video/15 text-type-video', icon: Play },
  photo: { bg: 'bg-type-photo/15 text-type-photo', icon: ImageIcon },
  text: { bg: 'bg-type-text/15 text-type-text', icon: TypeIcon },
  article: { bg: 'bg-type-article/15 text-type-article', icon: FileText },
}

function Thumb({ item, fresh, seen }: { item: TheaterItem; fresh: boolean; seen: boolean }) {
  const type = inferType(item)
  const tile = TYPE_TILE[type]
  const Icon = tile.icon
  return (
    <div
      className={cn(
        'relative h-12 w-[72px] flex-none overflow-hidden rounded-md bg-inset',
        // Watched rows go grey. In a list of thumbnails this is the only cue
        // that reads without being read — owner: "it's not immediately obvious
        // to me, after I've watched something in the queue, that it's been
        // watched". The row dim + the ✓ are the supporting detail, not the
        // signal.
        seen && 'grayscale',
      )}
    >
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

/** `Date.now()` relative time — fill after mount so SSR and the client cannot disagree. */
function AddedStamp({ addedAt }: { addedAt: string }) {
  const [rel, setRel] = useState('')
  useEffect(() => {
    setRel(formatCompactRelativeTime(addedAt))
  }, [addedAt])
  return (
    <span
      className="font-mono text-[10.5px] text-ink-3"
      title={addedToAdhxLabel(addedAt)}
      aria-label={addedToAdhxLabel(addedAt)}
    >
      {rel ? <span>added {rel}</span> : null}
    </span>
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
  const caption = theaterRowCaption(item)
  const handle = item.author ? item.author.replace(/^@+/, '') : ''

  return (
    <button
      type="button"
      data-theater-queue-item=""
      onClick={() => onSelect(key)}
      onMouseEnter={() => warmOnHover(item)}
      aria-current={isCurrent ? 'true' : undefined}
      className={cn(
        'group flex w-full items-start gap-2.5 rounded-lg border-l-2 px-2.5 py-2.5 text-left transition-colors',
        isCurrent ? 'border-clay bg-inset' : 'border-transparent hover:bg-inset/60',
        !isCurrent && seen && 'opacity-45',
        !isCurrent && fresh && 'bg-clay/[0.07]',
      )}
    >
      <Thumb item={item} fresh={fresh && !isCurrent} seen={!isCurrent && seen} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <PlatformGlyph platform={item.platform} size={11} className="text-ink-3 flex-none" />
          {/* "added" prefix only here — the rows have the horizontal room, and
              a bare relative time beside a post reads as the POST's age
              everywhere else on the internet. The stage chip and dock cards
              carry the same meaning via `title`/`aria-label` instead. */}
          {hasKnownTimestamp(item.addedAt) && <AddedStamp addedAt={item.addedAt as string} />}
          <div className="ml-auto flex flex-none items-center gap-1.5">
            {isCurrent && repeatCurrent ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-clay">
                <Repeat size={10} aria-hidden />
                <span>repeat</span>
              </span>
            ) : isNext ? (
              <span className="text-[10px] font-bold uppercase tracking-wide text-clay">
                next ↓
              </span>
            ) : (
              !isCurrent &&
              seen && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-done"
                  title="Watched"
                >
                  <Check size={12} aria-hidden />
                  <span className="sr-only">Watched</span>
                </span>
              )
            )}
          </div>
        </div>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink">
          <span>{caption || (handle ? `@${handle}` : 'Saved post')}</span>
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
  onSelect,
  className,
  ownScroll = true,
  collapsedCount,
  repeatCurrent,
  seenStartIndex = -1,
}: UpNextListProps) {
  const [expanded, setExpanded] = useState(false)

  const seenFlags = items.map((item) => seenReady && isSeen(theaterItemKey(item)))
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
    <div
      className={cn(ownScroll && 'overflow-y-auto', className)}
      {...(ownScroll ? { [THEATER_QUEUE_SCROLL_ATTR]: '' } : {})}
    >
      <div className="flex flex-col gap-1 px-2">
        {visibleItems.map((item, i) => {
          const key = theaterItemKey(item)
          const isCurrent = i === currentIndex
          const isNext =
            currentIndex >= 0 &&
            i === currentIndex + 1 &&
            (seenStartIndex < 0 || i < seenStartIndex)
          const heading = queueSectionHeading(i, currentIndex, seenStartIndex)
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
          if (heading) {
            return (
              <div key={`${key}-group`} className="contents">
                <div
                  role="separator"
                  className="mt-1 flex items-center gap-2 px-2.5 pb-0.5 text-[10.5px] font-medium uppercase tracking-wide text-ink-3"
                >
                  <span>{heading.label}</span>
                  <span className="h-px flex-1 bg-hairline" />
                </div>
                {row}
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
