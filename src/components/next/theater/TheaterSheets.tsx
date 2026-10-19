'use client'

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Bookmark, Check, Lock, Minus, Plus, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sanitizeTag } from '@/lib/utils/tag'
import { articleHeadline, postCoverSrc, postText } from '../post'
import { NxImage } from '../primitives'
import { kindOf, resultKey, type SearchResultItem } from '../search/model'
import { isVideoItem, viaLabel } from './queue'
import { channelTitle } from '../channels/ChannelParts'
import { WhyIcon, whyKind, whyLabel } from './FeedParts'
import type { FeedWeight } from '@/lib/feed/blend'

/**
 * A panel over the stage: a side panel on wide screens, a bottom sheet on
 * phones. Escape or the backdrop closes it; focus moves in and back out.
 */
export function Sheet({
  label,
  onClose,
  children,
  side = 'right',
}: {
  label: string
  onClose: () => void
  children: ReactNode
  /** Desktop placement: a full-height side panel or a small menu by the rail. */
  side?: 'right' | 'menu'
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Callers pass a new onClose on every render (the theater re-renders several
  // times a second while a video plays). Focus must move in once, on open —
  // re-running this per render stole focus from the channel search field.
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    }
  }, [])
  return (
    <>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/50 md:bg-black/20"
      />
      <div
        ref={ref}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[78dvh] flex-col gap-3 overflow-y-auto rounded-t-[22px] bg-[#1c1b19]/[0.98] p-4 pb-[max(16px,env(safe-area-inset-bottom))] text-white shadow-[0_-10px_40px_rgba(0,0,0,0.5)] outline-none',
          side === 'right'
            ? 'md:bottom-4 md:left-auto md:right-24 md:top-24 md:max-h-none md:w-[360px] md:rounded-[20px]'
            : 'md:inset-x-auto md:bottom-auto md:right-24 md:top-1/2 md:w-[280px] md:-translate-y-1/3 md:rounded-[14px] md:p-1.5',
        )}
      >
        <span
          aria-hidden
          className="mx-auto h-1 w-10 shrink-0 rounded-full bg-white/25 md:hidden"
        />
        {children}
      </div>
    </>
  )
}

type UpNextFilter = 'all' | 'videos' | 'posts'

