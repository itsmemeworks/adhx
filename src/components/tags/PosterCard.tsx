'use client'

import Link from 'next/link'
import { Bookmark, Eye, Flame, Layers, User } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Discovery view/save stats for this playlist (docs/specs/discovery-leaderboards.md §6).
 * `rank` is the 1-based position on this week's leaderboard, or `null`/absent when it isn't
 * charting — it renders as the small clay "#N" chip in the footer badge row. Omit the whole
 * prop (or pass `null`) for a card with nothing to show. */
export interface PosterCardStats {
  viewCount: number
  cloneCount: number
  rank?: number | null
}

/** A single content-mosaic tile: a thumbnail image, or a short text excerpt. */
export interface PosterTile {
  thumbnailUrl?: string | null
  text?: string | null
}

export interface CollectionPosterCardProps {
  tag: string
  count: number
  tiles: PosterTile[]
  /** Card link target — the whole mosaic area clicks through to this
   * (or, with `wholeCardLink`, the entire card). */
  href: string
  /** Interactive control for the action row under the mosaic (Public/
   * Private on `/tags`). Must not be combined with `wholeCardLink`
   * (nesting a button/anchor inside an `<a>` is invalid HTML). `rank`
   * below is the non-interactive alternative that IS safe with
   * `wholeCardLink`. On the `wholeCardLink` layout this still paints in
   * the mosaic's top-right (leaderboard curator uses `curator` instead).
   * When both `badge` and `curator` are passed, `badge` wins and
   * `curator` is dropped. */
  badge?: React.ReactNode
  /** Action controls (copy/open/delete, clone, …). INTERACTIVE — must not
   * be combined with `wholeCardLink`. On the default layout these sit in a
   * horizontal row under the mosaic so the image only carries the title and
   * stats. */
  children?: React.ReactNode
  heightClass?: string
  /** Shows a pulsing placeholder mosaic instead of `tiles` — for the window
   * between the tag list resolving and its content preview arriving. */
  tilesLoading?: boolean
  className?: string
  /** Renders the ENTIRE card (mosaic + title strip) as a single `<Link>`
   * instead of just the mosaic. Use only when the card carries no `badge`/
   * `children` interactive controls — nesting a button/anchor inside a
   * `<Link>` is invalid HTML. This is the public profile page's variant;
   * `/tags` keeps the default (mosaic links out; Public/Private + actions
   * sit in a row under the image so they don't nest inside the `<a>`).
   * `rank`'s medallion is non-interactive and safe to combine with this. */
  wholeCardLink?: boolean
  /** Showcase scale for a single-playlist profile: bigger tag title,
   * roomier footer padding, larger overflow-count type. */
  featured?: boolean
  /** Discovery view/save stats, rendered as icon badges in the fixed footer
   * badge row (eye + views, bookmark + saves, and a clay "#N" chip when
   * `rank` is a number). Omit or pass `null` when there's nothing to show —
   * existing callers are unaffected. */
  stats?: PosterCardStats | null
  /** Top-right overlay badge showing who curated this playlist — a
   * non-interactive `User` icon + handle, safe to combine with
   * `wholeCardLink` (the leaderboard's usage). Dropped when `badge` is also
   * passed (see `badge`'s doc). Usernames are capped at 15 chars, so this is
   * sized for that. */
  curator?: string
  /** 1-based leaderboard position. Renders a NON-interactive top-left rank
   * medallion — a gold clay-grad pill for #1, a clay-grad circle for #2-3,
   * and a glass circle for #4+ (mirrors the old leaderboard-only
   * `CollectionCard`'s `RankMedallion`). Safe to combine with
   * `wholeCardLink`, unlike `badge`/`children`. Omit or pass `null` for no
   * medallion. */
  rank?: number | null
}

const TILE_BG = '#171219'
/** Every footer/overlay text element gets this so it stays legible over
 * light content — badges already carry their own backing, so this is only
 * needed on the bare title. */
const TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.8)'
/** Shared recipe for every footer badge — icon-first, backed pill so text
 * never floats bare over the mosaic. */
const BADGE_CLASS =
  'inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 font-mono text-[10.5px] text-white/85 backdrop-blur-md'
/** The one badge that keeps its own warm coloring instead of the neutral
 * `BADGE_CLASS` recipe — carried over from the original "#N this week" chip. */
const CLAY_BADGE_STYLE: React.CSSProperties = {
  backgroundColor: 'rgba(227,124,84,0.16)',
  border: '1px solid rgba(227,124,84,0.4)',
  color: '#e88a5e',
}

