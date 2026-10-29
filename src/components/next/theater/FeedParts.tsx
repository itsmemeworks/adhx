'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  Bookmark,
  Check,
  ChevronRight,
  CirclePlay,
  Clock,
  Plus,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Saver } from '@/lib/people/types'
import { postCoverSrc } from '../post'
import { NxAvatar, NxImage } from '../primitives'
import { saverName } from '../savers'
import { namesOf } from '../moments/people'
import { cn } from '@/lib/utils'
import {
  FEED_KINDS,
  FEED_KIND_LABELS,
  feedTypesSummary,
  waitingLine,
  type BlendMode,
  type FeedKind,
  type WhyKind,
} from '@/lib/feed/blend'
import type { FeedItem } from '@/components/feed/types'
import { Gob } from '../Gob'
import { GobShape } from '../GobShape'

/**
 * Pieces of the blended feed in the theater (`/play?feed=`): whose saves it
 * plays, why a post is here, and the end of New.
 */

/** Icon for a reason, as on the chip, Up next and "Why this one". */
export const WHY_ICON: Record<WhyKind, LucideIcon> = {
  sent: Send,
  together: Users,
  more: Plus,
  like: Bookmark,
  close: CirclePlay,
  fresh: Clock,
  yours: Bookmark,
}

export function WhyIcon({
  kind,
  className,
  strokeWidth = 2.2,
}: {
  kind: WhyKind
  className?: string
  strokeWidth?: number
}) {
  const Icon = WHY_ICON[kind]
  return <Icon aria-hidden className={className} strokeWidth={strokeWidth} />
}

/** The short label for a post's why: "Saved together", else the why line itself. */
export function whyLabel(post: Pick<FeedItem, 'why' | 'whyReasons'>): string {
  if (!post.why) return ''
  return post.whyReasons?.[0]?.kind === 'together' ? 'Saved together' : post.why
}

export function whyKind(post: Pick<FeedItem, 'whyReasons'>): WhyKind {
  return post.whyReasons?.[0]?.kind ?? 'fresh'
}

/**
 * Who sent you this post ("Pete sent you this"), as a face to show: their
 * saver entry when they have a save you can see, else their generated face.
 */
export function sentBy(
  post: Pick<FeedItem, 'whyReasons' | 'savers'>,
): { avatarUrl: string | null; handle: string; name: string } | null {
  const reason = post.whyReasons?.[0]
  if (reason?.kind !== 'sent' || !reason.username) return null
  const saver = post.savers?.find((s) => s.username === reason.username)
  return {
    avatarUrl: saver?.avatarUrl ?? null,
    handle: reason.username,
    name: saver ? saverName(saver) : reason.text.split(/ (?:and|sent) /)[0] || reason.username,
  }
}

/** The face before a reason: the sender's for "sent", else the reason's icon. */
export function WhyLead({
  post,
  size = 18,
  className,
}: {
  post: Pick<FeedItem, 'whyReasons' | 'savers'>
  size?: number
  className?: string
}) {
  const sender = sentBy(post)
  if (sender) return <NxAvatar author={sender} size={size} />
  return <WhyIcon kind={whyKind(post)} className={className} />
}

/**
 * The thumbnail beside "Like … you kept": your own kept post it's most like,
 * a Gob-shaped square that opens it in My saves.
 */
export function LikeThumb({
  post,
  size = 38,
}: {
  post: { platform: string; id: string; posterUrl?: string | null } | undefined
  size?: number
}) {
  if (!post?.posterUrl) return null
  return (
    <Link
      href={`/play?recent=1&start=${encodeURIComponent(`${post.platform}:${post.id}`)}`}
      aria-label="Open the post you kept"
      className="shrink-0"
    >
      <GobShape size={size} className="bg-nx-raised">
        <NxImage src={post.posterUrl} alt="" className="h-full w-full object-cover" />
      </GobShape>
    </Link>
  )
}

