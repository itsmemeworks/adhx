'use client'

import { AccountMenu } from '../AccountMenu'
import { BottomNav, NxLogo, PrimaryNav, type NavId } from '../PrimaryNav'
import { HeaderSearch } from '../QuickSearch'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FeedItem } from '@/components/feed/types'
import { postCoverSrc, postText } from '../post'
import { NxImage } from '../primitives'
import { channelPlayHref } from '../theater/queue'

/** A tile in a cover: a post's picture, or its words on cream when it has none. */
export interface CoverTile {
  img: string | null
  text: string
}

import { channelTitle } from './title'
export { channelTitle }

export function tilesFromPosts(posts: FeedItem[]): CoverTile[] {
  return posts.map((p) => ({ img: postCoverSrc(p), text: postText(p) }))
}

/** Up to three posts fanned out, the first in front. Decorative (the card names the channel). */
export function ChannelCover({
  tiles,
  label,
  className,
}: {
  tiles: CoverTile[]
  /** Shown on cream when there are no tiles at all. */
  label: string
  className?: string
}) {
  const shown = tiles.slice(0, 3)
  return (
    <span
      aria-hidden
      className={cn('relative block overflow-hidden rounded-[18px] bg-nx-surface', className)}
    >
      {shown[0]?.img && (
        <img
          src={shown[0].img}
          alt=""
          className="absolute -inset-8 h-[calc(100%+64px)] w-[calc(100%+64px)] object-cover blur-[30px] brightness-[0.5] saturate-[1.2]"
        />
      )}
      {shown.length === 0 && (
        <span className="absolute inset-0 flex items-end bg-nx-cream p-3 font-nx-serif text-[22px] leading-none text-nx-ink">
          {label}
        </span>
      )}
      {shown.map((tile, i) => {
        const pos = [
          'left-1/2 top-[10%] z-[3] h-[80%] w-[38%] -translate-x-1/2',
          'left-[8%] top-[16%] z-[2] h-[70%] w-[32%] -rotate-6',
          'right-[8%] top-[16%] z-[1] h-[70%] w-[32%] rotate-6',
        ][i]
        return (
          <span
            key={i}
            className={cn(
              'absolute overflow-hidden rounded-xl shadow-[0_12px_30px_rgba(0,0,0,0.5)]',
              pos,
            )}
          >
            {tile.img ? (
              <NxImage
                src={tile.img}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <span className="absolute inset-0 overflow-hidden bg-nx-cream p-2 font-nx-serif text-[13px] leading-[1.1] text-nx-ink">
                {tile.text}
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}

interface LeaderboardEntry {
  username: string
  tag: string
  rank: number
  viewCount: number
  cloneCount: number
  itemCount: number
  tiles: { thumbnailUrl?: string | null; text?: string | null }[]
}

const WINDOWS = [
  { slug: 'today', label: 'Today' },
  { slug: 'week', label: 'Week' },
  { slug: 'month', label: 'Month' },
  { slug: 'all-time', label: 'All time' },
] as const
type WindowSlug = (typeof WINDOWS)[number]['slug']

const COVER_COLOURS = [
  'bg-nx-accent',
  'bg-nx-cream',
  'bg-[#ff8a6b]',
  'bg-[#8fb4ff]',
  'bg-[#b9e3a5]',
  'bg-[#e0b7f0]',
]

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Public channels ranked by views and saves (the Discovery leaderboard). */
export function TopChannels({
  className,
  highlight,
}: {
  className?: string
  highlight?: string | null
}) {
  const [window, setWindow] = useState<WindowSlug>('week')
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setRows(null)
    fetch(`/api/collections/trending?window=${window}&limit=10`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ items: LeaderboardEntry[] }>) : { items: [] }))
      .then((d) => setRows(d.items ?? []))
      .catch(() => {
        if (!controller.signal.aborted) setRows([])
      })
    return () => controller.abort()
  }, [window])

  return (
    <section
      aria-labelledby="nx-top"
      className={cn('flex flex-col gap-3.5 rounded-[22px] bg-[#121110] p-4 md:p-[18px]', className)}
    >
      <div className="flex items-baseline justify-between">
        <h2 id="nx-top" className="m-0 font-nx-serif text-[30px] font-normal md:text-[32px]">
          Top channels
        </h2>
        <span className="text-xs text-white/55">by views + saves</span>
      </div>
      <div
        role="tablist"
        aria-label="Time window"
        className="flex gap-0.5 rounded-xl bg-[#1c1b19] p-[3px]"
      >
        {WINDOWS.map((w) => (
          <button
            key={w.slug}
            type="button"
            role="tab"
            aria-selected={window === w.slug}
            onClick={() => setWindow(w.slug)}
            className={cn(
              'min-h-[38px] flex-1 rounded-[9px] text-[13px]',
              window === w.slug ? 'bg-white font-bold text-black' : 'text-[#bbb]',
            )}
          >
            {w.label}
          </button>
        ))}
      </div>
      {rows === null ? (
        <div aria-hidden className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="nx-shimmer animate-nx-shimmer block h-[68px] rounded-[14px]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="m-0 py-6 text-center text-sm text-white/60">
          No public channels with views yet in this window.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {rows.map((r, i) => {
            const cover = r.tiles.find((t) => t.thumbnailUrl)?.thumbnailUrl ?? null
            const mine = highlight === `${r.username}/${r.tag}`
            return (
              <li key={`${r.username}/${r.tag}`} className="flex items-center gap-2">
                <Link
                  href={`/t/${r.username}/${r.tag}`}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-3 rounded-[14px] p-2',
                    i === 0 ? 'bg-[#211e14]' : 'hover:bg-white/[0.04]',
                    mine && 'ring-1 ring-nx-accent/60',
                  )}
                >
                  <span
                    className={cn(
                      'w-7 shrink-0 text-center font-nx-serif',
                      i < 3 ? 'text-[28px]' : 'text-[20px]',
                      i === 0 ? 'text-nx-accent' : i < 3 ? 'text-white' : 'text-white/50',
                    )}
                  >
                    {String(r.rank)}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'relative flex h-[52px] w-[52px] shrink-0 items-end overflow-hidden rounded-[10px] p-1.5 font-nx-serif text-[14px] leading-none text-black',
                      COVER_COLOURS[i % COVER_COLOURS.length],
                    )}
                  >
                    {cover ? (
                      <NxImage
                        src={cover}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      channelTitle(r.tag)
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-bold">{channelTitle(r.tag)}</span>
                    <span className="truncate text-xs text-white/60">
                      <span>{`@${r.username} · `}</span>
                      <span className="font-semibold text-nx-accent">
                        {`${plural(r.viewCount, 'view')}${r.cloneCount ? ` · ${plural(r.cloneCount, 'save')}` : ''}`}
                      </span>
                    </span>
                  </span>
                </Link>
                <Link
                  href={channelPlayHref(r.username, r.tag)}
                  aria-label={`Play ${channelTitle(r.tag)}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2e2c29] text-white"
                >
                  <Play
                    aria-hidden
                    className="ml-0.5 h-3.5 w-3.5"
                    fill="currentColor"
                    strokeWidth={0}
                  />
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

export function NxHeader({
  children,
  current,
}: {
  children?: React.ReactNode
  /** Which tab is lit; by default, from the address. */
  current?: NavId | null
}) {
  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-4 bg-black/90 px-4 py-3 backdrop-blur md:px-7 md:py-[18px]">
        <NxLogo />
        <PrimaryNav current={current} />
        <span className="flex-1" />
        {children}
        <HeaderSearch />
        <AccountMenu />
      </header>
      <BottomNav current={current} />
    </>
  )
}
