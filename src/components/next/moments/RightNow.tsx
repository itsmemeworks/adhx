'use client'

import Link from 'next/link'
import { useState } from 'react'
import { BellRing, Play } from 'lucide-react'
import type { Saver } from '@/lib/people/types'
import { networkLabel } from '@/lib/platform/networks'
import type { FeedItem } from '@/components/feed/types'
import { cn } from '@/lib/utils'
import { NxImage } from '../primitives'
import { nextPostKind, postAuthor, postCoverSrc, postText } from '../post'
import { momentPlayHref } from '../theater/queue'
import {
  plural,
  timeAgo,
  useMoments,
  type Flash,
  type FormingView,
  type MomentView,
  type StreamItem,
} from './live'
import { Faces } from './LiveTogether'
import { namesOf, personColour, recentLine, savingLine, tuneInLabel, watchingLine } from './people'
import { saverName } from '../savers'

/**
 * "Right now": what people are saving, sorted into moments as it happens.
 * The liveliest moment leads, big; the rest stack beside it. Saves slide into the "Just saved" strip tagged with where they
 * went; a card glows in its colour when one lands in it; groups still
 * forming fill up and pop into new moments. Anonymous to strangers; signed-in
 * members also see who is saving each moment and who is watching it.
 */

const KIND_WORD: Record<string, string> = {
  video: 'a video',
  gif: 'a GIF',
  photo: 'a picture',
  post: 'a post',
  article: 'an article',
}

function asFeed(post: unknown): FeedItem {
  return post as FeedItem
}

/** A few words about a post for the strip: its text, else what it is. */
function shortWhat(post: FeedItem): string {
  const text = postText(post)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text) return text.length > 42 ? `${text.slice(0, 40).trimEnd()}…` : text
  return KIND_WORD[nextPostKind(post)] ?? 'a post'
}

function Cover({ post, className, tiny }: { post: FeedItem; className?: string; tiny?: boolean }) {
  const src = postCoverSrc(post)
  if (src)
    return (
      <NxImage
        src={src}
        alt=""
        className={cn('absolute inset-0 h-full w-full object-cover', className)}
      />
    )
  // Too small for words: a cream square with the post's first letter.
  if (tiny) {
    return (
      <span
        aria-hidden
        className={cn(
          'absolute inset-0 flex items-center justify-center bg-nx-cream font-nx-serif text-[15px] text-nx-ink',
          className,
        )}
      >
        {shortWhat(post).charAt(0).toUpperCase()}
      </span>
    )
  }
  // Words on cream, from the top, like a post card: who, then what they said.
  const author = postAuthor(post)
  const text = postText(post)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return (
    <span
      className={cn(
        'absolute inset-0 flex flex-col gap-1.5 overflow-hidden bg-nx-cream p-3 text-nx-ink',
        className,
      )}
    >
      <span className="truncate font-nx-sans text-[11px] font-bold">
        {author.handle || author.name}
      </span>
      <span className="line-clamp-[8] font-nx-serif text-[15px] leading-[1.15] md:text-[17px]">
        {text || shortWhat(post)}
      </span>
    </span>
  )
}

function StreamChip({ item, fresh }: { item: StreamItem; fresh: boolean }) {
  const post = asFeed(item.post)
  const hue = item.to?.hue ?? '#a89f8d'
  return (
    <li
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3',
        fresh ? 'animate-nx-slide-in bg-[#1f1d1a]' : 'bg-[#1a1814]',
      )}
      style={fresh ? { boxShadow: `0 0 0 1.5px ${hue}` } : undefined}
    >
      <span className="relative block h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-[#2a2620]">
        <Cover post={post} tiny />
      </span>
      <span
        className={cn('whitespace-nowrap text-[13px]', fresh ? 'font-semibold' : 'text-nx-soft')}
      >
        {shortWhat(post)}
      </span>
      {item.to && (
        <span className="whitespace-nowrap text-xs font-extrabold" style={{ color: hue }}>
          {`→ ${item.to.kind === 'forming' ? `forming: ${item.to.title.toLowerCase()}` : item.to.title}`}
        </span>
      )}
    </li>
  )
}

