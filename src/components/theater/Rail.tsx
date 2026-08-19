'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Bookmark,
  Check,
  Copy,
  Download,
  ExternalLink,
  Flame,
  ChevronUp,
  ChevronDown,
  LogIn,
  Loader2,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Minimize2,
  Maximize2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { MatterLogo, LiveDot, PlatformGlyph } from '@/components/matter'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { inferType } from '@/lib/trending/filter'
import { UpNextList } from './UpNextList'
import { useSendFile } from './useSendFile'
import { TheaterLinkedText } from './TheaterText'
import { progressKindFor } from './TheaterProgressLine'
import { theaterItemKey } from './types'
import type { TheaterItem, TheaterMode } from './types'

/**
 * Session-scoped expand preference shared by every `useClampExpand` call site
 * (desktop rail + mobile chrome, both always mounted at once). Once the user
 * explicitly expands or collapses a caption, later items default to that
 * choice instead of always collapsing — in-memory only (no sessionStorage) is
 * fine since it only needs to survive item changes, not reloads.
 */
let preferExpanded = false

/**
 * Clamped text + expand toggle, shared by the desktop rail's now-playing
 * block and the mobile chrome's bottom-scrim caption. Detects overflow via
 * `scrollHeight` vs `clientHeight` on the ref'd (clamped) element — never a
 * character-count guess — and resets to the shared `preferExpanded`
 * preference whenever `resetKey` changes (the theater advancing to a new
 * item), not unconditionally to collapsed.
 */
export function useClampExpand(resetKey: string | null) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpandedState] = useState(preferExpanded)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    setExpandedState(preferExpanded)
  }, [resetKey])

  useLayoutEffect(() => {
    if (expanded) return
    const el = ref.current
    setOverflowing(!!el && el.scrollHeight > el.clientHeight + 1)
  }, [resetKey, expanded])

  const setExpanded = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setExpandedState((prev) => {
      const next = typeof value === 'function' ? (value as (prev: boolean) => boolean)(prev) : value
      preferExpanded = next
      return next
    })
  }, [])

  return { ref, expanded, setExpanded, overflowing }
}

/**
 * ~400px right rail (spec §3): a FIXED header block — brand, transport
 * (prev/pause/next/audio/de-clutter), and actions (Copy link / Save / Open on
 * {platform}) — that never shifts position regardless of post-text length,
 * followed by a single scroll container holding the now-playing post text and
 * the live Up-next feed. Follows the theme tokens — the dark look on theater
 * routes comes from the theme system defaulting dark there (spec §7), not
 * from hardcoded colors in this component.
 */

/** Human platform label for "Open on {platform}" titles — shared with `CollectionRail`. */
export const PLATFORM_LABEL: Record<string, string> = {
  twitter: 'X',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
}

export interface RailProps {
  mode: TheaterMode
  items: TheaterItem[]
  current: TheaterItem | null
  currentKey: string | null
  isSeen: (key: string) => boolean
  seenReady: boolean
  freshKeys: ReadonlySet<string>
  newCount: number
  savedToday: number
  onSelect: (key: string) => void
  /** Shared mode (PR 3): the post the visitor landed on — drives the "Shared post" chip. */
  sharedItem?: TheaterItem
  /** Whether the visiting user is signed in (shared mode: swaps Connect for a direct Save). */
  authed?: boolean
  /**
   * End-of-feed waiting stage (`current` is null for this reason, not the
   * pre-hydration "nothing picked yet" reason) — swaps NowPlaying's loading
   * skeleton for a one-line "waiting" message so it doesn't pulse forever.
   */
  waiting?: boolean
  /** Current sound state (owned by TheaterShell) — mirrors the mobile chrome's audio button. */
  muted: boolean
  /** Flips TheaterShell's `muted` state. */
  onToggleMute: () => void
  /** Whether there's a previous/next post to navigate to — disables the corresponding chevron in place. */
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  /** Desktop de-clutter (owned by TheaterShell — collapses the rail column when true). */
  declutter: boolean
  onToggleDeclutter: () => void
}

