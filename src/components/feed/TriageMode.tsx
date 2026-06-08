'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X,
  Check,
  Clock,
  Trash2,
  Flame,
  Undo2,
  PartyPopper,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  Share2,
  Link2,
} from 'lucide-react'
import type { FeedItem } from './types'
import { MediaCard, isFullBleedCandidate } from './MediaCard'
import { copyPreviewLink, sharePreviewLink } from './utils'
import { cn } from '@/lib/utils'

/** User's LOCAL calendar day as YYYY-MM-DD (streaks are per the user's days). */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Track the mobile breakpoint (<768px) so focus media can go full-bleed. */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = () => setMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}

interface Streak {
  current: number
  longest: number
}

interface TriageModeProps {
  isOpen: boolean
  onClose: () => void
  /** Snapshot of the queue to triage (taken when opened). */
  initialQueue: FeedItem[]
  /** Where to start in the queue (gallery click jumps to the clicked item). */
  startIndex: number
  /** Retained for API compatibility — tags are not surfaced in Matter triage. */
  availableTags: { tag: string; count: number }[]
  /** Notify the feed so it can drop archived/deleted items without a refetch. */
  onItemResolved?: (id: string, action: 'archive' | 'delete') => void
  /** Notify the feed an archive was undone, so it can restore the item + unread count. */
  onItemRestored?: (item: FeedItem) => void
  onTagAdd?: (id: string, tag: string) => void
  onTagRemove?: (id: string, tag: string) => void
}

type UndoAction =
  | { type: 'archive'; item: FeedItem; index: number }
  | { type: 'keep'; index: number }
  | { type: 'delete'; item: FeedItem; index: number; timer: ReturnType<typeof setTimeout> }

const SWIPE_THRESHOLD = 90

