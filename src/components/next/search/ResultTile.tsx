'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
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
import { PrivateLock, SaverFaces } from '../SaverFaces'
import { saversLine } from '../savers'
import {
  heardOrRead,
  kindOf,
  openHref,
  previewVideoSrc,
  STRENGTH_LABEL,
  strengthOfItem,
  type MatchStrength,
  type SearchResultItem,
} from './model'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    setReduced(query.matches)
    const onChange = () => setReduced(query.matches)
    query.addEventListener?.('change', onChange)
    return () => query.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

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

/**
 * Top-right of a result: who saved it (members see faces; tapping one opens
 * that friend's channel), a lock when it's just for you, or — with no names
 * known — "Everyone" on someone else's save.
 */
export function SaversMark({
  item,
  everyone = true,
  className,
}: {
  item: SearchResultItem
  /** Show "Everyone" on someone else's save when no savers are known (search only). */
  everyone?: boolean
  className?: string
}) {
  const savers = item.post.savers ?? []
  if (savers.length > 0) {
    return (
      <span
        className={cn(
          'pointer-events-none absolute flex max-w-[calc(100%-16px)] items-center gap-1',
          className,
        )}
      >
        {item.post.isPrivate && <PrivateLock />}
        <SaverFaces savers={savers} tone="plate" size={18} compact={savers.length > 2} linked />
      </span>
    )
  }
  if (item.post.isPrivate) return <PrivateLock className={cn('absolute', className)} />
  if (!item.saved && everyone) return <EveryoneBadge className={className} />
  return null
}

/**
 * How sure the match is, as three bars (like signal strength): 3 strong,
 * 2 good, 1 related. The label is spoken and shown on hover.
 */
export function StrengthMeter({
  strength,
  className,
  tone = 'plate',
  withLabel = false,
  where,
}: {
  strength: MatchStrength
  className?: string
  tone?: 'plate' | 'cream'
  withLabel?: boolean
  /** Where the match was found when the tile can't show it ("Said in the video", "On screen"). */
  where?: string | null
}) {
  const bars = strength === 'strong' ? 3 : strength === 'good' ? 2 : 1
  const label = where
    ? `${STRENGTH_LABEL[strength]}, ${where.toLowerCase()}`
    : STRENGTH_LABEL[strength]
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'pointer-events-auto flex h-6 shrink-0 items-end gap-[3px] rounded-full px-2 pb-[7px] pt-1.5',
        tone === 'plate' ? 'nx-plate' : 'bg-nx-ink/10',
        className,
      )}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            'w-[3px] rounded-sm',
            ['h-[5px]', 'h-[8px]', 'h-[11px]'][i],
            i < bars
              ? tone === 'plate'
                ? 'bg-nx-accent'
                : 'bg-nx-ink'
              : tone === 'plate'
                ? 'bg-white/35'
                : 'bg-nx-ink/25',
          )}
        />
      ))}
      {(withLabel || where) && (
        <span
          aria-hidden
          className={cn(
            'ml-1 self-center text-[11px] font-bold leading-none',
            tone === 'plate' ? 'text-white' : 'text-nx-ink',
          )}
        >
          {withLabel && where
            ? `${STRENGTH_LABEL[strength]} · ${where}`
            : (where ?? STRENGTH_LABEL[strength])}
        </span>
      )}
    </span>
  )
}

/** "Words only": matched on the post's text while its picture/video is still being learned. */
export function WordsOnlyBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'nx-plate pointer-events-none absolute flex h-6 items-center rounded-full px-2 text-[11px] font-bold text-white',
        className,
      )}
    >
      Words only
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
  showStrength = true,
}: {
  item: SearchResultItem
  /** The top match gets the yellow ring. */
  best?: boolean
  className?: string
  onOpen?: (item: SearchResultItem) => void
  /** Where the tile goes; defaults to the post's own address. */
  href?: string
  /** Search-only marks: the confidence meter and "Everyone" (off on channels). */
  showStrength?: boolean
}) {
  const kind = kindOf(item)
  const { post } = item
  const author = postAuthor(post)
  const heard = heardOrRead(item)
  const savers = post.savers ?? []
  const savedBy = savers.length
    ? `, ${saversLine(savers)}`
    : item.saved || !showStrength
      ? ''
      : ', saved by someone else'
  const label = `${feedItemAccessibleDescription(post)}${savedBy}${post.isPrivate ? ', just for you' : ''}${showStrength ? `, ${STRENGTH_LABEL[strengthOfItem(item)].toLowerCase()}${heard ? `, ${heard.toLowerCase()}` : ''}` : ''}`
  const frame = cn(
    'group relative block w-full overflow-hidden rounded-nx-tile bg-nx-surface text-left font-nx-sans',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nx-accent',
    best && 'outline outline-2 outline-offset-2 outline-nx-accent',
    className,
  )
  const cover = postCoverSrc(post)
  const badge = mediaBadge(item)
  const strength = strengthOfItem(item)
  const where = heard
  const reduced = useReducedMotion()
  const [hovering, setHovering] = useState(false)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const videoSrc = kind === 'video' || kind === 'gif' ? previewVideoSrc(post) : null
  const preview = hovering && !reduced ? videoSrc : null
  useEffect(() => {
    if (!hovering) setPreviewPlaying(false)
  }, [hovering])
  const onCream = kind === 'post' || (kind === 'article' && !cover)

  let body
  if (kind === 'post' || (kind === 'article' && !cover)) {
    const text = kind === 'article' ? articleHeadline(post) : postText(post)
    body = (
      <span className="flex flex-col gap-2 bg-nx-cream p-4 text-nx-ink">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold">
            {author.handle || author.name}
          </span>
          {showStrength && <StrengthMeter strength={strength} tone="cream" where={where} />}
        </span>
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
        {preview && (
          // Hovering plays the video, muted, over its cover.
          <video
            src={preview}
            muted
            playsInline
            autoPlay
            loop
            preload="none"
            aria-hidden
            onPlaying={() => setPreviewPlaying(true)}
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
              previewPlaying ? 'opacity-100' : 'opacity-0',
            )}
          />
        )}
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
      onPointerEnter={(e) => e.pointerType === 'mouse' && videoSrc && setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocus={() => videoSrc && setHovering(true)}
      onBlur={() => setHovering(false)}
    >
      {body}
      <SaversMark item={item} everyone={showStrength} className="right-2 top-2" />
      {item.learning && <WordsOnlyBadge className="left-2 top-2" />}
      {showStrength && !onCream && (
        <StrengthMeter strength={strength} where={where} className="absolute bottom-2 left-2" />
      )}
    </Link>
  )
}