const SWITCH: { mode: Exclude<BlendMode, 'lineup'>; label: string }[] = [
  { mode: 'new', label: 'New' },
  { mode: 'everyone', label: 'Everyone' },
  { mode: 'friends', label: 'Friends' },
  { mode: 'mine', label: 'Mine' },
]

/**
 * New · Everyone · Friends · Mine. New is your people's saves you
 * haven't seen; the other three are the latest saves, newest first, seen or not.
 */
export function FeedSwitch({
  mode,
  onChange,
  className,
}: {
  mode: BlendMode
  onChange: (mode: BlendMode) => void
  className?: string
}) {
  const lit = mode
  return (
    <div
      role="radiogroup"
      aria-label="Whose saves"
      className={cn('flex shrink-0 gap-0.5 rounded-full bg-nx-sheet p-1', className)}
    >
      {SWITCH.map((option) => {
        const on = lit === option.mode
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              if (!on) onChange(option.mode)
            }}
            className={cn(
              'h-8 whitespace-nowrap rounded-full px-3 text-[13px] md:h-9 md:px-3.5',
              on ? 'bg-nx-cream font-extrabold text-black' : 'font-semibold text-nx-ink/80',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * "What's in your feed": a short summary ("Videos and photos") that opens four
 * toggle chips. At least one kind stays on.
 */
export function FeedTypesControl({
  types,
  onChange,
  compact = false,
  className,
}: {
  types: readonly FeedKind[]
  onChange: (types: FeedKind[]) => void
  /** The icon alone, its chips opening to the left (beside the switch). */
  compact?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])
  const summary = feedTypesSummary(types)
  return (
    <div ref={ref} className={cn('relative shrink-0', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`What’s in your feed: ${summary}`}
        onClick={() => setOpen((o) => !o)}
        title={compact ? `What’s in your feed: ${summary}` : undefined}
        className={cn(
          'flex h-10 min-w-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-nx-sheet px-3 text-[13px] font-bold text-nx-ink',
          compact ? 'h-12 w-12 bg-nx-surface px-0' : 'sm:px-3.5',
        )}
      >
        <SlidersHorizontal aria-hidden className="h-4 w-4 shrink-0 text-nx-accent" />
        {/* Phones: the icon alone (the chips say what's on). */}
        {!compact && <span className="hidden sm:inline">{summary}</span>}
      </button>
      {open && (
        <div
          role="group"
          aria-label="What’s in your feed"
          className={cn(
            'absolute right-0 top-full z-50 mt-2 flex w-[260px] flex-col gap-2 rounded-2xl bg-nx-sheet p-3 shadow-[0_10px_40px_rgba(0,0,0,0.5)]',
            !compact && 'sm:left-0 sm:right-auto',
          )}
        >
          <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-nx-ink/60">
            What’s in your feed
          </span>
          <div className="flex flex-wrap gap-1.5">
            {FEED_KINDS.map((kind) => {
              const on = types.includes(kind)
              const last = on && types.length === 1
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={on}
                  disabled={last}
                  title={last ? 'Keep at least one on' : undefined}
                  onClick={() =>
                    onChange(
                      on
                        ? types.filter((k) => k !== kind)
                        : FEED_KINDS.filter((k) => k === kind || types.includes(k)),
                    )
                  }
                  className={cn(
                    'flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-bold disabled:cursor-not-allowed',
                    on ? 'bg-nx-cream text-black' : 'bg-white/10 text-nx-ink',
                  )}
                >
                  {on && <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />}
                  <span>{FEED_KIND_LABELS[kind]}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** The chip at the stage's top-left that says why this post is here; opens "Why this one". */
export function WhyChip({
  post,
  onOpen,
  chevron = false,
  className,
}: {
  post: Pick<FeedItem, 'why' | 'whyReasons' | 'savers'>
  onOpen: () => void
  /** A chevron after the words (phones: it opens a sheet). */
  chevron?: boolean
  className?: string
}) {
  const label = whyLabel(post)
  if (!label) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Why this one: ${label}`}
      className={cn(
        'pointer-events-auto flex h-9 min-w-0 max-w-full items-center gap-[7px] rounded-full border border-white/[0.14] bg-black/50 pl-2.5 pr-3 text-[13px] font-bold text-nx-cream backdrop-blur-md',
        className,
      )}
    >
      <WhyLead post={post} size={22} className="h-4 w-4 shrink-0 text-nx-accent" />
      <span className="truncate">{label}</span>
      {chevron && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-nx-ink/70" />}
    </button>
  )
}

/** What New played today, from the people who saved it: "12 from Ana, Ben and Mum today". */
export interface CaughtUpRecap {
  count: number
  savers: readonly Saver[]
  covers: readonly string[]
  onPlay: () => void
}

export function recapLine(recap: CaughtUpRecap): string {
  const names = recap.savers.filter((s) => !s.isYou).map(saverName)
  return `${recap.count} from ${namesOf(names)} today`
}

function RecapThumbs({ covers, tall = false }: { covers: readonly string[]; tall?: boolean }) {
  return (
    <span aria-hidden className="flex shrink-0">
      {covers.slice(0, 4).map((src, i) => (
        <span
          key={`${i}:${src}`}
          className={cn(
            'relative block overflow-hidden border-2 border-nx-surface bg-nx-plate',
            tall ? 'h-[58px] w-[42px] rounded-[10px]' : 'h-[34px] w-[26px] rounded-md',
            i > 0 && (tall ? '-ml-3' : '-ml-2'),
          )}
          style={tall ? { transform: `rotate(${(i - 1.5) * 3}deg)` } : undefined}
        >
          <NxImage
            src={src}
            sizes="42px"
            alt=""
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </span>
      ))}
    </span>
  )
}

interface TonightCard {
  key: string
  href: string
  cover: string | null
  badge: 'live' | 'channel'
  title: string
  sub: string
  savers: Saver[]
}

/** A live moment and a couple of channels, for "Tonight on your ADHX". */
function useTonight(on: boolean): TonightCard[] | null {
  const [cards, setCards] = useState<TonightCard[] | null>(null)
  useEffect(() => {
    if (!on) return
    const controller = new AbortController()
    const get = (url: string) =>
      fetch(url, { credentials: 'same-origin', signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    void Promise.all([get('/api/moments'), get('/api/channels')]).then(([m, c]) => {
      if (controller.signal.aborted) return
      const out: TonightCard[] = []
      type Moment = {
        slug: string
        title: string
        people: number
        watching: number
        covers?: FeedItem[]
        savers?: Saver[]
      }
      const moment = ((m?.moments ?? []) as Moment[])[0]
      if (moment) {
        out.push({
          key: `m:${moment.slug}`,
          href: `/play?moment=${encodeURIComponent(moment.slug)}`,
          cover: moment.covers?.[0] ? postCoverSrc(moment.covers[0]) : null,
          badge: 'live',
          title: `${moment.title} · live`,
          sub:
            moment.watching > 0
              ? `${moment.watching} watching`
              : `${moment.people} ${moment.people === 1 ? 'person' : 'people'} saving it`,
          savers: (moment.savers ?? []).slice(0, 2),
        })
      }
      type Group = {
        slug: string
        name: string
        size: number
        newCount: number
        savers: Saver[]
        covers?: { post: FeedItem }[]
      }
      // A channel made of the live moment's own posts would show the same thing twice.
      const inMoment = new Set(
        (moment?.covers ?? []).map((p) => `${p.platform ?? 'twitter'}:${p.id}`),
      )
      const groups = [...((c?.group ?? []) as Group[])]
        .filter(
          (g) =>
            !(g.covers ?? []).some((cv) =>
              inMoment.has(`${cv.post.platform ?? 'twitter'}:${cv.post.id}`),
            ),
        )
        .sort((a, b) => b.newCount - a.newCount || b.size - a.size)
      for (const g of groups.slice(0, 3 - out.length)) {
        out.push({
          key: `g:${g.slug}`,
          href: `/play?group=${encodeURIComponent(g.slug)}`,
          cover: g.covers?.[0] ? postCoverSrc(g.covers[0].post) : null,
          badge: 'channel',
          title: `${g.name} · ${g.size} saves`,
          sub: namesOf(g.savers.map(saverName)),
          savers: g.savers.slice(0, 2),
        })
      }
      setCards(out)
    })
    return () => controller.abort()
  }, [on])
  return cards
}

function TonightRow({ recap }: { recap?: CaughtUpRecap | null }) {
  const cards = useTonight(true)
  if (!cards?.length && !recap?.count) return null
  return (
    <section
      aria-labelledby="nx-tonight"
      className="mt-auto flex w-full flex-col gap-3.5 self-stretch pt-8 text-left"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="nx-tonight" className="m-0 font-nx-serif text-[30px] font-normal leading-none">
          Tonight on your ADHX
        </h2>
        {recap && recap.count > 0 && (
          <button
            type="button"
            onClick={recap.onPlay}
            className="flex h-11 shrink-0 items-center gap-3 rounded-full bg-nx-surface pl-2 pr-3.5 text-sm font-semibold text-nx-cream"
          >
            <RecapThumbs covers={recap.covers} />
            <span className="whitespace-nowrap">{recapLine(recap)}</span>
          </button>
        )}
      </div>
      {cards && cards.length > 0 && (
        <div className="flex gap-5">
          {cards.map((card) => (
            <Link
              key={card.key}
              href={card.href}
              className="relative block h-[190px] min-w-0 flex-1 overflow-hidden rounded-[20px] bg-nx-surface text-nx-cream"
            >
              {card.cover && (
                <NxImage
                  src={card.cover}
                  sizes="(max-width: 768px) 50vw, 300px"
                  alt=""
                  loading="eager"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <span className="absolute left-3 top-3 flex h-7 items-center gap-1.5 rounded-full bg-black/55 px-2.5 text-xs font-extrabold backdrop-blur-md">
                {card.badge === 'live' && (
                  <span aria-hidden className="block h-[7px] w-[7px] rounded-full bg-nx-live" />
                )}
                <span className={card.badge === 'live' ? 'tracking-[0.06em]' : 'font-bold'}>
                  {card.badge === 'live' ? 'LIVE' : 'Channel'}
                </span>
              </span>
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2.5 bg-gradient-to-b from-transparent to-black/90 px-4 pb-3.5 pt-12">
                <span className="flex min-w-0 flex-col gap-[3px]">
                  <span className="truncate text-[17px] font-extrabold">{card.title}</span>
                  <span className="truncate text-[13px] text-nx-ink-soft">{card.sub}</span>
                </span>
                {card.savers.length > 0 && <SaverDots savers={card.savers} />}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function SaverDots({ savers }: { savers: readonly Saver[] }) {
  return (
    <span aria-hidden className="flex shrink-0">
      {savers.map((s, i) => (
        <span key={s.username} className={cn('block', i > 0 && '-ml-2')}>
          <NxAvatar
            author={{ avatarUrl: s.avatarUrl, handle: s.username, name: saverName(s) }}
            size={24}
            style={{ boxShadow: '0 0 0 2px #000' }}
          />
        </span>
      ))}
    </span>
  )
}

/**
 * The end of New: everything your people saved has been on stage. Replaces
 * the stage (the player stays mounted underneath). Wide screens add
 * "Tonight on your ADHX" (a live moment and channels); phones get the recap
 * card above the buttons.
 */
export function CaughtUpStage({
  onWatchAgain,
  waiting = {},
  onShowWaiting,
  recap = null,
  tonight = false,
  className,
}: {
  /** Play everyone's saves again, seen ones included (mode `everyone`). */
  onWatchAgain: () => void
  /** Unseen posts "What's in your feed" leaves out, by kind. */
  waiting?: Partial<Record<FeedKind, number>>
  onShowWaiting?: () => void
  /** What New played today, when it played anything. */
  recap?: CaughtUpRecap | null
  /** Wide screens: the Tonight row along the bottom. */
  tonight?: boolean
  className?: string
}) {
  const waits = waitingLine(waiting)
  return (
    <section
      aria-labelledby="nx-caught-up"
      className={cn(
        'relative flex flex-col items-center overflow-y-auto bg-nx-stage px-5 pb-8 text-center font-nx-sans text-nx-cream md:px-8',
        tonight ? 'justify-start pt-9' : 'justify-center pt-6',
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-10 h-[480px] w-[min(900px,140vw)] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(rgba(255,210,63,0.10),rgba(255,210,63,0)_65%)]"
      />
      {/* Phones: a bigger Gob with its shadow on the floor, as on the phone board. */}
      <span className="relative flex flex-col items-center md:hidden">
        <Gob size={96} className="drop-shadow-[0_18px_40px_rgba(255,210,63,0.18)]" />
        <span aria-hidden className="mt-2.5 block h-2 w-[70px] rounded-[50%] bg-black/60" />
      </span>
      <Gob
        size={84}
        className="relative hidden drop-shadow-[0_18px_40px_rgba(255,210,63,0.18)] md:block"
      />
      <h1
        id="nx-caught-up"
        className="relative m-0 mt-[18px] font-nx-serif text-[50px] font-normal leading-[0.95] tracking-[-0.01em] md:mt-[22px] md:text-[76px]"
      >
        <span className="block">You’re all caught up.</span>
        <span className="block text-nx-accent">Go touch grass.</span>
      </h1>
      <p className="relative m-0 mt-3.5 max-w-[300px] text-base leading-[1.45] text-nx-ink-soft md:mt-4 md:max-w-[480px] md:text-lg">
        That’s everything your people saved since you last looked.
      </p>
      {waits && onShowWaiting && (
        <p className="relative m-0 mt-2 text-[15px] text-nx-ink-soft">
          <span>{`${waits} · `}</span>
          <button
            type="button"
            onClick={onShowWaiting}
            className="font-bold text-nx-accent underline underline-offset-2"
          >
            Show them
          </button>
        </p>
      )}
      {recap && recap.count > 0 && !tonight && (
        <button
          type="button"
          onClick={recap.onPlay}
          className="relative mt-6 flex w-full max-w-[420px] items-center gap-3.5 rounded-[20px] border border-white/[0.08] bg-nx-surface p-3.5 text-left md:hidden"
        >
          <RecapThumbs covers={recap.covers} tall />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <SaverDots savers={recap.savers.filter((s) => !s.isYou).slice(0, 3)} />
            <span className="text-[15px] font-bold leading-snug">{recapLine(recap)}</span>
          </span>
          <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-nx-ink/60" />
        </button>
      )}
      <div className="relative mt-6 grid w-full max-w-[420px] grid-cols-2 gap-3 md:flex md:w-auto md:max-w-none md:flex-wrap md:justify-center">
        <Link
          href="/channels"
          className="col-span-2 flex h-[52px] items-center justify-center whitespace-nowrap rounded-full bg-nx-accent px-7 text-base font-extrabold text-black"
        >
          Browse channels
        </Link>
        <Link
          href="/now"
          className="flex h-[52px] items-center justify-center gap-2 whitespace-nowrap rounded-full bg-nx-plate px-5 text-[15px] font-semibold text-nx-cream md:px-6 md:text-base"
        >
          <span aria-hidden className="block h-2 w-2 rounded-full bg-nx-live" />
          <span>See what’s live</span>
        </Link>
        <button
          type="button"
          onClick={onWatchAgain}
          className="flex h-[52px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-white/[0.16] px-5 text-[15px] font-semibold text-nx-cream md:px-6 md:text-base"
        >
          <RotateCcw aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.2} />
          <span>Watch it all again</span>
        </button>
      </div>
      {tonight && <TonightRow recap={recap} />}
    </section>
  )
}