function BrandRow() {
  return (
    <div className="flex-none border-b border-hairline px-5 pt-5 pb-4">
      <div className="flex items-center justify-between">
        <a href="/" className="flex items-center">
          <MatterLogo size={19} />
        </a>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          <LiveDot />
          Live
        </span>
      </div>
    </div>
  )
}

/**
 * Platform glyph + relative time, doubling as the link-out to the original
 * post on its native network. Renders as a plain (non-interactive) chip when
 * `sourceUrl` can't build a link (no bookmark id) — never a dead anchor.
 */
function LinkOutChip({
  platform,
  author,
  bookmarkId,
  createdAt,
}: {
  platform: string
  author: string
  bookmarkId?: string | null
  createdAt: string
}) {
  const href = sourceUrl(platform, author, bookmarkId ?? '')
  const platformLabel = PLATFORM_LABEL[platform] ?? platform
  const content = (
    <>
      <PlatformGlyph platform={platform} size={12} />
      <span className="font-mono text-[12px]" suppressHydrationWarning>
        {formatCompactRelativeTime(createdAt)}
      </span>
    </>
  )

  if (!href) {
    return <span className="inline-flex flex-none items-center gap-1.5 text-ink-3">{content}</span>
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open on ${platformLabel}`}
      className="inline-flex flex-none items-center gap-1.5 text-ink-3 transition-colors hover:text-ink"
    >
      {content}
    </a>
  )
}

function NowPlaying({
  current,
  sharedItem,
  waiting = false,
}: {
  current: TheaterItem | null
  sharedItem?: TheaterItem
  waiting?: boolean
}) {
  const key = current ? theaterItemKey(current) : null
  const { ref, expanded, setExpanded, overflowing } = useClampExpand(key)

  if (!current) {
    // Two distinct reasons for a null `current`: pre-hydration (nothing
    // picked yet — a real loading skeleton is honest) vs. the end-of-feed
    // waiting stage, where there's nothing to load and the skeleton would
    // just pulse forever.
    if (waiting) {
      return (
        <div className="flex-none border-b border-hairline px-5 py-5">
          <p className="text-[13px] text-ink-3">Waiting for new sends&hellip;</p>
        </div>
      )
    }
    return (
      <div className="flex-none border-b border-hairline px-5 py-5">
        <div className="h-3 w-24 animate-pulse rounded bg-inset" />
        <div className="mt-3 h-8 w-8 animate-pulse rounded-full bg-inset" />
        <div className="mt-3 h-3 w-full animate-pulse rounded bg-inset" />
        <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-inset" />
      </div>
    )
  }

  const trendCount = current.trendCount ?? current.saveCount ?? 0
  const handle = current.author ? current.author.replace(/^@+/, '') : ''
  const isSharedCurrent = !!sharedItem && theaterItemKey(current) === theaterItemKey(sharedItem)
  const text = (current.text || '').trim() || 'Saved post'
  const hasMedia = inferType(current) === 'video' || inferType(current) === 'photo'

  return (
    <div className="flex-none border-b border-hairline px-5 py-4">
      <div className="flex items-center gap-2">
        {isSharedCurrent && (
          <span className="inline-flex items-center rounded-full bg-clay/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-clay">
            Shared post
          </span>
        )}
        <div className="ml-auto flex flex-none items-center gap-2">
          {trendCount >= 2 && (
            <span className="inline-flex flex-none items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[11px] font-bold text-orange-300">
              <Flame size={11} className="text-orange-400" fill="currentColor" />
              {trendCount}
            </span>
          )}
          <LinkOutChip
            platform={current.platform}
            author={current.author}
            bookmarkId={current.bookmarkId}
            createdAt={current.createdAt}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2.5">
        <AuthorAvatar
          src={current.authorAvatarUrl ?? current.thumbnailUrl}
          author={current.author}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-bold text-ink">
            {current.authorName || (handle ? `@${handle}` : 'Saved post')}
          </div>
          {handle && <div className="truncate font-mono text-[11px] text-ink-3">@{handle}</div>}
        </div>
      </div>

      <p
        ref={ref}
        className={cn('mt-2.5 text-[14px] leading-relaxed text-ink', !expanded && 'line-clamp-4')}
      >
        <TheaterLinkedText
          platform={current.platform}
          text={text}
          hasMedia={hasMedia}
          links={current.textLinks}
          hideTweetLinks={!!current.quote}
        />
      </p>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 flex min-h-[44px] items-center text-[12.5px] font-semibold text-ink-3 transition-colors hover:text-ink"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

/** Shared style for the transport row's icon-only controls — mirrors the mobile peek bar's `PEEK_ICON_BTN`/`PEEK_ICON_BTN_DISABLED`. */
const TRANSPORT_ICON_BTN =
  'inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-inset hover:text-ink active:bg-inset active:text-ink disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-3'

/**
 * Desktop transport row: prev/pause/next + audio (video kind only) + de-clutter.
 * Mirrors `TheaterMobileChrome`'s peek-bar semantics exactly — same events,
 * same kind-awareness — but rendered inline in the rail rather than an
 * overlay, since the desktop rail has no scrim to hide behind. Rendered
 * regardless of `current` (prev/next/de-clutter stay usable through the
 * waiting stage); pause/audio hide via `kind === 'none'`.
 */
function TransportRow({
  current,
  currentKey,
  canPrev,
  canNext,
  onPrev,
  onNext,
  muted,
  onToggleMute,
  declutter,
  onToggleDeclutter,
}: {
  current: TheaterItem | null
  currentKey: string | null
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  muted: boolean
  onToggleMute: () => void
  declutter: boolean
  onToggleDeclutter: () => void
}) {
  const kind = progressKindFor(current)

  // Mirrors TheaterMobileChrome's pause/play + mute bookkeeping: 'video'-kind
  // items reflect StageVideo's real playing state via the same window events;
  // 'timed'-kind items own their own paused flag (StageVideo doesn't exist for
  // them), reset whenever the current post changes.
  const [videoPlaying, setVideoPlaying] = useState(true)
  const [timedPaused, setTimedPaused] = useState(false)
  const [liveMuted, setLiveMuted] = useState<boolean | null>(null)

  useEffect(() => {
    const handlePlaying = (e: Event) => {
      const detail = (e as CustomEvent<{ playing: boolean }>).detail
      if (detail) setVideoPlaying(detail.playing)
    }
    const handleMuted = (e: Event) => {
      const detail = (e as CustomEvent<{ muted: boolean }>).detail
      if (detail) setLiveMuted(detail.muted)
    }
    window.addEventListener('theater-playing-state', handlePlaying)
    window.addEventListener('theater-muted-state', handleMuted)
    return () => {
      window.removeEventListener('theater-playing-state', handlePlaying)
      window.removeEventListener('theater-muted-state', handleMuted)
    }
  }, [])

  // Never let a paused 'timed' item leak its pause into the next one — 'video'
  // items don't need this, StageVideo always (re)plays a fresh src.
  useEffect(() => {
    setTimedPaused(false)
  }, [currentKey])

  const paused = kind === 'video' ? !videoPlaying : timedPaused
  const displayMuted = liveMuted ?? muted
  const soundPulse = kind === 'video' && displayMuted && videoPlaying

  const handleTogglePause = () => {
    if (kind === 'video') {
      window.dispatchEvent(new CustomEvent(videoPlaying ? 'theater-pause' : 'theater-resume'))
      return
    }
    if (kind === 'timed') {
      setTimedPaused((was) => {
        window.dispatchEvent(new CustomEvent(was ? 'theater-resume' : 'theater-pause'))
        return !was
      })
    }
  }

  return (
    <div className="flex flex-none items-center gap-1 border-b border-hairline px-5 py-2">
      <button
        type="button"
        disabled={!canPrev}
        onClick={onPrev}
        aria-label="Previous post"
        aria-disabled={!canPrev}
        className={TRANSPORT_ICON_BTN}
      >
        <ChevronUp size={18} />
      </button>
      {kind !== 'none' && (
        <button
          type="button"
          onClick={handleTogglePause}
          aria-label={paused ? 'Play' : 'Pause'}
          className={TRANSPORT_ICON_BTN}
        >
          {paused ? (
            <Play size={16} fill="currentColor" />
          ) : (
            <Pause size={16} fill="currentColor" />
          )}
        </button>
      )}
      <button
        type="button"
        disabled={!canNext}
        onClick={onNext}
        aria-label="Next post"
        aria-disabled={!canNext}
        className={TRANSPORT_ICON_BTN}
      >
        <ChevronDown size={18} />
      </button>
      {kind === 'video' && (
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={displayMuted ? 'Unmute' : 'Mute'}
          className={cn(TRANSPORT_ICON_BTN, soundPulse && 'animate-sound-pulse text-ink')}
        >
          {displayMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      )}
      <button
        type="button"
        onClick={onToggleDeclutter}
        aria-label={declutter ? 'Show controls' : 'Hide controls'}
        className={cn(TRANSPORT_ICON_BTN, 'ml-auto')}
      >
        {declutter ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
      </button>
    </div>
  )
}

const BUTTON_BASE =
  'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-hairline bg-inset px-3 text-[12.5px] font-semibold text-ink transition-colors hover:bg-surface disabled:opacity-60'
// The emphasized (clay-grad) treatment: Save normally wears this on the home
// rail, but Send takes it over as the first, primary action whenever the
// current item has a sendable file — Save then drops to the outline style.
const PRIMARY_BASE =
  'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-clay-grad px-3 text-[12.5px] font-semibold text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-60'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Shared-mode, signed-in Save: POSTs the CURRENT item's canonical source URL
 * (never the on-ADHX preview path stored in `current.url`'s pulse-item
 * convention) to the same platform-agnostic endpoint the preview pages' own
 * "Save to collection" CTAs use. Computed via `sourceUrl()` rather than
 * trusting `current.url` — that field is the pulse's on-ADHX link target for
 * live items, not necessarily the external URL `/api/bookmarks/add` expects.
 */
function SavePostButton({ current, primary }: { current: TheaterItem; primary: boolean }) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const key = theaterItemKey(current)

  useEffect(() => {
    setStatus('idle')
  }, [key])

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [],
  )

  const handleSave = async () => {
    if (status === 'saving' || status === 'saved' || !current.bookmarkId) return
    setStatus('saving')
    try {
      const url = sourceUrl(current.platform, current.author, current.bookmarkId)
      if (!url) throw new Error('No source URL for this post')
      const res = await fetch('/api/bookmarks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || data?.error) throw new Error(data?.error || 'Save failed')
      setStatus('saved')
    } catch {
      // Quiet failure — never crash the rail over a save hiccup. Reset after
      // a beat so the button is tappable again.
      setStatus('error')
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setStatus('idle'), 2000)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleSave()}
      disabled={status === 'saving' || status === 'saved'}
      className={primary ? PRIMARY_BASE : BUTTON_BASE}
    >
      {status === 'saving' ? (
        <Loader2 size={14} className="animate-spin" />
      ) : status === 'saved' ? (
        <Check size={14} />
      ) : (
        <Bookmark size={14} />
      )}
      {status === 'saved' ? 'Saved' : status === 'error' ? 'Try again' : 'Save'}
    </button>
  )
}

function Actions({
  mode,
  current,
  authed = false,
}: {
  mode: TheaterMode
  current: TheaterItem | null
  authed?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { supported: sendSupported, sending, send, mode: sendMode } = useSendFile(current)

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [],
  )

  if (!current) {
    // Same bordered container as the populated state, holding an
    // invisible same-height spacer — keeps the fixed header block's height
    // stable through loading/waiting instead of collapsing to nothing.
    return (
      <div className="flex-none border-b border-hairline px-5 py-3">
        <div className="min-h-[44px]" aria-hidden />
      </div>
    )
  }

  const platformLabel = PLATFORM_LABEL[current.platform] ?? current.platform
  const openUrl = sourceUrl(current.platform, current.author, current.bookmarkId || '')
  const showAuthedSave = mode === 'shared' && authed

  const handleCopy = async () => {
    const path = previewPath(current.platform, current.author, current.bookmarkId || '')
    const shareUrl = new URL(path, window.location.origin).toString()
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard can be denied (permissions/insecure context) — silently no-op,
      // there's nothing actionable to show the user beyond the button itself.
    }
  }

  const buttonBase = BUTTON_BASE
  const primaryBase = PRIMARY_BASE

  return (
    <div className="flex-none border-b border-hairline px-5 py-3">
      <div className="flex items-center gap-2">
        {sendSupported && (
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            title={
              sendMode === 'share'
                ? 'Opens your share sheet with the video file'
                : 'Download the video file'
            }
            className={`${primaryBase} disabled:opacity-60`}
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download
          </button>
        )}

        <button type="button" onClick={handleCopy} className={buttonBase}>
          {copied ? <Check size={14} className="text-done" /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Link'}
        </button>

        {showAuthedSave ? (
          <SavePostButton current={current} primary={!sendSupported} />
        ) : mode === 'home' && !sendSupported ? (
          <a href="/api/auth/twitter" className={primaryBase}>
            <LogIn size={14} />
            Save
          </a>
        ) : (
          <a href="/api/auth/twitter" className={buttonBase}>
            <LogIn size={14} />
            Save
          </a>
        )}

        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonBase}
            title={`Open on ${platformLabel}`}
          >
            <ExternalLink size={14} />
            Open
          </a>
        )}
      </div>
    </div>
  )
}

export function Rail({
  mode,
  items,
  current,
  currentKey,
  isSeen,
  seenReady,
  freshKeys,
  newCount,
  savedToday,
  onSelect,
  sharedItem,
  authed = false,
  waiting = false,
  muted,
  onToggleMute,
  canPrev,
  canNext,
  onPrev,
  onNext,
  declutter,
  onToggleDeclutter,
}: RailProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Jump back to the top of the scroller (now-playing + up-next) every time
  // the theater advances to a new item — otherwise a deep scroll into a long
  // caption or the up-next list would carry over to the next post.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [currentKey])

  return (
    <div className="flex h-full w-full flex-col bg-surface text-ink lg:h-full lg:border-l lg:border-hairline">
      <BrandRow />
      <TransportRow
        current={current}
        currentKey={currentKey}
        canPrev={canPrev}
        canNext={canNext}
        onPrev={onPrev}
        onNext={onNext}
        muted={muted}
        onToggleMute={onToggleMute}
        declutter={declutter}
        onToggleDeclutter={onToggleDeclutter}
      />
      <Actions mode={mode} current={current} authed={authed} />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <NowPlaying current={current} sharedItem={sharedItem} waiting={waiting} />

        <div className="flex flex-col">
          <h2 className="flex flex-none items-center justify-between px-5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-ink-3">
            <span>{mode === 'shared' ? 'More being sent right now' : 'Up next'}</span>
            {savedToday > 0 && (
              <span className="text-[11.5px] font-normal normal-case tracking-normal text-ink-3">
                {savedToday} saved today
              </span>
            )}
          </h2>
          <UpNextList
            items={items}
            currentKey={currentKey}
            isSeen={isSeen}
            seenReady={seenReady}
            freshKeys={freshKeys}
            newCount={newCount}
            onSelect={onSelect}
            ownScroll={false}
            collapsedCount={6}
          />
        </div>
      </div>
    </div>
  )
}
