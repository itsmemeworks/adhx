'use client'

/**
 * Theater orchestrator (spec §3/§4/§5/§6/§8): full-viewport <Stage/> + <Rail/>.
 * Owns current-item state, keyboard nav, mute state, the seen model + preview
 * pulse, and next-item prefetch. See docs/specs/theater-first.md.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Stage } from './Stage'
import { Rail } from './Rail'
import { TheaterMobileChrome, swipeDirection } from './TheaterMobileChrome'
import { useTheaterFeed } from './useTheaterFeed'
import { useSeenSet } from './useSeenSet'
import { prefetchPlayback } from './usePlaybackSource'
import { progressKindFor } from './TheaterProgressLine'
import { theaterItemKey } from './types'
import { previewPath } from '@/lib/activity/preview-path'
import type { TheaterFeedSeed, TheaterItem, TheaterMode } from './types'

export interface TheaterShellProps {
  seed: TheaterFeedSeed
  mode?: TheaterMode
  /** Shared mode (PR 3): the post the visitor landed on — always the initial current item. */
  sharedItem?: TheaterItem
  /** Whether the visiting user is signed in (shared mode: swaps Connect for a direct Save). */
  authed?: boolean
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
 * Pure: true when a touch starting on `el` should be left entirely to the
 * browser — native scroll, text selection, link/button taps, copying —
 * instead of being read as a theater swipe. Two cases:
 *  1. An explicit opt-out region (`data-theater-scroll`) or an interactive
 *     element (`a`/`button`/`input`/`textarea`) anywhere in the ancestor
 *     chain.
 *  2. A scroll surface we don't own and can't tag (StageArticle's reader,
 *     read-only) — any ancestor up to (not including) `root` that's
 *     independently scrollable (`overflow-y: auto|scroll`), detected via
 *     computed style since we can't add the attribute there.
 * `getOverflowY` is injectable so this stays unit-testable without a real DOM.
 */
export function isScrollableTarget(
  el: Element | null,
  root: Element | null,
  getOverflowY: (node: Element) => string = (node) => window.getComputedStyle(node).overflowY,
): boolean {
  if (!el) return false
  if (el.closest('[data-theater-scroll], a, button, input, textarea')) return true
  let node: Element | null = el
  while (node && node !== root) {
    if (getOverflowY(node) === 'auto' || getOverflowY(node) === 'scroll') return true
    node = node.parentElement
  }
  return false
}

