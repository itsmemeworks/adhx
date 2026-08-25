'use client'

import { useState } from 'react'
import { Check, Play, Image as ImageIcon, Type as TypeIcon, FileText, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addedToAdhxLabel, formatCompactRelativeTime, hasKnownTimestamp } from '@/lib/utils/format'
import { PlatformGlyph, type ContentType } from '@/components/matter'
import { inferType } from '@/lib/trending/filter'
import { instagramWarmSrc, prefetchPlayback } from './usePlaybackSource'
import { theaterRowCaption } from './TheaterText'
import type { TheaterItem } from './types'
import { theaterItemKey } from './types'
// Grouping comes from the shell so the headings below can never disagree with
// the order the queue was built in.
import {
  liveQueueGroupOf,
  orderLiveQueue,
  pinKeyFirst,
  LIVE_QUEUE_GROUP_LABEL,
  type LiveQueueGroup,
} from './TheaterShell'
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
 * Rail feed rows + the seen spine (spec §5). Live mode re-groups here the
 * same way the shell does, so a finished post slides into Watched earlier
 * even if the caller passed the raw arrival order. Playlist mode leaves
 * `items` as-is. Seen state is computed per row via `isSeen`, but only once
 * `seenReady` (SSR parity: everything renders unseen until hydration settles).
 */

export interface UpNextListProps {
  items: TheaterItem[]
  currentKey: string | null
  isSeen: (key: string) => boolean
  /** Ready flag from useSeenSet — render everything unseen until true (SSR parity). */
  seenReady: boolean
  /** Keys that arrived via polling after mount (accent treatment). */
  freshKeys: ReadonlySet<string>
  /**
   * Was this key already watched when the session STARTED
   * (`SeenSet.seenOnEntry`)? Drives the section headings, and must be the same
   * snapshot `orderLiveQueue` grouped by. Live seen-state moves a finished
   * row into Watched once it is no longer current. Absent in playlist mode,
   * whose one curated order has no groups; SHARED mode does pass it (owner:
   * a preview page's queue showed no sections at all while the same queue
   * on `/` did — "we just need to be always consistent here"), with the
   * shared post itself pinned out of the grouping via `pinnedKey`.
   */
  wasSeenOnEntry?: (key: string) => boolean
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
  /**
   * The shared post on a preview page: always the lead row, and deliberately
   * OUTSIDE the arrived/unwatched/watched grouping — it isn't part of "what's
   * new", it's the thing you followed a link to. It gets its own "Shared post"
   * heading, is excluded from every group count, and never counts toward
   * caught-up (which is about the live queue below it).
   */
  pinnedKey?: string | null
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
          {hasKnownTimestamp(item.addedAt) && (
            <span
              className="font-mono text-[10.5px] text-ink-3"
              title={addedToAdhxLabel(item.addedAt as string)}
              aria-label={addedToAdhxLabel(item.addedAt as string)}
              suppressHydrationWarning
            >
              added {formatCompactRelativeTime(item.addedAt as string)}
            </span>
          )}
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
          {caption || (handle ? `@${handle}` : 'Saved post')}
        </p>
      </div>
    </button>
  )
}

