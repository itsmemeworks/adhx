'use client'

/**
 * Text/quote tweets typeset large (serif) on the near-black stage; the
 * `photo` variant reuses the same shell with the image full-bleed +
 * bottom-scrim caption (same treatment as `DiscoverCard`'s media cards).
 */

import { cn } from '@/lib/utils'
import { PlatformChip } from '@/components/matter'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import type { TheaterItem } from './types'

export interface StageTextProps {
  item: TheaterItem
  /** When set, render the photo variant (image full-bleed + caption). */
  photo?: boolean
}

/** Larger type for short posts, scaling down as the text gets longer. */
function textSizeClass(text: string): string {
  const len = text.length
  if (len <= 80) return 'text-4xl sm:text-5xl lg:text-6xl'
  if (len <= 180) return 'text-3xl sm:text-4xl lg:text-5xl'
  return 'text-xl sm:text-2xl lg:text-3xl'
}

export function StageText({ item, photo }: StageTextProps) {
  const text = (item.text || '').trim()
  const authorName = item.authorName || (item.author ? `@${item.author}` : 'Saved post')

  if (photo) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-[#08070a]">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <p className="max-w-2xl px-8 text-center font-serif text-3xl text-white/80">
              {text || 'Photo'}
            </p>
          </div>
        )}

        {/* Bottom scrim: author + up-to-2-line caption. Padding on the
            wrapper, line-clamp on a child with no vertical padding, so the
            clamp doesn't let a clipped extra line peek through. */}
        <div
          className="absolute inset-x-0 bottom-0 px-6 pb-6 pt-16 sm:px-10 sm:pb-10"
          style={{ background: 'linear-gradient(transparent, rgba(11,11,17,.84))' }}
        >
          <div className="mb-2 flex items-center gap-2.5">
            <AuthorAvatar src={item.authorAvatarUrl ?? undefined} author={item.author} size="sm" />
            <span className="truncate text-[13.5px] font-semibold text-white">{authorName}</span>
            <PlatformChip platform={item.platform} />
          </div>
          {text && <p className="line-clamp-2 text-[15px] leading-snug text-white/90">{text}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#08070a] px-6 sm:px-10">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <AuthorAvatar src={item.authorAvatarUrl ?? undefined} author={item.author} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold text-white">{authorName}</div>
            {item.author && (
              <div className="truncate font-mono text-sm text-white/50">@{item.author}</div>
            )}
          </div>
          <PlatformChip platform={item.platform} />
        </div>
        <p className={cn('font-serif leading-tight text-white', textSizeClass(text || ''))}>
          {text || 'Saved post'}
        </p>
      </div>
    </div>
  )
}
