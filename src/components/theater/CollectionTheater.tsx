'use client'

/**
 * The authed Collection's focus/triage surface — the theater-first
 * replacement for the old card-stack `TriageMode` (docs/specs/theater-first.md
 * §3/§10 PR 3). A dark full-bleed stage (reusing the read-only theater Stage
 * variants) + a `Collection ↔ Live` rail.
 *
 * KEYBOARD MAP — preserved EXACTLY from `TriageMode.tsx` (the acceptance bar
 * for this PR is "authed triage keyboard map preserved", not a redesign of
 * it): ArrowRight = Done, ArrowLeft = Later, ArrowDown/Backspace/Delete =
 * Delete, U = Undo, Escape = Close. `collectionKeyAction()` is the pure
 * mapping, unit-tested against the old map in `theater-collection-keyboard.test.ts`.
 *
 * NOT preserved (deliberately, flagged in the PR report): the old touch
 * swipe-to-dismiss gesture and "immersive tap-to-hide chrome" — both are
 * artifacts of the old single-card-fills-the-screen layout. The theater's
 * layout is stage+rail always visible (that's the point of the redesign), so
 * there's no card to swipe and no chrome to hide; Keep/Later/Delete are
 * button-only here, same as they'd be on desktop in the old surface.
 *
 * NOT implemented because they don't exist in the current app (despite older
 * CLAUDE.md prose describing a `Lightbox.tsx` that no longer exists): a R/U
 * read-unread toggle key and Q/P quoted-tweet/parent-tweet keyboard
 * navigation. `TriageMode.tsx` + `MediaCard.tsx` are the actual current
 * implementation and neither has these bindings today.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { FeedItem } from '@/components/feed/types'
import { VideoPlayer } from '@/components/feed/VideoPlayer'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { reelVideoSrc } from '@/components/feed/video-src'
import { sourceUrl } from '@/lib/activity/preview-path'
import { Stage } from './Stage'
import { StageText } from './StageText'
import { TheaterLinkedText } from './TheaterText'
import { StageArticle } from './StageArticle'
import { StageInstagram } from './StageInstagram'
import { StageYouTube } from './StageYouTube'
import { StageVideo } from './StageVideo'
import { feedItemToTheaterItem } from './collection-item'
import { theaterItemKey } from './types'
import type { TheaterItem } from './types'
import { CollectionRail, type CollectionTab } from './CollectionRail'

/** User's LOCAL calendar day as YYYY-MM-DD (streaks are per the user's days). */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Streak {
  current: number
  longest: number
}

export interface CollectionTheaterProps {
  isOpen: boolean
  onClose: () => void
  /** Snapshot of the queue to triage (taken when opened) — same contract as TriageMode's `initialQueue`. */
  initialQueue: FeedItem[]
  /** Where to start in the queue (gallery click jumps to the clicked item). */
  startIndex: number
  /** Notify the feed so it can drop archived/deleted items without a refetch. */
  onItemResolved?: (id: string, action: 'archive' | 'delete') => void
  /** Notify the feed an archive was undone, so it can restore the item + unread count. */
  onItemRestored?: (item: FeedItem) => void
}

type UndoAction =
  | { type: 'archive'; item: FeedItem; index: number }
  | { type: 'keep'; index: number }
  | { type: 'delete'; item: FeedItem; index: number; timer: ReturnType<typeof setTimeout> }

export type CollectionKeyAction = 'done' | 'later' | 'delete' | 'undo' | 'close'

interface KeyLike {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  target?: EventTarget | null
}

function isTypingTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof HTMLElement === 'undefined') return false
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
}

/**
 * Pure key → action mapping. Mirrors `TriageMode.tsx`'s keydown switch
 * exactly (ArrowRight/ArrowLeft/ArrowDown+Backspace+Delete/U/Escape); the
 * only addition is guarding modifier keys + input/textarea/contentEditable
 * targets (TriageMode only guarded `HTMLInputElement`), which never changes
 * what a bare keypress does — see `theater-collection-keyboard.test.ts`.
 */
export function collectionKeyAction(e: KeyLike): CollectionKeyAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  if (isTypingTarget(e.target)) return null
  switch (e.key) {
    case 'ArrowRight':
      return 'done'
    case 'ArrowLeft':
      return 'later'
    case 'ArrowDown':
    case 'Backspace':
    case 'Delete':
      return 'delete'
    case 'u':
    case 'U':
      return 'undo'
    case 'Escape':
      return 'close'
    default:
      return null
  }
}

