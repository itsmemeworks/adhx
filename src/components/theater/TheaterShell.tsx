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
import { Stage } from './Stage'
import { StageWaiting } from './StageWaiting'
import { DesktopStageChrome, DesktopDock } from './TheaterDesktopChrome'
import { TheaterMobileChrome } from './TheaterMobileChrome'
import { useTheaterFeed } from './useTheaterFeed'
import { useSeenSet } from './useSeenSet'
import { prefetchPlayback } from './usePlaybackSource'
import { TheaterProgressLine, progressKindFor } from './TheaterProgressLine'
import { theaterItemKey } from './types'
import { previewPath, sourceUrl } from '@/lib/activity/preview-path'
// SignInModal + useAuthMe are built by a parallel agent under the same
// accounts/magic-link PR — imported per the shared contract even though the
// module may not exist yet at review time; see the "Save collection" CTA
// below (collection mode only).
import { SignInModal, useAuthMe } from '@/components/auth'
import type {
  SaveCollectionStatus,
  TheaterCollectionMeta,
  TheaterFeedSeed,
  TheaterItem,
  TheaterMode,
} from './types'

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
}: TheaterShellProps) {
  // Collection mode (`/t/{username}/{tag}`) is a fixed, curated queue to loop
  // through — never a live blend with the anonymous community pulse.
  const loop = mode === 'collection'
  const feed = useTheaterFeed(seed, { live: !loop })
  const seenSet = useSeenSet()
  const { items } = feed

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
  }, [goNext, goPrev])

  // Mark seen + fire the preview pulse once the current post has been staged
  // for SEEN_DWELL_MS. Resets only when `currentKey` changes. Collection mode
  // is a curated surface, not the public pulse — it marks seen locally (so a
  // loop doesn't visually re-highlight already-viewed cards as "fresh") but
  // never records a `preview` activity event, matching the pre-theater
  // `/t/{username}/{tag}` page's behavior.
  useEffect(() => {
    if (!currentKey) return
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
  }, [currentKey, loop])

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
    if (typeof window === 'undefined' || mode === 'collection') return
    const item = itemsRef.current.find((it) => theaterItemKey(it) === currentKey) ?? null
    const path = theaterUrlSyncPath(item)
    if (!path || window.location.pathname === path) return
    try {
      window.history.replaceState(null, '', path)
    } catch {
      // Blocked in some embedded/sandboxed contexts — never worth breaking playback over.
    }
  }, [currentKey, mode])

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

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#08070a]">
      {/* Full-width stage on every viewport (spec §8, "Filmstrip dock"):
          below lg the mobile chrome overlays it full-viewport as before;
          at lg+ <DesktopStageChrome/> overlays it with the top bar/post
          overlay/actions, and <DesktopDock/> (a sibling, in-flow below) is
          the bottom filmstrip queue — no more side-by-side rail column. */}
      <div className="relative h-full w-full flex-1 overflow-hidden">
        <div className="absolute inset-0">
          {waiting ? (
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
            be alive on desktop and double-dispatch `theater-advance`. */}
        <TheaterProgressLine
          itemKey={currentKey}
          kind={isDesktop ? progressKindFor(waiting ? null : current) : 'none'}
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
          current={waiting || isDesktop ? null : current}
          items={displayItems}
          currentKey={currentKey}
          isSeen={seenSet.isSeen}
          seenReady={seenSet.ready}
          freshKeys={feed.freshKeys}
          newCount={newCount}
          onSelect={onSelect}
          onPrev={goPrev}
          onNext={goNext}
          canPrev={canPrev}
          canNext={canNext}
          muted={muted}
          onToggleMute={onToggleMute}
          collection={collection}
          saveStatus={saveStatus}
          onSaveCollection={handleSaveCollection}
          onRequestSignIn={openSignIn}
        />
        <DesktopStageChrome
          mode={mode}
          current={waiting ? null : current}
          sharedItem={sharedItem}
          authed={authed}
          declutter={desktopDeclutter}
          onToggleDeclutter={onToggleDesktopDeclutter}
          collection={collection}
          saveStatus={saveStatus}
          onSaveCollection={handleSaveCollection}
          onRequestSignIn={openSignIn}
        />
      </div>
      <DesktopDock
        mode={mode}
        items={displayItems}
        current={waiting ? null : current}
        currentKey={currentKey}
        isSeen={seenSet.isSeen}
        seenReady={seenSet.ready}
        freshKeys={feed.freshKeys}
        newCount={newCount}
        savedToday={feed.savedToday}
        onSelect={onSelect}
        waiting={waiting}
        muted={muted}
        onToggleMute={onToggleMute}
        canPrev={canPrev}
        canNext={canNext}
        onPrev={goPrev}
        onNext={goNext}
        declutter={desktopDeclutter}
        collection={collection}
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
    </div>
  )
}
