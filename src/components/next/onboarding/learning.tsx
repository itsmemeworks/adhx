'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * "Getting to know your saves": how far the understanding pipeline has got
 * with this user's saves (`/api/understanding/status`). A quiet ring while
 * it works; tap it for the details. Copy says only what is true: words are
 * read, pictures looked at, videos watched a frame every two seconds (no
 * audio), all on ADHX's own servers.
 */

export interface LearningStatus {
  enabled: boolean
  groups: { id: 'words' | 'photos' | 'videos'; done: number; total: number; failed: number }[]
  ready: number
  totalSaves: number
  failed: number
  queued: number
  current: { kind: 'text' | 'image' | 'video'; phase: string; frames: number } | null
}

export interface LearningRow {
  id: 'words' | 'photos' | 'videos'
  label: string
  sub: string
  done: number
  total: number
}

const ROW_COPY: Record<LearningRow['id'], { label: string; sub: string }> = {
  words: { label: 'Posts and articles', sub: 'Read every word' },
  photos: { label: 'Photos and video stills', sub: 'Looked at' },
  videos: { label: 'Videos', sub: 'Watched, a frame every two seconds' },
}

export interface LearningSummary {
  rows: LearningRow[]
  remaining: number
  /** What the pill talks about: the slowest kind still in progress. */
  focus: LearningRow | null
  failed: number
  /** 0–1 across everything. */
  progress: number
}

export function learningSummary(status: LearningStatus | null): LearningSummary {
  if (!status?.enabled) return { rows: [], remaining: 0, focus: null, failed: 0, progress: 1 }
  const rows = (['words', 'photos', 'videos'] as const)
    .map((id) => {
      const g = status.groups.find((x) => x.id === id)
      return { id, ...ROW_COPY[id], done: g?.done ?? 0, total: g?.total ?? 0 }
    })
    .filter((r) => r.total > 0)
  const remaining = rows.reduce((n, r) => n + Math.max(0, r.total - r.done), 0)
  const all = rows.reduce((n, r) => n + r.total, 0)
  const focus = [...rows].reverse().find((r) => r.done < r.total) ?? null
  return {
    rows,
    remaining,
    focus,
    failed: status.failed,
    progress: all ? rows.reduce((n, r) => n + r.done, 0) / all : 1,
  }
}

const NOUN: Record<LearningRow['id'], string> = {
  words: 'posts',
  photos: 'photos',
  videos: 'videos',
}

/** "Learning videos · 34/271" */
export function pillLabel(focus: LearningRow): string {
  return `Learning ${NOUN[focus.id]} · ${focus.done}/${focus.total}`
}

export function currentLine(current: LearningStatus['current']): string | null {
  if (!current) return null
  if (current.kind === 'video') {
    if (current.phase === 'sampling') return 'Picking frames from a video'
    if (current.phase === 'understanding')
      return current.frames ? `Watching a video · ${current.frames} frames` : 'Watching a video'
    return 'Opening a video'
  }
  if (current.kind === 'image') return 'Looking at a picture'
  return 'Reading a post'
}

