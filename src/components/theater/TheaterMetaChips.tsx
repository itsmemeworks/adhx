'use client'

import { Flame } from 'lucide-react'
import { PlatformGlyph } from '@/components/matter'
import { sourceUrl } from '@/lib/activity/preview-path'
import { pingAnalytic } from '@/lib/analytics/client'
import { addedToAdhxLabel, formatCompactRelativeTime, hasKnownTimestamp } from '@/lib/utils/format'
import { PLATFORM_LABEL, type TheaterItem } from './types'

const CHIP =
  'inline-flex min-h-[32px] flex-none items-center gap-1.5 rounded-full bg-black/40 px-2.5 text-white/80 backdrop-blur-sm'

/** "Open on {platform}" + ADHX-added time. Shared by desktop overlays and the mobile top scrim. */
export function PlatformTimeChip({ item }: { item: TheaterItem }) {
  const src = sourceUrl(item.platform, item.author, item.bookmarkId ?? '')
  const label = PLATFORM_LABEL[item.platform] ?? item.platform
  const inner = (
    <>
      <PlatformGlyph platform={item.platform} size={12} />
      {hasKnownTimestamp(item.addedAt) && (
        <span
          className="font-mono text-[11px]"
          title={addedToAdhxLabel(item.addedAt as string)}
          aria-label={addedToAdhxLabel(item.addedAt as string)}
          suppressHydrationWarning
        >
          {formatCompactRelativeTime(item.addedAt as string)}
        </span>
      )}
    </>
  )
  return src ? (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className={CHIP}
      title={`Open on ${label}`}
      onClick={() =>
        pingAnalytic('post.open', {
          platform: item.platform,
          id: item.bookmarkId || undefined,
        })
      }
    >
      {inner}
    </a>
  ) : (
    <span className={CHIP} title={`Open on ${label}`}>
      {inner}
    </span>
  )
}

export function FlameChip({ trendCount }: { trendCount: number }) {
  if (trendCount < 2) return null
  return (
    <span className="inline-flex min-h-[32px] flex-none items-center gap-1 rounded-full bg-black/40 px-2.5 text-[11px] font-bold text-orange-300 backdrop-blur-sm">
      <Flame size={11} className="text-orange-400" fill="currentColor" />
      <span>{trendCount}</span>
    </span>
  )
}