const KIND_NOUN: Record<string, string> = {
  video: 'video',
  gif: 'GIF',
  photo: 'photo',
  post: 'post',
  article: 'article',
}

/** "Reddit video", "X post". */
function whatItIs(post: FeedItem): string {
  return `${networkLabel(post.platform)} ${KIND_NOUN[nextPostKind(post)] ?? 'post'}`
}

/** Covers with a picture first; words-only posts fill in after. */
function pictureFirst(covers: unknown[], n: number): FeedItem[] {
  const all = covers.map(asFeed)
  return [...all.filter((p) => postCoverSrc(p)), ...all.filter((p) => !postCoverSrc(p))].slice(0, n)
}

/** Everyone tuned in to any moment, once each (members only). */
function peopleOn(moments: MomentView[]): Saver[] {
  const seen = new Map<string, Saver>()
  for (const m of moments) for (const w of m.watchers ?? []) seen.set(w.username, w)
  return [...seen.values()]
}

/** The page title for members: "What your lot are into tonight". */
function intoTitle(label: string): string {
  if (label === 'Right now') {
    const h = new Date().getHours()
    return `What your lot are into ${h >= 17 || h < 5 ? 'tonight' : 'today'}`
  }
  return label === 'This week'
    ? 'What your lot are into this week'
    : 'What your lot are into lately'
}

/** A card's glow when a save lands in it, or when it has just formed. */
function Glow({ flash, hue, radius }: { flash: Flash | undefined; hue: string; radius: string }) {
  if (!flash) return null
  return (
    <span
      key={flash.item.id}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 animate-nx-glow', radius)}
      style={{ boxShadow: `0 0 0 2px ${hue}, 0 0 34px ${hue}66` }}
    />
  )
}

/** Cards beside the lead moment on wide screens; the rest wrap below. */
const SIDE_CARDS = 2

