'use client'

/**
 * Theater orchestrator (spec §3/§4/§5/§6/§8): a full-width <Stage/> with
 * overlaid chrome and a bottom filmstrip dock on desktop (the "Filmstrip
 * dock" layout — see <DesktopStageChrome/>/<DesktopDock/> in
 * TheaterDesktopChrome.tsx, which replaced the old right-hand <Rail/>).
 * Owns current-item state, keyboard nav, mute state, the seen model + preview
 * pulse, and next-item prefetch. See docs/specs/theater-first.md.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import type { FeedItem } from '@/components/feed/types'
import { Stage } from './Stage'
import { TriageStage } from './TriageStage'
import { StageWaiting } from './StageWaiting'
import { TriagePileClear } from './TriagePileClear'
import { DesktopStageChrome, DesktopDock } from './TheaterDesktopChrome'
import { TheaterMobileChrome } from './TheaterMobileChrome'
import { useTheaterFeed } from './useTheaterFeed'
import { useSeenSet } from './useSeenSet'
import { prefetchPlayback } from './usePlaybackSource'
import { TheaterProgressLine, progressKindFor } from './TheaterProgressLine'
import { feedItemToTheaterItem } from './collection-item'
import { theaterItemKey } from './types'
import { previewPath, sourceUrl } from '@/lib/activity/preview-path'
// SignInModal + useAuthMe are built by a parallel agent under the same
// accounts/magic-link PR — imported per the shared contract even though the
// module may not exist yet at review time; see the "Save collection" CTA
// below (collection mode only).
import { SignInModal, useAuthMe } from '@/components/auth'
// TagQuickPicker is built by a parallel agent (unified-theater-triage.md §4)
// — imported per the shared contract for the triage "Tag" action.
import { TagQuickPicker } from '@/components/tags'
import type {
  SaveCollectionStatus,
  TheaterCollectionMeta,
  TheaterFeedSeed,
  TheaterItem,
  TheaterMode,
  TheaterTriageChrome,
  TriageTab,
} from './types'

/** Stable empty key set for triage's Collection tab (no "fresh" concept there) — avoids allocating a new Set every render for something read-only. */
const EMPTY_KEY_SET: ReadonlySet<string> = new Set()

export interface TriageUndoAction {
  type: 'archive' | 'keep' | 'delete'
  item: FeedItem
  index: number
}

/** User's LOCAL calendar day as YYYY-MM-DD (streaks are per the user's days). */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface TriageKeyLike {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  target?: EventTarget | null
}

function isTriageTypingTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof HTMLElement === 'undefined') return false
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
}

export type TriageKeyAction = 'done' | 'later' | 'delete' | 'back' | 'undo' | 'close'

/**
 * Pure key → action mapping for triage mode's Collection tab
 * (docs/specs/unified-theater-triage.md §2). Preserves the deleted
 * `CollectionTheater.tsx`'s map VERBATIM — ArrowRight=Done, ArrowLeft=Later,
 * ArrowDown/Backspace/Delete=Delete, U=Undo, Escape=Close — and adds
 * ArrowUp=Back (step to the previous item without touching its read/delete
 * state; distinct from `U`, which reverses the *last* action).
 */
export function triageKeyAction(e: TriageKeyLike): TriageKeyAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  if (isTriageTypingTarget(e.target)) return null
  switch (e.key) {
    case 'ArrowRight':
      return 'done'
    case 'ArrowLeft':
      return 'later'
    case 'ArrowDown':
    case 'Backspace':
    case 'Delete':
      return 'delete'
    case 'ArrowUp':
      return 'back'
    case 'u':
    case 'U':
      return 'undo'
    case 'Escape':
      return 'close'
    default:
      return null
  }
}

/** Pure: does committing a pending delete-undo owe the server a DELETE call?
 * Only when the pending undo is itself a `'delete'` — an `'archive'`/`'keep'`
 * undo never scheduled one, so committing it (by doing nothing) is correct. */
export function shouldCommitDelete(undo: TriageUndoAction | null): boolean {
  return undo?.type === 'delete'
}

/** Pure: the triage queue index after Done/Later/Delete — always a plain
 * advance, regardless of which of the three actions fired. */
export function triageAdvance(index: number): number {
  return index + 1
}

/** Pure: the triage queue index after ArrowUp ("Back") — steps to the
 * previous item without going below the start of the queue. */
export function triageStepBackIndex(index: number): number {
  return Math.max(0, index - 1)
}

/**
 * Live viewport check matching Tailwind's `lg` breakpoint (1024px) — the JS
 * counterpart to the `lg:hidden`/`lg:flex` split between the mobile chrome
 * and the desktop rail. Needed because CSS `display: none` on the chrome's
 * wrapper only hides it VISUALLY — its effects (including the mobile
 * `TheaterProgressLine`'s 10s auto-advance timer) keep running underneath
 * regardless of viewport. Gating the chrome's `current` prop (and this hook's
 * own desktop-progress-line kind) on this flag is what keeps exactly one
 * 'timed' timer alive at a time; without it, a desktop viewer would get two
 * independent timers double-dispatching `theater-advance`. SSR-safe default
 * `false` (matches mobile) to avoid a hydration mismatch — the real value
 * settles a moment after mount.
 */
function useIsDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    setIsDesktop(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isDesktop
}

export interface TheaterShellProps {
  seed: TheaterFeedSeed
  mode?: TheaterMode
  /** Shared mode (PR 3): the post the visitor landed on — always the initial current item. */
  sharedItem?: TheaterItem
  /**
   * Whether the visiting user is signed in. Shared mode: swaps Connect for a
   * direct Save. Collection mode: initial SSR hint for the Save-collection
   * CTA — `useAuthMe()` inside the shell is the live source of truth (it can
   * change without a reload if sign-in completes in-modal).
   */
  authed?: boolean
  /** Collection mode (`/t/{username}/{tag}` — tag-collections-as-theater): identity + count driving the chrome and the Save-collection CTA. */
  collection?: TheaterCollectionMeta
  /**
   * Triage mode (`mode="triage"`, unified-theater-triage.md §2): the
   * snapshot of the authed Collection's unread queue to triage — same
   * contract as the deleted `CollectionTheater`'s `initialQueue`. Taken once
   * at mount; AuthedHome remounts the shell (conditional render) for a fresh
   * triage session rather than this prop changing underneath an open one.
   */
  triageItems?: FeedItem[]
  /** Where to start in the triage queue — a gallery click jumps to the clicked item (same contract as the deleted `CollectionTheater`'s `startIndex`). */
  initialTriageIndex?: number
  /** Which triage sub-tab to open on (the Triage pill vs. the Live pill in Header both dispatch `open-theater`, differing only in this). */
  initialTriageTab?: TriageTab
  /** Notify the Collection feed so it can drop archived/deleted items without a refetch. */
  onTriageResolved?: (id: string, action: 'archive' | 'delete') => void
  /** Notify the Collection feed an archive was undone, so it can restore the item + unread count. */
  onTriageRestored?: (item: FeedItem) => void
  /** Triage mode only — closes the overlay (it lives over `/`, there is no page to navigate back to). */
  onClose?: () => void
}

