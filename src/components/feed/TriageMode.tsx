'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Check, Clock, Trash2, Flame, Undo2, PartyPopper } from 'lucide-react'
import type { FeedItem } from './types'
import { MediaCard } from './MediaCard'
import { isTouchDevice } from './utils'

/** User's LOCAL calendar day as YYYY-MM-DD (streaks are per the user's days). */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  availableTags,
  onItemResolved,
  onItemRestored,
  onTagAdd,
  onTagRemove,
}: TriageModeProps) {
  const [queue, setQueue] = useState<FeedItem[]>([])
  const [index, setIndex] = useState(0)
  const [streak, setStreak] = useState<Streak>({ current: 0, longest: 0 })
  const [celebrate, setCelebrate] = useState<string | null>(null)
  const [undo, setUndo] = useState<UndoAction | null>(null)
  const [exiting, setExiting] = useState<'left' | 'right' | 'up' | null>(null)
  const [drag, setDrag] = useState(0)
  const [isTouch, setIsTouch] = useState(false)

  const recordedRef = useRef(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const total = queue.length
  const done = Math.min(index, total)
  const current = index < queue.length ? queue[index] : null
  const finished = index >= queue.length

  // --- seed queue from the snapshot on open; load streak for display ---
  useEffect(() => {
    if (!isOpen) return
    setIsTouch(isTouchDevice())
    setQueue(initialQueue)
    setIndex(startIndex)
    recordedRef.current = false

    let cancelled = false
    fetch(`/api/triage/streak?today=${localToday()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => !cancelled && s && setStreak({ current: s.current ?? 0, longest: s.longest ?? 0 }))
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
    setIndex((i) => i + 1)
  }, [])

  // --- actions ---
  const archive = useCallback(() => {
    if (!current) return
    recordStreak()
    const item = current
    fetch(`/api/bookmarks/${item.id}/read`, { method: 'POST' }).catch(() => {})
    onItemResolved?.(item.id, 'archive')
    clearUndoTimer()
    setUndo({ type: 'archive', item, index })
    setExiting('left')
    setTimeout(advance, 220)
  }, [current, index, recordStreak, advance, onItemResolved])

  const keep = useCallback(() => {
    if (!current) return
    recordStreak()
    clearUndoTimer()
    setUndo({ type: 'keep', index })
    setExiting('right')
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
    setExiting('up')
    setTimeout(advance, 220)
  }, [current, index, recordStreak, advance, onItemResolved])

  const doUndo = useCallback(() => {
    if (!undo) return
    if (undo.type === 'archive') {
      fetch(`/api/bookmarks/${undo.item.id}/read`, { method: 'DELETE' }).catch(() => {})
      // archive decremented the feed's unread count immediately — restore it
      onItemRestored?.(undo.item)
    } else if (undo.type === 'delete') {
      clearUndoTimer() // cancel the pending delete — nothing was deleted yet
    }
    setIndex(undo.index)
    setExiting(null)
    setDrag(0)
    setUndo(null)
  }, [undo, onItemRestored])

  const addTag = useCallback(
    (tag: string) => {
      if (!current || current.tags.includes(tag)) return
      onTagAdd?.(current.id, tag)
      setQueue((q) => q.map((it, i) => (i === index ? { ...it, tags: [...it.tags, tag] } : it)))
    },
    [current, index, onTagAdd],
  )

  const removeTag = useCallback(
    (tag: string) => {
      if (!current) return
      onTagRemove?.(current.id, tag)
      setQueue((q) => q.map((it, i) => (i === index ? { ...it, tags: it.tags.filter((t) => t !== tag) } : it)))
    },
    [current, index, onTagRemove],
  )

  // --- keyboard ---
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault(); archive(); break
        case 'ArrowLeft':
          e.preventDefault(); keep(); break
        case 'Backspace':
        case 'Delete':
          e.preventDefault(); del(); break
        case 'u':
        case 'U':
          doUndo(); break
        case 'Escape':
          onClose(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, archive, keep, del, doUndo, onClose])

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
    if (Math.abs(dx) > Math.abs(dy)) setDrag(dx)
  }
  const onTouchEnd = () => {
    if (drag > SWIPE_THRESHOLD) keep()
    else if (drag < -SWIPE_THRESHOLD) archive()
    else setDrag(0)
    touchStart.current = null
  }

  const cardTransform = exiting
    ? exiting === 'left'
      ? 'translateX(-130%) rotate(-12deg)'
      : exiting === 'right'
        ? 'translateX(130%) rotate(12deg)'
        : 'translateY(-130%)'
    : drag !== 0
      ? `translateX(${drag}px) rotate(${drag / 30}deg)`
      : undefined

  return (
    // Click anywhere on the backdrop (outside the card/actions) to close.
    <div className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex flex-col" onClick={onClose}>
      {/* Header: progress + streak + close */}
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full" aria-label="Exit triage">
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs mb-1">
            <span>{finished ? `${total} done` : `${done} / ${total}`}</span>
            {streak.current > 0 && (
              <span className="flex items-center gap-1 text-orange-300 font-medium">
                <Flame className="w-3.5 h-3.5" /> {streak.current}-day streak
              </span>
            )}
          </div>
          <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-400 to-pink-400 transition-all duration-300"
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex items-center justify-center px-4 pb-4 overflow-hidden">
        {finished ? (
          <div onClick={(e) => e.stopPropagation()}>
            <FinishCard total={total} streak={streak} onClose={onClose} />
          </div>
        ) : current ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full flex flex-col items-center gap-4 ${
              current.media?.length || current.articlePreview?.imageUrl ? 'max-w-md lg:max-w-4xl' : 'max-w-md lg:max-w-xl'
            }`}
          >
            <div
              className="w-full select-none touch-pan-y"
              style={{
                transform: cardTransform,
                opacity: exiting ? 0 : 1,
                transition: exiting || drag === 0 ? 'transform 0.22s ease, opacity 0.22s ease' : undefined,
              }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <MediaCard item={current} />
            </div>

            {/* Tags: applied (tap to remove) + a few suggestions (tap to add) */}
            <div className="flex flex-wrap gap-1.5 justify-center max-w-lg">
              {current.tags.map((t) => (
                <button
                  key={t}
                  onClick={() => removeTag(t)}
                  className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500 text-white hover:bg-purple-600 flex items-center gap-1 transition-colors"
                >
                  #{t} <X className="w-3 h-3" />
                </button>
              ))}
              {availableTags
                .filter((a) => !current.tags.includes(a.tag))
                .slice(0, 6)
                .map(({ tag }) => (
                  <button
                    key={tag}
                    onClick={() => addTag(tag)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
            </div>

            {/* Action bar */}
            <div className="flex items-center gap-3">
              <ActionButton onClick={keep} label="Keep" sub={isTouch ? 'swipe →' : '←'} tone="neutral">
                <Clock className="w-6 h-6" />
              </ActionButton>
              <ActionButton onClick={del} label="Delete" tone="danger" small>
                <Trash2 className="w-5 h-5" />
              </ActionButton>
              <ActionButton onClick={archive} label="Archive" sub={isTouch ? 'swipe ←' : '→'} tone="primary">
                <Check className="w-6 h-6" />
              </ActionButton>
            </div>
          </div>
        ) : null}
      </div>

      {/* Undo toast */}
      {undo && !finished && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white text-gray-900 px-4 py-2 rounded-full shadow-lg text-sm"
        >
          <span>
            {undo.type === 'archive' ? 'Archived' : undo.type === 'delete' ? 'Deleted' : 'Kept'}
          </span>
          <button onClick={doUndo} className="flex items-center gap-1 font-semibold text-purple-600">
            <Undo2 className="w-4 h-4" /> Undo
          </button>
        </div>
      )}

      {/* Streak celebration */}
      {celebrate && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-orange-500 text-white px-6 py-3 rounded-2xl text-xl font-bold shadow-2xl animate-bounce flex items-center gap-2">
            <Flame className="w-6 h-6" /> {celebrate}
          </div>
        </div>
      )}
    </div>
  )
}

function ActionButton({
  onClick,
  label,
  sub,
  tone,
  small,
  children,
}: {
  onClick: () => void
  label: string
  sub?: string
  tone: 'primary' | 'neutral' | 'danger'
  small?: boolean
  children: React.ReactNode
}) {
  const colors =
    tone === 'primary'
      ? 'bg-green-500 hover:bg-green-600 text-white'
      : tone === 'danger'
        ? 'bg-white/10 hover:bg-red-500/80 text-white/70 hover:text-white'
        : 'bg-white/10 hover:bg-white/20 text-white'
  const size = small ? 'w-11 h-11' : 'w-14 h-14'
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1" aria-label={label}>
      <span className={`${size} rounded-full flex items-center justify-center transition-colors ${colors}`}>
        {children}
      </span>
      <span className="text-[10px] text-white/60">
        {label}
        {sub ? ` · ${sub}` : ''}
      </span>
    </button>
  )
}

function FinishCard({ total, streak, onClose }: { total: number; streak: Streak; onClose: () => void }) {
  return (
    <div className="text-center text-white max-w-sm">
      <PartyPopper className="w-16 h-16 mx-auto mb-4 text-purple-300" />
      <h2 className="text-2xl font-bold mb-2">{total > 0 ? 'Backlog cleared!' : 'Nothing to triage'}</h2>
      {total > 0 ? (
        <p className="text-white/70 mb-1">You processed {total} {total === 1 ? 'item' : 'items'}.</p>
      ) : (
        <p className="text-white/70 mb-1">Your unread queue is empty. Nice.</p>
      )}
      {streak.current > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-orange-300 font-semibold text-lg mb-1">
          <Flame className="w-5 h-5" /> {streak.current}-day streak
        </p>
      )}
      <p className="text-white/50 text-sm mb-6">Come back tomorrow to keep your streak alive.</p>
      <button
        onClick={onClose}
        className="px-6 py-2.5 bg-white text-gray-900 rounded-full font-semibold hover:bg-white/90"
      >
        Done
      </button>
    </div>
  )
}