function LeadMoment({
  moment,
  flash,
  popped,
  Title,
}: {
  moment: MomentView
  flash: Flash | undefined
  popped: boolean
  Title: 'h2' | 'h3'
}) {
  const covers = pictureFirst(moment.covers, 4)
  const arriving = flash ? asFeed(flash.item.post) : null
  const savers = moment.savers ?? []
  const watchers = moment.watchers ?? []
  // Members: "3 saves in 10 min" instead of the totals.
  const recent = recentLine(moment)
  // Who saved what, newest first (members only: covers carry savers then).
  const rows = moment.covers
    .map(asFeed)
    .map((post) => ({ post, saver: post.savers?.[0] }))
    .filter((r): r is { post: FeedItem; saver: Saver } => !!r.saver)
    .slice(0, 3)
  return (
    <article
      className={cn(
        'relative flex min-w-0 flex-col gap-3 rounded-[28px] border-2 bg-nx-surface p-3 lg:min-h-[460px] lg:flex-row lg:gap-[26px]',
        popped && 'animate-nx-pop-in',
      )}
      style={{
        borderColor: moment.hue,
        boxShadow: popped
          ? `0 0 0 2px ${moment.hue}, 0 0 40px ${moment.hue}55`
          : `0 0 0 6px ${moment.hue}14`,
      }}
    >
      <Glow flash={flash} hue={moment.hue} radius="rounded-[28px]" />
      <Link
        href={`/moments/${moment.slug}`}
        aria-label={`Open ${moment.title}`}
        // 28 px card, 2 px border, 12 px padding: the covers curve at 14 px.
        className="relative grid h-[180px] shrink-0 grid-cols-3 gap-[3px] overflow-hidden rounded-[14px] lg:h-auto lg:w-[340px] lg:grid-cols-2 lg:grid-rows-2"
      >
        {covers.map((post, i) => (
          <span
            key={`${post.platform}:${post.id}`}
            className={cn(
              'relative block overflow-hidden bg-[#2a2620]',
              i === 3 && 'hidden lg:block',
            )}
          >
            <Cover post={post} />
          </span>
        ))}
        {arriving && (
          <span
            key={flash!.item.id}
            className="absolute inset-y-0 left-0 block w-1/3 overflow-hidden animate-nx-drop-in lg:inset-y-auto lg:top-0 lg:h-1/2 lg:w-1/2"
            style={{ boxShadow: `inset 0 0 0 3px ${moment.hue}` }}
          >
            <Cover post={arriving} />
            <span
              className="absolute left-2.5 top-2.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-extrabold text-black"
              style={{ background: moment.hue }}
            >
              Just saved
            </span>
          </span>
        )}
        {/* Phones: live and who's watching sit on the pictures, as on the phone app. */}
        <span className="absolute left-2.5 top-2.5 flex h-[30px] items-center gap-2 whitespace-nowrap rounded-full bg-black/55 px-3 text-xs font-extrabold tracking-[0.06em] text-white backdrop-blur-md lg:hidden">
          <span
            aria-hidden
            className="block h-2 w-2 rounded-full bg-[#ff5a3c] shadow-[0_0_0_3px_rgba(255,90,60,0.3)]"
          />
          <span>{moment.rising ? 'RISING' : 'LIVE'}</span>
        </span>
        {watchers.length > 0 ? (
          <span className="absolute bottom-2.5 right-2.5 flex h-[34px] items-center gap-2 whitespace-nowrap rounded-full bg-black/55 pl-1 pr-3 text-xs font-extrabold text-white backdrop-blur-md lg:hidden">
            <Faces people={watchers} size={24} live ring="#000" />
            <span>{`${watchers.length} watching`}</span>
          </span>
        ) : null}
        <span
          className={cn(
            'absolute bottom-2.5 right-2.5 h-[30px] items-center whitespace-nowrap rounded-full bg-black/55 px-3 text-xs font-extrabold text-white backdrop-blur-md',
            watchers.length > 0 ? 'hidden lg:flex' : 'flex',
          )}
        >
          {`${moment.posts.toLocaleString('en-GB')} in this moment`}
        </span>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-3.5 px-1 pb-1 lg:px-0 lg:py-3 lg:pr-3.5">
        <p className="relative m-0 hidden h-8 items-center gap-2 self-start whitespace-nowrap rounded-full border border-[#ff5a3c]/40 bg-[#ff5a3c]/[0.14] pl-3 pr-3.5 text-[13px] lg:flex">
          <span
            aria-hidden
            className="block h-[9px] w-[9px] shrink-0 rounded-full bg-[#ff5a3c] shadow-[0_0_0_4px_rgba(255,90,60,0.25),0_0_0_8px_rgba(255,90,60,0.1)]"
          />
          <span className="font-extrabold tracking-[0.06em]">
            {moment.rising ? 'RISING' : 'LIVE'}
          </span>
          <span aria-hidden className="text-nx-soft">
            ·
          </span>
          {recent ? (
            <span className="tabular-nums">{recent}</span>
          ) : (
            <>
              <span className="tabular-nums">{plural(moment.people, 'person', 'people')}</span>
              <span className="text-nx-soft">{`· ${plural(moment.posts, 'save')}`}</span>
            </>
          )}
          {flash && (
            <span
              key={flash.item.id}
              aria-hidden
              className="absolute -top-4 right-2 text-[13px] font-extrabold animate-nx-float-up"
              style={{ color: moment.hue }}
            >
              +1
            </span>
          )}
        </p>
        <Link href={`/moments/${moment.slug}`} className="min-w-0">
          <Title className="m-0 truncate font-nx-serif text-[36px] font-normal leading-[0.95] lg:text-[58px]">
            {moment.title}
          </Title>
        </Link>
        {/* Phones: one short line instead of the LIVE pill and the faces. */}
        <p className="-mt-1.5 m-0 truncate text-[13px] text-nx-soft lg:hidden">
          {`${recent ?? `${plural(moment.people, 'person', 'people')} · ${plural(moment.posts, 'save')}`}${savers.length ? ` · ${namesOf(savers.map(saverName), moment.people)}` : ''}`}
        </p>
        {savers.length > 0 && (
          // Members only: the server sends `savers` to signed-in members alone.
          <p className="m-0 hidden min-w-0 items-center gap-3 text-base text-nx-soft lg:flex">
            <Faces people={savers} size={32} />
            <span className="truncate">{savingLine(savers, moment.people)}</span>
          </p>
        )}
        {rows.length > 0 && (
          <ul className="m-0 mt-1 hidden list-none flex-col gap-2 p-0 lg:flex">
            {rows.map(({ post, saver }) => (
              <li
                key={`${post.platform}:${post.id}`}
                className="flex min-w-0 items-center gap-3 text-sm"
              >
                <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-[10px] bg-[#2a2620]">
                  <Cover post={post} tiny />
                </span>
                <span
                  aria-hidden
                  className="block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: personColour(saver.username) }}
                />
                <span className="shrink-0 font-semibold">{saverName(saver)}</span>
                <span className="min-w-0 truncate text-nx-muted">{whatItIs(post)}</span>
                <span className="flex-1" />
                <span className="shrink-0 whitespace-nowrap text-nx-muted">
                  {timeAgo(saver.savedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <span className="hidden flex-1 lg:block" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <Link
            href={momentPlayHref(moment.slug)}
            // 28 − 16 − 2 = 10 px on phones; 12 px more inset from lg leaves the 8 px floor.
            className="flex h-[52px] w-full max-w-full items-center justify-center gap-2.5 rounded-[10px] bg-nx-accent px-7 text-base font-extrabold text-black lg:w-auto lg:rounded-[8px]"
          >
            <Play aria-hidden className="h-4 w-4 shrink-0" fill="currentColor" strokeWidth={0} />
            <span className="truncate">{tuneInLabel(watchers)}</span>
          </Link>
          {watchers.length > 0 ? (
            <span className="hidden min-w-0 items-center gap-2.5 text-sm text-nx-soft lg:flex">
              <Faces people={watchers} size={28} live />
              <span className="truncate">{watchingLine(watchers)}</span>
            </span>
          ) : (
            moment.watching > 0 && (
              <span className="whitespace-nowrap text-sm text-nx-soft">{`${moment.watching} watching`}</span>
            )
          )}
        </div>
      </div>
    </article>
  )
}

/** A smaller card beside the lead: a thumbnail, what it is, and Tune in. */
function SideCard({
  hue,
  cover,
  flash,
  popped,
  dashed,
  children,
  action,
}: {
  hue: string
  cover: FeedItem | undefined
  flash: Flash | undefined
  popped?: boolean
  dashed?: boolean
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <article
      className={cn(
        'relative flex min-h-[108px] min-w-0 items-center gap-4 rounded-[24px] bg-nx-surface p-3 lg:min-h-[200px] lg:flex-1 lg:items-stretch',
        dashed ? 'border-[1.5px] border-dashed border-white/[0.18]' : 'border border-white/[0.08]',
        popped && 'animate-nx-pop-in',
      )}
      style={popped ? { boxShadow: `0 0 0 2px ${hue}, 0 0 40px ${hue}55` } : undefined}
    >
      <Glow flash={flash} hue={hue} radius="rounded-[24px]" />
      <span
        className={cn(
          // 24 px card, 12 px padding, 1 px border: 11 px.
          'relative block h-[84px] w-[84px] shrink-0 overflow-hidden rounded-[11px] bg-[#2a2620] lg:h-auto lg:w-[140px]',
          dashed && 'saturate-[0.75]',
        )}
      >
        {cover && <Cover post={cover} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 lg:py-1.5 lg:pr-1">{children}</div>
      {action}
    </article>
  )
}

function OtherMoment({
  moment,
  flash,
  popped,
  Title,
}: {
  moment: MomentView
  flash: Flash | undefined
  popped: boolean
  Title: 'h2' | 'h3'
}) {
  const savers = moment.savers ?? []
  const watchers = moment.watchers ?? []
  const href = momentPlayHref(moment.slug)
  const label = tuneInLabel(watchers)
  return (
    <SideCard
      hue={moment.hue}
      cover={pictureFirst(moment.covers, 1)[0]}
      flash={flash}
      popped={popped}
      action={
        <Link
          href={href}
          aria-label={label}
          className="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full bg-[#2a2620] text-nx-cream lg:hidden"
        >
          <Play aria-hidden className="ml-0.5 h-4 w-4" fill="currentColor" strokeWidth={0} />
        </Link>
      }
    >
      <span className="flex items-center gap-2 whitespace-nowrap text-xs font-extrabold uppercase tracking-[0.08em] text-nx-muted">
        <span
          aria-hidden
          className="block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: moment.hue }}
        />
        <span>{`${moment.watching > 0 ? `${moment.watching} watching` : moment.rising ? 'Rising' : 'Live'} · ${timeAgo(moment.lastAt)}`}</span>
      </span>
      <Link href={`/moments/${moment.slug}`} className="min-w-0">
        <Title className="m-0 truncate text-[17px] font-extrabold leading-tight lg:font-nx-serif lg:text-[34px] lg:font-normal lg:leading-[0.95]">
          {moment.title}
        </Title>
      </Link>
      <p className="relative m-0 flex min-w-0 items-center gap-2 text-sm text-nx-soft">
        {savers.length > 0 && <Faces people={savers} size={24} />}
        <span className="truncate">
          {savers.length > 0
            ? `${namesOf(savers.map(saverName), moment.people)} · ${plural(moment.posts, 'save')}`
            : `${plural(moment.people, 'person', 'people')} · ${plural(moment.posts, 'save')}`}
        </span>
        {flash && (
          <span
            key={flash.item.id}
            aria-hidden
            className="absolute -top-3 left-0 text-[13px] font-extrabold animate-nx-float-up"
            style={{ color: moment.hue }}
          >
            +1
          </span>
        )}
      </p>
      <span className="hidden flex-1 lg:block" />
      <Link
        href={href}
        // At the card's bottom, 18 px in: 24 − 18 − 1 leaves the 8 px floor.
        className="hidden h-11 max-w-full items-center gap-2 self-start whitespace-nowrap rounded-[8px] border border-white/[0.22] px-[18px] text-sm font-extrabold lg:flex"
      >
        <Play aria-hidden className="h-3.5 w-3.5 shrink-0" fill="currentColor" strokeWidth={0} />
        <span className="truncate">{label}</span>
      </Link>
    </SideCard>
  )
}

/** Faces on a forming card: the people saving it (members only). */
function formingFaces(forming: FormingView): Saver[] {
  return (forming.people ?? []).map((p) => ({ ...p, savedAt: '', isYou: false }))
}

/**
 * Ask the browser to show a notification when it goes live, inside the bell's
 * click (the only time a browser lets a page ask). Fine to say no: the toast
 * still shows on any page.
 */
function askToNotify(): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => {})
    }
  } catch {
    // Some browsers throw outside a secure context.
  }
}

/** "Tell me when it's live": the bell on a forming group (members only). */
export function FormingBell({ forming }: { forming: FormingView }) {
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [gone, setGone] = useState(false)
  if (forming.alert === undefined) return null
  const lit = on ?? forming.alert
  const toggle = async () => {
    if (busy) return
    const next = !lit
    if (next) askToNotify()
    setBusy(true)
    setOn(next)
    try {
      const res = await fetch(`/api/moments/forming/${encodeURIComponent(forming.id)}/alert`, {
        method: next ? 'PUT' : 'DELETE',
      })
      if (res.status === 404) {
        setGone(true)
        setOn(false)
      } else if (!res.ok) {
        setOn(!next)
      }
    } catch {
      setOn(!next)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      aria-pressed={lit}
      disabled={busy || gone}
      onClick={() => void toggle()}
      className={cn(
        // In a forming card: 24 − 12 − 1 = 11 px on phones, the 8 px floor from lg.
        'flex h-11 max-w-full items-center gap-2 self-start whitespace-nowrap rounded-[11px] px-[18px] text-sm font-extrabold disabled:opacity-60 lg:rounded-[8px]',
        lit ? 'bg-nx-accent text-black' : 'border border-white/[0.22] text-nx-cream',
      )}
    >
      {lit && <BellRing aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.4} />}
      <span className="truncate">
        {gone ? 'It’s not forming any more' : lit ? 'We’ll tell you' : 'Tell me when it’s live'}
      </span>
    </button>
  )
}

function FormingCard({
  forming,
  flash,
  Title,
}: {
  forming: FormingView
  flash: Flash | undefined
  Title: 'h2' | 'h3'
}) {
  const left = Math.max(0, forming.need - forming.have)
  const unit =
    forming.unit === 'people' ? (left === 1 ? 'person' : 'people') : left === 1 ? 'save' : 'saves'
  const faces = formingFaces(forming)
  return (
    <SideCard hue={forming.hue} cover={pictureFirst(forming.covers, 1)[0]} flash={flash} dashed>
      <span className="flex h-[26px] items-center self-start whitespace-nowrap rounded-full border border-dashed border-nx-accent/60 px-2.5 text-xs font-extrabold text-nx-accent">
        Forming
      </span>
      <Title className="m-0 truncate text-[17px] font-extrabold leading-tight lg:font-nx-serif lg:text-[34px] lg:font-normal lg:leading-[0.95]">
        {forming.title}
      </Title>
      <span className="flex min-w-0 items-center gap-2 text-sm text-nx-soft">
        {faces.length > 0 && <Faces people={faces} size={24} max={4} />}
        <span className="truncate">{`${left} more ${unit} to go live`}</span>
      </span>
      <span
        role="img"
        aria-label={`${forming.have} of ${forming.need} ${forming.unit}`}
        className="flex w-[150px] gap-[5px]"
      >
        {Array.from({ length: forming.need }, (_, i) => (
          <span
            key={i}
            className="block h-[5px] flex-1 rounded-[5px]"
            style={{ background: i < forming.have ? '#ffd23f' : 'rgba(255,255,255,0.14)' }}
          />
        ))}
      </span>
      {forming.alert !== undefined && (
        <>
          <span className="hidden flex-1 lg:block" />
          <FormingBell forming={forming} />
        </>
      )}
    </SideCard>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-nx-serif text-[32px] leading-none tabular-nums md:text-[38px]">
        {value}
      </span>
      <span className="text-xs text-nx-muted">{label}</span>
    </div>
  )
}

export function RightNow({
  headingLevel = 'h2',
}: {
  /** h1 where Right now is the page itself (/now, members); h2 under another page's title. */
  headingLevel?: 'h1' | 'h2'
} = {}) {
  const Heading = headingLevel
  const Title = headingLevel === 'h1' ? 'h2' : 'h3'
  const page = headingLevel === 'h1'
  const { snapshot, flashes, popped } = useMoments()

  if (!snapshot) {
    return (
      <section aria-label="Right now" className="flex flex-col gap-5">
        <span
          aria-hidden
          className="nx-shimmer animate-nx-shimmer block h-[60px] w-[min(620px,100%)] rounded-xl"
        />
        <span
          aria-hidden
          className="nx-shimmer animate-nx-shimmer block h-[460px] w-full rounded-[28px]"
        />
      </section>
    )
  }

  const { moments, forming, stream, stats, label } = snapshot
  const freshId = stream[0]?.id
  const quiet = moments.length === 0 && forming.length === 0
  const [lead, ...others] = moments
  const on = peopleOn(moments)
  const side = others.length + forming.length > 0
  // Beside the lead go as many cards as fit its height (two, as on the
  // boards); the rest wrap underneath instead of stretching the lead card.
  const cards = [
    ...others.map((m) => ({ key: m.slug, moment: m, forming: null })),
    ...forming.map((f) => ({ key: f.id, moment: null, forming: f })),
  ]
  const beside = lead ? cards.slice(0, SIDE_CARDS) : cards
  const below = lead ? cards.slice(SIDE_CARDS) : []
  const card = (c: (typeof cards)[number]) =>
    c.moment ? (
      <OtherMoment
        key={c.key}
        moment={c.moment}
        flash={flashes.get(c.moment.slug)}
        popped={popped.has(c.moment.slug)}
        Title={Title}
      />
    ) : (
      <FormingCard key={c.key} forming={c.forming!} flash={flashes.get(c.key)} Title={Title} />
    )

  return (
    <section aria-labelledby="nx-rightnow" className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex min-w-[260px] flex-1 flex-col gap-2.5">
          <Heading
            id="nx-rightnow"
            className="m-0 font-nx-serif text-[34px] font-normal leading-[0.95] md:text-[60px]"
          >
            {page ? intoTitle(label) : label}
          </Heading>
          <p className={cn('m-0 text-[15px] text-nx-soft md:text-base', page && 'hidden md:block')}>
            {page
              ? 'When a few of you save the same kind of thing at once, it goes live. Tune in and watch it together.'
              : 'What people are saving, sorted into moments as it happens. Tune in to one and new saves play the moment they arrive.'}
          </p>
        </div>
        {page ? (
          on.length > 0 && (
            <p className="m-0 hidden items-center gap-2.5 pb-0.5 text-sm text-nx-soft md:flex">
              <Faces people={on} size={30} ring="#0f0e0c" />
              <span className="whitespace-nowrap">
                {on.length === 1
                  ? `${saverName(on[0])} is on`
                  : `${on.length} of your people are on`}
              </span>
            </p>
          )
        ) : (
          <div className="flex gap-7">
            <Stat
              value={stats.today.toLocaleString('en-GB')}
              label={stats.today === 1 ? 'save today' : 'saves today'}
            />
            <Stat value={stats.lastHour.toLocaleString('en-GB')} label="in the last hour" />
            <Stat
              value={String(moments.length)}
              label={moments.length === 1 ? 'moment' : 'moments'}
            />
          </div>
        )}
      </div>

      {quiet ? (
        <div className="flex flex-col items-center gap-4 rounded-[24px] bg-nx-surface px-5 py-8 text-center">
          <p className="m-0 text-nx-soft">
            Nothing’s trending yet. When a few people save the same kind of thing, it shows up here.
          </p>
          <span className="flex flex-wrap justify-center gap-2">
            <Link
              href="/channels"
              className="flex h-11 items-center rounded-full bg-nx-accent px-5 text-sm font-extrabold text-black"
            >
              Browse channels
            </Link>
            <Link
              href="/play?recent=1"
              className="flex h-11 items-center rounded-full border border-white/30 px-5 text-sm font-bold text-white"
            >
              Play my saves
            </Link>
          </span>
        </div>
      ) : (
        <div
          className={cn(
            'grid grid-cols-1 gap-3 lg:gap-5',
            side && lead && 'lg:grid-cols-[minmax(0,1fr)_420px]',
          )}
        >
          {lead && (
            <LeadMoment
              moment={lead}
              flash={flashes.get(lead.slug)}
              popped={popped.has(lead.slug)}
              Title={Title}
            />
          )}
          {side && (
            <div className="flex min-w-0 flex-col gap-3 lg:gap-5">
              {beside.map(card)}
              {/* One card alone keeps the size it has beside a second, not the lead's full height. */}
              {beside.length === 1 && <span aria-hidden className="hidden lg:block lg:flex-1" />}
            </div>
          )}
          {below.length > 0 && (
            <div className="grid min-w-0 grid-cols-1 gap-3 lg:col-span-2 lg:grid-cols-3 lg:gap-5">
              {below.map(card)}
            </div>
          )}
        </div>
      )}

      {stream.length > 0 && (
        <div className="flex items-center gap-3 overflow-hidden rounded-[18px] bg-[#12110f] px-3 py-2.5">
          <span className="shrink-0 text-[11px] font-extrabold tracking-[.14em] text-nx-muted">
            JUST SAVED
          </span>
          <ul aria-live="polite" className="m-0 flex min-w-0 list-none gap-2 overflow-hidden p-0">
            {stream.map((item) => (
              <StreamChip
                key={item.id}
                item={item}
                fresh={item.id === freshId && Date.now() - Date.parse(item.at) < 60_000}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