export function TheaterShell({
  seed,
  mode = 'home',
  sharedItem,
  authed = false,
}: TheaterShellProps) {
  const feed = useTheaterFeed(seed)
  const seenSet = useSeenSet()
  const { items } = feed

  const [muted, setMuted] = useState(true)
  const [currentKey, setCurrentKey] = useState<string | null>(null)
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

  // Kept in refs (rather than effect deps) so the seen/pulse timer below only
  // resets when `currentKey` itself changes, not on every unrelated re-render
  // (polling, seen-state updates, etc.).
  const itemsRef = useRef(displayItems)
  itemsRef.current = displayItems
  const seenSetRef = useRef(seenSet)
  seenSetRef.current = seenSet

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
    if (sharedItem) return
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

  // Read fresh inside the `theater-advance` listener below without
  // re-registering that listener on every navigation (mirrors itemsRef).
  const currentRef = useRef(current)
  currentRef.current = current

  const goNext = useCallback(() => {
    setCurrentKey((key) => {
      const idx = itemsRef.current.findIndex((it) => theaterItemKey(it) === key)
      if (idx === -1 || idx + 1 >= itemsRef.current.length) return key
      hasNavigatedRef.current = true
      return theaterItemKey(itemsRef.current[idx + 1])
    })
  }, [])

  const goPrev = useCallback(() => {
    setCurrentKey((key) => {
      const idx = itemsRef.current.findIndex((it) => theaterItemKey(it) === key)
      if (idx <= 0) return key
      hasNavigatedRef.current = true
      return theaterItemKey(itemsRef.current[idx - 1])
    })
  }, [])

  const onSelect = useCallback((key: string) => {
    hasNavigatedRef.current = true
    setCurrentKey(key)
  }, [])

  const onRequestUnmute = useCallback(() => setMuted(false), [])
  const onToggleMute = useCallback(() => setMuted((m) => !m), [])

  // Mobile swipe nav (spec §8): vertical swipe on the stage only — the
  // mobile chrome's sheet/backdrop are separate DOM siblings positioned on
  // top of the stage, so a drag inside the sheet never reaches this handler.
  // `stageRef` is the touch wrapper below (`touch-none`) — also the `root`
  // boundary for `isScrollableTarget`'s ancestor walk.
  const stageRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number; ignore: boolean } | null>(null)
  const onStageTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    // A gesture starting inside a scrollable/selectable/interactive region
    // (long-post text, an expanded caption, a link, StageArticle's reader)
    // is ignored entirely — no swipe nav, no preventDefault — so scrolling,
    // link taps, and long-press text selection/copying behave natively.
    const ignore = isScrollableTarget(e.target as Element, stageRef.current)
    touchStartRef.current = { x: t.clientX, y: t.clientY, ignore }
  }, [])
  const onStageTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartRef.current
      touchStartRef.current = null
      if (!start || start.ignore) return
      const t = e.changedTouches[0]
      const direction = swipeDirection(t.clientX - start.x, t.clientY - start.y)
      if (direction === 'next') goNext()
      else if (direction === 'prev') goPrev()
    },
    [goNext, goPrev],
  )
  const onStageTouchCancel = useCallback(() => {
    touchStartRef.current = null
  }, [])

  // Suppress the browser's native pull-to-refresh / overscroll chaining while
  // the theater is mounted — it's a fixed full-viewport overlay, not a normal
  // scrolling page, so a swipe-down at the top should never yank in the
  // browser's refresh UI. Chrome/Android honors `overscroll-behavior` alone;
  // older iOS Safari ignores it, hence the touch-action + preventDefault path
  // below as well. Restores whatever was there before (defensive — nothing
  // else in the app currently sets this).
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

  // Non-passive touchmove listener: React's synthetic onTouchMove is passive
  // by default, so calling preventDefault() from a JSX `onTouchMove` prop is
  // a silent no-op. Only blocks the browser's default scroll/refresh once the
  // gesture is clearly vertical AND didn't start in an opt-out region
  // (`touchStartRef.current.ignore`, set on touchstart above).
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const PREVENT_THRESHOLD = 6
    function handleTouchMove(e: TouchEvent) {
      const start = touchStartRef.current
      if (!start || start.ignore) return
      const t = e.touches[0]
      if (!t) return
      if (Math.abs(t.clientY - start.y) > PREVENT_THRESHOLD) {
        e.preventDefault()
      }
    }
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', handleTouchMove)
  }, [])

  // Keyboard nav: ↓/j next, ↑/k prev, space toggles play/pause (delegated to
  // Stage via a custom event, matching the repo's cross-component keyboard
  // pattern), m toggles mute. Ignored while typing in an input/textarea/
  // contentEditable element.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
        case 'J':
          e.preventDefault()
          goNext()
          break
        case 'ArrowUp':
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
  }, [goNext, goPrev])

  // Mark seen + fire the preview pulse once the current post has been staged
  // for SEEN_DWELL_MS. Resets only when `currentKey` changes.
  useEffect(() => {
    if (!currentKey) return
    const timer = window.setTimeout(() => {
      const item = itemsRef.current.find((it) => theaterItemKey(it) === currentKey)
      if (!item) return
      seenSetRef.current.markSeen(currentKey)
      if (item.bookmarkId) {
        fetch('/api/activity/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: item.platform, id: item.bookmarkId }),
        }).catch(() => {})
      }
    }, SEEN_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [currentKey])

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
  useEffect(() => {
    if (typeof window === 'undefined') return
    const item = itemsRef.current.find((it) => theaterItemKey(it) === currentKey) ?? null
    const path = theaterUrlSyncPath(item)
    if (!path || window.location.pathname === path) return
    try {
      window.history.replaceState(null, '', path)
    } catch {
      // Blocked in some embedded/sandboxed contexts — never worth breaking playback over.
    }
  }, [currentKey])

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
      if (progressKindFor(currentRef.current) !== 'timed') return
      goNext()
    }
    window.addEventListener('theater-advance', handleAdvance)
    return () => window.removeEventListener('theater-advance', handleAdvance)
  }, [goNext])

  // Prefetch at most one item ahead.
  useEffect(() => {
    if (currentIndex === -1) return
    const next = displayItems[currentIndex + 1]
    if (next) prefetchPlayback(next)
  }, [currentIndex, displayItems])

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

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#08070a] lg:flex-row">
      {/* Full-viewport stage below lg (spec §8) — the desktop 62dvh-stage +
          stacked-rail layout only applies at lg+, where <Rail/> takes its
          own column instead of overlaying the stage. */}
      <div className="relative h-full w-full flex-1 overflow-hidden lg:min-w-0">
        {/* No CSS touch-action here: `none` on this ancestor would ALSO kill
            native scrolling/selection in descendants (touch-action intersects
            down the tree), which broke text-post scrolling and swiping alike.
            The JS ignore-flag + conditional preventDefault in the native
            touchmove listener is the sole gesture arbiter. */}
        <div
          ref={stageRef}
          className="absolute inset-0"
          onTouchStart={onStageTouchStart}
          onTouchEnd={onStageTouchEnd}
          onTouchCancel={onStageTouchCancel}
        >
          <Stage
            item={current}
            muted={muted}
            onRequestUnmute={onRequestUnmute}
            onEnded={goNext}
            photoCaption={false}
          />
        </div>
        <TheaterMobileChrome
          mode={mode}
          current={current}
          items={displayItems}
          currentKey={currentKey}
          isSeen={seenSet.isSeen}
          seenReady={seenSet.ready}
          freshKeys={feed.freshKeys}
          newCount={newCount}
          onSelect={onSelect}
          onPrev={goPrev}
          onNext={goNext}
          muted={muted}
          onToggleMute={onToggleMute}
        />
      </div>
      <div className="hidden min-h-0 flex-1 overflow-y-auto lg:flex lg:h-full lg:flex-none">
        <Rail
          mode={mode}
          items={displayItems}
          current={current}
          currentKey={currentKey}
          isSeen={seenSet.isSeen}
          seenReady={seenSet.ready}
          freshKeys={feed.freshKeys}
          newCount={newCount}
          savedToday={feed.savedToday}
          onSelect={onSelect}
          sharedItem={sharedItem}
          authed={authed}
        />
      </div>
    </div>
  )
}
