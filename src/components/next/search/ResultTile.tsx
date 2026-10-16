'use client'

import Link from 'next/link'
import { Users } from 'lucide-react'
import { feedItemAccessibleDescription } from '@/components/feed/feedItemMeta'
import { cn } from '@/lib/utils'
import {
  articleHeadline,
  isTallMedia,
  mediaAspect,
  mediaFallbackSrc,
  photoSources,
  postAuthor,
  postCoverSrc,
  postDurationLabel,
  postText,
} from '../post'
import { MediaChip, NxImage } from '../primitives'
import { kindOf, openHref, type SearchResultItem } from './model'

/** Masonry tiles keep each post's shape, within limits so a column stays readable. */
function tileAspect(item: SearchResultItem): number {
  const aspect = mediaAspect(item.post)
  if (aspect) return Math.min(1.6, Math.max(0.56, aspect))
  return isTallMedia(item.post) ? 9 / 16 : 4 / 3
}

/** Serif size for a cream post card by length (short posts read as headlines). */
function postTextSize(length: number): string {
  if (length < 60) return 'text-[26px] leading-[1.05]'
  if (length < 140) return 'text-[21px] leading-[1.1]'
  return 'text-[17px] leading-[1.18]'
}

export function EveryoneBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'nx-plate pointer-events-none absolute flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-bold text-white',
        className,
      )}
    >
      <Users aria-hidden className="h-3 w-3" />
      <span>Everyone</span>
    </span>
  )
}

/** The chip a media tile shows: duration, album count or GIF. */
export function mediaBadge(item: SearchResultItem): string | null {
  const kind = kindOf(item)
  if (kind === 'video') return postDurationLabel(item.post) ?? 'Video'
  if (kind === 'gif') return 'GIF'
  if (kind === 'photo') {
    const count = photoSources(item.post).length
    return count > 1 ? `1 / ${count}` : null
  }
  return null
}

/**
 * One result in the masonry grid. The whole tile is a link to the post
 * (your saves open in the theater; anyone else's on its public page).
 */
export function ResultTile({
  item,
  best = false,
  className,
  onOpen,
  href,
}: {
  item: SearchResultItem
  /** The top match gets the yellow ring. */
  best?: boolean
  className?: string
  onOpen?: (item: SearchResultItem) => void
  /** Where the tile goes; defaults to the post's own address. */
  href?: string
}) {
  const kind = kindOf(item)
  const { post } = item
  const author = postAuthor(post)
  const label = `${feedItemAccessibleDescription(post)}${item.saved ? '' : ', saved by someone else'}`
  const frame = cn(
    'group relative block w-full overflow-hidden rounded-nx-tile bg-nx-surface text-left font-nx-sans',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nx-accent',
    best && 'outline outline-2 outline-offset-2 outline-nx-accent',
    className,
  )
  const cover = postCoverSrc(post)
  const badge = mediaBadge(item)

  let body
  if (kind === 'post' || (kind === 'article' && !cover)) {
    const text = kind === 'article' ? articleHeadline(post) : postText(post)
    body = (
      <span className="flex flex-col gap-2 bg-nx-cream p-4 text-nx-ink">
        <span className="truncate text-[11px] font-bold">{author.handle || author.name}</span>
        <span className={cn('line-clamp-[7] font-nx-serif', postTextSize(text.length))}>
          {text || 'Post'}
        </span>
      </span>
    )
  } else if (kind === 'article') {
    body = (
      <span className="relative block aspect-[4/3]">
        <NxImage src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <span className="nx-scrim nx-text-shadow absolute inset-x-0 bottom-0 px-3 pb-3 pt-10 font-nx-serif text-[19px] leading-[1.1] text-white">
          <span className="line-clamp-3">{articleHeadline(post)}</span>
        </span>
      </span>
    )
  } else {
    body = (
      <span className="relative block" style={{ aspectRatio: tileAspect(item).toFixed(4) }}>
        <NxImage
          src={cover}
          fallbackSrc={mediaFallbackSrc(post)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        {badge && <MediaChip className="bottom-2 right-2">{badge}</MediaChip>}
      </span>
    )
  }

  return (
    <Link
      href={href ?? openHref(item)}
      aria-label={label}
      className={frame}
      onClick={onOpen ? () => onOpen(item) : undefined}
    >
      {body}
      {!item.saved && <EveryoneBadge className="right-2 top-2" />}
    </Link>
  )
}
