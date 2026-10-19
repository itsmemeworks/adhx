'use client'

import { cn } from '@/lib/utils'
import { articleHeadline, articleLede, postAuthor, postCoverSrc } from '../post'
import { AuthorLine, NxImage } from '../primitives'
import { TileFrame, type TileProps } from './TileFrame'

/** Yellow uppercase kicker shared by the article tile and stage. */
export function ArticleKicker({ className }: { className?: string }) {
  return (
    <span
      className={cn('text-[11px] font-bold uppercase tracking-[1.2px] text-nx-accent', className)}
    >
      Article
    </span>
  )
}

/** An article: cover on top, yellow ARTICLE label, serif headline, first lines. */
export function ArticleTile({ item, ...frame }: TileProps) {
  const cover = postCoverSrc(item)
  const lede = articleLede(item, 220)
  return (
    <TileFrame
      item={item}
      aspect={260 / 340}
      {...frame}
      className={cn('flex flex-col bg-nx-surface text-nx-cream', frame.className)}
    >
      {cover && (
        <span className="relative block h-[39%] shrink-0 overflow-hidden">
          <NxImage src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </span>
      )}
      <span className="flex min-h-0 flex-1 flex-col gap-2 px-3.5 py-3">
        <ArticleKicker />
        <span
          className={cn(
            'font-nx-serif leading-[1.1]',
            cover ? 'line-clamp-3 text-[22px]' : 'line-clamp-5 text-[28px]',
          )}
        >
          {articleHeadline(item)}
        </span>
        {lede && (
          <span
            className={cn(
              'text-[12.5px] leading-[1.4] text-nx-soft',
              cover ? 'line-clamp-3' : 'line-clamp-6',
            )}
          >
            {lede}
          </span>
        )}
        <AuthorLine author={postAuthor(item)} className="mt-auto text-nx-muted" />
      </span>
    </TileFrame>
  )
}