/** Polls the status: often while something is being learned or the sheet is open, rarely otherwise. */
export function useLearningStatus(opts: { fast?: boolean } = {}): {
  status: LearningStatus | null
  refresh: () => void
} {
  const [status, setStatus] = useState<LearningStatus | null>(null)
  const timer = useRef<number | null>(null)
  const fastRef = useRef(opts.fast)
  fastRef.current = opts.fast

  const load = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current)
    let next: LearningStatus | null = null
    try {
      const res = await fetch('/api/understanding/status', { credentials: 'same-origin' })
      if (res.ok) next = (await res.json()) as LearningStatus
    } catch {
      next = null
    }
    if (next) setStatus(next)
    const busy = !!next && learningSummary(next).remaining > 0
    const delay = fastRef.current ? 3_000 : busy ? 8_000 : 60_000
    if (!document.hidden) timer.current = window.setTimeout(() => void load(), delay)
  }, [])

  useEffect(() => {
    void load()
    const onVisible = () => {
      if (!document.hidden) void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  return { status, refresh: () => void load() }
}

function Ring({ progress, size = 26 }: { progress: number; size?: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100)
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(#ffd23f ${pct}%, #444 0)` }}
    >
      <span className="rounded-full bg-[#1c1b19]" style={{ width: size - 8, height: size - 8 }} />
    </span>
  )
}

/** The quiet ring. Renders nothing once everything is understood. */
export function LearningPill({
  status,
  onOpen,
  className,
}: {
  status: LearningStatus | null
  onOpen: () => void
  className?: string
}) {
  const summary = learningSummary(status)
  if (!summary.focus && summary.failed === 0) return null
  // Everything else is done: keep a way to see and retry what failed.
  const label = summary.focus ? pillLabel(summary.focus) : `${summary.failed} couldn’t be learned`
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}. Show what’s being learned`}
      className={cn(
        'flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#3a352c] bg-[#1c1b19]/90 px-1.5 text-[13px] text-nx-cream sm:pr-3.5',
        className,
      )}
    >
      <Ring progress={summary.focus ? summary.focus.done / Math.max(1, summary.focus.total) : 1} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

export function LearningSheet({
  status,
  onClose,
  onRetried,
}: {
  status: LearningStatus | null
  onClose: () => void
  onRetried?: () => void
}) {
  const summary = learningSummary(status)
  const [retry, setRetry] = useState<'idle' | 'busy' | 'done'>('idle')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const doRetry = async () => {
    setRetry('busy')
    try {
      await fetch('/api/understanding/retry', { method: 'POST' })
      setRetry('done')
      onRetried?.()
    } catch {
      setRetry('idle')
    }
  }
  const now = currentLine(status?.current ?? null)

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/50"
      />
      <div
        role="dialog"
        aria-label="Getting to know your saves"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-[24px] bg-[#1c1b19] p-5 pb-[max(20px,env(safe-area-inset-bottom))] font-nx-sans text-white md:inset-x-auto md:bottom-auto md:right-6 md:top-20 md:w-[400px] md:rounded-[22px]"
      >
        <div className="flex items-start gap-3">
          <span className="flex flex-1 flex-col gap-1">
            <span className="font-nx-serif text-[28px] leading-none">
              Getting to know your saves
            </span>
            <span className="text-sm text-white/65">
              So you can find things by what’s in them, even inside videos.
            </span>
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
        {now && (
          <div className="flex items-center gap-3 rounded-2xl bg-black px-3.5 py-3">
            <span
              aria-hidden
              className="block h-[18px] w-[18px] shrink-0 animate-nx-spin rounded-full border-[3px] border-[#333] border-t-nx-accent"
            />
            <span className="text-sm">{now}</span>
          </div>
        )}
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {summary.rows.map((r) => {
            const done = r.done >= r.total
            return (
              <li key={r.id} className="flex flex-col gap-1.5">
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full',
                      done ? 'bg-nx-accent text-black' : 'border-2 border-white/30',
                    )}
                  >
                    {done && <Check className="h-3 w-3" strokeWidth={3.4} />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-bold">{r.label}</span>
                    <span className="text-xs text-white/55">{r.sub}</span>
                  </span>
                  <span className="text-[13px] tabular-nums text-white/70">{`${r.done} / ${r.total}`}</span>
                </span>
                <span aria-hidden className="block h-1.5 rounded-full bg-white/10">
                  <span
                    className={cn(
                      'block h-1.5 rounded-full',
                      done ? 'bg-[#7ddc8a]' : 'bg-nx-accent',
                    )}
                    style={{ width: `${Math.round((r.done / Math.max(1, r.total)) * 100)}%` }}
                  />
                </span>
              </li>
            )
          })}
        </ul>
        <p className="m-0 text-[13px] text-white/60">
          Up next and new saves jump the line, so what you’re about to watch gets learned first.
        </p>
        {summary.failed > 0 && (
          <div className="flex items-center gap-3 rounded-2xl bg-black px-3.5 py-3">
            <span className="flex-1 text-sm">
              {summary.failed === 1
                ? '1 couldn’t be learned'
                : `${summary.failed} couldn’t be learned`}
            </span>
            <button
              type="button"
              onClick={() => void doRetry()}
              disabled={retry !== 'idle'}
              className="flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[13px] font-bold disabled:opacity-60"
            >
              <RotateCcw aria-hidden className="h-3.5 w-3.5" />
              <span>{retry === 'done' ? 'Trying again' : 'Retry'}</span>
            </button>
          </div>
        )}
        <p className="m-0 text-xs text-white/45">
          Pictures and videos are understood on ADHX’s own servers.
        </p>
      </div>
    </>
  )
}