export function UpNextList({
  items: incoming,
  currentKey,
  isSeen,
  seenReady,
  freshKeys,
  wasSeenOnEntry,
  onSelect,
  className,
  ownScroll = true,
  collapsedCount,
  repeatCurrent,
  pinnedKey,
}: UpNextListProps) {
  const [expanded, setExpanded] = useState(false)

  // Same grouping as TheaterShell: finished posts slide into Watched earlier.
  // The shell already orders `displayItems` this way; doing it here too means
  // a raw arrival-order list (tests, or a missed caller) still reads New /
  // Up next / Watched. Playlist mode has no `wasSeenOnEntry` and stays put.
  const items =
    seenReady && wasSeenOnEntry
      ? pinKeyFirst(
          orderLiveQueue(incoming, wasSeenOnEntry, (k) => freshKeys.has(k), isSeen, currentKey),
          pinnedKey ?? null,
        )
      : incoming

  // Per-row seen flags (SSR-safe: everything false until seenReady).
  const seenFlags = items.map((item) => seenReady && isSeen(theaterItemKey(item)))

  // Section headings, from the SAME grouping the queue was ordered by. A
  // heading renders on the first row of each group, so the list reads
  // "New since you opened / Not watched yet / Watched" instead of one
  // undifferentiated run — owner: "do we need to be clear about what's been
  // seen, what hasn't been seen yet, and then new things that have come in as
  // we've been watching?". Only in grouped (live) mode: `wasSeenOnEntry`
  // absent means playlist/shared, which has one curated order and no groups.
  const groups: (LiveQueueGroup | null)[] = items.map((item) =>
    seenReady && wasSeenOnEntry && theaterItemKey(item) !== pinnedKey
      ? liveQueueGroupOf(
          theaterItemKey(item),
          wasSeenOnEntry,
          (k) => freshKeys.has(k),
          isSeen,
          currentKey,
        )
      : null,
  )
  const groupCounts = groups.reduce<Partial<Record<LiveQueueGroup, number>>>((acc, g) => {
    if (g) acc[g] = (acc[g] ?? 0) + 1
    return acc
  }, {})
  /**
   * How many rows in each group are STILL unwatched, live. Finished rows
   * move into Watched; the heading count is the leftover in New / Up next.
   * For "Watched earlier" the total is the useful number.
   */
  const groupRemaining = groups.reduce<Partial<Record<LiveQueueGroup, number>>>((acc, g, i) => {
    if (g && g !== 'watched' && !seenFlags[i]) acc[g] = (acc[g] ?? 0) + 1
    return acc
  }, {})
  const headingCount = (g: LiveQueueGroup) =>
    g === 'watched' ? groupCounts.watched : groupRemaining[g]
  /**
   * Index → the heading that renders above that row: each group's first row,
   * plus the pinned shared post, which gets a heading of its own because it
   * belongs to no group. Without that, a preview page read "Up next / [the
   * shared post] / New since you opened / … / [more unwatched posts with no
   * heading]" — the pinned lead consumed the "Up next" heading and the real
   * unwatched run below it went unlabelled.
   */
  const headingAt = new Map<number, { label: string; count?: number }>()
  const started = new Set<LiveQueueGroup>()
  groups.forEach((g, i) => {
    if (!g || started.has(g)) return
    started.add(g)
    headingAt.set(i, { label: LIVE_QUEUE_GROUP_LABEL[g], count: headingCount(g) })
  })
  if (pinnedKey && seenReady && wasSeenOnEntry) {
    const pinnedIndex = items.findIndex((item) => theaterItemKey(item) === pinnedKey)
    if (pinnedIndex !== -1) headingAt.set(pinnedIndex, { label: 'Shared post' })
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
    <div
      className={cn(ownScroll && 'overflow-y-auto', className)}
      {...(ownScroll ? { [THEATER_QUEUE_SCROLL_ATTR]: '' } : {})}
    >
      {/* No summary line above the rows. The group headings ARE the summary —
          a list whose only sections are "Watched earlier 19" (and, on a
          preview page, "Shared post") already says there is nothing left to
          watch, so a "You're all caught up" line above it was the same fact
          twice (owner: "I don't think there's any point"). The end-of-queue
          STAGE still says it, where it's the whole message rather than a
          caption on a list that contradicts it with a "next ↓" row. */}
      <div className="flex flex-col gap-1 px-2">
        {visibleItems.map((item, i) => {
          const key = theaterItemKey(item)
          const isCurrent = i === currentIndex
          // After live regroup the row after current is often Watched earlier.
          // Next from the last pending post waits — do not paint next ↓ there.
          const isNext = currentIndex >= 0 && i === currentIndex + 1 && groups[i] !== 'watched'
          const heading = headingAt.get(i)
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
                  {!!heading.count && (
                    <span className="font-mono normal-case tracking-normal">{heading.count}</span>
                  )}
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
