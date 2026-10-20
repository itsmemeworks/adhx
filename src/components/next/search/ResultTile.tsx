'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Lock, Users } from 'lucide-react'
import { networkLabel } from '@/lib/platform/networks'
import { timeAgo } from '../moments/live'
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
import { NxImage } from '../primitives'
import { PrivateLock, SaverFaces } from '../SaverFaces'
import { saversLine } from '../savers'
import {
  heardOrRead,
  KIND_WORD,
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
  spoken,
}: {
  strength: MatchStrength
  className?: string
  tone?: 'plate' | 'cream'
  withLabel?: boolean
  /** Where the match was found when the tile can't show it ("Said in the video", "On screen"). */
  where?: string | null
  /** Where it matched, said but not shown (the tile shows it elsewhere). */
  spoken?: string | null
}) {
  const bars = strength === 'strong' ? 3 : strength === 'good' ? 2 : 1
  const said = where ?? spoken
  const label = said
    ? `${STRENGTH_LABEL[strength]}, ${said.toLowerCase()}`
    : STRENGTH_LABEL[strength]
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'pointer-events-auto flex h-6 shrink-0 items-end gap-[3px] rounded-full px-[9px] pb-[6px] pt-1',
        tone === 'plate' ? 'nx-plate' : 'bg-nx-ink/10',
        className,
      )}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            'w-1 rounded-[2px]',
            ['h-[6px]', 'h-[9px]', 'h-[12px]'][i],
            i < bars
              ? tone === 'plate'
                ? 'bg-nx-accent'
                : 'bg-nx-ink'
              : tone === 'plate'
                ? 'bg-white/30'
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

/** Network then kind: "YouTube video", "X photo". */
export function networkKind(item: SearchResultItem): string {
  return `${networkLabel(item.post.platform)} ${KIND_WORD[kindOf(item)].toLowerCase()}`
}

/** A result's few words: its text or headline, else what it is. */
export function tileTitle(item: SearchResultItem): string {
  const kind = kindOf(item)
  const text = (kind === 'article' ? articleHeadline(item.post) : postText(item.post))
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text || networkKind(item)
}

/** Where a search result matched, for the chip on its corner ("In the video"). */
export function tileWhere(item: SearchResultItem): string {
  if (strengthOfItem(item) === 'related') return 'Related'
  if (item.post.isPrivate) return 'Just for you'
  const lead = item.matched[0] ?? 'words'
  if (lead === 'speech' || lead === 'video') return 'In the video'
  if (lead === 'picture') return 'In the picture'
  if (lead === 'screen') return 'On screen'
  return 'In the words'
}

const CHIP =
  'pointer-events-none absolute flex h-6 max-w-[calc(100%-16px)] items-center gap-1 whitespace-nowrap rounded-full bg-black/55 px-[9px] text-[11px] font-extrabold text-white backdrop-blur-md'

/**
 * One result in a grid of tiles: the picture, a chip in each top corner, and
 * its title and who saved it along the bottom. The whole tile is a link to
 * the post (your saves open in the theater; anyone else's on its public page).
 *
 * Search tiles (`showStrength`) say where it matched and how sure; channel
 * tiles say which network, how long, and whether it's new to you.
 */