export function TriageMode({
  isOpen,
  onClose,
  initialQueue,
  startIndex,
  onItemResolved,
  onItemRestored,
}: TriageModeProps) {
  const [queue, setQueue] = useState<FeedItem[]>([])
  const [index, setIndex] = useState(0)
  const [streak, setStreak] = useState<Streak>({ current: 0, longest: 0 })
  const [celebrate, setCelebrate] = useState<string | null>(null)
  const [undo, setUndo] = useState<UndoAction | null>(null)
  const [exiting, setExiting] = useState<'left' | 'right' | 'down' | null>(null)
  // Horizontal drag (Later/Done) and downward drag (Delete) for live swipe feedback.
  const [drag, setDrag] = useState(0)
  const [dragY, setDragY] = useState(0)
  // Transient confirmation for the Copy / Share buttons.
  const [flash, setFlash] = useState<null | 'copied' | 'shared'>(null)
  // Immersive mode (full-bleed video only): tap the video to hide all chrome
  // (dock, top bar, caption) for unobstructed viewing; tap again to restore.
  const [immersive, setImmersive] = useState(false)
  // Count of cleared items (Done + Delete) this session. Drives the shrinking
  // "N left" counter + progress bar — the dopamine of clearing the backlog.
  // "Later" deliberately doesn't count (the item stays unread for next time).
  const [cleared, setCleared] = useState(0)

  const recordedRef = useRef(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isMobile = useIsMobile()
  const total = queue.length
  // Backlog still to clear — shrinks on Done/Delete, NOT on Later.
  const remaining = Math.max(0, total - cleared)
  const current = index < queue.length ? queue[index] : null
  const finished = index >= queue.length
  // On phones, media posts take over the whole screen (Reels/TikTok style) and
  // the chrome (top bar + dock) overlays the media in white. Everything else
  // (desktop, or article/quote/text on mobile) uses the light framed layout.
  const fullBleed = isMobile && !!current && isFullBleedCandidate(current)

  // --- seed queue from the snapshot on open; load streak for display ---
  useEffect(() => {
    if (!isOpen) return
    setQueue(initialQueue)
    setIndex(startIndex)
    setImmersive(false)
    setCleared(0)
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

  // --- record a triage day on the first action of the session ---
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
        if (s.grew > 0) {
          setCelebrate(`🔥 ${s.current}-day streak!`)
          setTimeout(() => setCelebrate(null), 1800)
        }
      })
      .catch(() => {})
  }, [])

  const clearUndoTimer = () => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    undoTimer.current = null
  }

  const advance = useCallback(() => {
    setExiting(null)
    setDrag(0)
    setDragY(0)
    setImmersive(false) // each new card starts with chrome visible
    setIndex((i) => i + 1)
  }, [])

  // --- actions ---
  // Done: mark read and advance (the design's green "Done"; same handler as before).
  const archive = useCallback(() => {
    if (!current) return
    recordStreak()
    const item = current
    fetch(`/api/bookmarks/${item.id}/read`, { method: 'POST' }).catch(() => {})
    onItemResolved?.(item.id, 'archive')
    clearUndoTimer()
    setUndo({ type: 'archive', item, index })
    setCleared((c) => c + 1) // Done counts as progress
    setExiting('right')
    setTimeout(advance, 220)
  }, [current, index, recordStreak, advance, onItemResolved])

  // Later: defer — advance without changing read state.
  const keep = useCallback(() => {
    if (!current) return
    recordStreak()
    clearUndoTimer()
    setUndo({ type: 'keep', index })
    setExiting('left')
    setTimeout(advance, 220)
  }, [current, index, recordStreak, advance])

  const del = useCallback(() => {
    if (!current) return
    recordStreak()
    const item = current
    // Deferred delete: commit after the undo window so undo is a real revert.
    clearUndoTimer()
    const timer = setTimeout(() => {
      fetch(`/api/bookmarks/${item.id}`, { method: 'DELETE' }).catch(() => {})
      onItemResolved?.(item.id, 'delete')
      setUndo((u) => (u && u.type === 'delete' && u.item.id === item.id ? null : u))
    }, 5000)
    undoTimer.current = timer
    setUndo({ type: 'delete', item, index, timer })
    setCleared((c) => c + 1) // Delete counts as progress
    setExiting('down')
    setTimeout(advance, 220)
  }, [current, index, recordStreak, advance, onItemResolved])

  const doUndo = useCallback(() => {
    if (!undo) return
    if (undo.type === 'archive') {
      fetch(`/api/bookmarks/${undo.item.id}/read`, { method: 'DELETE' }).catch(() => {})
      // archive decremented the feed's unread count immediately — restore it
      onItemRestored?.(undo.item)
      setCleared((c) => Math.max(0, c - 1)) // undid a Done → restore the count
    } else if (undo.type === 'delete') {
      clearUndoTimer() // cancel the pending delete — nothing was deleted yet
      setCleared((c) => Math.max(0, c - 1)) // undid a Delete → restore the count
    }
    setIndex(undo.index)
    setExiting(null)
    setDrag(0)
    setUndo(null)
  }, [undo, onItemRestored])

  // Copy the current post's on-ADHX preview link to the clipboard.
  const copyCurrent = useCallback(async () => {
    if (!current) return
    if (await copyPreviewLink(current)) {
      setFlash('copied')
      setTimeout(() => setFlash(null), 1600)
    }
  }, [current])

  // Share the link via the native share sheet (falls back to copy on desktop).
  const shareCurrent = useCallback(async () => {
    if (!current) return
    const result = await sharePreviewLink(current)
    if (result === 'shared' || result === 'copied') {
      setFlash(result === 'shared' ? 'shared' : 'copied')
      setTimeout(() => setFlash(null), 1600)
    }
  }, [current])

  // --- keyboard: ← Later, → Done, ↓ Delete, U undo, Esc close ---
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          archive()
          break
        case 'ArrowLeft':
          e.preventDefault()
          keep()
          break
        case 'ArrowDown':
        case 'Backspace':
        case 'Delete':
          e.preventDefault()
          del()
          break
        case 'u':
        case 'U':
          doUndo()
          break
        case 'Escape':
          onClose()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, archive, keep, del, doUndo, onClose])

  // Lock the underlying page while triage is open, so wheel/touch scrolling in
  // the empty areas doesn't scroll the collection behind the overlay.
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  // Auto-dismiss the undo toast so it isn't a permanent fixture. Deletes manage
  // their own lifetime (the toast must stay for the whole 5s undo window before
  // the delete commits), so only keep/archive toasts time out here.
  useEffect(() => {
    if (!undo || undo.type === 'delete') return
    const t = setTimeout(() => setUndo(null), 4000)
    return () => clearTimeout(t)
  }, [undo])

  // flush any pending delete when the mode closes
  useEffect(() => {
    if (isOpen) return
    if (undoTimer.current) {
      // commit immediately on close
      const u = undo
      if (u && u.type === 'delete') {
        fetch(`/api/bookmarks/${u.item.id}`, { method: 'DELETE' }).catch(() => {})
        onItemResolved?.(u.item.id, 'delete')
      }
      clearUndoTimer()
    }
    // reset transient state for next open
    setUndo(null)
    setDrag(0)
    setExiting(null)
  }, [isOpen])

  if (!isOpen) return null

  // --- touch handlers (live drag) ---
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.touches[0].clientX - touchStart.current.x
    const dy = e.touches[0].clientY - touchStart.current.y
    // Horizontal gesture → Later/Done. A downward gesture → Delete, but ONLY for
    // full-bleed media (which doesn't scroll). Framed text/articles/quotes are
    // scrollable, so we leave the vertical axis to native scroll there —
    // otherwise scrolling back up fires the delete swipe.
    if (Math.abs(dx) > Math.abs(dy)) {
      setDrag(dx)
      setDragY(0)
    } else if (fullBleed) {
      setDragY(Math.max(0, dy))
      setDrag(0)
    }
  }
  const onTouchEnd = () => {
    // Swipe direction matches the card flight + the keyboard arrows:
    // right → Done (flies right), left → Later (flies left), down → Delete.
    if (drag > SWIPE_THRESHOLD) archive()
    else if (drag < -SWIPE_THRESHOLD) keep()
    else if (dragY > SWIPE_THRESHOLD) del()
    else {
      setDrag(0)
      setDragY(0)
    }
    touchStart.current = null
  }

  const cardTransform = exiting
    ? exiting === 'left'
      ? 'translateX(-130%) rotate(-12deg)'
      : exiting === 'right'
        ? 'translateX(130%) rotate(12deg)'
        : 'translateY(130%)'
    : drag !== 0
      ? `translateX(${drag}px) rotate(${drag / 30}deg)`
      : dragY !== 0
        ? `translateY(${dragY}px)`
        : undefined

  // The bar tracks session position — how far through the queue you've moved
  // (advances on every action, including Later) — so cycling always shows
  // forward motion. The "N left" count is the dopamine signal (Done/Delete only).
  const progress = total ? (Math.min(index, total) / total) * 100 : 0

  return (
    // Full-screen focus surface. Media posts on mobile go full-bleed on black;
    // everything else uses the light Matter focus surface. Click backdrop to close.
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col overflow-hidden',
        fullBleed ? 'bg-black' : 'bg-focus-bg',
      )}
      onClick={onClose}
    >
      {/* Ambient edge glows — decorative, not buttons. Hidden under full-bleed media. */}
      {!fullBleed && (
        <>
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-[150px] z-[1]"
            style={{
              background:
                'linear-gradient(to right, color-mix(in srgb, var(--m-accent) 20%, transparent), transparent)',
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-[150px] z-[1]"
            style={{ background: 'linear-gradient(to left, rgba(16,185,129,.16), transparent)' }}
            aria-hidden
          />
        </>
      )}

      {/* Top bar (absolute): close · count · progress · streak — one line, even on mobile.
          Fades out in immersive (tap-to-hide) mode. */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 z-[6] flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 transition-opacity duration-200',
          immersive && 'opacity-0 pointer-events-none',
        )}
      >
        <button
          onClick={onClose}
          className={cn(
            'w-[38px] h-[38px] flex-none rounded-full flex items-center justify-center hover:opacity-80 transition-opacity',
            fullBleed ? 'bg-black/40 backdrop-blur text-white' : 'bg-fsurface text-fink-2',
          )}
          aria-label="Exit triage"
        >
          <X className="w-[19px] h-[19px]" />
        </button>
        <span
          className={cn(
            'font-mono text-sm font-medium min-w-[62px] flex-none',
            fullBleed ? 'text-white/90 drop-shadow' : 'text-fink-2',
          )}
        >
          {finished ? `${cleared} done` : `${remaining} left`}
        </span>
        <div
          className={cn(
            'flex-1 h-[5px] rounded-full overflow-hidden',
            fullBleed ? 'bg-white/25' : 'bg-fline',
          )}
        >
          <div
            className="h-full bg-clay-grad transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        {current && (
          <div className="flex-none flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                copyCurrent()
              }}
              className={cn(
                'w-[38px] h-[38px] rounded-full flex items-center justify-center hover:opacity-80 transition-opacity',
                fullBleed ? 'bg-black/40 backdrop-blur text-white' : 'bg-fsurface text-fink-2',
              )}
              aria-label="Copy link to this post"
              title="Copy link"
            >
              {flash === 'copied' ? (
                <Check className="w-[18px] h-[18px]" />
              ) : (
                <Link2 className="w-[18px] h-[18px]" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                shareCurrent()
              }}
              className={cn(
                'w-[38px] h-[38px] rounded-full flex items-center justify-center hover:opacity-80 transition-opacity',
                fullBleed ? 'bg-black/40 backdrop-blur text-white' : 'bg-fsurface text-fink-2',
              )}
              aria-label="Share this post"
              title="Share"
            >
              {flash === 'shared' ? (
                <Check className="w-[18px] h-[18px]" />
              ) : (
                <Share2 className="w-[18px] h-[18px]" />
              )}
            </button>
          </div>
        )}
        {streak.current > 0 && (
          <span
            className={cn(
              'flex-none inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap border',
              fullBleed
                ? 'px-2.5 py-1 text-xs bg-black/40 backdrop-blur text-white border-white/20'
                : 'px-3 py-1.5 text-[13px] bg-flame/15 text-flame border-flame/30',
            )}
          >
            <Flame className="w-[15px] h-[15px]" fill="currentColor" />
            {/* Number only on mobile/full-bleed; "-day streak" appended on sm+. */}
            <span>
              {streak.current}
              {!fullBleed && <span className="hidden sm:inline">-day streak</span>}
            </span>
          </span>
        )}
      </div>

      {/* Body */}
      {fullBleed && current ? (
        // Full-bleed: media fills the screen; chrome above overlays it.
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 z-0 select-none touch-pan-y"
          style={{
            transform: cardTransform,
            opacity: exiting ? 0 : 1,
            transition:
              exiting || drag === 0 ? 'transform 0.22s ease, opacity 0.22s ease' : undefined,
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <MediaCard
            item={current}
            fullBleed
            immersive={immersive}
            onToggleImmersive={() => setImmersive((v) => !v)}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center px-6 sm:px-16 lg:px-24 pt-[72px] pb-[150px] overflow-hidden z-[2]">
          {finished ? (
            <div onClick={(e) => e.stopPropagation()}>
              <FinishCard total={total} streak={streak} onClose={onClose} />
            </div>
          ) : current ? (
            <div
              // Click-away: clicks on the card keep triage open; clicks in the
              // surrounding gutter fall through to the backdrop. Also stay open if
              // the user just finished selecting text (mouseup may land off-card).
              onClick={(e) => {
                if (
                  (e.target as HTMLElement).closest('[data-triage-content]') ||
                  (window.getSelection()?.toString().length ?? 0) > 0
                ) {
                  e.stopPropagation()
                }
              }}
              className="w-full h-full flex items-center justify-center select-text touch-pan-y"
              style={{
                transform: cardTransform,
                opacity: exiting ? 0 : 1,
                transition:
                  exiting || (drag === 0 && dragY === 0)
                    ? 'transform 0.22s ease, opacity 0.22s ease'
                    : undefined,
              }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <MediaCard item={current} />
            </div>
          ) : null}
        </div>
      )}

      {/* Live swipe feedback: the action you're about to trigger, on the side
          the card is heading toward (left = Later, right = Done). */}
      {!finished && current && drag !== 0 && !exiting && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-[5] flex items-center',
            drag < 0 ? 'justify-start pl-6 sm:pl-14' : 'justify-end pr-6 sm:pr-14',
          )}
        >
          <div
            className="inline-flex items-center gap-2 rounded-2xl border-[3px] px-4 py-2.5 text-lg font-extrabold uppercase tracking-wide backdrop-blur"
            style={{
              opacity: Math.min(1, Math.abs(drag) / SWIPE_THRESHOLD),
              transform: `rotate(${drag < 0 ? -8 : 8}deg)`,
              color: drag < 0 ? 'var(--m-accent)' : 'var(--m-done)',
              borderColor: drag < 0 ? 'var(--m-accent)' : 'var(--m-done)',
              background: `color-mix(in srgb, ${drag < 0 ? 'var(--m-accent)' : 'var(--m-done)'} 14%, transparent)`,
            }}
          >
            {drag < 0 ? <Clock className="w-5 h-5" /> : <Check className="w-5 h-5" />}
            {drag < 0 ? 'Later' : 'Done'}
          </div>
        </div>
      )}

      {/* Live swipe feedback for a downward (Delete) gesture. */}
      {!finished && current && dragY > 0 && !exiting && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-end justify-center pb-28">
          <div
            className="inline-flex items-center gap-2 rounded-2xl border-[3px] px-4 py-2.5 text-lg font-extrabold uppercase tracking-wide backdrop-blur"
            style={{
              opacity: Math.min(1, dragY / SWIPE_THRESHOLD),
              color: 'var(--m-fink-2)',
              borderColor: 'var(--m-fline)',
              background: 'color-mix(in srgb, var(--m-fink) 10%, transparent)',
            }}
          >
            <Trash2 className="w-5 h-5" />
            Delete
          </div>
        </div>
      )}

      {/* Action dock (bottom-center): labelled glass buttons (tap or swipe), each
          showing its swipe/keyboard direction (Later ←, Delete ↓, Done →). Fades
          out in immersive (tap-to-hide) mode. */}
      {!finished && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'absolute bottom-6 left-0 right-0 z-[7] flex flex-col items-center gap-3 transition-opacity duration-200',
            immersive && 'opacity-0 pointer-events-none',
          )}
        >
          <div className="flex items-end gap-6 sm:gap-[40px]">
            <DockButton onClick={keep} label="Later" tone="primary" arrow="left" onDark={fullBleed}>
              <Clock className="w-[25px] h-[25px]" />
            </DockButton>
            <DockButton onClick={del} label="Delete" tone="outline" arrow="down" onDark={fullBleed}>
              <Trash2 className="w-[22px] h-[22px]" />
            </DockButton>
            <DockButton onClick={archive} label="Done" tone="done" arrow="right" onDark={fullBleed}>
              <Check className="w-[25px] h-[25px]" />
            </DockButton>
          </div>
        </div>
      )}

      {/* Undo toast */}
      {undo && !finished && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed bottom-[150px] left-1/2 -translate-x-1/2 z-[8] flex items-center gap-3 bg-fsurface border border-fline text-fink px-4 py-2 rounded-full shadow-m-lg text-sm"
        >
          <span>
            {undo.type === 'archive' ? 'Done' : undo.type === 'delete' ? 'Deleted' : 'Later'}
          </span>
          <button onClick={doUndo} className="flex items-center gap-1 font-semibold text-clay">
            <Undo2 className="w-4 h-4" /> Undo
          </button>
        </div>
      )}

      {/* Copy / share confirmation toast */}
      {flash && (
        <div className="fixed top-[68px] left-1/2 -translate-x-1/2 z-[9] bg-fink text-fsurface px-4 py-2 rounded-full text-sm font-semibold shadow-m-lg">
          {flash === 'shared' ? 'Shared' : 'Link copied'}
        </div>
      )}

      {/* Streak celebration */}
      {celebrate && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-[9]">
          <div className="bg-flame text-white px-6 py-3 rounded-2xl text-xl font-bold shadow-m-lg animate-bounce flex items-center gap-2">
            <Flame className="w-6 h-6" fill="currentColor" /> {celebrate}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * "Apple-glass" dock button — translucent fill + backdrop blur. Later = accent
 * glass, Delete = subtle outline glass, Done = green glass. The whole stack
 * (circle + label) is the tap target, so it works by tap as well as swipe, and
 * the label + direction arrow say what each action does.
 */
function DockButton({
  onClick,
  label,
  tone,
  arrow,
  onDark = false,
  children,
}: {
  onClick: () => void
  label: string
  tone: 'primary' | 'outline' | 'done'
  /** The gesture/keyboard direction for this action, shown next to the label. */
  arrow?: 'left' | 'right' | 'down'
  onDark?: boolean
  children: React.ReactNode
}) {
  const Arrow = arrow === 'left' ? ArrowLeft : arrow === 'right' ? ArrowRight : ArrowDown
  const big = tone !== 'outline'
  const background =
    tone === 'primary'
      ? 'color-mix(in srgb, var(--m-accent) 66%, transparent)'
      : tone === 'done'
        ? 'color-mix(in srgb, var(--m-done) 66%, transparent)'
        : onDark
          ? 'rgba(255,255,255,.12)'
          : 'color-mix(in srgb, var(--m-fink) 8%, transparent)'
  const borderColor =
    tone === 'outline'
      ? onDark
        ? 'rgba(255,255,255,.4)'
        : 'var(--m-fline)'
      : 'rgba(255,255,255,.4)'
  const iconColor = tone === 'outline' && !onDark ? 'text-fink-2' : 'text-white'
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="group flex flex-col items-center gap-1.5"
    >
      <span
        className={cn(
          'rounded-full border flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95',
          big ? 'w-16 h-16' : 'w-[54px] h-[54px]',
          iconColor,
        )}
        style={{
          background,
          borderColor,
          backdropFilter: 'blur(16px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
          boxShadow: big ? '0 8px 24px rgba(0,0,0,.18)' : undefined,
        }}
      >
        {children}
      </span>
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[13px] font-semibold leading-none',
          onDark ? 'text-white drop-shadow' : 'text-fink',
        )}
      >
        {arrow === 'left' && <Arrow className="w-3.5 h-3.5" />}
        {label}
        {arrow && arrow !== 'left' && <Arrow className="w-3.5 h-3.5" />}
      </span>
    </button>
  )
}

function FinishCard({
  total,
  streak,
  onClose,
}: {
  total: number
  streak: Streak
  onClose: () => void
}) {
  return (
    <div className="text-center max-w-sm">
      <PartyPopper className="w-16 h-16 mx-auto mb-4 text-clay" />
      <h2 className="font-serif text-2xl font-semibold text-fink mb-2">
        {total > 0 ? 'Backlog cleared!' : 'Nothing to triage'}
      </h2>
      {total > 0 ? (
        <p className="text-fink-2 mb-1">
          You processed {total} {total === 1 ? 'item' : 'items'}.
        </p>
      ) : (
        <p className="text-fink-2 mb-1">Your unread queue is empty. Nice.</p>
      )}
      {streak.current > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-flame font-semibold text-lg mb-1">
          <Flame className="w-5 h-5" fill="currentColor" /> {streak.current}-day streak
        </p>
      )}
      <p className="text-fink-3 text-sm mb-6">Come back tomorrow to keep your streak alive.</p>
      <button
        onClick={onClose}
        className="px-6 py-2.5 bg-clay-grad text-white rounded-full font-semibold shadow-glow hover:opacity-90 transition-opacity"
      >
        Done
      </button>
    </div>
  )
}