/** Fetch the sendable MP4 duration hint (seconds) for the VideoPlayer fast-path, if known. */
function durationSecondsOf(item: FeedItem): number | undefined {
  const ms = item.media?.[0]?.durationMs
  return typeof ms === 'number' && ms > 0 ? ms / 1000 : undefined
}

/** Minimal inline quote card for the stage — dark-themed, compact. There is no
 * exported `QuoteCard` (the equivalent view in `MediaCard.tsx` is a private,
 * light-surface-only component), so this is a small purpose-built variant. */
function StageQuoteCard({ item }: { item: FeedItem }) {
  const q = item.quotedTweet
  const qc = item.quoteContext
  const qName = q?.authorName || q?.author || qc?.authorName || qc?.author || 'unknown'
  const qHandle = q?.author || qc?.author || ''
  const qText = q?.text || qc?.text || ''
  const qHasMedia = !!(q?.media?.length || qc?.media?.photos?.length || qc?.media?.videos?.length)
  if (!qText && !qHandle) return null
  return (
    <div className="mt-4 w-full max-w-2xl rounded-xl border border-white/15 bg-white/[0.04] p-4">
      <div className="mb-2 flex items-center gap-2">
        <AuthorAvatar
          src={q?.authorProfileImageUrl || qc?.authorProfileImageUrl}
          author={qHandle}
          size="sm"
        />
        <span className="truncate text-[13px] font-semibold text-white">{qName}</span>
        {qHandle && <span className="truncate font-mono text-xs text-white/50">@{qHandle}</span>}
      </div>
      {qText && (
        <p className="line-clamp-4 text-[13.5px] leading-snug text-white/80">
          <TheaterLinkedText text={qText} hasMedia={qHasMedia} platform="twitter" />
        </p>
      )}
    </div>
  )
}

/** Dispatches the right stage variant for the current `FeedItem`, converting
 * to `TheaterItem` for the read-only theater stages and using `VideoPlayer`
 * (HLS-aware) directly for twitter video — the theater's own `StageVideo` is
 * plain-MP4-only, which would regress long (>5min) tweet videos that need
 * HLS to avoid the Fly.io proxy timeout. */
function CollectionStage({
  feedItem,
  muted,
  onRequestUnmute,
}: {
  feedItem: FeedItem
  muted: boolean
  onRequestUnmute: () => void
}) {
  const theaterItem = feedItemToTheaterItem(feedItem)
  const platform = feedItem.platform ?? 'twitter'
  const primary = feedItem.media?.[0]
  const isVideo = primary?.mediaType === 'video' || primary?.mediaType === 'animated_gif'

  if (platform === 'instagram') {
    return <StageInstagram item={theaterItem} muted={muted} onRequestUnmute={onRequestUnmute} />
  }

  if (platform === 'youtube') {
    return <StageYouTube item={theaterItem} />
  }

  if (platform === 'twitter' && isVideo) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#08070a]">
        <VideoPlayer
          author={feedItem.author}
          tweetId={feedItem.id}
          tweetUrl={feedItem.tweetUrl}
          poster={primary?.thumbnailUrl}
          duration={durationSecondsOf(feedItem)}
          platform="twitter"
          loop
          autoPlay
          className="h-full max-h-full w-auto max-w-full object-contain"
        />
      </div>
    )
  }

  if (platform === 'tiktok' && isVideo) {
    return (
      <StageVideo
        item={theaterItem}
        src={reelVideoSrc(theaterItem)}
        poster={theaterItem.thumbnailUrl ?? null}
        muted={muted}
        onRequestUnmute={onRequestUnmute}
      />
    )
  }

  if (theaterItem.contentType === 'article') {
    return <StageArticle item={theaterItem} />
  }

  if (theaterItem.contentType === 'photo') {
    return <StageText item={theaterItem} photo />
  }

  if (theaterItem.contentType === 'quote') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center overflow-y-auto bg-[#08070a] px-6 py-10 sm:px-10">
        <StageText item={theaterItem} hideTweetLinks />
        <StageQuoteCard item={feedItem} />
      </div>
    )
  }

  return <StageText item={theaterItem} />
}

