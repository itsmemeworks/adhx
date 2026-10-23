'use client'

import { cn } from '@/lib/utils'
import { postAuthor, postLinkDomain, postText } from '../post'
import { NxAvatar } from '../primitives'
import { TileFrame, type TileProps } from './TileFrame'

/** Serif size + clamp so short posts read like a pull quote and long ones still fit. */
export function postTileTypeScale(length: number): string {
  if (length <= 100) return 'text-[26px] leading-[1.12] line-clamp-6'
  if (length <= 180) return 'text-[22px] leading-[1.15] line-clamp-7'
  return 'text-[19px] leading-[1.2] line-clamp-8'
}

/** A text post, set like a pull quote on cream. */
export function PostTile({ item, ...frame }: TileProps) {
  const author = postAuthor(item)
  const text = postText(item) || item.quoteContext?.text || ''
  const quoting = item.isQuote ? item.quoteContext?.author || item.quotedTweet?.author : null
  const chip = quoting ? `Quoting @${quoting}` : postLinkDomain(item)

  return (
    <TileFrame
      item={item}
      aspect={260 / 340}
      {...frame}
      className={cn('flex flex-col gap-3.5 bg-nx-cream p-[18px] text-nx-bg', frame.className)}
    >
      <span className="flex min-w-0 items-center gap-2">
        <NxAvatar author={author} size={32} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-bold">{author.name}</span>
          {author.handle && (
            <span className="truncate text-[12px] text-nx-on-cream-soft">{author.handle}</span>
          )}
        </span>
      </span>
      {/* Fades a part-clipped last line when a shorter tile height (--nx-tile-h) can't fit the clamp. */}
      <span className="min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,black_82%,transparent)]">
        <span className={cn('font-nx-serif', postTileTypeScale(text.length))}>{text}</span>
      </span>
      {chip && (
        <span className="max-w-full self-start truncate rounded-full border border-nx-bone px-2.5 py-1.5 text-[12px] font-semibold">
          {chip}
        </span>
      )}
    </TileFrame>
  )
}
