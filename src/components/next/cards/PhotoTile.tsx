'use client'

import { cn } from '@/lib/utils'
import { mediaFallbackSrc, photoSources, postAuthor, postCoverSrc, postText } from '../post'
import { AuthorLine, MediaChip, NxImage, Scrim } from '../primitives'
import { TileFrame, type TileProps } from './TileFrame'

/**
 * A photo, or an album: with more than one photo the next two peek out above
 * the card as stacked edges, and a `1 / N` chip says how many there are.
 */
export function PhotoTile({ item, ...frame }: TileProps) {
  const photos = photoSources(item)
  const count = Math.max(photos.length, 1)
  const album = count > 1
  const author = postAuthor(item)
  const caption = postText(item)
  // Back to front: third photo (or the second again), then the second.
  const edges = album ? [photos[2] ?? photos[1], photos[1]] : []

  return (
    <TileFrame item={item} aspect={230 / 340} clip={false} {...frame}>
      {edges.map((src, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            'absolute h-5 overflow-hidden rounded-t-[14px] bg-nx-surface',
            i === 0 ? 'inset-x-4 top-0 opacity-50' : 'inset-x-2 top-2 opacity-75',
          )}
        >
          <NxImage src={src} alt="" reveal="none" className="h-[120px] w-full object-cover" />
        </span>
      ))}
      <span
        className={cn(
          'absolute inset-x-0 bottom-0 overflow-hidden rounded-nx-tile bg-nx-surface',
          album ? 'top-4' : 'top-0',
        )}
      >
        <NxImage
          src={postCoverSrc(item)}
          fallbackSrc={mediaFallbackSrc(item)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        {album && <MediaChip className="right-2.5 top-2.5">{`1 / ${count}`}</MediaChip>}
        <Scrim className="gap-1.5 px-3 pb-3 pt-10">
          <AuthorLine
            author={author}
            label={author.handle || author.name}
            className="text-white/85"
          />
          {caption && <span className="line-clamp-2 text-[12.5px] leading-[1.35]">{caption}</span>}
        </Scrim>
      </span>
    </TileFrame>
  )
}