export function CollectionTheater({
  isOpen,
  onClose,
  initialQueue,
  startIndex,
  onItemResolved,
  onItemRestored,
}: CollectionTheaterProps) {
  const [queue, setQueue] = useState<FeedItem[]>([])
  const [index, setIndex] = useState(0)
  const [streak, setStreak] = useState<Streak>({ current: 0, longest: 0 })
  const [undo, setUndo] = useState<UndoAction | null>(null)
  const [cleared, setCleared] = useState(0)
  const [tab, setTab] = useState<CollectionTab>('collection')
  const [muted, setMuted] = useState(true)

  const [liveItems, setLiveItems] = useState<TheaterItem[]>([])
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveCurrentKey, setLiveCurrentKey] = useState<string | null>(null)
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set())
  const liveStartedRef = useRef(false)

  const recordedRef = useRef(false)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const total = queue.length
  const remaining = Math.max(0, total - cleared)
  const current = index < queue.length ? queue[index] : null
  const finished = index >= queue.length

  // --- seed queue from the snapshot on open; load streak for display ---
  useEffect(() => {
    if (!isOpen) return
    setQueue(initialQueue)
    setIndex(startIndex)
    setCleared(0)
    setTab('collection')
    recordedRef.current = false

    let cancelled = false
    fetch(`/api/triage/streak?today=${localToday()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (s) => !cancelled && s && setStreak({ current: s.current ?? 0, longest: s.longest ?? 0 }),
      )
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isOpen, initialQueue, startIndex])

  // --- dialog a11y: move focus into the overlay on open, restore on close ---
  useEffect(() => {
    if (!isOpen) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    overlayRef.current?.focus()
    return () => {
      previousFocusRef.current?.focus?.()
    }
  }, [isOpen])

  // --- lock the underlying page while the theater is open ---
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  // --- Live tab: fetch once on first open, then poll every 12s while active ---
  useEffect(() => {
    if (!isOpen || tab !== 'live') return
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch('/api/activity', { signal: AbortSignal.timeout(10_000) })
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data.items)) setLiveItems(data.items)
      } catch {
        // Transient — keep whatever we have, try again next tick.
      }
    }

    if (!liveStartedRef.current) {
      liveStartedRef.current = true
      setLiveLoading(true)
      poll().finally(() => !cancelled && setLiveLoading(false))
    }

    const id = window.setInterval(poll, 12_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [isOpen, tab])

  // Reset the "started" flag + live selection each time the theater re-opens.
  useEffect(() => {
    if (!isOpen) return
    liveStartedRef.current = false
    setLiveItems([])
    setLiveCurrentKey(null)
  }, [isOpen])

  useEffect(() => {
    if (tab !== 'live' || liveCurrentKey || liveItems.length === 0) return
    setLiveCurrentKey(theaterItemKey(liveItems[0]))
  }, [tab, liveItems, liveCurrentKey])

  const recordStreak = useCallback(() => {
    if (recordedRef.current) return
    recordedRef.current = true
    fetch('/api/triage/streak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ today: localToday() }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s) return
        setStreak({ current: s.current, longest: s.longest })
      })
      .catch(() => {})
  }, [])

  const clearUndoTimer = () => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = null
  }

  // See TriageMode.tsx's identical comment: a pending delete must be
  // COMMITTED (not just cancelled) when the next action lands within its 5s
  // undo window, or the previous delete silently never reaches the server.
  const commitPendingDelete = useCallback(() => {
    if (!undoTimer.current) return
    clearUndoTimer()
    setUndo((u) => {
      if (u?.type === 'delete') {
        fetch(`/api/bookmarks/${u.item.id}?platform=${u.item.platform ?? 'twitter'}`, {
          method: 'DELETE',
        }).catch(() => {})
        onItemResolved?.(u.item.id, 'delete')
      }
      return null
    })
  }, [onItemResolved])

  const advance = useCallback(() => {
    setIndex((i) => i + 1)
  }, [])

  // Done: mark read and advance.
  const archive = useCallback(() => {
    if (!current) return
    recordStreak()
    const item = current
    fetch(`/api/bookmarks/${item.id}/read?platform=${item.platform ?? 'twitter'}`, {
      method: 'POST',
    }).catch(() => {})
    onItemResolved?.(item.id, 'archive')
    commitPendingDelete()
    setUndo({ type: 'archive', item, index })
    setCleared((c) => c + 1)
    advance()
  }, [current, index, recordStreak, advance, onItemResolved, commitPendingDelete])

  // Later: defer — advance without changing read state.
  const keep = useCallback(() => {
    if (!current) return
    recordStreak()
    commitPendingDelete()
    setUndo({ type: 'keep', index })
    advance()
  }, [current, index, recordStreak, advance, commitPendingDelete])

  const del = useCallback(() => {
    if (!current) return
    recordStreak()
    const item = current
    commitPendingDelete()
    const timer = setTimeout(() => {
      fetch(`/api/bookmarks/${item.id}?platform=${item.platform ?? 'twitter'}`, {
        method: 'DELETE',
      }).catch(() => {})
      onItemResolved?.(item.id, 'delete')
      setUndo((u) => (u && u.type === 'delete' && u.item.id === item.id ? null : u))
    }, 5000)
    undoTimer.current = timer
    setUndo({ type: 'delete', item, index, timer })
    setCleared((c) => c + 1)
    advance()
  }, [current, index, recordStreak, advance, onItemResolved, commitPendingDelete])

  const doUndo = useCallback(() => {
    if (!undo) return
    if (undo.type === 'archive') {
      fetch(`/api/bookmarks/${undo.item.id}/read?platform=${undo.item.platform ?? 'twitter'}`, {
        method: 'DELETE',
      }).catch(() => {})
      onItemRestored?.(undo.item)
      setCleared((c) => Math.max(0, c - 1))
    } else if (undo.type === 'delete') {
      clearUndoTimer()
      setCleared((c) => Math.max(0, c - 1))
    }
    setIndex(undo.index)
    setUndo(null)
  }, [undo, onItemRestored])

  // --- keyboard: only while the Collection tab is active and there's a queue ---
  useEffect(() => {
    if (!isOpen || tab !== 'collection') return
    const onKeyDown = (e: KeyboardEvent) => {
      const action = collectionKeyAction(e)
      if (!action) return
      e.preventDefault()
      switch (action) {
        case 'done':
          archive()
          break
        case 'later':
          keep()
          break
        case 'delete':
          del()
          break
        case 'undo':
          doUndo()
          break
        case 'close':
          onClose()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, tab, archive, keep, del, doUndo, onClose])

  // flush any pending delete + reset transient state when the theater closes
  useEffect(() => {
    if (isOpen) return
    commitPendingDelete()
    setUndo(null)
  }, [isOpen, commitPendingDelete])

  const handleLiveSave = useCallback(async (item: TheaterItem) => {
    const key = theaterItemKey(item)
    const url = sourceUrl(item.platform, item.author, item.bookmarkId || '')
    if (!url) return
    try {
      const res = await fetch('/api/bookmarks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, source: 'manual' }),
      })
      if (res.ok) {
        setSavedKeys((prev) => new Set(prev).add(key))
        // The same event AuthedHome already listens for after any add flow —
        // refreshes the Collection feed/count without a bespoke wire-up here.
        window.dispatchEvent(new CustomEvent('tweet-added'))
      }
    } catch {
      // Best effort — the button simply won't flip to "Saved".
    }
  }, [])

  if (!isOpen) return null

  const liveCurrentIndex = liveCurrentKey
    ? liveItems.findIndex((it) => theaterItemKey(it) === liveCurrentKey)
    : -1
  const liveCurrent = liveCurrentIndex === -1 ? null : liveItems[liveCurrentIndex]

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Collection theater"
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col outline-none lg:flex-row"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close theater"
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-opacity hover:opacity-80"
      >
        <X className="h-[19px] w-[19px]" />
      </button>

      <div className="relative min-h-0 flex-1 bg-[#08070a]">
        {tab === 'collection' ? (
          current ? (
            <CollectionStage
              feedItem={current}
              muted={muted}
              onRequestUnmute={() => setMuted(false)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <p className="text-sm text-white/40">Backlog cleared</p>
            </div>
          )
        ) : liveCurrent ? (
          // Live items ARE TheaterItems — the community Stage dispatcher
          // handles every platform/type for them directly (IG probe, YouTube
          // iframe, article splash+reader). Round-tripping through a synthetic
          // FeedItem loses the contentType and downgrades articles to text.
          <Stage item={liveCurrent} muted={muted} onRequestUnmute={() => setMuted(false)} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-sm text-white/40">{liveLoading ? 'Loading…' : 'Nothing playing'}</p>
          </div>
        )}
      </div>

      <CollectionRail
        tab={tab}
        onTabChange={setTab}
        queue={queue.map(feedItemToTheaterItem)}
        currentIndex={index}
        current={current ? feedItemToTheaterItem(current) : null}
        remaining={remaining}
        total={total}
        finished={finished}
        streak={streak}
        onSelect={(i) => setIndex(i)}
        onKeep={keep}
        onDone={archive}
        onDelete={del}
        undo={undo}
        onUndo={doUndo}
        onCloseFinished={onClose}
        liveItems={liveItems}
        liveCurrentKey={liveCurrentKey}
        liveLoading={liveLoading}
        onLiveSelect={setLiveCurrentKey}
        onLiveSave={handleLiveSave}
        savedKeys={savedKeys}
      />
    </div>
  )
}
