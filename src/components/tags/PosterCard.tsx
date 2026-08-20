'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

/** A single content-mosaic tile: a thumbnail image, or a short text excerpt. */
export interface PosterTile {
  thumbnailUrl?: string | null
  text?: string | null
}

export interface CollectionPosterCardProps {
  tag: string
  count: number
  tiles: PosterTile[]
  /** Card link target — the whole mosaic area clicks through to this. */
  href: string
  /** Top-right overlay (e.g. a PUBLIC/Private badge, optionally with a
   * secondary action stacked under it). Rendered outside the card's Link so
   * its own interactive children never trigger card navigation. */
  badge?: React.ReactNode
  /** Bottom-right actions (make-public pill, copy/open glass buttons, …). */
  children?: React.ReactNode
  /** Rendered right after the post count on the meta line — e.g. a
   * truncated public share URL. Optional; omit for a bare count. */
  subtitle?: React.ReactNode
  heightClass?: string
  /** Shows a pulsing placeholder mosaic instead of `tiles` — for the window
   * between the tag list resolving and its content preview arriving. */
  tilesLoading?: boolean
  className?: string
}

const TILE_BG = '#171219'
const BORDER = '#322b23'

/**
 * Reusable "poster" card (Option C): the content mosaic IS the card, with a
 * serif tag title overlaid on a bottom scrim. Always dark inside — content-
 * on-dark by nature, like `TagQuickPicker`/`SignInModal` — regardless of the
 * site's light/dark theme; the page around it stays on Matter tokens.
 *
 * Consumed by `/tags` (`TagsClient.tsx`) and intended for reuse on the public
 * profile page.
 */
export function CollectionPosterCard({
  tag,
  count,
  tiles,
  href,
  badge,
  children,
  subtitle,
  heightClass = 'h-[200px]',
  tilesLoading = false,
  className,
}: CollectionPosterCardProps): React.ReactElement {
  const showOverflow = !tilesLoading && count > tiles.length && tiles.length > 0
  const visibleTiles = showOverflow ? tiles.slice(0, 3) : tiles.slice(0, 4)
  const overflowCount = count - visibleTiles.length

  return (
    <div
      className={cn('relative overflow-hidden rounded-[14px] border', heightClass, className)}
      style={{ borderColor: BORDER }}
    >
      <Link href={href} aria-label={`View #${tag}`} className="absolute inset-0 z-0 block">
        <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-[2px]">
          {[0, 1, 2, 3].map((i) => {
            if (tilesLoading) {
              return (
                <div
                  key={i}
                  className="animate-pulse"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                  aria-hidden
                />
              )
            }
            if (showOverflow && i === 3) {
              return (
                <div
                  key={i}
                  className="flex items-center justify-center font-mono text-[13px] font-semibold text-white/60"
                  style={{ backgroundColor: TILE_BG }}
                >
                  +{overflowCount}
                </div>
              )
            }
            return <PosterTileView key={i} tile={visibleTiles[i] ?? null} />
          })}
        </div>
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(transparent 30%, rgba(11,11,17,.9))' }}
          aria-hidden
        />
      </Link>

      {badge && <div className="absolute right-3 top-3 z-10">{badge}</div>}

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 p-4">
        <div className="pointer-events-none min-w-0">
          <div className="truncate font-serif text-[22px] font-semibold text-white sm:text-[24px]">
            #{tag}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 overflow-hidden font-mono text-[10.5px] text-white/55">
            <span className="flex-none whitespace-nowrap">
              {count} post{count === 1 ? '' : 's'}
            </span>
            {subtitle}
          </div>
        </div>
        {children && (
          <div className="flex flex-none items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

function PosterTileView({ tile }: { tile: PosterTile | null }) {
  if (!tile) {
    return <div style={{ backgroundColor: TILE_BG }} aria-hidden />
  }

  if (tile.thumbnailUrl) {
    return (
      <img
        src={tile.thumbnailUrl}
        alt=""
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    )
  }

  const excerpt = (tile.text || '').slice(0, 60).trim()

  return (
    <div className="flex items-center justify-center p-2" style={{ backgroundColor: TILE_BG }}>
      <span className="line-clamp-4 text-center text-[9px] leading-tight text-white/70">
        {excerpt || '—'}
      </span>
    </div>
  )
}