export function ResultTile({
  item,
  best = false,
  className,
  onOpen,
  href,
  showStrength = true,
  owner,
  isNew = false,
  fill = false,
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
  /** A friend's channel: their save goes without saying; others "saved this too". */
  owner?: string
  /** You haven't seen it yet (channels). */
  isNew?: boolean
  /** Fill the parent's height instead of keeping the post's shape. */
  fill?: boolean
}) {
  const kind = kindOf(item)
  const { post } = item
  const author = postAuthor(post)
  const heard = heardOrRead(item)
  const savers = post.savers ?? []
  const others = owner ? savers.filter((s) => s.username !== owner) : savers
  const ownerSave = owner ? savers.find((s) => s.username === owner) : undefined
  const savedBy = savers.length
    ? `, ${saversLine(savers)}`
    : item.saved || !showStrength
      ? ''
      : ', saved by someone else'
  const label = `${feedItemAccessibleDescription(post)}${savedBy}${post.isPrivate ? ', just for you' : ''}${showStrength ? `, ${STRENGTH_LABEL[strengthOfItem(item)].toLowerCase()}${heard ? `, ${heard.toLowerCase()}` : ''}` : ''}`
  const frame = cn(
    'group relative block w-full overflow-hidden rounded-[20px] bg-nx-surface text-left font-nx-sans',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nx-accent',
    best && 'outline outline-2 outline-offset-2 outline-nx-accent',
    fill && 'h-full',
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

  // "You and Ben saved this too" on a friend's channel; "Mum saved this · Reddit" in search.
  const network = networkLabel(post.platform)
  const facesLine = owner
    ? others.length
      ? `${saversLine(others).replace(/ saved this$/, '')} saved this too`
      : null
    : savers.length
      ? `${saversLine(savers)} · ${network}`
      : null
  const metaLine = owner
    ? `${networkKind(item)}${ownerSave ? ` · ${timeAgo(ownerSave.savedAt)}` : ''}`
    : `${network} · ${author.handle || author.name}`

  const footer = (
    <span className="flex min-w-0 items-center gap-2">
      {facesLine ? (
        <SaverFaces
          savers={owner ? others : savers}
          size={16}
          linked
          line={facesLine}
          className="min-w-0"
        />
      ) : !item.saved && showStrength && !post.isPrivate ? (
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-nx-cream">
          <Users aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span>Everyone</span>
        </span>
      ) : (
        <span className="truncate text-[12px] text-nx-soft">{metaLine}</span>
      )}
      {post.isPrivate && <PrivateLock tone="scrim" className="ml-auto" />}
    </span>
  )

  const topLeft = showStrength ? (
    <span className={cn(CHIP, 'left-2.5 top-2.5')}>
      {post.isPrivate && strength !== 'related' && (
        <Lock aria-hidden className="h-3 w-3 shrink-0" strokeWidth={2.6} />
      )}
      <span>{tileWhere(item)}</span>
    </span>
  ) : (
    <span className={cn(CHIP, 'left-2.5 top-2.5')}>{network}</span>
  )
  const topRight = showStrength ? (
    <StrengthMeter
      strength={strength}
      where={null}
      className="pointer-events-none absolute right-2.5 top-2.5 bg-black/55 backdrop-blur-md"
      spoken={where}
    />
  ) : (
    (badge || isNew) && (
      <span className="pointer-events-none absolute right-2.5 top-2.5 flex gap-1.5">
        {badge && (
          <span className="flex h-6 items-center whitespace-nowrap rounded-full bg-black/55 px-[9px] text-[11px] font-extrabold tabular-nums text-white backdrop-blur-md">
            {badge}
          </span>
        )}
        {isNew && (
          <span className="flex h-6 items-center whitespace-nowrap rounded-full bg-nx-accent px-[9px] text-[11px] font-extrabold text-black">
            New
          </span>
        )}
      </span>
    )
  )

  let body
  if (onCream) {
    const text = kind === 'article' ? articleHeadline(post) : postText(post)
    body = (
      <span className={cn('flex flex-col gap-2 bg-nx-cream p-4 text-nx-ink', fill && 'h-full')}>
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold">
            {author.handle || author.name}
          </span>
          {showStrength ? (
            <StrengthMeter strength={strength} tone="cream" where={where} />
          ) : (
            isNew && (
              <span className="flex h-6 items-center rounded-full bg-nx-accent px-[9px] text-[11px] font-extrabold text-black">
                New
              </span>
            )
          )}
        </span>
        <span className={cn('line-clamp-[7] font-nx-serif', postTextSize(text.length))}>
          {text || 'Post'}
        </span>
        <span className="mt-auto flex min-w-0 flex-wrap items-center gap-2">
          {savers.length > 0 ? (
            <SaverFaces
              savers={owner ? (others.length ? others : savers) : savers}
              tone="cream"
              size={16}
              linked
              line={facesLine ?? undefined}
              className="min-w-0"
            />
          ) : (
            !item.saved &&
            showStrength &&
            !post.isPrivate && (
              <span className="flex items-center gap-1.5 text-[12px] font-bold">
                <Users aria-hidden className="h-3.5 w-3.5 shrink-0" />
                <span>Everyone</span>
              </span>
            )
          )}
          {post.isPrivate && <PrivateLock tone="cream" />}
          {item.learning && (
            <span className="flex h-6 items-center whitespace-nowrap rounded-full bg-nx-ink/10 px-2 text-[11px] font-bold">
              Words only
            </span>
          )}
        </span>
      </span>
    )
  } else {
    body = (
      <span
        className={cn('relative block', fill && 'h-full')}
        style={
          fill
            ? undefined
            : { aspectRatio: (kind === 'article' ? 4 / 3 : tileAspect(item)).toFixed(4) }
        }
      >
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
        <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-b from-transparent to-black/90 px-3 pb-3 pt-12 text-white">
          <span className="line-clamp-2 text-[14px] font-extrabold leading-[1.25] [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">
            {tileTitle(item)}
          </span>
          {footer}
        </span>
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
      {!onCream && topLeft}
      {!onCream && topRight}
      {item.learning && !onCream && (
        // Under the corner chip, so the two never overlap.
        <WordsOnlyBadge className="left-2.5 top-10" />
      )}
    </Link>
  )
}
