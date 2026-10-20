'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  Lock,
  Search,
  SlidersHorizontal,
  Text as TextIcon,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { networkLabel } from '@/lib/platform/networks'
import { FEED_KINDS, shortAgo, type BlendMode, type FeedKind } from '@/lib/feed/blend'
import type { FeedItem } from '@/components/feed/types'
import type { Saver } from '@/lib/people/types'
import { Gob } from '../Gob'
import { NxAvatar, NxImage } from '../primitives'
import { articleHeadline, postCoverSrc, postText, TITLED_NETWORKS } from '../post'
import { kindOf, resultKey, type SearchResultItem } from '../search/model'
import { orderedSavers, saverName } from '../savers'
import { Faces } from '../moments/LiveTogether'
import { LikeThumb, WhyIcon, WhyLead, whyKind, whyLabel, FeedSwitch } from './FeedParts'
import { Sheet, SwitchLook } from './TheaterSheets'
import type { NavId } from '../PrimaryNav'

/**
 * The theater's frame around the stage (design boards j1–j7): the up-next
 * columns, the card for what's next, the side panels for channels and
 * moments, and the phone header. Presentational only: TheaterV2 owns state.
 * Translation safety: every run of text is its own element.
 */

/** Wide screens get the columns; phones (and tablets) keep the full-bleed reel. */
export const WIDE_QUERY = '(min-width: 1024px)'

/**
 * Whether the screen is wide. Starts false so the first render matches the
 * server's; only leaf placement depends on it (the stage never moves).
 */
export function useWide(query = WIDE_QUERY): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia(query) : null
    if (!mq) return
    const update = () => setWide(!!mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [query])
  return wide
}

// ——— Words ———

/**
 * A post's title and the words after it. Titled networks (YouTube, Reddit…)
 * keep "Title\n\nDescription"; everything else is one run of words.
 */
export function postWords(post: FeedItem): { title: string; rest: string } {
  if (kindOf({ post, saved: false, matched: [] }) === 'article') {
    return { title: articleHeadline(post), rest: '' }
  }
  const text = postText(post)
  const raw = (post.text || '').trim()
  const cut = raw.indexOf('\n\n')
  if (TITLED_NETWORKS.has(post.platform ?? 'twitter') && cut > 0 && cut <= 140) {
    const [first, ...more] = text.split('\n')
    return { title: first.trim(), rest: more.join(' ').trim() }
  }
  const first = text.split('\n')[0] ?? ''
  return { title: first.trim(), rest: text.replace(/\n/g, ' ') }
}

/**
 * Who saved it, for the byline: "You saved this", "You and Ana saved this",
 * "You, Ana and Ben saved this", "You, Ana and 2 others saved this".
 */
export function bylineLine(savers: readonly Saver[], verb = true): string {
  const list = orderedSavers(savers).map(saverName)
  if (list.length === 0) return ''
  const tail = verb ? ' saved this' : ''
  if (list.length === 1) return `${list[0]}${tail}`
  if (list.length === 2) return `${list[0]} and ${list[1]}${tail}`
  if (list.length === 3) return `${list[0]}, ${list[1]} and ${list[2]}${tail}`
  return `${list[0]}, ${list[1]} and ${list.length - 2} others${tail}`
}

/** When the newest save landed ("3h"), or null. */
export function savedAgo(savers: readonly Saver[] | undefined, now = Date.now()): string | null {
  const times = (savers ?? []).map((s) => Date.parse(s.savedAt)).filter((t) => Number.isFinite(t))
  if (times.length === 0) return null
  return shortAgo(Math.max(...times), now)
}

/** "YouTube", "X photo", "X, 2 photos", "Instagram Reel", "Pinterest video". */
export function kindLine(item: SearchResultItem): string {
  const network = networkLabel(item.post.platform)
  const kind = kindOf(item)
  const photos = (item.post.media ?? []).filter((m) => m.mediaType === 'photo').length
  if (kind === 'photo') return photos > 1 ? `${network}, ${photos} photos` : `${network} photo`
  if (kind === 'article') return `${network} article`
  if (kind === 'post') return `${network} post`
  const platform: string = item.post.platform ?? 'twitter'
  if (platform === 'instagram') return 'Instagram Reel'
  if (platform === 'youtube' || platform === 'soundcloud' || platform === 'vimeo') return network
  return `${network} video`
}

