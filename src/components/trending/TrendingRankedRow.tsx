import Link from 'next/link'
import { Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlatformGlyph, TYPE_META, type ContentType } from '@/components/matter'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { previewPath } from '@/lib/activity/preview-path'
import type { TheaterItem } from '@/components/theater/types'
import { theaterItemKey } from '@/components/theater/types'
import { inferType } from '@/lib/trending/filter'

/**
 * One row of the dark ranked list. Shared by live `/trending` and the
 * frozen archive week pages. Do not import `TrendingStaticList` from here —
 * that module pulls better-sqlite3 into the client bundle.
 */

const PLATFORM_LABEL: Record<string, string> = {
  twitter: 'X',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
}

export function trendingItemKey(item: TheaterItem): string {
  return theaterItemKey(item)
}

export function trendingItemHref(item: TheaterItem): string {
  if (item.bookmarkId) {
    return previewPath(item.platform, item.author, item.bookmarkId, item.contentType)
  }
  return item.url
}

export function TrendingRankedRow({
  item,
  rank,
  fresh = false,
}: {
  item: TheaterItem
  rank: number
  fresh?: boolean
}) {
  const type = inferType(item) as ContentType
  const meta = TYPE_META[type]
  const title = item.text || item.authorName || (item.author ? `@${item.author}` : 'Saved post')
  const trend = item.trendCount ?? 0

  return (
    <Link
      href={trendingItemHref(item)}
      className={cn(
        'group flex items-start gap-4 border-b border-white/[0.06] px-4 py-4 transition-colors sm:px-5',
        'hover:bg-white/[0.03]',
        fresh && 'bg-clay/[0.08]',
      )}
    >
      <span className="w-7 flex-none pt-0.5 text-right font-mono text-[15px] tabular-nums text-white/35 sm:w-9 sm:text-[17px]">
        {rank}
      </span>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[14.5px] font-medium leading-snug text-white/90 sm:text-[15.5px]">
          <span>{title}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-white/45">
          <span className="inline-flex items-center gap-1">
            <PlatformGlyph platform={item.platform} size={12} className="text-white/50" />
            <span>{PLATFORM_LABEL[item.platform] ?? item.platform}</span>
          </span>
          <span aria-hidden>·</span>
          <span suppressHydrationWarning>{formatCompactRelativeTime(item.createdAt)}</span>
          {meta ? (
            <>
              <span aria-hidden>·</span>
              <span>{meta.label}</span>
            </>
          ) : null}
          {trend >= 2 ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1 text-flame">
                <Flame size={12} fill="currentColor" />
                <span>{trend}</span>
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="h-14 w-14 flex-none overflow-hidden rounded-md bg-white/[0.06] sm:h-16 sm:w-16">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className={cn('flex h-full w-full items-center justify-center', meta?.dot)}>
            <PlatformGlyph platform={item.platform} size={18} className="text-white/70" />
          </div>
        )}
      </div>
    </Link>
  )
}