/** How long a post must stay staged before it counts as "seen" (spec §4/§5). */
const SEEN_DWELL_MS = 2_000

/**
 * Pure: move the item matching `pinnedKey` to the front of `items`, order
 * otherwise preserved. A missing key (not found, or already at index 0)
 * returns `items` unchanged (same reference) — cheap to call on every render.
 * Used so the rail's visual order and the keyboard-nav order are always the
 * same list: shared mode pins the shared post, home mode pins the lead pick,
 * once either is chosen.
 */
export function pinKeyFirst<
  T extends { platform: string; bookmarkId?: string | null; url: string },
>(items: T[], pinnedKey: string | null): T[] {
  if (!pinnedKey) return items
  const idx = items.findIndex((it) => theaterItemKey(it) === pinnedKey)
  if (idx <= 0) return items
  const copy = items.slice()
  const [pinned] = copy.splice(idx, 1)
  copy.unshift(pinned)
  return copy
}

/**
 * Pure: the canonical preview path to sync the address bar to for the given
 * item, or null when there isn't a well-formed one to sync to. `previewPath()`
 * happily builds a malformed path (e.g. `//status/123`) from an empty author,
 * so the "both an id AND an author are present" guard lives here rather than
 * there — a post missing either leaves the address bar alone.
 */
export function theaterUrlSyncPath(
  item: Pick<TheaterItem, 'platform' | 'bookmarkId' | 'author'> | null,
): string | null {
  if (!item || !item.bookmarkId || !item.author) return null
  return previewPath(item.platform, item.author, item.bookmarkId)
}

/**
 * Pure: does `index` sit at the tail of a `length`-long list? `-1` (key not
 * found) is never "the end" — that's a distinct no-op case, matching the
 * pre-waiting clamp behavior for a current item that's dropped out of the
 * list entirely.
 */
export function isFeedEnd(length: number, index: number): boolean {
  return index !== -1 && index === length - 1
}

/**
 * Pure: the peek bar's prev-chevron state, folding in the end-of-feed waiting
 * stage — while waiting there's always a "back to the last post" move.
 */
export function computeCanPrev(currentIndex: number, waiting: boolean): boolean {
  return waiting || currentIndex > 0
}

/**
 * Pure: the peek bar's next-chevron state. Advancing from the last real item
 * is exactly what leads INTO the waiting stage, so it stays enabled there;
 * once waiting, there's nowhere further to go until something new arrives.
 */
export function computeCanNext(currentIndex: number, waiting: boolean): boolean {
  return !waiting && currentIndex !== -1
}

/**
 * Pure: the first key in `freshKeys` that wasn't already there when the
 * waiting stage was entered (`baseline`) — the item the waiting stage
 * auto-plays into. Iteration follows `freshKeys`' insertion order, so if
 * several arrive between polls the earliest arrival stages first. `null`
 * when nothing genuinely new has shown up yet.
 */
export function findFreshArrival(
  freshKeys: ReadonlySet<string>,
  baseline: ReadonlySet<string>,
): string | null {
  for (const key of freshKeys) {
    if (!baseline.has(key)) return key
  }
  return null
}

/**
 * Pure: the index `goNext` should land on in a `length`-long list. Collection
 * mode (`loop: true`) wraps past the last item to `0` instead of entering the
 * end-of-feed waiting stage — `'waiting'` signals that non-loop case so the
 * caller can enter it. `null` when there's nowhere to go (key not found, or
 * an empty list).
 */
export function computeLoopedNext(
  length: number,
  index: number,
  loop: boolean,
): number | 'waiting' | null {
  if (index === -1 || length === 0) return null
  if (index === length - 1) return loop ? 0 : 'waiting'
  return index + 1
}

/**
 * Pure: the index `goPrev` should land on in a `length`-long list. Collection
 * mode (`loop: true`) wraps back from `0` to the last item. `null` when
 * there's nowhere to go (key not found, an empty list, or index 0 without
 * looping — the existing "back does nothing at the start" behavior).
 */
export function computeLoopedPrev(length: number, index: number, loop: boolean): number | null {
  if (index === -1 || length === 0) return null
  if (index === 0) return loop ? length - 1 : null
  return index - 1
}