/** "YouTube · jawed". */
export function sourceLine(post: FeedItem): string {
  const network = networkLabel(post.platform)
  return post.author ? `${network} · ${post.author}` : network
}

// ——— Faces ———

/** Gob-shaped faces with a "+2" when there are more than three. */
export function FaceStack({
  savers,
  size = 30,
  ring = '#000',
  max = 3,
  className,
}: {
  savers: readonly Saver[]
  size?: number
  ring?: string
  max?: number
  className?: string
}) {
  const list = orderedSavers(savers)
  if (list.length === 0) return null
  const shown = list.length > max ? list.slice(0, max - 1) : list
  const more = list.length - shown.length
  const overlap = Math.round(size / 3)
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center', className)}>
      {shown.map((s, i) => (
        <span key={s.username} className="block" style={{ marginLeft: i === 0 ? 0 : -overlap }}>
          <NxAvatar
            author={{ avatarUrl: s.avatarUrl, handle: s.username, name: saverName(s) }}
            size={size}
            style={{ boxShadow: `0 0 0 2px ${ring}` }}
          />
        </span>
      ))}
      {more > 0 && (
        <span
          className="relative flex items-center justify-center rounded-full bg-[#262320] font-extrabold text-nx-cream"
          style={{
            width: size,
            height: size,
            marginLeft: -overlap,
            fontSize: Math.round(size * 0.37),
            boxShadow: `0 0 0 2px ${ring}`,
          }}
        >
          {`+${more}`}
        </span>
      )}
    </span>
  )
}

// ——— Up next ———

export type UpNextVariant = 'feed' | 'saves' | 'channel' | 'moment'

function Thumb({ item, className }: { item: SearchResultItem; className: string }) {
  const cover = postCoverSrc(item.post)
  return (
    <span className={cn('relative block shrink-0 overflow-hidden bg-[#262320]', className)}>
      {cover ? (
        <NxImage src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 overflow-hidden bg-nx-cream p-1.5 font-nx-serif text-[11px] leading-[1.1] text-nx-ink">
          {postWords(item.post).title}
        </span>
      )}
    </span>
  )
}

/** The second line of a feed row: why it's coming up, or who saved it. */
function FeedWhy({ item, current }: { item: SearchResultItem; current: boolean }) {
  const savers = item.post.savers ?? []
  if (current && savers.length > 0) {
    return <span className="truncate text-xs text-nx-muted">{bylineLine(savers, false)}</span>
  }
  const kind = whyKind(item.post)
  const label = whyLabel(item.post)
  if (!label) return null
  // "Pete sent you this", led by Pete's face.
  if (kind === 'sent') {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-nx-muted">
        <WhyLead post={item.post} size={14} />
        <span className="truncate">{label}</span>
      </span>
    )
  }
  const ago = savedAgo(savers)
  const solo = savers.filter((s) => !s.isYou)
  // "Mum saved this · 1h", led by Mum's face.
  if ((kind === 'fresh' || kind === 'close') && solo.length > 0 && /saved this/.test(label)) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-nx-muted">
        <NxAvatar
          author={{
            avatarUrl: solo[0].avatarUrl,
            handle: solo[0].username,
            name: saverName(solo[0]),
          }}
          size={14}
        />
        <span className="truncate">{ago ? `${label} · ${ago}` : label}</span>
      </span>
    )
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-nx-muted">
      <WhyIcon kind={kind} className="h-3 w-3 shrink-0 text-nx-accent" strokeWidth={2.4} />
      <span className="truncate">{label}</span>
    </span>
  )
}

