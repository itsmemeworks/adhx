import Link from 'next/link'
import { User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MatterLogo, LiveDot } from '@/components/matter'
import { CollectionPosterCard } from '@/components/tags'
import {
  RANK_WINDOWS,
  windowToPath,
  type RankWindow,
  type LeaderboardEntry,
} from '@/lib/discovery/rank'

/**
 * The visual surface of /collections + /collections/[window] — the "podium"
 * design (docs/specs/discovery-leaderboards.md §6). Entirely server-rendered:
 * unlike `TrendingRankedList` (which polls a live feed client-side), the
 * leaderboard is a per-request snapshot and the window switcher is real
 * navigation (`<Link>` to `windowToPath()`), so no client component or
 * hydration is needed here at all.
 *
 * Header chrome (MatterLogo + LiveDot + brand label, dark stage) matches
 * `src/components/trending/TrendingRankedList.tsx` on purpose — same Matter
 * dark vocabulary, different content.
 *
 * Cards are the canonical `CollectionPosterCard` (`@/components/tags`) — the
 * leaderboard used to have its own bespoke `CollectionCard`, now deleted, so
 * /collections, /tags, and /t/{username} all render collections identically.
 * The board's own contribution on top is the rank medallion (`rank` prop,
 * safe with `wholeCardLink`) and the size hierarchy below.
 */

type LeaderboardCardSize = 'podium-lead' | 'podium-side' | 'grid'

/** Width+height per slot — merged into the card's own className via
 * `heightClass`, which just interpolates whatever string it's given. */
const SIZE_CLASSES: Record<LeaderboardCardSize, string> = {
  'podium-lead': 'w-[260px] sm:w-[300px] h-[340px] sm:h-[380px]',
  'podium-side': 'w-[220px] sm:w-[240px] h-[290px] sm:h-[320px]',
  grid: 'h-[240px] w-full',
}

/** One leaderboard slot: the canonical poster card + the curator's handle
 * underneath (info the old bespoke card carried inline in its footer — the
 * shared card's footer has no room reserved for it, so it lives outside).
 * #1 keeps its glow treatment via a wrapper class, since the shared card has
 * no rank-1-specific styling hook of its own. */
function LeaderboardCard({
  entry,
  rank,
  size,
}: {
  entry: LeaderboardEntry
  rank: number
  size: LeaderboardCardSize
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2', rank === 1 && 'shadow-glow')}>
      <CollectionPosterCard
        tag={entry.tag}
        count={entry.itemCount}
        tiles={entry.tiles}
        href={`/t/${entry.username}/${entry.tag}`}
        wholeCardLink
        featured={size === 'podium-lead'}
        rank={rank}
        heightClass={SIZE_CLASSES[size]}
        stats={{ viewCount: entry.viewCount, cloneCount: entry.cloneCount }}
      />
      <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 font-mono text-[10.5px] text-white/70 backdrop-blur-md">
        <User size={10.5} aria-hidden="true" />
        {entry.username}
      </span>
    </div>
  )
}

export function CollectionsBoard({
  window,
  entries,
}: {
  window: RankWindow
  entries: LeaderboardEntry[]
}) {
  const [first, second, third] = entries
  const rest = entries.slice(3)

  return (
    <div className="min-h-screen bg-[#08070a] text-white/90">
      <header className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-6">
        <Link href="/" aria-label="ADHX home" className="[&_span]:text-white">
          <MatterLogo size={19} />
        </Link>
        <span className="ml-2 inline-flex items-center gap-2">
          <LiveDot />
          <span className="text-[12.5px] font-semibold text-white/60">Collections</span>
        </span>
        <Link
          href="/trending"
          className="ml-auto text-[13px] font-semibold text-white/60 underline decoration-white/20 underline-offset-4 transition-colors hover:text-white"
        >
          Trending posts →
        </Link>
      </header>

      <div className="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-clay">
            Collection leaderboard
          </p>
          <h1 className="mt-3 font-serif text-[38px] leading-[1.05] sm:text-[52px]">
            The most-watched collections
          </h1>
          <p className="mt-4 text-[15px] text-white/55">
            What the community is saving into and sending around, ranked by views and saves.
          </p>
        </div>

        <nav
          aria-label="Time window"
          className="mt-7 flex flex-wrap items-center justify-center gap-2"
        >
          {RANK_WINDOWS.map((w) => {
            const active = w.id === window
            return (
              <Link
                key={w.id}
                href={windowToPath(w.id)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-150',
                  active
                    ? 'bg-white text-black'
                    : 'border border-white/15 bg-white/[0.04] text-white/60 hover:text-white',
                )}
              >
                {w.label}
              </Link>
            )
          })}
        </nav>

        {entries.length === 0 ? (
          <div className="mt-20 flex flex-col items-center gap-2 text-center">
            <p className="text-[16px] text-white/40">No public collections charting yet</p>
            <p className="max-w-sm text-[13px] text-white/30">
              Make one of your tag collections public from /tags to get it on the board.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-14 flex flex-col items-center gap-5 sm:flex-row sm:items-end sm:justify-center sm:gap-4">
              {second && (
                <div className="order-2 sm:order-1">
                  <LeaderboardCard entry={second} rank={2} size="podium-side" />
                </div>
              )}
              {first && (
                <div className="order-1 sm:order-2">
                  <LeaderboardCard entry={first} rank={1} size="podium-lead" />
                </div>
              )}
              {third && (
                <div className="order-3">
                  <LeaderboardCard entry={third} rank={3} size="podium-side" />
                </div>
              )}
            </div>

            {rest.length > 0 && (
              <div className="mt-16">
                <div className="border-t border-white/[0.08] pt-6">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-white/40">
                    Ranks 4–{entries.length}
                  </h2>
                </div>
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((entry) => (
                    <LeaderboardCard
                      key={`${entry.username}:${entry.tag}`}
                      entry={entry}
                      rank={entry.rank}
                      size="grid"
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <p className="mt-16 text-center font-mono text-[11px] text-white/35">
          Updated live · views count once per person per collection · saves weigh 5×
        </p>
      </div>
    </div>
  )
}
