'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X,
  Check,
  Clock,
  Trash2,
  Flame,
  Undo2,
  ExternalLink,
  Play,
  Loader2,
  Sparkles,
  PartyPopper,
} from 'lucide-react'
import type { FeedItem } from './types'
import { AuthorAvatar } from './AuthorAvatar'
import { renderTextWithLinks, stripMediaUrls, isTouchDevice } from './utils'

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
  filter: string
  platformFilter: string
  search: string
  selectedTags: string[]
  availableTags: { tag: string; count: number }[]
  /** Notify the feed so it can drop archived/deleted items without a refetch. */
  onItemResolved?: (id: string, action: 'archive' | 'delete') => void
}

type UndoAction =
  | { type: 'archive'; item: FeedItem; index: number }
  | { type: 'keep'; index: number }
  | { type: 'delete'; item: FeedItem; index: number; timer: ReturnType<typeof setTimeout> }

const SWIPE_THRESHOLD = 90

export function TriageMode({
  isOpen,
  onClose,
  filter,
  platformFilter,
  search,
  selectedTags,
  availableTags,
  onItemResolved,
}: TriageModeProps) {
  const [queue, setQueue] = useState<FeedItem[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
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
  const finished = !loading && index >= queue.length

  // --- load queue + streak on open ---
  useEffect(() => {
    if (!isOpen) return
    setIsTouch(isTouchDevice())
    let cancelled = false
    setLoading(true)
    recordedRef.current = false

    const params = new URLSearchParams({ unreadOnly: 'true', limit: '100' })
    if (filter !== 'all') params.set('filter', filter)
    if (platformFilter !== 'all') params.set('platform', platformFilter)
    if (search) params.set('search', search)
    selectedTags.forEach((t) => params.append('tag', t))

    Promise.all([
      fetch(`/api/feed?${params}`).then((r) => (r.ok ? r.json() : { items: [] })),
      fetch(`/api/triage/streak?today=${localToday()}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([feed, s]) => {
        if (cancelled) return
        setQueue(feed.items || [])
        setIndex(0)
        if (s) setStreak({ current: s.current ?? 0, longest: s.longest ?? 0 })
      })
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [isOpen, filter, platformFilter, search, selectedTags])

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
    } else if (undo.type === 'delete') {
      clearUndoTimer() // cancel the pending delete — nothing was deleted yet
    }
    setIndex(undo.index)
    setExiting(null)
    setDrag(0)
    setUndo(null)
  }, [undo])

  const quickTag = useCallback(
    (tag: string) => {
      if (!current) return
      fetch(`/api/bookmarks/${current.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      }).catch(() => {})
      setQueue((q) =>
        q.map((it, i) =>
          i === index && !it.tags.includes(tag) ? { ...it, tags: [...it.tags, tag] } : it,
        ),
      )
    },
    [current, index],
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
    <div className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex flex-col">
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
        {loading ? (
          <Loader2 className="w-8 h-8 text-white/70 animate-spin" />
        ) : finished ? (
          <FinishCard total={total} streak={streak} onClose={onClose} />
        ) : current ? (
          <div className="w-full max-w-md flex flex-col items-center gap-4">
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
              <TriageCard item={current} />
            </div>

            {/* Quick tags */}
            {availableTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center max-w-md">
                {availableTags.slice(0, 6).map(({ tag }) => {
                  const applied = current.tags.includes(tag)
                  return (
                    <button
                      key={tag}
                      onClick={() => quickTag(tag)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        applied
                          ? 'bg-purple-500 text-white'
                          : 'bg-white/10 text-white/80 hover:bg-white/20'
                      }`}
                    >
                      {applied ? '✓ ' : '#'}{tag}
                    </button>
                  )
                })}
              </div>
            )}

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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white text-gray-900 px-4 py-2 rounded-full shadow-lg text-sm">
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

function TriageCard({ item }: { item: FeedItem }) {
  const media = item.media?.[0]
  const isVideo = media?.mediaType === 'video' || media?.mediaType === 'animated_gif'
  const text = stripMediaUrls(item.text || '', !!media)
  const platformLabel =
    item.platform === 'instagram' ? 'Reel' : item.platform === 'tiktok' ? 'TikTok' : null

  return (
    <article className="w-full bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden max-h-[62vh] flex flex-col">
      <header className="flex items-center gap-3 p-3 flex-shrink-0">
        <AuthorAvatar src={item.authorProfileImageUrl} author={item.author} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 dark:text-white truncate">
            {item.authorName || item.author}
          </p>
          <p className="text-xs text-gray-500 truncate">
            @{item.author}
            {platformLabel ? ` · ${platformLabel}` : ''}
          </p>
        </div>
        <a
          href={item.tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          aria-label="Open source"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </header>

      <div className="overflow-y-auto px-3 pb-3 flex flex-col gap-3">
        {text && (
          <p className="text-[15px] leading-relaxed text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {renderTextWithLinks(text)}
          </p>
        )}

        {item.summary && (
          <div className="flex items-start gap-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700 dark:text-gray-300">{item.summary}</p>
          </div>
        )}

        {media?.thumbnailUrl && (
          <div className="relative rounded-xl overflow-hidden bg-black">
            <img
              src={media.thumbnailUrl}
              alt=""
              className="w-full max-h-[34vh] object-cover"
              referrerPolicy="no-referrer"
            />
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="w-12 h-12 bg-black/60 rounded-full flex items-center justify-center">
                  <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
                </span>
              </div>
            )}
          </div>
        )}

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.map((t) => (
              <span key={t} className="px-2 py-0.5 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
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
