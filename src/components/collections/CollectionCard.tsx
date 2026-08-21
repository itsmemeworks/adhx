import Link from 'next/link'
import { Eye, Bookmark, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeaderboardEntry } from '@/lib/discovery/rank'

/**
 * Poster card for the /collections leaderboard — the "podium" design
 * (docs/specs/discovery-leaderboards.md §6). Deliberately its own component
 * rather than a reuse of `src/components/tags/PosterCard.tsx` (owned by a
 * concurrent change); the mosaic/scrim/footer recipe is intentionally the
 * same visual language, plus a rank medallion PosterCard doesn't have.
 */

export type CollectionCardSize = 'podium-lead' | 'podium-side' | 'grid'

const TILE_BG = '#171219'
const BORDER = '#322b23'
/** Warmer border for the #1 spot — the only card that also gets the glow shadow. */
const WARM_BORDER = '#5a3a22'

const SIZE_CLASSES: Record<CollectionCardSize, string> = {
  'podium-lead': 'w-[260px] sm:w-[300px] h-[340px] sm:h-[380px]',
  'podium-side': 'w-[220px] sm:w-[240px] h-[290px] sm:h-[320px]',
  grid: 'h-[240px] w-full',
}

export function CollectionCard({
  entry,
  rank,
  size,
}: {
  entry: LeaderboardEntry
  rank: number
  size: CollectionCardSize
}) {
  const featured = size === 'podium-lead'
  const showOverflow = entry.itemCount > entry.tiles.length && entry.tiles.length > 0
  const visibleTiles = showOverflow ? entry.tiles.slice(0, 3) : entry.tiles.slice(0, 4)
  const overflowCount = entry.itemCount - visibleTiles.length

  return (
    <Link
      href={`/t/${entry.username}/${entry.tag}`}
      aria-label={`View #${entry.tag} by @${entry.username}, rank ${rank}`}
      className={cn(
        'group relative block overflow-hidden rounded-[14px] border transition-opacity hover:opacity-95',
        rank === 1 && 'shadow-glow',
        SIZE_CLASSES[size],
      )}
      style={{ borderColor: rank === 1 ? WARM_BORDER : BORDER }}
    >
      <div
        className={cn(
          'grid h-full w-full grid-cols-2 grid-rows-2',
          featured ? 'gap-1' : 'gap-[2px]',
        )}
      >
        {[0, 1, 2, 3].map((i) => {
          if (showOverflow && i === 3) {
            return (
              <div
                key={i}
                className={cn(
                  'flex items-center justify-center font-mono font-semibold text-white/60',
                  featured ? 'text-[20px]' : 'text-[13px]',
                )}
                style={{ backgroundColor: TILE_BG }}
              >
                +{overflowCount}
              </div>
            )
          }
          const tile = visibleTiles[i]
          if (!tile) return <div key={i} style={{ backgroundColor: TILE_BG }} aria-hidden />
          if (tile.thumbnailUrl) {
            return (
              <img
                key={i}
                src={tile.thumbnailUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            )
          }
          const excerpt = (tile.text || '').slice(0, 60).trim()
          return (
            <div
              key={i}
              className="flex items-center justify-center p-2"
              style={{ backgroundColor: TILE_BG }}
            >
              <span className="line-clamp-4 text-center text-[9px] leading-tight text-white/70">
                {excerpt || '—'}
              </span>
            </div>
          )
        })}
      </div>

      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(transparent 30%, rgba(11,11,17,.9))' }}
        aria-hidden
      />

      <RankMedallion rank={rank} />

      <div
        className={cn('absolute inset-x-0 bottom-0 flex flex-col gap-1', featured ? 'p-6' : 'p-4')}
      >
        <div
          className={cn(
            'truncate font-serif font-semibold text-white',
            featured ? 'text-[30px] sm:text-[36px]' : 'text-[20px] sm:text-[22px]',
          )}
        >
          #{entry.tag}
        </div>
        <div
          className={cn(
            'flex items-center gap-1.5 font-mono text-white/55',
            featured ? 'text-[12.5px]' : 'text-[11px]',
          )}
        >
          <span>
            @{entry.username} · {entry.itemCount} post{entry.itemCount === 1 ? '' : 's'}
          </span>
        </div>
        <div
          className={cn(
            'flex items-center gap-3 font-mono text-white/70',
            featured ? 'text-[12.5px]' : 'text-[11px]',
          )}
        >
          <span className="inline-flex items-center gap-1">
            <Eye size={featured ? 14 : 12} strokeWidth={2} />
            {entry.viewCount.toLocaleString()} views
          </span>
          <span className="inline-flex items-center gap-1">
            <Bookmark size={featured ? 14 : 12} strokeWidth={2} />
            {entry.cloneCount.toLocaleString()} saves
          </span>
        </div>
      </div>
    </Link>
  )
}

function RankMedallion({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full bg-clay-grad px-2.5 py-1 shadow-glow">
        <Flame size={13} className="text-white" fill="currentColor" />
        <span className="font-mono text-[12px] font-bold text-white">1</span>
      </div>
    )
  }
  if (rank === 2 || rank === 3) {
    return (
      <div className="absolute left-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-clay-grad font-mono text-[13px] font-bold text-white">
        {rank}
      </div>
    )
  }
  return (
    <div className="absolute left-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/55 font-mono text-[12px] text-white/70">
      {rank}
    </div>
  )
}
