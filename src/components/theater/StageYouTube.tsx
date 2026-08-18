'use client'

/**
 * Official youtube-nocookie iframe (spec §3/§6). There is no MP4 mirror for
 * YouTube (see CLAUDE.md "YouTube Shorts preview"), so the theater plays it
 * exactly like the preview page does: the sanctioned iframe embed, appearing
 * instantly and playing on its own tap — no autoplay param, no custom chrome,
 * no progress bar (there's nothing to drive one off).
 *
 * THE GOTCHA (CLAUDE.md, bitten before): an `aspect-[9/16]` box around an
 * absolutely-positioned iframe collapses to zero height. The fix is a
 * concrete height on the box itself, derived from the stage's own `h-full`
 * ancestor via a `flex-1 min-h-0` wrapper.
 */

import { ArrowRight } from 'lucide-react'
import { PlatformChip } from '@/components/matter'
import { isValidVideoId, youtubeEmbedUrl } from '@/lib/media/youtube'
import { previewPath } from '@/lib/activity/preview-path'
import type { TheaterItem } from './types'

export interface StageYouTubeProps {
  item: TheaterItem
}

/**
 * The theater's `bookmarkId` for a YouTube item IS the 11-char video id
 * (see `previewPath` / `TrendingItem.bookmarkId`). Returns null when it
 * doesn't look like one, so the stage can fall back to a poster instead of
 * pointing an iframe at garbage.
 */
export function resolveYouTubeVideoId(item: Pick<TheaterItem, 'bookmarkId'>): string | null {
  const id = item.bookmarkId || ''
  return isValidVideoId(id) ? id : null
}

export function StageYouTube({ item }: StageYouTubeProps) {
  const videoId = resolveYouTubeVideoId(item)
  const text = (item.text || '').trim()

  if (!videoId) {
    const href = previewPath(item.platform, item.author, item.bookmarkId || '')
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#08070a]">
        {item.thumbnailUrl ? (
          <>
            <img
              src={item.thumbnailUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-contain opacity-60"
            />
            <div className="absolute inset-0 bg-[#08070a]/55" aria-hidden />
          </>
        ) : null}
        <div className="relative flex max-w-xl flex-col items-center gap-4 px-6 text-center">
          <PlatformChip platform="youtube" />
          {text && (
            <h2 className="font-serif text-2xl leading-tight text-white sm:text-3xl">{text}</h2>
          )}
          <a
            href={href}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-clay-grad px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-opacity hover:opacity-90"
          >
            Open preview
            <ArrowRight size={15} />
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#08070a]">
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
        <div className="relative aspect-[9/16] h-[min(82vh,100%)] max-w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
          <iframe
            key={videoId}
            src={youtubeEmbedUrl(videoId)}
            title={text || 'YouTube Short'}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      </div>
      {text && (
        <div className="flex-shrink-0 px-6 pb-6 sm:px-10 sm:pb-8">
          <p className="line-clamp-1 text-center text-sm text-white/70">{text}</p>
        </div>
      )}
    </div>
  )
}