/**
 * Reusable "poster" card (Option C): the content mosaic IS the card, with a
 * serif tag title overlaid on a bottom scrim. Always dark inside — content-
 * on-dark by nature, like `TagQuickPicker`/`SignInModal` — regardless of the
 * site's light/dark theme; the page around it stays on Matter tokens.
 *
 * Consumed by `/tags` (`TagsClient.tsx`, mosaic link + title/stats overlay,
 * Public/Private and copy/open/delete in a row under the image), the public
 * profile page `/t/{username}` (`wholeCardLink`, no interactive controls —
 * the whole card is one clickable unit), and the `/leaderboard`
 * (`CollectionsBoard.tsx`, `wholeCardLink` + `rank` medallion).
 */
export function CollectionPosterCard({
  tag,
  count,
  tiles,
  href,
  badge,
  children,
  heightClass = 'h-[240px]',
  tilesLoading = false,
  className,
  wholeCardLink = false,
  featured = false,
  stats = null,
  curator,
  rank = null,
}: CollectionPosterCardProps): React.ReactElement {
  // `badge` wins when both are passed (see the prop's doc) — in practice
  // /tags passes `badge` and the leaderboard passes `curator`, never both.
  const topRightOverlay = badge ?? (curator ? <CuratorBadge username={curator} /> : null)
  const mosaic = (
    <PosterMosaic tiles={tiles} count={count} tilesLoading={tilesLoading} featured={featured} />
  )

  const scrim = (
    <div
      className="absolute inset-0"
      style={{ background: 'linear-gradient(transparent 30%, rgba(11,11,17,.9))' }}
      aria-hidden
    />
  )

  const overlayFooter = (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 z-10',
        featured ? 'p-5' : 'p-4',
      )}
    >
      <div className="min-w-0 flex-1">
        {/* Row 1: the tag title — ALWAYS in this exact spot, never shifted by
            whether row 2 below has one badge or three. */}
        <div
          className={cn(
            'truncate font-serif font-semibold text-white',
            featured ? 'text-[26px] sm:text-[32px]' : 'text-[22px] sm:text-[24px]',
          )}
          style={{ textShadow: TEXT_SHADOW }}
        >
          #{tag}
        </div>
        {/* Row 2: fixed-height icon-badge row. Always rendered (even with just
            the post count) so row 1 above never moves depending on what else
            is available for this card. */}
        <div className="mt-1.5 flex h-[21px] items-center gap-1.5 overflow-hidden">
          <span
            className={BADGE_CLASS}
            title={`${count} post${count === 1 ? '' : 's'}`}
            aria-label={`${count} post${count === 1 ? '' : 's'}`}
          >
            <Layers size={10.5} aria-hidden="true" />
            <span>{count}</span>
          </span>
          {stats ? (
            <>
              <span
                className={BADGE_CLASS}
                title={`${stats.viewCount} views`}
                aria-label={`${stats.viewCount} views`}
              >
                <Eye size={10.5} aria-hidden="true" />
                <span>{stats.viewCount}</span>
              </span>
              <span
                className={BADGE_CLASS}
                title={`${stats.cloneCount} saves`}
                aria-label={`${stats.cloneCount} saves`}
              >
                <Bookmark size={10.5} aria-hidden="true" />
                <span>{stats.cloneCount}</span>
              </span>
              {typeof stats.rank === 'number' && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10.5px] font-semibold backdrop-blur-md"
                  style={CLAY_BADGE_STYLE}
                  title={`#${stats.rank} this week`}
                >
                  <Flame size={10} fill="currentColor" aria-hidden="true" />
                  <span>#{stats.rank}</span>
                </span>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )

  const actionBar =
    !wholeCardLink && (badge || children) ? (
      <div className="flex items-center gap-2 border-t border-hairline bg-surface px-3 py-2">
        {badge && <div className="min-w-0">{badge}</div>}
        {children && <div className="ml-auto flex flex-none items-center gap-1.5">{children}</div>}
      </div>
    ) : null

  if (wholeCardLink) {
    return (
      <Link
        href={href}
        aria-label={`View #${tag}`}
        className={cn(
          'relative block overflow-hidden rounded-[14px] border border-hairline transition-opacity hover:opacity-95',
          heightClass,
          className,
        )}
      >
        {mosaic}
        {scrim}
        {typeof rank === 'number' && <RankMedallion rank={rank} />}
        {topRightOverlay && <div className="absolute right-3 top-3 z-10">{topRightOverlay}</div>}
        {overlayFooter}
      </Link>
    )
  }

  return (
    <div
      className={cn('overflow-hidden rounded-[14px] border border-hairline bg-surface', className)}
    >
      <div className={cn('relative', heightClass)}>
        <Link href={href} aria-label={`View #${tag}`} className="absolute inset-0 z-0 block">
          {mosaic}
          {scrim}
        </Link>

        {typeof rank === 'number' && <RankMedallion rank={rank} />}
        {curator && !badge && (
          <div className="pointer-events-none absolute right-3 top-3 z-10">
            <CuratorBadge username={curator} />
          </div>
        )}

        {overlayFooter}
      </div>
      {actionBar}
    </div>
  )
}

