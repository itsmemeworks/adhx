'use client'

import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  isTallMedia,
  mediaFallbackSrc,
  postAuthor,
  postCoverSrc,
  postDurationLabel,
  postText,
} from '../post'
import { AuthorLine, MediaChip, NxImage, Scrim } from '../primitives'
import { TileFrame, type TileProps } from './TileFrame'

export interface VideoTileProps extends TileProps {
  /** Shows the yellow "Playing" chip (this post is on the stage now). */
  playing?: boolean
  /** `auto` picks from the video's aspect ratio. */
  layout?: 'auto' | 'tall' | 'wide'
}

export function PlayGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'nx-plate pointer-events-none absolute left-1/2 top-1/2 flex h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-nx-cream',
        className,
      )}
    >
      <Play className="ml-0.5 h-4 w-4" fill="currentColor" strokeWidth={0} />
    </span>
  )
}

/**
 * A video in a row. Tall videos are full-bleed cover with the caption on the
 * scrim; wide videos put the cover on top and give a longer caption room below.
 */
export function VideoTile({ item, playing = false, layout = 'auto', ...frame }: VideoTileProps) {
  const tall = layout === 'tall' || (layout === 'auto' && isTallMedia(item))
  const author = postAuthor(item)
  const caption = postText(item)
  const duration = postDurationLabel(item)
  const cover = (
    <NxImage
      src={postCoverSrc(item)}
      fallbackSrc={mediaFallbackSrc(item)}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
    />
  )

  if (tall) {
    return (
      <TileFrame item={item} aspect={200 / 340} {...frame}>
        <span className="absolute inset-0 bg-nx-surface">{cover}</span>
        {playing && (
          <MediaChip tone="accent" className="left-2.5 top-2.5">
            Playing
          </MediaChip>
        )}
        {duration && <MediaChip className="right-2.5 top-2.5">{duration}</MediaChip>}
        {!playing && <PlayGlyph />}
        <Scrim className="gap-1.5 px-3 pb-3 pt-10">
          <AuthorLine author={author} className="text-white/85" />
          {caption && <span className="line-clamp-2 text-[12.5px] leading-[1.35]">{caption}</span>}
        </Scrim>
      </TileFrame>
    )
  }

  return (
    <TileFrame
      item={item}
      aspect={260 / 340}
      {...frame}
      className={cn('flex flex-col bg-nx-surface', frame.className)}
    >
      <span className="relative block h-[43%] shrink-0 overflow-hidden">
        {cover}
        {playing && (
          <MediaChip tone="accent" className="left-2 top-2">
            Playing
          </MediaChip>
        )}
        {duration && <MediaChip className="bottom-2 right-2">{duration}</MediaChip>}
        {!playing && <PlayGlyph />}
      </span>
      <span className="flex min-h-0 flex-1 flex-col gap-2 px-3.5 py-3 text-nx-cream">
        <AuthorLine author={author} className="text-nx-soft" />
        {caption && <span className="line-clamp-5 text-[14px] leading-[1.4]">{caption}</span>}
      </span>
    </TileFrame>
  )
}