export function UpNextSheet({
  items,
  current,
  onPlay,
  onClose,
}: {
  items: SearchResultItem[]
  current: number
  onPlay: (index: number) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState<UpNextFilter>('all')
  const upcoming = items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => index > current)
    .filter(({ item }) =>
      filter === 'all' ? true : filter === 'videos' ? isVideoItem(item) : !isVideoItem(item),
    )
  return (
    <Sheet label="Up next" onClose={onClose}>
      <div className="flex items-center gap-2">
        <h2 className="m-0 flex-1 text-lg font-bold">Up next</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <div role="group" aria-label="Show" className="flex gap-1.5">
        {(['all', 'videos', 'posts'] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'min-h-[34px] rounded-full px-3 text-[13px] font-semibold',
              filter === f ? 'bg-white text-black' : 'bg-[#2e2c29] text-[#ddd]',
            )}
          >
            {f === 'all' ? 'All' : f === 'videos' ? 'Videos' : 'Posts'}
          </button>
        ))}
      </div>
      {upcoming.length === 0 ? (
        <p className="m-0 py-6 text-center text-sm text-white/60">Nothing else queued.</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
          {upcoming.map(({ item, index }, at) => {
            const cover = postCoverSrc(item.post)
            const kind = kindOf(item)
            const text = kind === 'article' ? articleHeadline(item.post) : postText(item.post)
            const prevVia = at > 0 ? upcoming[at - 1].item.via?.key : items[current]?.via?.key
            // A heading where the queue moves on to posts found from another one.
            const heading = item.via && item.via.key !== prevVia ? viaLabel(item.via) : null
            return (
              <Fragment key={resultKey(item)}>
                {heading && (
                  <li className="col-span-2 flex items-center gap-2 pt-2 text-[13px] font-bold text-white/80">
                    <Sparkles
                      aria-hidden
                      className="h-3.5 w-3.5 text-nx-accent"
                      fill="currentColor"
                    />
                    <span>{heading}</span>
                  </li>
                )}
                <li>
                  <button
                    type="button"
                    onClick={() => onPlay(index)}
                    aria-label={`Play ${text || item.post.author}`}
                    className="relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-nx-surface text-left"
                  >
                    {cover ? (
                      <NxImage
                        src={cover}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 overflow-hidden bg-nx-cream p-3 font-nx-serif text-[15px] leading-[1.15] text-nx-ink">
                        {text}
                      </span>
                    )}
                    <span className="nx-plate absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold">
                      {String(index + 1)}
                    </span>
                  </button>
                  {item.post.why && (
                    // The blended feed says why each one is coming up.
                    <span className="mt-1 flex min-w-0 items-start gap-1 text-[12px] leading-tight text-white/65">
                      <WhyIcon
                        kind={whyKind(item.post)}
                        className="mt-px h-3 w-3 shrink-0 text-nx-accent"
                        strokeWidth={2.4}
                      />
                      <span className="line-clamp-2">{whyLabel(item.post)}</span>
                    </span>
                  )}
                </li>
              </Fragment>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}

export interface MenuRow {
  label: string
  /** Shown on the right (e.g. On / Off, the repeat mode). */
  value?: string
  checked?: boolean
  danger?: boolean
  onSelect: () => void
}

export function MoreSheet({ rows, onClose }: { rows: MenuRow[]; onClose: () => void }) {
  return (
    <Sheet label="Options" onClose={onClose} side="menu">
      <div role="menu" aria-label="Options" className="flex flex-col">
        {rows.map((row) => (
          <button
            key={row.label}
            type="button"
            role={row.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={row.checked === undefined ? undefined : row.checked}
            onClick={row.onSelect}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-left text-[15px] hover:bg-white/[0.06]',
              row.danger ? 'text-[#ff8a7a]' : 'text-white',
            )}
          >
            <span className="flex-1">{row.label}</span>
            {row.value && (
              <span
                className={cn(
                  'text-[13px] font-semibold',
                  row.checked || row.value === 'All' || row.value === 'This post'
                    ? 'text-nx-accent'
                    : 'text-white/50',
                )}
              >
                {row.value}
              </span>
            )}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

export interface ChannelOption {
  tag: string
  count: number
  isPublic: boolean
}

/**
 * "Saved · add to a channel": tick channels this post belongs in, or make a
 * new one (public by default, with its link ready to share).
 */
export function SaveSheet({
  channels,
  selected,
  busy,
  created,
  onToggle,
  onCreate,
  onCopy,
  onClose,
  isPrivate,
  privateBusy = false,
  onPrivate,
}: {
  channels: ChannelOption[] | null
  selected: ReadonlySet<string>
  busy: string | null
  /** Set right after creating a channel: shows its link. */
  created: { tag: string; shareUrl: string | null } | null
  onToggle: (tag: string, on: boolean) => void
  onCreate: (name: string) => void
  onCopy: (url: string) => void
  onClose: () => void
  /** "Just for me": shown when the caller can switch it. */
  isPrivate?: boolean
  privateBusy?: boolean
  onPrivate?: (on: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const needle = sanitizeTag(query)
  const shown = (channels ?? []).filter((c) => !needle || c.tag.includes(needle))
  const exact = (channels ?? []).some((c) => c.tag === needle)

  if (created) {
    const url = created.shareUrl ? `${window.location.origin}${created.shareUrl}` : null
    return (
      <Sheet label="Channel created" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="text-xs font-extrabold uppercase tracking-[1.4px] text-nx-accent">
            It’s live
          </span>
          <span className="font-nx-serif text-[34px] leading-none">
            {channelTitle(created.tag)}
          </span>
          <span className="text-sm text-white/70">Public · anyone with the link can watch</span>
          {url && (
            <>
              <span className="max-w-full truncate rounded-full bg-white/10 px-3 py-1.5 text-[13px]">
                {url.replace(/^https?:\/\//, '')}
              </span>
              <button
                type="button"
                onClick={() => onCopy(url)}
                className="h-12 rounded-full bg-nx-accent px-6 text-[15px] font-extrabold text-black"
              >
                Copy link
              </button>
            </>
          )}
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet label="Saved. Add to a channel" onClose={onClose}>
      <div className="flex items-center gap-2">
        <Bookmark aria-hidden className="h-[18px] w-[18px] text-nx-accent" fill="currentColor" />
        <h2 className="m-0 flex-1 text-[15px] font-bold">Saved · add to a channel</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      {onPrivate && <PrivateRow on={!!isPrivate} busy={privateBusy} onChange={onPrivate} />}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (needle && !exact) onCreate(query)
        }}
      >
        <label htmlFor="nx-channel-find" className="sr-only">
          Find or create a channel
        </label>
        <input
          id="nx-channel-find"
          type="text"
          value={query}
          maxLength={50}
          autoComplete="off"
          placeholder="Find or create a channel"
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 text-[15px] text-white outline-none placeholder:text-white/40 focus:border-nx-accent"
        />
      </form>
      {channels === null ? (
        <p className="m-0 py-4 text-center text-sm text-white/60">Loading your channels…</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {shown.map((c) => {
            const on = selected.has(c.tag)
            return (
              <li key={c.tag}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={busy === c.tag}
                  onClick={() => onToggle(c.tag, !on)}
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-white/[0.06] disabled:opacity-60"
                >
                  <span
                    aria-hidden
                    className="flex h-[42px] w-[42px] shrink-0 items-end overflow-hidden rounded-[9px] bg-nx-cream p-1.5 font-nx-serif text-[13px] leading-none text-nx-ink"
                  >
                    {c.tag}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">{channelTitle(c.tag)}</span>
                    <span className="text-xs text-white/55">
                      {`${c.isPublic ? 'Public' : 'Private'} · ${c.count === 1 ? '1 post' : `${c.count} posts`}`}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px]',
                      on ? 'bg-nx-accent text-black' : 'border-2 border-white/40',
                    )}
                  >
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3.2} />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {needle && !exact && (
        <button
          type="button"
          onClick={() => onCreate(query)}
          disabled={busy === needle}
          className="flex min-h-12 items-center gap-2 rounded-xl px-2 text-left text-[15px] font-bold text-nx-accent hover:bg-white/[0.06]"
        >
          <Plus aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.4} />
          <span>{`New channel “${needle}”`}</span>
        </button>
      )}
      {!needle && channels !== null && channels.length === 0 && (
        <p className="m-0 text-sm text-white/60">Type a name to start your first channel.</p>
      )}
    </Sheet>
  )
}

/** "Just for me" as a switch: on, nobody else sees, counts or is told about this save. */
export function PrivateRow({
  on,
  busy = false,
  onChange,
}: {
  on: boolean
  busy?: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => onChange(!on)}
      className="flex min-h-[52px] w-full items-center gap-3 rounded-xl bg-white/[0.04] px-3 text-left hover:bg-white/[0.08] disabled:opacity-60"
    >
      <Lock
        aria-hidden
        className={cn('h-[18px] w-[18px]', on ? 'text-nx-accent' : 'text-white/60')}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">Just for me</span>
        <span className="text-xs text-white/55">
          {on ? 'Only you can see this save.' : 'Your people can see you saved this.'}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-6 w-10 shrink-0 rounded-full transition-colors',
          on ? 'bg-nx-accent' : 'bg-white/25',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]',
            on ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}

/**
 * Share: the post's link, a Copy link button and, where the device has one,
 * its own share sheet. Always shows something, even when copying is blocked.
 */
export function ShareSheet({
  url,
  waiting = false,
  onClose,
}: {
  url: string
  /** Whether playback is held while this is open (says so). */
  waiting?: boolean
  onClose: () => void
}) {
  const [copied, setCopied] = useState<'yes' | 'blocked' | null>(null)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (copied !== 'yes') return
    const t = window.setTimeout(() => setCopied(null), 2000)
    return () => window.clearTimeout(t)
  }, [copied])
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied('yes')
    } catch {
      setCopied('blocked')
      field.current?.select()
    }
  }
  return (
    <Sheet label="Share" onClose={onClose} side="menu">
      <div className="flex flex-col gap-3 md:p-2.5">
        <span className="text-[15px] font-bold">Share this post</span>
        <label className="sr-only" htmlFor="nx-share-link">
          Link to this post
        </label>
        <input
          ref={field}
          id="nx-share-link"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 w-full rounded-[10px] bg-white/[0.08] px-3 text-[13px] text-white/85 outline-none focus:ring-2 focus:ring-nx-accent"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="flex h-11 items-center justify-center gap-2 rounded-full bg-nx-accent text-[15px] font-extrabold text-black"
        >
          {copied === 'yes' && <Check aria-hidden className="h-4 w-4" />}
          <span>{copied === 'yes' ? 'Link copied' : 'Copy link'}</span>
        </button>
        {canShare && (
          <button
            type="button"
            onClick={() => void navigator.share({ url }).catch(() => {})}
            className="h-11 rounded-full border border-white/25 text-[15px] font-bold text-white"
          >
            More ways to share…
          </button>
        )}
        {copied === 'blocked' && (
          <span role="status" className="text-[13px] text-white/70">
            This browser blocked copying. The link above is selected; copy it from there.
          </span>
        )}
        {waiting && copied !== 'blocked' && (
          <span className="text-[13px] text-white/55">Paused until you close this.</span>
        )}
      </div>
    </Sheet>
  )
}

/** A friend the why sheet can show more or less of. */
export interface WhyFriend {
  username: string
  name: string
}

/**
 * "Why this one": every reason the feed has for the post on stage, and a way
 * to see more or less from the friends who saved it. Nothing else decides.
 */
export function WhySheet({
  item,
  friends,
  weights,
  busy,
  onWeight,
  onClose,
}: {
  item: SearchResultItem
  friends: WhyFriend[]
  /** Null while loading. */
  weights: Record<string, FeedWeight> | null
  busy: string | null
  onWeight: (username: string, weight: FeedWeight) => void
  onClose: () => void
}) {
  const cover = postCoverSrc(item.post)
  const kind = kindOf(item)
  const text = kind === 'article' ? articleHeadline(item.post) : postText(item.post)
  const reasons = item.post.whyReasons?.length
    ? item.post.whyReasons
    : item.post.why
      ? [{ kind: 'fresh' as const, text: item.post.why }]
      : []
  return (
    <Sheet label="Why this one" onClose={onClose}>
      <div className="flex items-center gap-2">
        <h2 className="m-0 flex-1 font-nx-serif text-[26px] font-normal leading-none">
          Why this one
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-2">
        {cover ? (
          <NxImage src={cover} alt="" className="h-14 w-11 shrink-0 rounded-lg object-cover" />
        ) : (
          <span aria-hidden className="h-14 w-11 shrink-0 rounded-lg bg-nx-cream" />
        )}
        <span className="line-clamp-2 min-w-0 text-sm font-semibold">
          {text || `@${item.post.author}`}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {reasons.map((reason) => {
          return (
            <li
              key={`${reason.kind}:${reason.text}`}
              className="flex min-h-11 items-center gap-3 rounded-xl px-1 text-[15px]"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-nx-accent"
              >
                <WhyIcon kind={reason.kind} className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">{reason.text}</span>
            </li>
          )
        })}
      </ul>
      {friends.length > 0 && (
        // One row per friend: their name, then less or more of them.
        <div className="flex flex-col gap-1.5 border-t border-white/10 pt-3">
          {friends.map((friend) => {
            const weight = weights?.[friend.username] ?? 0
            return (
              <div key={friend.username} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{friend.name}</span>
                {([-1, 1] as const).map((w) => {
                  const on = weight === w
                  return (
                    <button
                      key={w}
                      type="button"
                      aria-pressed={on}
                      aria-label={`Show ${w === 1 ? 'more' : 'less'} from ${friend.name}`}
                      disabled={weights === null || busy === friend.username}
                      onClick={() => onWeight(friend.username, on ? 0 : w)}
                      className={cn(
                        'flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold disabled:opacity-50',
                        on ? 'bg-nx-cream text-black' : 'bg-white/10 text-white',
                      )}
                    >
                      {w === 1 ? (
                        <Plus aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                      ) : (
                        <Minus aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.4} />
                      )}
                      <span>{w === 1 ? 'Show more' : 'Show less'}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
      <p className="m-0 text-center text-xs text-white/55">
        No engagement bait. These are the only reasons.
      </p>
    </Sheet>
  )
}