/** Top-right, non-interactive "curated by" badge for the leaderboard — same
 * recipe as the other footer badges (`BADGE_CLASS`), just relocated. Safe
 * with `wholeCardLink` since it carries no click handler. */
function CuratorBadge({ username }: { username: string }) {
  return (
    <span className={BADGE_CLASS}>
      <User size={10.5} aria-hidden="true" />
      <span>{username}</span>
    </span>
  )
}

/**
 * Adaptive content mosaic — the number of real tiles (capped at 4 by every
 * caller) decides the layout, so a 1- or 3-post playlist doesn't leave a
 * dead cell or shrink into a quarter of the card:
 * - 0 tiles: one placeholder cell fills the card.
 * - 1 tile: fills the whole card.
 * - 2 tiles: two full-height columns.
 * - 3 tiles: 2×2, with the 3rd tile spanning both columns on the bottom row.
 * - 4 tiles: standard 2×2 — the 4th cell becomes a "+N" overflow ONLY when
 *   `count` (the playlist's real total) is more than the 3 tiles otherwise
 *   shown alongside it.
 */
function PosterMosaic({
  tiles,
  count,
  tilesLoading,
  featured,
}: {
  tiles: PosterTile[]
  count: number
  tilesLoading: boolean
  featured: boolean
}) {
  const tileCount = tilesLoading ? 4 : Math.min(tiles.length, 4)
  const showOverflow = !tilesLoading && tileCount === 4 && count > 4
  const overflowCount = count - 3
  const gridClass =
    tileCount <= 1
      ? 'grid-cols-1 grid-rows-1'
      : tileCount === 2
        ? 'grid-cols-2 grid-rows-1'
        : 'grid-cols-2 grid-rows-2'

  return (
    <div className={cn('grid h-full w-full', gridClass, featured ? 'gap-1' : 'gap-[2px]')}>
      {tilesLoading ? (
        [0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            aria-hidden
          />
        ))
      ) : tileCount === 0 ? (
        <PosterTileView tile={null} />
      ) : (
        Array.from({ length: tileCount }, (_, i) => {
          if (showOverflow && i === 3) {
            return (
              <div
                key="overflow"
                className={cn(
                  'flex items-center justify-center font-mono font-semibold text-white/60',
                  featured ? 'text-[18px] sm:text-[22px]' : 'text-[13px]',
                )}
                style={{ backgroundColor: TILE_BG }}
              >
                +{overflowCount}
              </div>
            )
          }
          const spanClass = tileCount === 3 && i === 2 ? 'col-span-2' : undefined
          return <PosterTileView key={i} tile={tiles[i] ?? null} className={spanClass} />
        })
      )}
    </div>
  )
}

function PosterTileView({ tile, className }: { tile: PosterTile | null; className?: string }) {
  if (!tile) {
    return <div className={className} style={{ backgroundColor: TILE_BG }} aria-hidden />
  }

  if (tile.thumbnailUrl) {
    return (
      <img
        src={tile.thumbnailUrl}
        alt=""
        referrerPolicy="no-referrer"
        className={cn('h-full w-full object-cover', className)}
      />
    )
  }

  const excerpt = (tile.text || '').slice(0, 60).trim()

  return (
    <div
      className={cn('flex items-center justify-center p-2', className)}
      style={{ backgroundColor: TILE_BG }}
    >
      <span className="line-clamp-4 text-center text-[9px] leading-tight text-white/70">
        {excerpt || '—'}
      </span>
    </div>
  )
}

/** Top-left, non-interactive leaderboard-position medallion. Tiered by rank:
 * #1 gets the warm gold treatment, #2-3 a plain clay circle, #4+ a glass
 * circle. Lifted from the old leaderboard-only `CollectionCard`. */
function RankMedallion({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full bg-clay-grad px-2.5 py-1 shadow-glow">
        <Flame size={13} className="text-white" fill="currentColor" />
        <span className="font-mono text-[12px] font-bold text-white">1</span>
      </div>
    )
  }
  if (rank === 2 || rank === 3) {
    return (
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-clay-grad font-mono text-[13px] font-bold text-white">
        {rank}
      </div>
    )
  }
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/55 font-mono text-[12px] text-white/70">
      {rank}
    </div>
  )
}
