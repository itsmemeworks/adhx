'use client'

import { Play } from 'lucide-react'
import type { FeedItem } from './types'
import { TypeBadge } from '@/components/matter'
import { formatCompactRelativeTime, formatDurationMs } from '@/lib/utils/format'
import { feedItemType, feedItemTitle, feedItemThumb } from './feedItemMeta'
import { cn } from '@/lib/utils'

/**
 * Bento mosaic tile — lifted from the Matter `concepts.jsx` BentoTile.
 * `cs`/`rs` are column/row spans (the parent grid sets equal auto-rows).
 */
export function FeedBentoTile({
  item,
  cs,
  rs,
  onClick,
}: {
  item: FeedItem
  cs: number
  rs: number
  onClick?: () => void
}) {
  const type = feedItemType(item)
  const thumb = feedItemThumb(item)
  const time = formatCompactRelativeTime(item.processedAt)
  const duration = formatDurationMs(item.media?.[0]?.durationMs)
  const isMedia = type === 'video' || type === 'photo' || type === 'article'
  const author = item.authorName || item.author
  const style = { gridColumn: `span ${cs}`, gridRow: `span ${rs}` } as const

  if (isMedia && thumb) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={style}
        className="relative block overflow-hidden rounded-card border border-hairline bg-surface shadow-m-sm text-left group"
      >
        <img
          src={thumb}
          alt=""
          referrerPolicy="no-referrer"
          className={cn(
            'absolute inset-0 w-full h-full object-cover',
            type === 'article' && 'opacity-55',
          )}
        />
        <span
          className={cn(
            'absolute inset-0',
            type === 'article'
              ? 'bg-gradient-to-b from-transparent to-[rgba(20,14,8,.9)]'
              : 'bg-gradient-to-b from-transparent from-[55%] to-black/60',
          )}
        />
        <span className="absolute top-3 left-3">
          <TypeBadge type={type} />
        </span>
        {type === 'video' && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span
              className="rounded-full bg-black/[0.42] backdrop-blur flex items-center justify-center text-white border border-white/50"
              style={{ width: rs > 1 ? 56 : 44, height: rs > 1 ? 56 : 44 }}
            >
              <Play className={rs > 1 ? 'w-5 h-5' : 'w-4 h-4'} fill="currentColor" />
            </span>
          </span>
        )}
        {duration && (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white font-mono">
            {duration}
          </span>
        )}
        {(type === 'article' || cs > 1) && (
          <span className="absolute left-0 right-0 bottom-0 px-3.5 pb-3.5 pt-10 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
            <span
              className={cn(
                'block font-serif font-semibold text-white leading-tight [text-shadow:0_1px_3px_rgba(0,0,0,.6)]',
                cs > 1 ? 'text-[18px]' : 'text-[15px]',
              )}
            >
              {feedItemTitle(item)}
            </span>
            <span className="block text-[11.5px] font-medium text-white/85 mt-1 [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">
              {author}
            </span>
          </span>
        )}
      </button>
    )
  }

  // text / quote
  const isQuote = type === 'quote'
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={cn(
        'flex flex-col overflow-hidden rounded-card border border-hairline shadow-m-sm p-4 text-left',
        isQuote ? 'bg-clay/[0.07]' : 'bg-surface',
      )}
    >
      {/* self-start so the badge hugs its content instead of stretching full-width */}
      <TypeBadge type={type} className="self-start" />
      <span
        className={cn(
          'mt-3 flex-1 overflow-hidden leading-normal text-ink',
          isQuote ? 'font-serif' : '',
          rs > 1 ? 'text-[16px]' : 'text-[14px]',
        )}
      >
        {item.text}
      </span>
      <span className="mt-2.5 text-[11.5px] font-semibold text-ink-3">
        {author} · {time}
      </span>
    </button>
  )
}

/** Span pattern (col, row) cycled across the mosaic — from the handoff. */
export const BENTO_SPANS: ReadonlyArray<readonly [number, number]> = [
  [2, 2],
  [1, 1],
  [2, 1],
  [1, 2],
  [1, 1],
  [1, 1],
  [2, 1],
  [1, 1],
  [1, 1],
  [2, 2],
  [1, 1],
  [1, 1],
  [2, 1],
  [1, 1],
]
