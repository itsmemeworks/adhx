'use client'

import { Play, ChevronRight, Image as ImageIcon, FileText, Video, Quote, Link2 } from 'lucide-react'
import type { FeedItem } from './types'
import { PlatformGlyph, TYPE_META, type ContentType } from '@/components/matter'
import { formatCompactRelativeTime, formatDurationMs } from '@/lib/utils/format'
import { feedItemType, feedItemTitle, feedItemThumb } from './feedItemMeta'
import { cn } from '@/lib/utils'

const TYPE_ICON: Record<ContentType, typeof Video> = {
  video: Video,
  photo: ImageIcon,
  text: FileText,
  article: Link2,
  quote: Quote,
}

const DOT: Record<ContentType, string> = {
  video: 'bg-type-video',
  photo: 'bg-type-photo',
  text: 'bg-type-text',
  article: 'bg-type-article',
  quote: 'bg-type-quote',
}

/**
 * Dense "List / Inbox" row — one per save. Lifted from the Matter `concepts.jsx`
 * ListRow. `compact` is the mobile variant (smaller thumb, no type chip column).
 */
export function FeedListRow({
  item,
  onClick,
  compact = false,
}: {
  item: FeedItem
  onClick?: () => void
  compact?: boolean
}) {
  const type = feedItemType(item)
  const thumb = feedItemThumb(item)
  const unread = !item.isRead
  const time = formatCompactRelativeTime(item.processedAt)
  const duration = formatDurationMs(item.media?.[0]?.durationMs)
  const TypeIcon = TYPE_ICON[type]
  const thumbSize = compact ? 46 : 54

  const Thumb = thumb ? (
    <div
      className="flex-none rounded-[10px] overflow-hidden relative bg-inset"
      style={{ width: thumbSize, height: thumbSize }}
    >
      <img src={thumb} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      {type === 'video' && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/15">
          <Play className="w-3.5 h-3.5 text-white" fill="white" />
        </span>
      )}
    </div>
  ) : (
    <div
      className="flex-none rounded-[10px] flex items-center justify-center bg-inset"
      style={{ width: thumbSize, height: thumbSize }}
    >
      <TypeIcon className="w-[18px] h-[18px] text-ink-3" />
    </div>
  )

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center text-left border-b border-hairline transition-colors duration-150 hover:bg-inset/60',
        compact ? 'gap-3 px-4 py-[13px]' : 'gap-4 px-4 sm:px-[26px] py-[14px]',
        unread ? 'bg-surface' : 'bg-transparent',
      )}
    >
      {/* unread dot */}
      <span className={cn('flex-none rounded-full', compact ? 'w-[7px] h-[7px]' : 'w-2 h-2', unread ? 'bg-clay' : 'bg-transparent')} />
      {Thumb}

      <span className="flex-1 min-w-0">
        <span
          className={cn(
            'block truncate text-ink mb-0.5',
            compact ? 'text-sm' : 'text-[15px]',
            unread ? 'font-bold' : 'font-medium',
          )}
        >
          {feedItemTitle(item)}
        </span>
        <span className="flex items-center gap-2 text-[12.5px] text-ink-3 min-w-0">
          {compact && <span className={cn('flex-none w-1.5 h-1.5 rounded-full', DOT[type])} />}
          <PlatformGlyph platform={item.platform} size={12} className="flex-none text-ink-3" />
          <span className="font-semibold text-ink-2 truncate">{item.authorName || item.author}</span>
          {!compact && <span className="font-mono text-ink-3 truncate">@{item.author}</span>}
          {compact && <span className="flex-none">· {time}</span>}
        </span>
      </span>

      {/* desktop-only trailing columns: type chip, duration/time, chevron */}
      {!compact && (
        <>
          <span className="flex-none inline-flex items-center gap-1.5 rounded-md bg-inset px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">
            <span className={cn('w-1.5 h-1.5 rounded-full', DOT[type])} />
            {TYPE_META[type].label}
          </span>
          <span className="flex-none w-12 text-right font-mono text-[12.5px] text-ink-3">{duration || time}</span>
          <ChevronRight className="flex-none w-[17px] h-[17px] text-ink-3" />
        </>
      )}
    </button>
  )
}