export function TheaterShell({
  seed,
  mode = 'home',
  sharedItem,
  authed = false,
  collection,
  triageItems,
  initialTriageIndex,
  initialTriageTab,
  onTriageResolved,
  onTriageRestored,
  onClose,
}: TheaterShellProps) {
  const isTriage = mode === 'triage'
  // Collection mode (`/t/{username}/{tag}`) is a fixed, curated queue to loop
  // through — never a live blend with the anonymous community pulse. Triage
  // mode never loops either — its queue is a finite backlog with a real end
  // ("Pile clear"), not a wraparound.
  const loop = mode === 'collection'
  // Triage's Collection tab never blends the live pulse in; its Live tab
  // reuses the exact same live feed home/shared mode does.
  const [triageTab, setTriageTab] = useState<TriageTab>(initialTriageTab ?? 'collection')
  const isTriageCollection = isTriage && triageTab === 'collection'
  const feed = useTheaterFeed(seed, { live: !loop && !isTriageCollection })
  const seenSet = useSeenSet()
  const { items } = feed

  // --- Triage mode (unified-theater-triage.md §2): a separate, small state
  // machine ported from the deleted CollectionTheater/CollectionRail. It
  // deliberately does NOT share `items`/`currentKey`/goNext/goPrev with the
  // rest of the shell — those always describe the live pulse feed (used
  // directly by home/shared/collection modes, and by triage's OWN Live tab);
  // the triage queue below is a wholly separate, non-live, non-looping list.
  // The queue itself never mutates after the initial snapshot — Done/Later/
  // Delete only ever advance `triageIndex`, exactly like the deleted
  // `CollectionTheater` (which never spliced/replaced its `queue` either).
  const [triageQueue, setTriageQueue] = useState<FeedItem[]>(() => triageItems ?? [])
  const [triageIndex, setTriageIndex] = useState(() => Math.max(0, initialTriageIndex ?? 0))
  const [triageStreak, setTriageStreak] = useState<{ current: number; longest: number }>({
    current: 0,
    longest: 0,
  })
  const [triageUndo, setTriageUndo] = useState<TriageUndoAction | null>(null)
  const [triageSavedKeys, setTriageSavedKeys] = useState<Set<string>>(new Set())
  const [tagPickerItem, setTagPickerItem] = useState<{
    platform: string
    bookmarkId: string
  } | null>(null)
  const triageRecordedRef = useRef(false)
  const triageUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const triageTotal = triageQueue.length
  const triageRemaining = Math.max(0, triageTotal - triageIndex)
  const triageCurrentFeedItem: FeedItem | null =
    triageIndex < triageQueue.length ? triageQueue[triageIndex] : null
  const triageFinished = triageIndex >= triageQueue.length
  const triageDisplayItems = useMemo(() => triageQueue.map(feedItemToTheaterItem), [triageQueue])
  const triageProcessedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (let i = 0; i < Math.min(triageIndex, triageQueue.length); i++) {
      keys.add(theaterItemKey(feedItemToTheaterItem(triageQueue[i])))
    }
    return keys
  }, [triageQueue, triageIndex])
  const triageIsSeen = useCallback(
    (key: string) => triageProcessedKeys.has(key),
    [triageProcessedKeys],
  )

  // Triage streak card (Settings has the full version; this is the same
  // read/write pair CollectionTheater used).
  useEffect(() => {
    if (!isTriage) return
    let cancelled = false
    fetch(`/api/triage/streak?today=${localToday()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (s) =>
          !cancelled && s && setTriageStreak({ current: s.current ?? 0, longest: s.longest ?? 0 }),
      )
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isTriage])

  const recordTriageStreak = useCallback(() => {
    if (triageRecordedRef.current) return
    triageRecordedRef.current = true
    fetch('/api/triage/streak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ today: localToday() }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s) return
        setTriageStreak({ current: s.current, longest: s.longest })
      })
      .catch(() => {})
  }, [])

  const clearTriageUndoTimer = useCallback(() => {
    if (triageUndoTimerRef.current) clearTimeout(triageUndoTimerRef.current)
    triageUndoTimerRef.current = null
  }, [])

  // A pending delete must be COMMITTED (not just cancelled) when the next
  // action lands within its 5s undo window, or the previous delete silently
  // never reaches the server. `shouldCommitDelete()` is the pure "is one
  // owed" check; this does the actual fetch + notification.
  const commitPendingTriageDelete = useCallback(() => {
    if (!triageUndoTimerRef.current) return
    clearTriageUndoTimer()
    setTriageUndo((u) => {
      if (shouldCommitDelete(u) && u) {
        fetch(`/api/bookmarks/${u.item.id}?platform=${u.item.platform ?? 'twitter'}`, {
          method: 'DELETE',
        }).catch(() => {})
        onTriageResolved?.(u.item.id, 'delete')
      }
      return null
    })
  }, [clearTriageUndoTimer, onTriageResolved])

  // Done: mark read and advance.
  const triageDone = useCallback(() => {
    if (!triageCurrentFeedItem) return
    recordTriageStreak()
    const item = triageCurrentFeedItem
    const idx = triageIndex
    fetch(`/api/bookmarks/${item.id}/read?platform=${item.platform ?? 'twitter'}`, {
      method: 'POST',
    }).catch(() => {})
    onTriageResolved?.(item.id, 'archive')
    commitPendingTriageDelete()
    setTriageUndo({ type: 'archive', item, index: idx })
    setTriageIndex(triageAdvance)
  }, [
    triageCurrentFeedItem,
    triageIndex,
    recordTriageStreak,
    onTriageResolved,
    commitPendingTriageDelete,
  ])

  // Later: defer — advance without changing read state.
  const triageLater = useCallback(() => {
    if (!triageCurrentFeedItem) return
    recordTriageStreak()
    commitPendingTriageDelete()
    setTriageUndo({ type: 'keep', item: triageCurrentFeedItem, index: triageIndex })
    setTriageIndex(triageAdvance)
  }, [triageCurrentFeedItem, triageIndex, recordTriageStreak, commitPendingTriageDelete])

  const triageDelete = useCallback(() => {
    if (!triageCurrentFeedItem) return
    recordTriageStreak()
    const item = triageCurrentFeedItem
    commitPendingTriageDelete()
    const timer = setTimeout(() => {
      fetch(`/api/bookmarks/${item.id}?platform=${item.platform ?? 'twitter'}`, {
        method: 'DELETE',
      }).catch(() => {})
      onTriageResolved?.(item.id, 'delete')
      setTriageUndo((u) => (u && u.type === 'delete' && u.item.id === item.id ? null : u))
    }, 5000)
    triageUndoTimerRef.current = timer
    setTriageUndo({ type: 'delete', item, index: triageIndex })
    setTriageIndex(triageAdvance)
  }, [
    triageCurrentFeedItem,
    triageIndex,
    recordTriageStreak,
    onTriageResolved,
    commitPendingTriageDelete,
  ])

  const triageDoUndo = useCallback(() => {
    if (!triageUndo) return
    if (triageUndo.type === 'archive') {
      fetch(
        `/api/bookmarks/${triageUndo.item.id}/read?platform=${triageUndo.item.platform ?? 'twitter'}`,
        {
          method: 'DELETE',
        },
      ).catch(() => {})
      onTriageRestored?.(triageUndo.item)
    } else if (triageUndo.type === 'delete') {
      clearTriageUndoTimer()
    }
    setTriageIndex(triageUndo.index)
    setTriageUndo(null)
  }, [triageUndo, onTriageRestored, clearTriageUndoTimer])

  // ArrowUp "Back": pure navigation only — never touches read/delete state,
  // unlike `U` (which reverses the last action).
  const triageStepBack = useCallback(() => {
    setTriageIndex(triageStepBackIndex)
  }, [])

  // Flush any pending delete when the shell unmounts (AuthedHome closes
  // triage by conditionally unmounting the whole `<TheaterShell/>`).
  useEffect(() => {
    if (!isTriage) return
    return () => {
      commitPendingTriageDelete()
    }
  }, [isTriage, commitPendingTriageDelete])

  // Keep the OPEN triage queue's tags live (unified-theater-triage.md §B):
  // `TagQuickPicker` broadcasts a post's full updated tag list on every
  // successful toggle/create. The queue itself is a fixed snapshot taken at
  // mount (see the comment above `triageQueue`'s declaration), so this is the
  // one place its items mutate in place — same immutable-map pattern used
  // elsewhere in this file, never a splice/replace.
  useEffect(() => {
    if (!isTriage) return
    function handleTagsChanged(e: Event) {
      const detail = (e as CustomEvent<{ platform?: string; bookmarkId?: string; tags?: string[] }>)
        .detail
      if (!detail?.bookmarkId) return
      const platform = detail.platform ?? 'twitter'
      setTriageQueue((prev) =>
        prev.map((item) =>
          item.id === detail.bookmarkId && (item.platform ?? 'twitter') === platform
            ? { ...item, tags: detail.tags ?? [] }
            : item,
        ),
      )
    }
    window.addEventListener('bookmark-tags-changed', handleTagsChanged)
    return () => window.removeEventListener('bookmark-tags-changed', handleTagsChanged)
  }, [isTriage])

  // Dialog a11y: move focus into the overlay on mount, restore on unmount.
  useEffect(() => {
    if (!isTriage) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    shellRef.current?.focus()
    return () => {
      previousFocusRef.current?.focus?.()
    }
  }, [isTriage])

  // Lock the underlying page's scroll while the triage overlay is mounted.
  useEffect(() => {
    if (!isTriage) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isTriage])

  const handleTriageLiveSave = useCallback(async (item: TheaterItem) => {
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
        setTriageSavedKeys((prev) => new Set(prev).add(key))
        window.dispatchEvent(new CustomEvent('tweet-added'))
        // Pull the freshly saved bookmark into the OPEN triage queue too, so
        // switching to the Collection tab shows it without a page reload
        // (the queue is a snapshot taken when the overlay opened).
        if (item.bookmarkId) {
          try {
            const q = new URLSearchParams({ unreadOnly: 'false', filter: 'all', limit: '5' })
            q.append('id', item.bookmarkId)
            const fres = await fetch(`/api/feed?${q}`)
            if (fres.ok) {
              const data = await fres.json()
              const saved = (data.items ?? []).find(
                (f: FeedItem) =>
                  (f.platform ?? 'twitter') === item.platform && f.id === item.bookmarkId,
              )
              if (saved) {
                setTriageQueue((prev) =>
                  prev.some(
                    (f) =>
                      f.id === saved.id &&
                      (f.platform ?? 'twitter') === (saved.platform ?? 'twitter'),
                  )
                    ? prev
                    : [...prev, saved],
                )
              }
            }
          } catch {
            // Queue update is best-effort; the grid behind refreshes anyway.
          }
        }
      }
    } catch {
      // Best effort — the button simply won't flip to "Saved".
    }
  }, [])

  const [muted, setMuted] = useState(true)

  // Sound preference survives full-page navigations within the theater —
  // paste-to-preview navigates with `window.location.assign`, which used to
  // silently reset a viewer's sound to muted. Read on mount (not in the
  // useState initializer — SSR renders muted, and a differing first client
  // render would be a hydration mismatch on the audio buttons), write on
  // every change. Best-effort only: on a fresh document the browser may
  // still veto audible autoplay (no gesture yet); StageVideo's
  // rejected-play fallback then re-mutes gracefully, exactly as before.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('adhx-theater-sound') === 'on') setMuted(false)
    } catch {
      // Storage can be unavailable (private mode) — keep the muted default.
    }
  }, [])
  useEffect(() => {
    try {
      sessionStorage.setItem('adhx-theater-sound', muted ? 'off' : 'on')
    } catch {
      // Same — never let a storage failure break playback.
    }
  }, [muted])
  const isDesktop = useIsDesktopViewport()
  // Desktop de-clutter: collapses the rail column for a full-bleed stage.
  // Desktop-only concept — mobile has its own independent de-clutter state
  // local to TheaterMobileChrome. Persists across item navigation (not reset
  // on `currentKey`), same as the mobile one.
  const [desktopDeclutter, setDesktopDeclutter] = useState(false)
  const onToggleDesktopDeclutter = useCallback(() => setDesktopDeclutter((v) => !v), [])
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  // Virtual "end of feed" stage entered by advancing past the last item (spec
  // addendum: end-of-feed waiting stage). `currentKey` is deliberately left
  // pointing at the last real item while waiting — that's what makes goPrev
  // ("back to the last post") a no-op besides clearing the flag, and keeps
  // the address-bar sync and seen-dwell effects (both keyed on `currentKey`)
  // inert without any extra guarding.
  const [waiting, setWaiting] = useState(false)
  // The item pinned to the front of the display order: the shared post in
  // shared mode (set once, on mount), else the home lead-pick once it's
  // chosen below. Pinning — rather than leaving the pick wherever it sits in
  // the recency-ordered feed — is what keeps ↓/keyboard nav and the rail's
  // visual order in agreement; without it, a lead-pick that lands near the
  // end of `items` clamps goNext immediately.
  const [pinnedKey, setPinnedKey] = useState<string | null>(() =>
    sharedItem ? theaterItemKey(sharedItem) : null,
  )

  // Set once a user has navigated (keyboard/rail click) — after that, the
  // "lead item = max trendCount among unseen" pick below never overrides
  // their choice.
  const hasNavigatedRef = useRef(false)
  const leadAppliedRef = useRef(false)

  // The list every index/nav computation below operates on — `items` with
  // the pinned key (if any) moved to the front. Keep this as THE list used
  // everywhere so the rail/mobile-chrome render order matches keyboard order.
  const displayItems = useMemo(() => pinKeyFirst(items, pinnedKey), [items, pinnedKey])

  // Seed savedKeys with EXISTING collection membership: a live-tab post the
  // viewer already saved (this session or any other) must show "Saved", not
  // "Save". One bulk `/api/feed?id=…&id=…` lookup per batch of unseen items;
  // each id is checked at most once per mount.
  const membershipCheckedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!isTriage || triageTab !== 'live') return
    const unknown = displayItems
      .filter((it) => it.bookmarkId && !membershipCheckedRef.current.has(theaterItemKey(it)))
      .slice(0, 50)
    if (unknown.length === 0) return
    unknown.forEach((it) => membershipCheckedRef.current.add(theaterItemKey(it)))
    const params = new URLSearchParams({ unreadOnly: 'false', filter: 'all', limit: '50' })
    unknown.forEach((it) => params.append('id', it.bookmarkId as string))
    fetch(`/api/feed?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const owned: FeedItem[] = d?.items ?? []
        if (!owned.length) return
        setTriageSavedKeys((prev) => {
          const next = new Set(prev)
          for (const f of owned) next.add(`${f.platform ?? 'twitter'}:${f.id}`)
          return next
        })
      })
      .catch(() => {})
  }, [isTriage, triageTab, displayItems])

  // Kept in refs (rather than effect deps) so the seen/pulse timer below only
  // resets when `currentKey` itself changes, not on every unrelated re-render
  // (polling, seen-state updates, etc.).
  const itemsRef = useRef(displayItems)
  itemsRef.current = displayItems
  const seenSetRef = useRef(seenSet)
  seenSetRef.current = seenSet
  // Read fresh inside goNext/goPrev (empty-deps callbacks) without
  // re-registering them on every waiting/feed change.
  const waitingRef = useRef(waiting)
  waitingRef.current = waiting
  const freshKeysRef = useRef(feed.freshKeys)
  freshKeysRef.current = feed.freshKeys
  // Snapshot of `freshKeys` taken the moment waiting begins — anything
  // added to freshKeys AFTER this point is a genuinely new arrival the
  // waiting stage should auto-play into (see the effect near the bottom).
  const waitingBaselineFreshKeysRef = useRef<ReadonlySet<string>>(new Set())

  // Land on the first item immediately (no flash of an empty stage); a
  // moment later, once localStorage seen-state has hydrated, jump to the
  // best unseen lead — but only if the user hasn't already moved on their own.
  // In shared mode the seed's first item IS the shared post (buildSharedSeed
  // puts it first), so this already lands on it with no extra branching.
  useEffect(() => {
    if (currentKey === null && displayItems.length > 0) {
      setCurrentKey(theaterItemKey(displayItems[0]))
    }
  }, [displayItems, currentKey])

  useEffect(() => {
    // Shared mode never re-picks a "best" lead — the shared post is ALWAYS
    // the initial current item, regardless of trendCount or seen-state.
    // Collection mode never re-picks either — a curated tag collection
    // always opens on its first item (curated order), never reshuffled by
    // trendCount (mostly 0/absent for saved items anyway) or by whatever
    // this viewer happens to have already seen elsewhere on the site.
    if (sharedItem || loop) return
    if (!seenSet.ready || leadAppliedRef.current || hasNavigatedRef.current) return
    leadAppliedRef.current = true
    if (items.length === 0) return
    const unseen = items.filter((it) => !seenSet.isSeen(theaterItemKey(it)))
    const pool = unseen.length > 0 ? unseen : items
    const lead = pool.reduce(
      (best, it) => ((it.trendCount ?? 0) > (best.trendCount ?? 0) ? it : best),
      pool[0],
    )
    const leadKey = theaterItemKey(lead)
    // Pin the pick to the front of the display order — otherwise a lead that
    // sits near the end of the recency-ordered feed clamps goNext right away.
    setPinnedKey(leadKey)
    setCurrentKey(leadKey)
  }, [seenSet, items])

  const currentIndex = useMemo(
    () => displayItems.findIndex((it) => theaterItemKey(it) === currentKey),
    [displayItems, currentKey],
  )
  const current: TheaterItem | null = currentIndex === -1 ? null : displayItems[currentIndex]
  // End-states for the peek bar's prev/next chevrons (tester feedback: at the
  // first post, pressing "back" silently did nothing). `currentIndex === -1`
  // (nothing current, e.g. an empty list) always reads as "can't navigate".
  // Collection mode loops, so both chevrons stay enabled the whole time
  // there's a current item — there's no waiting stage and no dead end.
  const canPrev = loop ? currentIndex !== -1 : computeCanPrev(currentIndex, waiting)
  const canNext = loop ? currentIndex !== -1 : computeCanNext(currentIndex, waiting)

  // Read fresh inside the `theater-advance` listener below without
  // re-registering that listener on every navigation (mirrors itemsRef).
  const currentRef = useRef(current)
  currentRef.current = current

  const goNext = useCallback(() => {
    setCurrentKey((key) => {
      const idx = itemsRef.current.findIndex((it) => theaterItemKey(it) === key)
      const next = computeLoopedNext(itemsRef.current.length, idx, loop)
      if (next === null) return key
      if (next === 'waiting') {
        // Advancing past the last post enters the waiting stage instead of
        // clamping silently. Idempotent: a repeat advance (e.g. another
        // keypress) while already waiting must not reset the baseline —
        // that would make an item that arrived a moment ago look "not new"
        // and get missed by the fresh-arrival effect below. Collection mode
        // never reaches this branch (computeLoopedNext never returns
        // 'waiting' when `loop` is true).
        if (!waitingRef.current) {
          waitingBaselineFreshKeysRef.current = new Set(freshKeysRef.current)
          setWaiting(true)
        }
        return key
      }
      hasNavigatedRef.current = true
      return theaterItemKey(itemsRef.current[next])
    })
  }, [loop])

  const goPrev = useCallback(() => {
    // While waiting, "back" just returns to the last post it's already
    // parked on (currentKey never moved) — never step further back too.
    // (Collection mode never sets `waiting`, so this branch is inert there.)
    if (waitingRef.current) {
      setWaiting(false)
      return
    }
    setCurrentKey((key) => {
      const idx = itemsRef.current.findIndex((it) => theaterItemKey(it) === key)
      const prev = computeLoopedPrev(itemsRef.current.length, idx, loop)
      if (prev === null) return key
      hasNavigatedRef.current = true
      return theaterItemKey(itemsRef.current[prev])
    })
  }, [loop])

  const onSelect = useCallback((key: string) => {
    hasNavigatedRef.current = true
    setWaiting(false)
    setCurrentKey(key)
  }, [])

  const onRequestUnmute = useCallback(() => setMuted(false), [])
  const onToggleMute = useCallback(() => setMuted((m) => !m), [])

  // Suppress the browser's native pull-to-refresh / overscroll chaining while
  // the theater is mounted — it's a fixed full-viewport overlay, not a normal
  // scrolling page, so a swipe-down at the top should never yank in the
  // browser's refresh UI. Chrome/Android honors `overscroll-behavior` alone;
  // without our own touchmove preventDefault (removed along with swipe nav —
  // navigation is buttons + keyboard + video-ended auto-advance now), older
  // iOS Safari may still rubber-band the fixed page slightly on an
  // aggressive drag — acceptable, and Chrome/Android is unaffected. Restores
  // whatever was there before (defensive — nothing else in the app currently
  // sets this).
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtml = html.style.overscrollBehavior
    const prevBody = body.style.overscrollBehavior
    html.style.overscrollBehavior = 'none'
    body.style.overscrollBehavior = 'none'
    return () => {
      html.style.overscrollBehavior = prevHtml
      body.style.overscrollBehavior = prevBody
    }
  }, [])

  // Keyboard nav: ↓/→/j next, ↑/←/k prev — the arrows double up because the
  // desktop dock's filmstrip queue reads horizontally while mobile still
  // scrolls vertically. Space toggles play/pause (delegated to Stage via a
  // custom event, matching the repo's cross-component keyboard pattern), m
  // toggles mute. Ignored while typing in an input/textarea/contentEditable
  // element.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      // Triage mode's Collection tab uses an entirely different keymap
      // (action-and-advance, not pure navigation) — see `triageKeyAction()`.
      // The Live tab keeps the standard ↓/↑/space/m nav below (it's the same
      // live pulse feed home mode uses), and Escape always closes the
      // overlay regardless of which triage tab is active.
      if (isTriage && triageTab === 'collection') {
        const action = triageKeyAction(e)
        if (!action) return
        e.preventDefault()
        switch (action) {
          case 'done':
            triageDone()
            break
          case 'later':
            triageLater()
            break
          case 'delete':
            triageDelete()
            break
          case 'back':
            triageStepBack()
            break
          case 'undo':
            triageDoUndo()
            break
          case 'close':
            onClose?.()
            break
        }
        return
      }

      if (isTriage && e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
        return
      }

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
        case 'j':
        case 'J':
          e.preventDefault()
          goNext()
          break
        case 'ArrowUp':
        case 'ArrowLeft':
        case 'k':
        case 'K':
          e.preventDefault()
          goPrev()
          break
        case ' ':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('theater-toggle-play'))
          break
        case 'm':
        case 'M':
          e.preventDefault()
          setMuted((m) => !m)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    goNext,
    goPrev,
    isTriage,
    triageTab,
    triageDone,
    triageLater,
    triageDelete,
    triageStepBack,
    triageDoUndo,
    onClose,
  ])

  // Mark seen + fire the preview pulse once the current post has been staged
  // for SEEN_DWELL_MS. Resets only when `currentKey` changes. Collection mode
  // is a curated surface, not the public pulse — it marks seen locally (so a
  // loop doesn't visually re-highlight already-viewed cards as "fresh") but
  // never records a `preview` activity event, matching the pre-theater
  // `/t/{username}/{tag}` page's behavior.
  useEffect(() => {
    // Triage mode's overlay lives on top of `/` — it never records a
    // `preview` pulse for the person's own queue, and its Collection tab
    // isn't even displaying `currentKey`'s item (see `TriageStage` below).
    if (!currentKey || isTriage) return
    const timer = window.setTimeout(() => {
      const item = itemsRef.current.find((it) => theaterItemKey(it) === currentKey)
      if (!item) return
      seenSetRef.current.markSeen(currentKey)
      if (item.bookmarkId && !loop) {
        fetch('/api/activity/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: item.platform, id: item.bookmarkId }),
        }).catch(() => {})
      }
    }, SEEN_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [currentKey, loop, isTriage])

  // Keep the address bar's path in lockstep with the item currently staged
  // (theater-first.md §7): a reload — or a URL someone copies mid-session —
  // always lands exactly where the viewer was, and "Link" copy is trivially
  // honest. replaceState only (never push — no history spam), and only once
  // theaterUrlSyncPath() can build a real app path; an item missing an id or
  // an author leaves the URL untouched. Keyed on currentKey alone (itemsRef
  // gives the fresh item without re-running on every unrelated re-render),
  // so this also fires once for the very first item — currentKey starts null
  // and transitions to that item's key exactly like any other selection, so
  // landing on `/` ends up indistinguishable from landing on its post URL.
  // Collection mode is exempt — `/t/{username}/{tag}` is the stable address
  // for the whole collection; browsing within it must never rewrite the URL
  // to a per-post preview path (that's a different, off-collection surface).
  useEffect(() => {
    if (typeof window === 'undefined' || mode === 'collection' || isTriage) return
    const item = itemsRef.current.find((it) => theaterItemKey(it) === currentKey) ?? null
    const path = theaterUrlSyncPath(item)
    if (!path || window.location.pathname === path) return
    try {
      window.history.replaceState(null, '', path)
    } catch {
      // Blocked in some embedded/sandboxed contexts — never worth breaking playback over.
    }
  }, [currentKey, mode, isTriage])

  // Stories-style auto-advance: a finished video advances via <Stage>'s
  // `onEnded` prop directly (all viewports — see below); a non-video item's
  // 10s dwell timer lives entirely in TheaterProgressLine (mobile-only,
  // mounted by TheaterMobileChrome below `lg`) and signals completion here
  // via this window event instead of a prop, since the timer component has
  // no direct handle on the shell. `progressKindFor` re-checks the item
  // that's actually current at the moment the event arrives (not whatever
  // was current when the listener was registered) so a timer left running
  // from a since-navigated-away item can never advance past the wrong post.
  useEffect(() => {
    function handleAdvance() {
      if (showSignInRef.current) return
      // Triage's Collection tab never auto-advances — Done/Later/Delete are
      // the only ways forward there. A leftover mobile progress-line timer
      // from the same content type would otherwise fire this and silently
      // step the (unrelated, unrendered) live-feed cursor underneath it.
      if (isTriageCollection) return
      if (progressKindFor(currentRef.current) !== 'timed') return
      goNext()
    }
    window.addEventListener('theater-advance', handleAdvance)
    return () => window.removeEventListener('theater-advance', handleAdvance)
  }, [goNext, isTriageCollection])

  // Prefetch at most one item ahead.
  useEffect(() => {
    if (currentIndex === -1) return
    const next = displayItems[currentIndex + 1]
    if (next) prefetchPlayback(next)
  }, [currentIndex, displayItems])

  // Auto-play into the waiting stage: the moment a genuinely fresh item shows
  // up (present in `freshKeys` but not in the baseline snapshotted when
  // waiting began), stage it and clear waiting. Mid-feed arrivals never hit
  // this branch — it's gated on `waiting` — so today's "prepend quietly,
  // don't interrupt" behavior for a viewer mid-scroll is untouched.
  useEffect(() => {
    if (!waiting) return
    const arrived = findFreshArrival(feed.freshKeys, waitingBaselineFreshKeysRef.current)
    if (!arrived) return
    setCurrentKey(arrived)
    setWaiting(false)
  }, [waiting, feed.freshKeys])

  // Items newer than the last visit and not yet seen. Zero on a first-ever
  // visit (no `lastVisitAt` to compare against) — the caught-up state is the
  // honest read for a brand new visitor, not "everything is new".
  const newCount = useMemo(() => {
    if (!seenSet.ready || seenSet.lastVisitAt == null) return 0
    const lastVisitAt = seenSet.lastVisitAt
    return displayItems.filter((it) => {
      if (seenSet.isSeen(theaterItemKey(it))) return false
      return new Date(it.createdAt).getTime() > lastVisitAt
    }).length
  }, [displayItems, seenSet])

  // Save-collection CTA (collection mode only): clones the shared tag to the
  // signed-in visitor's own account via the existing clone endpoint. Auth
  // state is `useAuthMe()`'s live client read rather than the `authed` SSR
  // prop, so a sign-in completed inside the modal (no full reload) is picked
  // up immediately via `refresh()` below.
  const authMe = useAuthMe()
  const isCollectionAuthed = loop ? !!authMe.me?.authenticated : authed
  const [saveStatus, setSaveStatus] = useState<SaveCollectionStatus>('idle')
  const [showSignIn, setShowSignIn] = useState(false)
  const pendingSaveRef = useRef(false)
  const autoSaveTriggeredRef = useRef(false)

  // Save-intent continuity for INDIVIDUAL posts (home/shared modes). The
  // sign-in modal must return the viewer to the exact post whose Save they
  // tapped — not to wherever the theater drifted while they typed their
  // email — and then finish the save for them. Three pieces:
  //  1. `signInReturnTo` freezes the post's preview path (+ ?save=1) at the
  //     moment Save is tapped.
  //  2. `showSignInRef` pauses auto-advance (timed + video-ended) while the
  //     modal is open, so the stage doesn't wander behind the blur.
  //  3. `saveIntentOnLoad` (read at FIRST RENDER — the URL-sync effect
  //     rewrites the address bar and drops the query before any effect can
  //     see it) triggers the deferred /api/bookmarks/add once auth settles.
  const [signInReturnTo, setSignInReturnTo] = useState<string | null>(null)
  const showSignInRef = useRef(false)
  useEffect(() => {
    showSignInRef.current = showSignIn
  }, [showSignIn])
  const [saveIntentOnLoad] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('save') === '1',
  )
  const sharedAutoSaveRef = useRef(false)

  const openSignIn = useCallback(() => {
    const item = currentRef.current
    const path = theaterUrlSyncPath(item)
    setSignInReturnTo(path ? `${path}?save=1` : null)
    setShowSignIn(true)
  }, [])

  // Deferred single-post save: landing on a preview path with ?save=1 after
  // the sign-in round-trip (magic link or X OAuth) completes the save the
  // viewer originally asked for. Waits for authMe to settle; if the link
  // expired and they sign in via the modal instead, authMe's refresh re-runs
  // this and the intent still completes. Announces success via a window
  // event so the chrome's SavePostButton flips to "Saved".
  useEffect(() => {
    if (!saveIntentOnLoad || mode !== 'shared' || !sharedItem) return
    if (sharedAutoSaveRef.current) return
    if (authMe.loading || !authMe.me?.authenticated) return
    sharedAutoSaveRef.current = true
    const url = sourceUrl(sharedItem.platform, sharedItem.author, sharedItem.bookmarkId ?? '')
    if (!url) return
    void fetch('/api/bookmarks/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
      .then((res) => {
        if (!res.ok) return
        window.dispatchEvent(
          new CustomEvent('theater-post-saved', {
            detail: { key: theaterItemKey(sharedItem) },
          }),
        )
      })
      .catch(() => {})
  }, [saveIntentOnLoad, mode, sharedItem, authMe.loading, authMe.me])

  const performClone = useCallback(async () => {
    if (!collection) return
    setSaveStatus((s) => {
      if (s === 'saving' || s === 'saved') return s
      return 'saving'
    })
    try {
      const res = await fetch(
        `/api/share/tag/by-name/${encodeURIComponent(collection.curator)}/${encodeURIComponent(collection.tag)}/clone`,
        { method: 'POST' },
      )
      if (res.status === 401) {
        pendingSaveRef.current = true
        setShowSignIn(true)
        setSaveStatus('idle')
        return
      }
      if (!res.ok) throw new Error('clone failed')
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }, [collection])

  const handleSaveCollection = useCallback(() => {
    if (!collection) return
    if (!isCollectionAuthed) {
      pendingSaveRef.current = true
      setShowSignIn(true)
      return
    }
    void performClone()
  }, [collection, isCollectionAuthed, performClone])

  // If sign-in completes while the modal is open (in-modal magic link, no
  // reload), fire the deferred clone as soon as `useAuthMe()` reflects it.
  useEffect(() => {
    if (!pendingSaveRef.current || !isCollectionAuthed) return
    pendingSaveRef.current = false
    void performClone()
  }, [isCollectionAuthed, performClone])

  // Cross-reload path: a sign-in flow that redirects (e.g. the X OAuth
  // round-trip) lands back on `returnTo` with `?save=1`. Auto-clone once auth
  // state has settled, then strip the param so a manual refresh never
  // re-triggers it.
  useEffect(() => {
    if (!collection || typeof window === 'undefined' || autoSaveTriggeredRef.current) return
    if (authMe.loading) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('save') !== '1') return
    autoSaveTriggeredRef.current = true
    params.delete('save')
    const qs = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    if (isCollectionAuthed) void performClone()
  }, [collection, authMe.loading, isCollectionAuthed, performClone])

  // --- Effective render inputs: triage's Collection tab is a wholly
  // separate list from the general `current`/`displayItems` (which always
  // describe the live pulse feed — used directly by home/shared/collection
  // modes, and by triage's own Live tab). Everything below picks the right
  // source once, so the chrome components stay mode-agnostic wherever
  // possible.
  const triageStageTheaterItem = triageCurrentFeedItem
    ? feedItemToTheaterItem(triageCurrentFeedItem)
    : null
  const chromeCurrent: TheaterItem | null = isTriageCollection
    ? triageFinished
      ? null
      : triageStageTheaterItem
    : waiting
      ? null
      : current
  const chromeItems = isTriageCollection ? triageDisplayItems : displayItems
  const chromeCurrentKey = isTriageCollection
    ? chromeCurrent
      ? theaterItemKey(chromeCurrent)
      : null
    : currentKey
  const chromeIsSeen = isTriageCollection ? triageIsSeen : seenSet.isSeen
  const chromeSeenReady = isTriageCollection ? true : seenSet.ready
  const chromeFreshKeys = isTriageCollection ? EMPTY_KEY_SET : feed.freshKeys
  const chromeNewCount = isTriageCollection ? 0 : newCount
  const chromeCanPrev = isTriageCollection ? triageIndex > 0 : canPrev
  const chromeCanNext = isTriageCollection ? !triageFinished : canNext
  // The transport chevrons in triage's Collection tab are pure skip/back —
  // "next" is exactly "Later" (advance without changing read state); the
  // dedicated Done/Tag/Delete buttons handle actual actions.
  const chromeOnPrev = isTriageCollection ? triageStepBack : goPrev
  const chromeOnNext = isTriageCollection ? triageLater : goNext
  const chromeOnSelect = isTriageCollection
    ? (key: string) => {
        const idx = triageQueue.findIndex((fi) => theaterItemKey(feedItemToTheaterItem(fi)) === key)
        if (idx !== -1) setTriageIndex(idx)
      }
    : onSelect

  const triageChrome: TheaterTriageChrome | undefined = isTriage
    ? {
        tab: triageTab,
        onTabChange: setTriageTab,
        onDone: triageDone,
        onLater: triageLater,
        onDelete: triageDelete,
        onTag: () => {
          if (!triageCurrentFeedItem) return
          setTagPickerItem({
            platform: triageCurrentFeedItem.platform ?? 'twitter',
            bookmarkId: triageCurrentFeedItem.id,
          })
        },
        onSave: handleTriageLiveSave,
        tags: triageCurrentFeedItem?.tags,
        savedKeys: triageSavedKeys,
        remaining: triageRemaining,
        streak: triageStreak,
        onClose: () => onClose?.(),
      }
    : undefined

  return (
    <div
      ref={shellRef}
      role={isTriage ? 'dialog' : undefined}
      aria-modal={isTriage ? true : undefined}
      aria-label={isTriage ? 'Triage' : undefined}
      tabIndex={isTriage ? -1 : undefined}
      className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#08070a] outline-none"
    >
      {/* Full-width stage on every viewport (spec §8, "Filmstrip dock"):
          below lg the mobile chrome overlays it full-viewport as before;
          at lg+ <DesktopStageChrome/> overlays it with the top bar/post
          overlay/actions, and <DesktopDock/> (a sibling, in-flow below) is
          the bottom filmstrip queue — no more side-by-side rail column. */}
      <div className="relative h-full w-full flex-1 overflow-hidden">
        <div className="absolute inset-0">
          {isTriageCollection ? (
            triageFinished ? (
              <TriagePileClear
                total={triageTotal}
                streak={triageStreak}
                onClose={() => onClose?.()}
              />
            ) : triageCurrentFeedItem ? (
              <TriageStage
                feedItem={triageCurrentFeedItem}
                muted={muted}
                onRequestUnmute={onRequestUnmute}
              />
            ) : null
          ) : waiting ? (
            <StageWaiting savedToday={feed.savedToday} />
          ) : (
            <Stage
              item={current}
              muted={muted}
              onRequestUnmute={onRequestUnmute}
              onEnded={() => {
                if (!showSignInRef.current) goNext()
              }}
              photoCaption={false}
            />
          )}
        </div>
        {/* Desktop counterpart to the mobile chrome's top progress line
            (Instagram-style, spans the full viewport including the rail —
            that's fine, arguably good). `kind` is gated on `isDesktop` rather
            than just rendered unconditionally: the mobile chrome below is
            ALWAYS mounted (only CSS-hidden at lg, its effects keep running),
            so without this gate — and the matching gate on the chrome's
            `current` prop below — two independent 'timed' timers would both
            be alive on desktop and double-dispatch `theater-advance`.
            Triage's Collection tab never auto-advances (see `handleAdvance`
            above), so its progress line is always suppressed. */}
        <TheaterProgressLine
          itemKey={chromeCurrentKey}
          kind={isTriageCollection ? 'none' : isDesktop ? progressKindFor(chromeCurrent) : 'none'}
        />
        {desktopDeclutter && (
          <button
            type="button"
            onClick={onToggleDesktopDeclutter}
            aria-label="Show controls"
            className="absolute right-4 top-4 z-20 hidden h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 lg:flex"
          >
            <Maximize2 size={18} />
          </button>
        )}
        <TheaterMobileChrome
          mode={mode}
          current={isDesktop ? null : chromeCurrent}
          items={chromeItems}
          currentKey={chromeCurrentKey}
          isSeen={chromeIsSeen}
          seenReady={chromeSeenReady}
          freshKeys={chromeFreshKeys}
          newCount={chromeNewCount}
          onSelect={chromeOnSelect}
          onPrev={chromeOnPrev}
          onNext={chromeOnNext}
          canPrev={chromeCanPrev}
          canNext={chromeCanNext}
          muted={muted}
          onToggleMute={onToggleMute}
          collection={collection}
          saveStatus={saveStatus}
          onSaveCollection={handleSaveCollection}
          onRequestSignIn={openSignIn}
          triage={triageChrome}
        />
        <DesktopStageChrome
          mode={mode}
          current={chromeCurrent}
          sharedItem={sharedItem}
          authed={authed}
          declutter={desktopDeclutter}
          onToggleDeclutter={onToggleDesktopDeclutter}
          collection={collection}
          saveStatus={saveStatus}
          onSaveCollection={handleSaveCollection}
          onRequestSignIn={openSignIn}
          triage={triageChrome}
        />
        {/* Triage's Delete (and Done/Later) undo toast — a 5s window, same
            deadline as `commitPendingTriageDelete`'s timer. Works the same
            on both viewports, so it lives here rather than duplicated inside
            each chrome component. */}
        {isTriageCollection && triageUndo && (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center lg:bottom-36">
            <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-black/80 px-4 py-2 text-[13px] text-white shadow-lg backdrop-blur-md">
              <span>
                {triageUndo.type === 'archive'
                  ? 'Done'
                  : triageUndo.type === 'delete'
                    ? 'Deleted'
                    : 'Later'}
              </span>
              <button type="button" onClick={triageDoUndo} className="font-semibold text-clay">
                Undo
              </button>
            </div>
          </div>
        )}
      </div>
      <DesktopDock
        mode={mode}
        items={chromeItems}
        current={chromeCurrent}
        currentKey={chromeCurrentKey}
        isSeen={chromeIsSeen}
        seenReady={chromeSeenReady}
        freshKeys={chromeFreshKeys}
        newCount={chromeNewCount}
        savedToday={feed.savedToday}
        onSelect={chromeOnSelect}
        waiting={isTriageCollection ? false : waiting}
        muted={muted}
        onToggleMute={onToggleMute}
        canPrev={chromeCanPrev}
        canNext={chromeCanNext}
        onPrev={chromeOnPrev}
        onNext={chromeOnNext}
        declutter={desktopDeclutter}
        collection={collection}
        triage={triageChrome}
      />
      <SignInModal
        open={showSignIn}
        onClose={() => {
          setShowSignIn(false)
          authMe.refresh()
        }}
        title={collection ? 'Save this collection' : 'Save it to your pile'}
        subtitle={
          collection
            ? `${collection.count} ${collection.count === 1 ? 'post' : 'posts'} from ${collection.tag}, curated by @${collection.curator} — keep them in your pile.`
            : 'Your saved posts stay yours — sync your X bookmarks anytime from Settings.'
        }
        returnTo={
          collection
            ? `/t/${collection.curator}/${collection.tag}?save=1`
            : (signInReturnTo ?? undefined)
        }
      />
      {isTriage && tagPickerItem && (
        <TagQuickPicker
          platform={tagPickerItem.platform}
          bookmarkId={tagPickerItem.bookmarkId}
          open
          onClose={() => setTagPickerItem(null)}
        />
      )}
    </div>
  )
}