function SavesSub({ item }: { item: SearchResultItem }) {
  const ago = shortAgo(Date.parse(item.post.processedAt), Date.now())
  const mine = item.saved || !!item.post.savers?.some((s) => s.isYou)
  const lead = item.post.isPrivate
    ? 'Just for me'
    : mine
      ? 'You saved this'
      : bylineLine(item.post.savers ?? [])
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-nx-muted">
      {item.post.isPrivate && <Lock aria-hidden className="h-3 w-3 shrink-0" strokeWidth={2.4} />}
      <span className="truncate">{[lead, ago, kindLine(item)].filter(Boolean).join(' · ')}</span>
    </span>
  )
}

/**
 * Up next as a column: what's playing and what follows, each a button that
 * plays it. `feed` (New's left column), `saves` (My saves, search),
 * `channel` and `moment` (inside their side panels).
 */
export function UpNextList({
  items,
  index,
  variant,
  onPlay,
  hue = '#ffd23f',
  limit = 24,
  className,
}: {
  items: readonly SearchResultItem[]
  index: number
  variant: UpNextVariant
  onPlay: (index: number) => void
  hue?: string
  limit?: number
  className?: string
}) {
  const rows = items.map((item, i) => ({ item, i })).slice(index, index + limit)
  return (
    <ol
      className={cn(
        'm-0 flex list-none flex-col p-0',
        variant === 'feed' ? 'gap-1' : 'gap-1.5',
        className,
      )}
    >
      {rows.map(({ item, i }) => {
        const current = i === index
        const { title } = postWords(item.post)
        const label = title || `@${item.post.author}`
        const savers = item.post.savers ?? []
        return (
          <li key={resultKey(item)}>
            <button
              type="button"
              onClick={() => onPlay(i)}
              aria-current={current ? 'true' : undefined}
              aria-label={`Play ${label}`}
              className={cn(
                'flex w-full min-w-0 items-center text-left text-nx-cream transition-colors',
                variant === 'feed' && 'gap-3 rounded-2xl p-2 hover:bg-white/[0.04]',
                variant === 'saves' && 'gap-3.5 rounded-2xl p-2 hover:bg-white/[0.04]',
                (variant === 'channel' || variant === 'moment') &&
                  'gap-3 rounded-[18px] py-2 pl-2 pr-2.5 hover:bg-white/[0.04]',
                current && variant === 'saves' && 'bg-nx-surface hover:bg-nx-surface',
                current && variant !== 'saves' && 'bg-[#262320] hover:bg-[#262320]',
              )}
              style={
                current && (variant === 'channel' || variant === 'moment')
                  ? { boxShadow: `inset 3px 0 0 ${variant === 'moment' ? hue : '#ffd23f'}` }
                  : undefined
              }
            >
              <Thumb
                item={item}
                className={cn(
                  variant === 'feed' && 'h-[70px] w-[50px] rounded-[10px]',
                  variant === 'saves' && 'h-16 w-16 rounded-xl',
                  variant === 'channel' && 'h-14 w-11 rounded-xl',
                  variant === 'moment' && 'h-12 w-12 rounded-xl',
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                {current && variant !== 'moment' && (
                  <span
                    className={cn(
                      'text-nx-accent',
                      variant === 'channel'
                        ? 'text-xs font-extrabold'
                        : 'text-[11px] font-extrabold uppercase tracking-[0.06em]',
                    )}
                  >
                    Now playing
                  </span>
                )}
                <span
                  className={cn(
                    'text-sm',
                    variant === 'moment' && current ? 'font-extrabold' : 'font-semibold',
                    variant === 'channel' || variant === 'moment' ? 'truncate' : 'line-clamp-2',
                  )}
                >
                  {label}
                </span>
                {variant === 'feed' && <FeedWhy item={item} current={current} />}
                {variant === 'saves' && <SavesSub item={item} />}
                {variant === 'channel' && (
                  <span className="truncate text-xs text-nx-muted">{kindLine(item)}</span>
                )}
                {variant === 'moment' && (
                  <span className="truncate text-xs text-nx-muted">{sourceLine(item.post)}</span>
                )}
              </span>
              {variant === 'channel' && savers.length > 0 && (
                <FaceStack
                  savers={savers}
                  size={24}
                  max={2}
                  ring={current ? '#262320' : '#0f0e0c'}
                />
              )}
              {variant === 'moment' && savers.length > 0 && (
                <span className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap">
                  <FaceStack savers={savers.slice(0, 1)} size={24} max={1} ring="transparent" />
                  {item.savedAt && (
                    <span
                      className={cn('text-[11px]', current ? 'font-extrabold' : 'text-nx-muted')}
                      style={current ? { color: hue } : undefined}
                    >
                      {Date.now() - Date.parse(item.savedAt) < 120_000
                        ? 'Just now'
                        : shortAgo(Date.parse(item.savedAt), Date.now()).replace(/m$/, ' min')}
                    </span>
                  )}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** "Next, in 12 seconds": what plays after this one, under the stage (New, desktop). */
export function NextCard({
  item,
  seconds,
  onSkip,
  className,
}: {
  item: SearchResultItem
  /** Seconds left on this one, or null when it waits for you. */
  seconds: number | null
  onSkip: () => void
  className?: string
}) {
  const { title } = postWords(item.post)
  const savers = (item.post.savers ?? []).filter((s) => !s.isYou)
  const when =
    seconds === null
      ? 'Next'
      : seconds <= 1
        ? 'Next, any second now'
        : `Next, in ${Math.ceil(seconds)} seconds`
  return (
    <aside
      aria-label="Next"
      className={cn(
        'flex items-center gap-3.5 rounded-[18px] border border-white/[0.08] bg-nx-surface px-3.5 py-2.5',
        className,
      )}
    >
      <Thumb item={item} className="h-10 w-[72px] rounded-lg" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="whitespace-nowrap text-xs text-nx-muted">{when}</span>
        <span className="truncate text-sm font-semibold">
          {[title || `@${item.post.author}`, sourceLine(item.post)].join(' · ')}
        </span>
      </span>
      {savers.length > 0 && <FaceStack savers={savers} size={26} max={2} ring="#1a1814" />}
      <button
        type="button"
        onClick={onSkip}
        className="h-11 shrink-0 whitespace-nowrap rounded-full bg-[#262320] px-[18px] text-sm font-semibold text-nx-cream hover:bg-[#2f2b27]"
      >
        Skip to it
      </button>
    </aside>
  )
}

// ——— Why it's on your feed (desktop) ———

const WHY_TITLES: Record<string, string> = {
  sent: 'Sent to you',
  together: 'Saved together',
  close: 'Close to you',
  fresh: 'Fresh',
  like: 'Like what you keep',
  more: 'More of what you asked for',
  yours: 'Yours',
}

const COUNT_WORDS = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
]

/**
 * "Saved together", said in full when the panel knows who: "Ana, Ben and you
 * all kept it. Three people don't agree on anything by accident." Other
 * reasons keep the feed's own words.
 */
export function whyDetail(
  reason: { kind: string; text: string; note?: string },
  savers: readonly Saver[] | undefined,
): string {
  if (reason.kind === 'sent' && reason.note) return `${reason.text}: “${reason.note}”`
  if (reason.kind !== 'together' || !savers || savers.length < 2) return reason.text
  // Friends first, newest first; you last, in lower case mid-sentence.
  const names = [
    ...savers.filter((s) => !s.isYou).map(saverName),
    ...(savers.some((s) => s.isYou) ? ['you'] : []),
  ]
  if (names.length === 2) return `${names[0]} and ${names[1]} both kept it.`
  const list =
    names.length > 4
      ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const count = COUNT_WORDS[names.length] ?? String(names.length)
  return `${list} all kept it. ${count} people don’t agree on anything by accident.`
}

/** Every reason the feed has, as cards beside the stage (wide screens). */
export function WhyPanel({
  item,
  friends,
  onClose,
}: {
  item: SearchResultItem
  friends: ReactNode
  onClose: () => void
}) {
  const reasons = item.post.whyReasons?.length
    ? item.post.whyReasons
    : item.post.why
      ? [{ kind: 'fresh' as const, text: item.post.why }]
      : []
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  const [first, ...rest] = reasons
  return (
    <aside
      aria-label="Why it’s on your feed"
      className="flex w-[300px] shrink-0 flex-col gap-3.5 overflow-y-auto"
    >
      <div className="flex items-start gap-2">
        <h2 className="m-0 mb-1 flex-1 font-nx-serif text-[34px] font-normal leading-[0.95]">
          Why it’s on your feed
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg leading-none"
        >
          <span aria-hidden>×</span>
        </button>
      </div>
      {first && (
        <div className="flex flex-col gap-2 rounded-[20px] border border-nx-accent bg-nx-surface p-4">
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-nx-accent px-2.5 py-[5px] text-xs font-extrabold text-black">
              {WHY_TITLES[first.kind] ?? 'Why'}
            </span>
            <span className="text-xs text-nx-muted">strongest signal</span>
          </span>
          <span className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-sm leading-[1.45] text-nx-cream">
              {whyDetail(first, item.post.savers)}
            </span>
            {first.kind === 'like' && <LikeThumb post={first.post} />}
          </span>
        </div>
      )}
      {rest.map((reason) => (
        <div
          key={`${reason.kind}:${reason.text}`}
          className="flex flex-col gap-1.5 rounded-[20px] bg-nx-surface px-4 py-3.5"
        >
          <span className="text-sm font-extrabold">{WHY_TITLES[reason.kind] ?? 'Why'}</span>
          <span className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-sm leading-[1.45] text-nx-soft">
              {whyDetail(reason, item.post.savers)}
            </span>
            {reason.kind === 'like' && <LikeThumb post={reason.post} />}
          </span>
        </div>
      ))}
      {friends}
      <span className="mt-auto text-[13px] leading-normal text-nx-muted">
        No ad tech picked this. Your people did.
      </span>
    </aside>
  )
}

// ——— Phones ———

const PHONE_TABS: { id: NavId; label: string; href: string }[] = [
  { id: 'new', label: 'New', href: '/play?feed=new' },
  { id: 'channels', label: 'Channels', href: '/channels' },
  { id: 'now', label: 'Live', href: '/now' },
]

/** New · Channels · Live, with New's unseen count on its corner (phones). */
export function PhoneTabs({
  current,
  unseen,
  className,
}: {
  current: NavId | null
  /** New's "N you haven't seen"; no badge when null. */
  unseen: number | null
  className?: string
}) {
  return (
    <nav
      aria-label="Theater"
      className={cn(
        'flex shrink-0 items-center gap-0.5 rounded-full bg-[#1a1814]/80 p-1 backdrop-blur-md',
        className,
      )}
    >
      {PHONE_TABS.map((tab) => {
        const on = current === tab.id
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'relative flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[15px]',
              on ? 'bg-nx-cream font-extrabold text-black' : 'font-semibold text-white',
            )}
          >
            {tab.id === 'now' && (
              <span aria-hidden className="block h-1.5 w-1.5 rounded-full bg-[#ff5a3c]" />
            )}
            <span>{tab.label}</span>
            {tab.id === 'new' && unseen !== null && unseen > 0 && (
              <span className="absolute -right-2 -top-2 flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-black bg-nx-accent px-1 text-[11px] font-extrabold leading-none text-black">
                <span aria-hidden>{unseen > 999 ? '999+' : String(unseen)}</span>
                <span className="sr-only">{`${unseen} you haven’t seen`}</span>
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

/** Gob, linking home: the phone header's first mark. */
export function PhoneGob({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="adhx home" className={cn('gob-host flex shrink-0', className)}>
      <Gob size={34} />
    </Link>
  )
}

export function RoundIconButton({
  label,
  onClick,
  icon: Icon,
  className,
}: {
  label: string
  onClick: () => void
  icon: LucideIcon
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1a1814]/80 text-white backdrop-blur-md',
        className,
      )}
    >
      <Icon aria-hidden className="h-[19px] w-[19px]" />
    </button>
  )
}

export const PhoneSearchIcon = Search
export const PhoneFilterIcon = SlidersHorizontal

const KIND_ROWS: Record<FeedKind, { label: string; hint: string; icon: LucideIcon }> = {
  video: { label: 'Videos', hint: 'Reels, clips and tracks with sound', icon: Video },
  photo: { label: 'Photos', hint: 'Single shots, albums and memes', icon: ImageIcon },
  text: { label: 'Text posts', hint: 'Threads, tweets and hot takes', icon: TextIcon },
  article: { label: 'Articles', hint: 'Long reads, for when you’ve got time', icon: FileText },
}

/**
 * "What's in your feed" as a sheet (phones): the four kinds and whose saves.
 * Changes apply at once; the button just closes.
 */
export function FeedFilterSheet({
  types,
  onTypes,
  mode,
  onMode,
  unseen,
  waiting,
  summary,
  onClose,
}: {
  types: readonly FeedKind[]
  onTypes: (types: FeedKind[]) => void
  mode: BlendMode
  onMode: (mode: BlendMode) => void
  unseen: number | null
  waiting: string | null
  summary: string
  onClose: () => void
}) {
  return (
    <Sheet label="What’s in your feed" onClose={onClose}>
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="m-0 flex-1 font-nx-serif text-[30px] font-normal leading-none">
          What’s in your feed
        </h2>
        {unseen !== null && <span className="text-[13px] text-nx-muted">{`${unseen} new`}</span>}
      </div>
      <div
        role="group"
        aria-label="What’s in your feed"
        className="flex flex-col overflow-hidden rounded-[18px] bg-[#262320]"
      >
        {FEED_KINDS.map((kind, i) => {
          const on = types.includes(kind)
          const last = on && types.length === 1
          const row = KIND_ROWS[kind]
          const Icon = row.icon
          return (
            <button
              key={kind}
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={row.label}
              disabled={last}
              title={last ? 'Keep at least one on' : undefined}
              onClick={() =>
                onTypes(
                  on
                    ? types.filter((k) => k !== kind)
                    : FEED_KINDS.filter((k) => k === kind || types.includes(k)),
                )
              }
              className={cn(
                'flex min-h-16 items-center gap-3.5 px-4 text-left disabled:cursor-not-allowed',
                i > 0 && 'border-t border-white/[0.06]',
              )}
            >
              <Icon
                aria-hidden
                className={cn('h-5 w-5 shrink-0', on ? 'text-nx-accent' : 'text-nx-muted')}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold">{row.label}</span>
                <span className="text-[13px] text-nx-muted">{row.hint}</span>
              </span>
              <SwitchLook on={on} />
            </button>
          )
        })}
      </div>
      <span className="px-1 pt-1 text-xs font-extrabold uppercase tracking-[0.08em] text-nx-muted">
        Whose saves
      </span>
      <FeedSwitch
        mode={mode}
        onChange={onMode}
        className="w-full [&>button]:h-11 [&>button]:flex-1"
      />
      {waiting && <p className="m-0 px-1 text-[13px] text-nx-muted">{waiting}</p>}
      <button
        type="button"
        onClick={onClose}
        className="h-[52px] shrink-0 rounded-full bg-nx-accent text-[15px] font-extrabold text-black"
      >
        {`Show ${summary.toLowerCase()}`}
      </button>
    </Sheet>
  )
}

// ——— Seek ———

/**
 * The seek bar: a track, the played part and a knob, with a real range
 * input on top for pointer, touch and keys.
 */
export function SeekBar({
  value,
  onSeek,
  disabled = false,
  thin = false,
  className,
}: {
  value: number
  onSeek: (p: number) => void
  disabled?: boolean
  /** A 3px line with no knob (tall stages, phones). */
  thin?: boolean
  className?: string
}) {
  const pct = `${Math.max(0, Math.min(1, value)) * 100}%`
  return (
    <span
      className={cn('relative flex min-w-0 flex-1 items-center', thin ? 'h-3' : 'h-4', className)}
    >
      <span
        aria-hidden
        className={cn(
          'relative block w-full rounded-full bg-white/[0.22]',
          thin ? 'h-[3px]' : 'h-1',
        )}
      >
        <span
          className="absolute inset-y-0 left-0 block rounded-full bg-nx-accent"
          style={{ width: pct }}
        />
      </span>
      {!thin && (
        <span
          aria-hidden
          className="absolute top-1/2 -ml-[7px] block h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-nx-accent"
          style={{ left: pct }}
        />
      )}
      <label htmlFor="nx-seek" className="sr-only">
        Seek
      </label>
      <input
        id="nx-seek"
        type="range"
        min={0}
        max={1000}
        value={Math.round(Math.max(0, Math.min(1, value)) * 1000)}
        onChange={(e) => onSeek(Number(e.target.value) / 1000)}
        disabled={disabled}
        className="absolute inset-x-0 top-1/2 h-6 w-full -translate-y-1/2 cursor-pointer opacity-0 disabled:cursor-default"
      />
    </span>
  )
}

// ——— Channel and moment side panels ———

export function PanelDivider() {
  return <span aria-hidden className="block h-px shrink-0 bg-white/[0.08]" />
}

/** The back arrow and "Channel · name · 3 of 41" chip at a channel player's top-left. */
export function ChannelChip({
  href,
  label,
  name,
  position,
  covers,
}: {
  href: string
  label: string
  name: string
  position: string | null
  covers: readonly SearchResultItem[]
}) {
  const tiles = covers.slice(0, 4)
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Link
        href={href}
        aria-label={`Back to ${label === 'Channel' ? 'the channel' : label}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-black/50 text-white backdrop-blur-md"
      >
        <ArrowLeft aria-hidden className="h-[18px] w-[18px]" />
      </Link>
      <span className="flex h-11 min-w-0 items-center gap-2 rounded-full border border-white/[0.12] bg-black/50 pl-2 pr-4 text-sm text-white backdrop-blur-md">
        {tiles.length > 0 && (
          <span
            aria-hidden
            className="grid shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-lg"
          >
            {tiles.map((t) => {
              const cover = postCoverSrc(t.post)
              return cover ? (
                <img
                  key={resultKey(t)}
                  src={cover}
                  alt=""
                  className="block h-[13px] w-[13px] object-cover"
                />
              ) : (
                <span key={resultKey(t)} className="block h-[13px] w-[13px] bg-nx-cream" />
              )
            })}
          </span>
        )}
        <span className="shrink-0 font-extrabold">{label}</span>
        <span aria-hidden className="text-nx-soft">
          ·
        </span>
        <span className="min-w-0 truncate font-semibold">{name}</span>
        {position && (
          <>
            <span aria-hidden className="text-nx-soft">
              ·
            </span>
            <span className="shrink-0 whitespace-nowrap text-nx-soft">{position}</span>
          </>
        )}
      </span>
    </span>
  )
}

/** The keys a channel player answers to, at its bottom-left. */
export function KeyHints() {
  const keys = [
    { key: 'J', label: 'Next' },
    { key: '←', label: 'Back' },
    { key: 'Space', label: 'Pause' },
  ]
  return (
    <ul
      aria-label="Keys"
      className="m-0 flex list-none flex-col gap-2 p-0 text-[13px] text-nx-muted"
    >
      {keys.map((k) => (
        <li key={k.key} className="flex items-center gap-2">
          <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-[7px] bg-white/10 px-1.5 font-nx-sans text-[13px] font-extrabold text-nx-cream">
            {k.key}
          </kbd>
          <span>{k.label}</span>
        </li>
      ))}
    </ul>
  )
}

/** Union of who saved the posts in a queue, most saves first. */
export function queueSavers(items: readonly SearchResultItem[], max = 3): Saver[] {
  const count = new Map<string, { saver: Saver; n: number }>()
  for (const item of items) {
    for (const s of item.post.savers ?? []) {
      const at = count.get(s.username)
      if (at) at.n++
      else count.set(s.username, { saver: s, n: 1 })
    }
  }
  return [...count.values()]
    .sort((a, b) => b.n - a.n || (a.saver.isYou ? 1 : 0) - (b.saver.isYou ? 1 : 0))
    .slice(0, max)
    .map((v) => v.saver)
}

/** "4 saves in 12 min", from when the queue's saves landed. */
export function momentPace(items: readonly SearchResultItem[]): string {
  const times = items
    .map((i) => (i.savedAt ? Date.parse(i.savedAt) : NaN))
    .filter((t) => Number.isFinite(t))
  const n = items.length
  const saves = n === 1 ? '1 save' : `${n} saves`
  if (times.length < 2) return saves
  const span = (Math.max(...times) - Math.min(...times)) / 60_000
  if (span < 1) return `${saves} in a minute`
  if (span < 60) return `${saves} in ${Math.round(span)} min`
  if (span < 24 * 60) return `${saves} in ${Math.round(span / 60)}h`
  return `${saves} this week`
}

/** Quick words for "Say something". */
export const QUICK_WORDS = ['ha', 'again', 'who sent this', 'more of this', 'no'] as const

export function QuickWords({
  onSay,
  disabled,
  said,
}: {
  onSay: (text: string) => void
  disabled: boolean
  said: string | null
}) {
  return (
    <div role="group" aria-label="Quick words" className="flex flex-wrap gap-2">
      {QUICK_WORDS.map((w) => (
        <button
          key={w}
          type="button"
          disabled={disabled}
          aria-pressed={said === w}
          onClick={() => onSay(w)}
          className={cn(
            'h-11 rounded-full border px-[18px] text-[15px] font-extrabold text-nx-cream disabled:opacity-60',
            said === w
              ? 'border-[#6b8cff] bg-[#6b8cff]/[0.16]'
              : 'border-white/[0.18] bg-nx-surface hover:bg-[#262320]',
          )}
        >
          {w}
        </button>
      ))}
    </div>
  )
}

/** Reactions on a wide screen: a short stack of pills at the player's bottom-left, newest last. */
export function ReactionStack({
  reactions,
  className,
}: {
  reactions: readonly { id: string; saver: Saver; emoji?: string; text?: string }[]
  className?: string
}) {
  const shown = reactions.slice(-4)
  return (
    <ul
      aria-label="Reactions from people watching"
      aria-live="polite"
      className={cn(
        'pointer-events-none m-0 flex list-none flex-col items-start gap-2 p-0',
        className,
      )}
    >
      {shown.map((r, i) => {
        const name = saverName(r.saver)
        const age = shown.length - 1 - i
        return (
          <li
            key={r.id}
            className="flex h-10 items-center gap-[9px] rounded-full border border-white/[0.12] bg-black/55 pl-[5px] pr-3.5 text-[15px] font-extrabold text-white backdrop-blur-md"
            style={{ opacity: age === 0 ? 1 : age === 1 ? 0.8 : 0.55 }}
          >
            <NxAvatar
              author={{ avatarUrl: r.saver.avatarUrl, handle: r.saver.username, name }}
              size={30}
            />
            <span className="sr-only">{`${name}:`}</span>
            <span className={r.emoji ? 'text-[20px] leading-none' : undefined}>
              {r.emoji ?? r.text}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** "Ana and Ben are watching with you", as the card in a moment's top-left. */
export function WatchersCard({ watchers }: { watchers: readonly Saver[] }) {
  if (watchers.length === 0) return null
  const others = watchers.filter((w) => !w.isYou)
  const names = others.map(saverName)
  const line =
    names.length <= 1
      ? (names[0] ?? '')
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names[0]}, ${names[1]} and ${names.length - 2} others`
  return (
    <div
      role="status"
      className="mt-1.5 flex w-[220px] flex-col gap-2.5 rounded-[20px] border border-white/[0.12] bg-black/50 p-3.5 backdrop-blur-md"
    >
      <Faces people={others} size={38} live ring="#111" max={4} />
      <span className="text-sm leading-[1.35] text-white">
        <span className="font-extrabold">{line}</span>
        <span>{others.length === 1 ? ' is watching with you' : ' are watching with you'}</span>
      </span>
    </div>
  )
}

/** Gob for the caught-up hero (BRAND.md proportions), floating. */
export function CaughtUpGob() {
  return <Gob size={84} className="drop-shadow-[0_18px_40px_rgba(255,210,63,0.18)]" />
}
