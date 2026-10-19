'use client'

import { mediaFallbackSrc, postAuthor, postCoverSrc, postText } from '../post'
import { AuthorLine, MediaChip, NxImage, Scrim } from '../primitives'
import { TileFrame, type TileProps } from './TileFrame'

/** A GIF: plays silently on loop, so it is labelled as such instead of a play button. */
export function GifTile({ item, ...frame }: TileProps) {
  const author = postAuthor(item)
  const caption = postText(item)
  return (
    <TileFrame item={item} aspect={200 / 340} {...frame}>
      <span className="absolute inset-0 bg-nx-surface">
        <NxImage
          src={postCoverSrc(item)}
          fallbackSrc={mediaFallbackSrc(item)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      </span>
      <MediaChip className="left-2.5 top-2.5">GIF · loops</MediaChip>
      <Scrim className="gap-1.5 px-3 pb-3 pt-10">
        <AuthorLine author={author} className="text-white/85" />
        {caption && <span className="line-clamp-2 text-[12.5px] leading-[1.35]">{caption}</span>}
      </Scrim>
    </TileFrame>
  )
}
