'use client'

import Link from 'next/link'
import { Radio } from 'lucide-react'
import type { FeedItem } from '@/components/feed/types'
import { cn } from '@/lib/utils'
import { NxImage } from '../primitives'
import { nextPostKind, postCoverSrc, postText } from '../post'
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

/**
 * "Right now" on Channels: what people are saving, sorted into moments as
 * it happens. Saves slide into the "Just saved" strip tagged with where they
 * went; a card glows in its colour when one lands in it; groups still
 * forming fill up and pop into new moments. All anonymous.
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
    return <NxImage src={src} alt="" className={cn('h-full w-full object-cover', className)} />
  // Too small for words: a cream square with the post's first letter.
  if (tiny) {
    return (
      <span
        aria-hidden
        className={cn(
          'flex h-full w-full items-center justify-center bg-nx-cream font-nx-serif text-[15px] text-nx-ink',
          className,
        )}
      >
        {shortWhat(post).charAt(0).toUpperCase()}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'flex h-full w-full items-end overflow-hidden bg-nx-cream p-2 font-nx-serif text-[13px] leading-tight text-nx-ink',
        className,
      )}
    >
      {shortWhat(post)}
    </span>
  )
}

function LiveDot({ hue, className }: { hue?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('block h-2.5 w-2.5 shrink-0 rounded-full animate-nx-live-pulse', className)}
      style={{ background: hue ?? '#ffd23f' }}
    />
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

function MomentCard({
  moment,
  lead,
  flash,
  popped,
}: {
  moment: MomentView
  lead: boolean
  flash: Flash | undefined
  popped: boolean
}) {
  // Posts with a picture make the mosaic; words-only posts fill in after.
  const all = moment.covers.map(asFeed)
  const covers = [
    ...all.filter((p) => postCoverSrc(p)),
    ...all.filter((p) => !postCoverSrc(p)),
  ].slice(0, lead ? 4 : 3)
  const arriving = flash ? asFeed(flash.item.post) : null
  return (
    <article
      className={cn(
        'relative flex min-w-0 flex-col gap-3 rounded-[24px] bg-nx-surface p-3',
        lead && 'sm:col-span-2 xl:col-span-3',
        popped && 'animate-nx-pop-in',
      )}
      style={
        popped ? { boxShadow: `0 0 0 2px ${moment.hue}, 0 0 40px ${moment.hue}55` } : undefined
      }
    >
      {flash && (
        <span
          key={flash.item.id}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[24px] animate-nx-glow"
          style={{ boxShadow: `0 0 0 2px ${moment.hue}, 0 0 34px ${moment.hue}66` }}
        />
      )}
      <Link
        href={`/moments/${moment.slug}`}
        aria-label={`Open ${moment.title}`}
        className={cn(
          'relative grid gap-1.5 overflow-hidden rounded-2xl',
          lead
            ? 'h-[260px] grid-cols-[2fr_1fr] md:h-[300px] md:grid-cols-[2fr_1fr_1fr_1fr]'
            : 'h-[160px] grid-cols-3',
        )}
      >
        {covers.map((post, i) => (
          <span
            key={`${post.platform}:${post.id}`}
            className={cn(
              'relative block overflow-hidden bg-[#2a2620]',
              lead && i >= 2 && 'hidden md:block',
            )}
          >
            <Cover post={post} />
          </span>
        ))}
        {arriving && (
          <span
            key={flash!.item.id}
            className={cn(
              'absolute inset-y-0 left-0 block overflow-hidden animate-nx-drop-in',
              lead ? 'w-2/3 md:w-[40%]' : 'w-1/3',
            )}
            style={{ boxShadow: `inset 0 0 0 3px ${moment.hue}` }}
          >
            <Cover post={arriving} />
            <span
              className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold text-black"
              style={{ background: moment.hue }}
            >
              Just saved
            </span>
          </span>
        )}
        <span className="nx-plate absolute right-2.5 top-2.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold">
          <span
            aria-hidden
            className="block h-1.5 w-1.5 rounded-full animate-nx-breathe"
            style={{ background: moment.hue }}
          />
          <span>
            {moment.watching > 0
              ? `${moment.watching} watching`
              : moment.rising
                ? 'Rising'
                : 'Live'}
          </span>
        </span>
      </Link>
      <div className="flex items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={`/moments/${moment.slug}`} className="min-w-0">
            <h3
              className={cn(
                'm-0 truncate font-nx-serif font-normal leading-[1.05]',
                lead ? 'text-[34px] md:text-[42px]' : 'text-[26px]',
              )}
            >
              {moment.title}
            </h3>
          </Link>
          <p className="relative m-0 text-[13px] text-nx-soft">
            <span className="font-extrabold tabular-nums" style={{ color: moment.hue }}>
              {plural(moment.people, 'person', 'people')}
            </span>
            <span>{` · ${plural(moment.posts, 'post')} · ${timeAgo(moment.lastAt)}`}</span>
            {flash && (
              <span
                key={flash.item.id}
                aria-hidden
                className="absolute -top-1 left-0 text-[13px] font-extrabold animate-nx-float-up"
                style={{ color: moment.hue }}
              >
                +1
              </span>
            )}
          </p>
        </div>
        <Link
          href={momentPlayHref(moment.slug)}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-extrabold text-black"
          style={{ background: moment.hue }}
        >
          <Radio aria-hidden className="h-4 w-4" strokeWidth={2.4} />
          <span>Tune in</span>
        </Link>
      </div>
    </article>
  )
}

function FormingCard({ forming, flash }: { forming: FormingView; flash: Flash | undefined }) {
  return (
    <article
      className="relative flex min-h-[230px] flex-col justify-between gap-3 rounded-[24px] border-2 border-dashed bg-[#100f0d] p-4"
      style={{ borderColor: forming.hue }}
    >
      {flash && (
        <span
          key={flash.item.id}
          aria-hidden
          className="pointer-events-none absolute -inset-0.5 rounded-[24px] animate-nx-glow"
          style={{ boxShadow: `0 0 30px ${forming.hue}66` }}
        />
      )}
      <div className="flex flex-col gap-2">
        <span
          className="flex items-center gap-2 text-[11px] font-extrabold tracking-[.14em]"
          style={{ color: forming.hue }}
        >
          <span
            aria-hidden
            className="block h-1.5 w-1.5 rounded-full animate-nx-breathe"
            style={{ background: forming.hue }}
          />
          <span>FORMING</span>
        </span>
        <h3 className="m-0 font-nx-serif text-[26px] font-normal italic leading-[1.05]">{`${forming.title}?`}</h3>
        <p className="m-0 text-[13px] text-nx-soft">
          {forming.unit === 'people'
            ? `A few people are saving the same kind of thing. It becomes a moment at ${forming.need}.`
            : `Saves like these are piling up. It becomes a moment at ${forming.need}.`}
        </p>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex gap-1.5" aria-hidden>
            {Array.from({ length: forming.need }, (_, i) => (
              <span
                key={i}
                className="block h-2 flex-1 rounded"
                style={{ background: i < forming.have ? forming.hue : '#2a2620' }}
              />
            ))}
          </div>
          <span className="text-xs font-bold">
            {`${forming.have} of ${forming.need} ${forming.unit}`}
          </span>
        </div>
        <span className="flex -space-x-3">
          {forming.covers.map(asFeed).map((post) => (
            <span
              key={`${post.platform}:${post.id}`}
              className="relative block h-10 w-10 overflow-hidden rounded-xl border-2 border-[#100f0d] bg-[#2a2620]"
            >
              <Cover post={post} tiny />
            </span>
          ))}
        </span>
      </div>
    </article>
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

export function RightNow() {
  const { snapshot, flashes, popped } = useMoments()

  if (!snapshot) {
    return (
      <section aria-label="Right now" className="flex flex-col gap-4">
        <span
          aria-hidden
          className="nx-shimmer animate-nx-shimmer block h-[44px] w-[260px] rounded-xl"
        />
        <span
          aria-hidden
          className="nx-shimmer animate-nx-shimmer block h-[300px] w-full rounded-[24px]"
        />
      </section>
    )
  }

  const { moments, forming, stream, stats, label } = snapshot
  const freshId = stream[0]?.id
  const quiet = moments.length === 0 && forming.length === 0

  return (
    <section aria-labelledby="nx-rightnow" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
        <div className="flex min-w-[260px] flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <LiveDot />
            <h2
              id="nx-rightnow"
              className="m-0 font-nx-serif text-[40px] font-normal leading-none md:text-[52px]"
            >
              {label}
            </h2>
          </div>
          <p className="m-0 text-[15px] text-nx-soft">
            What people are saving, sorted into moments as it happens. Tune in to one and new saves
            play the moment they arrive.
          </p>
        </div>
        <div className="flex gap-7">
          <Stat value={stats.today.toLocaleString('en-GB')} label="saves today" />
          <Stat value={stats.lastHour.toLocaleString('en-GB')} label="in the last hour" />
          <Stat
            value={String(moments.length)}
            label={moments.length === 1 ? 'moment' : 'moments'}
          />
        </div>
      </div>

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {moments.map((m, i) => (
            <MomentCard
              key={m.slug}
              moment={m}
              lead={i === 0}
              flash={flashes.get(m.slug)}
              popped={popped.has(m.slug)}
            />
          ))}
          {forming.map((f) => (
            <FormingCard key={f.id} forming={f} flash={flashes.get(f.id)} />
          ))}
        </div>
      )}
    </section>
  )
}
