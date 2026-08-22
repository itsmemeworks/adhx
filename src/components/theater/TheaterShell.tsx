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
import { Minimize2 } from 'lucide-react'
import type { FeedItem } from '@/components/feed/types'
import { Stage } from './Stage'
import { TriageStage } from './TriageStage'
import { StageWaiting } from './StageWaiting'
import { StageUnavailable } from './StageUnavailable'
import { TriageAllClear } from './TriageAllClear'
import { DesktopStageChrome, DesktopDock } from './TheaterDesktopChrome'
import { TheaterMobileChrome } from './TheaterMobileChrome'
import { YtDebugOverlay } from './YtDebugOverlay'
import { useTheaterFeed } from './useTheaterFeed'
import { useSeenSet } from './useSeenSet'
import { useTheaterKeyboard } from './useTheaterKeyboard'
import { useTheaterPrefetch } from './useTheaterPrefetch'
import { useTheaterDwell } from './useTheaterDwell'
import {
  TheaterProgressLine,
  progressKindFor,
  progressKindForPin,
  collectionTabProgressKind,
} from './TheaterProgressLine'
import { feedItemToTheaterItem } from './collection-item'
import { notifyCollectionChanged } from '@/lib/client-events'
import { theaterItemKey } from './types'
import { previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { hasKnownTimestamp } from '@/lib/utils/format'
// SignInModal + useAuthMe are built by a parallel agent under the same
// accounts/magic-link PR — imported per the shared contract even though the
// module may not exist yet at review time; see the "Save playlist" CTA
// below (collection mode only).
import { SignInModal, useAuthMe } from '@/components/auth'
// TagQuickPicker is built by a parallel agent (unified-theater-triage.md §4)
// — imported per the shared contract for the triage "Tag" action.
import { TagQuickPicker } from '@/components/tags'
import type {
  RepeatMode,
  SavePlaylistStatus,
  TheaterPlaylistMeta,
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

// `triageKeyAction` and its `TriageKeyAction` type now live in
// `useTheaterKeyboard.ts` (the keyboard-handling hook that's their only
// caller) — re-exported here so existing imports (incl. theater-triage.test.ts)
// keep working unchanged.
export { triageKeyAction } from './useTheaterKeyboard'
export type { TriageKeyAction } from './useTheaterKeyboard'

/** Pure: does committing a pending delete-undo owe the server a DELETE call?
 * Only when the pending undo is itself a `'delete'` — an `'archive'`/`'keep'`
 * undo never scheduled one, so committing it (by doing nothing) is correct. */
export function shouldCommitDelete(undo: TriageUndoAction | null): boolean {
  return undo?.type === 'delete'
}

/** Pure: should an undo-toast dismiss timer armed for `expiring` actually
 * clear the toast when it fires? Only when `current` is still that exact
 * action (identity, not value, equality — a fresh action object is created
 * on every Done/Later/Delete, even a repeat of the same type). A `false`
 * result means a newer action has since replaced it, and the stale timer
 * must be a no-op rather than wiping the newer undo out from under it. */
export function shouldDismissUndo(
  current: TriageUndoAction | null,
  expiring: TriageUndoAction,
): boolean {
  return current === expiring
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
   * Shared mode, TASK 3 (owner report): the source post couldn't be resolved
   * (FxTwitter 401/404 — deleted, private, or suspended). `sharedItem` is
   * then a minimal stub (author/platform only, `contentType: 'text'`) built
   * by the page so the lead renders a graceful "no longer available"
   * treatment (`StageUnavailable`) instead of the real post — no retry, no
   * save CTA, no X-connect CTA, since there's nothing behind it to act on.
   * Also un-pins the shared-post-repeat pin (see `sharedPinned` below) —
   * there's nothing to repeat, so the stub's 'timed' progress kind is left
   * free to auto-advance the queue into the live pulse after its normal 10s
   * dwell, exactly like any other timed item.
   */
  sharedUnavailable?: boolean
  /**
   * Whether the visiting user is signed in. Shared mode: swaps Connect for a
   * direct Save. Playlist mode: initial SSR hint for the Save-playlist
   * CTA — `useAuthMe()` inside the shell is the live source of truth (it can
   * change without a reload if sign-in completes in-modal).
   */
  authed?: boolean
  /** Playlist mode (`/t/{username}/{tag}` — a playlist is one shared tag): identity + count driving the chrome and the Save-playlist CTA. */
  playlist?: TheaterPlaylistMeta
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
  /**
   * Called when the viewer flips the Live ⇄ My Collection switch. The switch
   * is a ROUTE on the signed-in theater (`/` is Live, `/collection` is My
   * Collection — owner: "a specific route that they select"), so the page
   * passes a `router.push` here. The tab still flips locally first, so the
   * switch responds instantly and doesn't wait on navigation; callers that
   * are a plain overlay (the `/library` grid's triage session) omit it.
   */
  onTriageTabChange?: (tab: TriageTab) => void
  /** Notify the Collection feed so it can drop archived/deleted items without a refetch. */
  onTriageResolved?: (id: string, action: 'archive' | 'delete') => void
  /** Notify the Collection feed an archive was undone, so it can restore the item + unread count. */
  onTriageRestored?: (item: FeedItem) => void
  /**
   * A post was added to the collection from the theater (the Live tab's Save).
   * Hands the grid the ready-made row so it can place it in-line, instead of
   * the old `tweet-added` broadcast that made the grid throw away its whole
   * list — and its scroll position — to refetch page 1.
   */
  onCollectionAdded?: (item: FeedItem) => void
  /** Triage mode only — closes the overlay (it lives over `/`, there is no page to navigate back to). */
  onClose?: () => void
}

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
 * Which of the three groups a live-queue item belongs to. The queue is built,
 * ordered and LABELLED off this one function so the section headings in
 * `UpNextList` can never disagree with the playback order (owner: "do we need
 * to be clear about what's been seen, what hasn't been seen yet, and then new
 * things that have come in as we've been watching?").
 *
 * - `arrived` — showed up from a poll while this session was open. Genuinely
 *   new, so it leads regardless of when it was added to ADHX.
 * - `unwatched` — was already in the feed and the viewer hasn't seen it.
 * - `watched` — seen BEFORE this session started. An item watched during the
 *   session keeps its group (see `wasSeen`), so nothing jumps under the
 *   viewer mid-watch.
 */
export type LiveQueueGroup = 'arrived' | 'unwatched' | 'watched'

export const LIVE_QUEUE_GROUP_ORDER: readonly LiveQueueGroup[] = ['arrived', 'unwatched', 'watched']

/**
 * Human labels for the section headings, kept next to the order they follow.
 *
 * These name the queue as it was WHEN YOU ARRIVED, because that's what the
 * grouping is (see `wasSeen` below) — positions stay put while you watch, so
 * the position counter means something and nothing slides out from under you.
 * The labels have to say that, though: "Not watched yet" over a row you just
 * finished (and which now carries a ✓) reads as a bug — owner report, "it's
 * categorizing a video that I've not watched yet but when I watch it, it stays
 * in that section". "Up next" is true either way, and the ✓ plus the live
 * remaining-count in the heading are what show progress within it.
 */
export const LIVE_QUEUE_GROUP_LABEL: Record<LiveQueueGroup, string> = {
  arrived: 'New since you opened',
  unwatched: 'Up next',
  watched: 'Watched earlier',
}

/**
 * Pure: an item's group.
 *
 * `wasSeen` MUST be the arrival snapshot (`SeenSet.seenOnEntry`), not the live
 * seen state — grouping off the live state would yank the post you're watching
 * to the back of the queue the moment its dwell timer marks it seen.
 */
export function liveQueueGroupOf(
  key: string,
  wasSeen: (key: string) => boolean,
  isFresh: (key: string) => boolean,
): LiveQueueGroup {
  if (isFresh(key)) return 'arrived'
  return wasSeen(key) ? 'watched' : 'unwatched'
}

/**
 * Pure: the timestamp the live queue SORTS by — deliberately the same value
 * the row chips DISPLAY (`addedAt`, when the post first hit ADHX).
 *
 * They used to differ: the queue was ordered by `createdAt` (the moving pulse
 * event time) while the chips rendered `addedAt`, so the list read "14h, 2h,
 * 4h, 1d, 1w" — owner report, "these time stamps are not right, they're out of
 * order". Sorting by the displayed value makes the list monotonic by
 * construction. `createdAt` is still what decides whether a polled item is a
 * fresh arrival; it's just no longer what orders the queue.
 */
function queueSortMs(item: { addedAt?: string | null; createdAt: string }): number {
  const added = hasKnownTimestamp(item.addedAt) ? Date.parse(item.addedAt as string) : NaN
  if (Number.isFinite(added)) return added
  const created = Date.parse(item.createdAt)
  return Number.isFinite(created) ? created : 0
}

/**
 * Pure: the live queue's playback order — new arrivals, then unwatched, then
 * watched; newest-added first inside each group.
 *
 * Live mode is "what the community previewed, saved and sent in the last 24
 * hours" (owner), and the point of opening it is to watch what you haven't
 * seen: index 0 is always the next thing to play, so a refresh resumes there
 * with nothing persisted. Watched posts stay in the queue — reachable by
 * browsing, or wholesale via the waiting stage's re-watch button / repeat —
 * but nothing auto-plays them.
 *
 * Arrivals keep their incoming order (the poll merge already prepends newest
 * first) rather than being re-sorted by `addedAt`: a resurfacing post can be
 * weeks old and still be the thing that just landed.
 *
 * Playlist and shared modes never call this — a curated playlist has its own
 * order, and a shared post always leads.
 */
export function orderLiveQueue<
  T extends { platform: string; bookmarkId?: string | null; url: string } & {
    addedAt?: string | null
    createdAt: string
  },
>(items: T[], wasSeen: (key: string) => boolean, isFresh: (key: string) => boolean): T[] {
  const groups: Record<LiveQueueGroup, T[]> = { arrived: [], unwatched: [], watched: [] }
  for (const item of items) {
    groups[liveQueueGroupOf(theaterItemKey(item), wasSeen, isFresh)].push(item)
  }
  // Newest-added first within the two settled groups; arrivals keep the order
  // the merge gave them. Array.prototype.sort is stable, so equal stamps hold
  // their relative position.
  for (const g of ['unwatched', 'watched'] as const) {
    groups[g].sort((a, b) => queueSortMs(b) - queueSortMs(a))
  }
  const ordered = LIVE_QUEUE_GROUP_ORDER.flatMap((g) => groups[g])
  // Same reference back when nothing actually moved — cheap re-renders.
  return ordered.every((item, i) => item === items[i]) ? items : ordered
}

/**
 * Pure: how many items at the front of an `orderLiveQueue` queue are unwatched
 * — i.e. the index where the already-watched block starts. `0` means the
 * viewer has watched everything in the window (the caught-up case).
 */
export function unseenBlockLength<
  T extends { platform: string; bookmarkId?: string | null; url: string },
>(items: T[], wasSeen: (key: string) => boolean): number {
  let n = 0
  while (n < items.length && !wasSeen(theaterItemKey(items[n]))) n++
  return n
}

/**
 * Pure: where a `goNext` lands, folding in the unseen boundary on top of
 * `computeLoopedNext`.
 *
 * An AUTO advance (a video ending, the timed dwell) stops at the end of the
 * unseen block and hands over to the waiting stage rather than rolling into
 * posts the viewer already watched — "you would need to specifically click
 * the re-watch button or hit repeat" (owner). Three things deliberately
 * bypass the boundary: user-initiated navigation (browsing on is always
 * allowed), `loop` (collection mode, or repeat 'all' — an explicit opt-in to
 * going round again), and `unseenCount === 0` (nothing unseen to protect, so
 * end-of-feed behaviour applies as before; the caught-up stage is entered up
 * front in that case instead).
 */
export function computeLiveNext(opts: {
  length: number
  index: number
  unseenCount: number
  loop: boolean
  userInitiated: boolean
  /**
   * First index that is STILL unwatched (live seen state), excluding the
   * current one — or null when nothing is left.
   *
   * This is what stops "caught up" from lying. Auto-advance only moves
   * forward, but a fresh arrival PREPENDS to index 0, so a viewer who is
   * already at index 13 never reaches it: the run ahead of them ends, the
   * boundary fires, and the stage claims they're caught up while unwatched
   * posts — including the one that just landed — sit behind the cursor. Owner
   * report: "a new video came in but it's not automatically playing that…
   * I shouldn't have to click re-watch because I haven't seen the new video
   * yet." So the boundary means "nothing unwatched anywhere", not "nothing
   * ahead of me".
   */
  nextUnwatchedIndex?: number | null
}): number | 'waiting' | null {
  const { length, index, unseenCount, loop, userInitiated, nextUnwatchedIndex } = opts
  const next = computeLoopedNext(length, index, loop)
  if (next === null) return null
  const wouldStop =
    next === 'waiting' || (!loop && !userInitiated && unseenCount > 0 && next >= unseenCount)
  if (!wouldStop) return next
  // About to stop — but only actually stop if there's nothing left unwatched.
  //
  // The index must be USABLE, not merely present. It comes from a ref computed
  // during an earlier render, so after a fresh arrival prepends and reorders
  // the queue it can be stale in two ways, and both used to be returned
  // verbatim:
  //
  //  - equal to `index`: the caller then sets the key it already has, React
  //    bails on the identical state, no re-render happens, the finished video
  //    never gets a new src — and the waiting stage never appears either. That
  //    is the owner's "it played the new video and then just stopped, without
  //    showing the final screen".
  //  - beyond the end: `items[next]` is undefined downstream.
  //
  // Either way the honest answer is the caught-up stage.
  const rescuable =
    typeof nextUnwatchedIndex === 'number' &&
    nextUnwatchedIndex >= 0 &&
    nextUnwatchedIndex < length &&
    nextUnwatchedIndex !== index
  if (rescuable) return nextUnwatchedIndex
  return 'waiting'
}

/**
 * Pure: how many posts the counter should be OUT OF — i.e. how many will
 * actually play from here.
 *
 * Auto-advance stops at the end of the unwatched run unless repeat says
 * otherwise, so "2 / 26" was misleading whenever only a handful were pending.
 * With repeat off the denominator is that run; with repeat on it's the whole
 * queue. Flipping the control therefore visibly changes the number, which is
 * the clearest feedback available that the switch did something (owner: "maybe
 * for mobile where it shows the count and position in that count, it should be
 * aware of that too").
 *
 * Falls back to the full length in the two cases where the run doesn't
 * describe the viewer's position: nothing pending (caught up — the whole queue
 * is what a re-watch would play), and having browsed back into already-watched
 * posts, where the index sits outside the run.
 */
export function computeQueueTotal(opts: {
  index: number
  length: number
  unseenCount: number
  repeatMode: RepeatMode
}): number {
  const { index, length, unseenCount, repeatMode } = opts
  if (repeatMode !== 'off') return length
  if (unseenCount <= 0 || index < 0 || index >= unseenCount) return length
  return unseenCount
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

// Spotify-style repeat control (mobile round 8, owner request):
// - 'off'  — the existing behavior: advance to the end, then the waiting
//   stage ("You're all caught up") until something new arrives.
// - 'all'  — the whole queue loops, exactly like playlist mode's built-in
//   loop; the waiting stage is never entered.
// - 'one'  — the current post repeats (the same player-level loop the
//   shared-post pin uses); timed items simply stay put.
// One button cycles off → all → one. The type lives in ./types (chromes
// import it too); re-exported here for tests/callers.
export type { RepeatMode } from './types'

/**
 * Pure: the repeat button's cycle order — off → all → one → off. Collection
 * mode (`wrapOnly`) has no 'off': a curated playlist is a loop by
 * definition (there's no live feed to wait on), so the button just toggles
 * whole-queue ⇄ this-post there.
 */
export function nextRepeatMode(mode: RepeatMode, wrapOnly = false): RepeatMode {
  if (wrapOnly) return mode === 'all' ? 'one' : 'all'
  return mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'
}

/**
 * Pure: should a *non-user* advance off `currentKey` re-enter the waiting
 * stage instead of stepping into the rest of the queue? True exactly when the
 * item that just finished is the fresh arrival the waiting stage auto-played
 * (owner report: finishing that one new video dumped them back into the old
 * playlist — they expected to wait for the next new send) and no repeat mode
 * overrides it. User-initiated navigation clears `stagedKey` before ever
 * reaching this, so deliberately browsing onward still works.
 */
export function shouldRewaitAfterArrival(
  stagedKey: string | null,
  currentKey: string | null,
  repeatMode: RepeatMode,
): boolean {
  return stagedKey !== null && currentKey === stagedKey && repeatMode === 'off'
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

/**
 * Pure: does the shared-post-repeat pin currently apply? True only in shared
 * mode (a preview page's `TheaterShell mode="shared"`), only while `pinned`
 * (shared-post-repeat: starts true on landing, cleared for the rest of the
 * session the moment the visitor deliberately navigates — see the
 * `goNextUser`/`goPrevUser`/`onSelectUser` wrappers below), and only while
 * the item actually on stage IS the shared post. That last check matters
 * because the pin outliving a navigation away would otherwise be
 * indistinguishable from a bug — if `pinned` is somehow still true but
 * `currentKey` has moved on, nothing should behave differently for whatever
 * is now playing.
 */
export function isSharedPostPinned(
  mode: TheaterMode,
  sharedItemKey: string | null,
  pinned: boolean,
  currentKey: string | null,
): boolean {
  return mode === 'shared' && pinned && sharedItemKey !== null && currentKey === sharedItemKey
}

/**
 * Pure: is the item currently on stage the shared lead post AND was it
 * resolved as unavailable (TASK 3 — deleted/private/suspended source)? Same
 * identity discipline as `isSharedPostPinned` (mode + key match) — once a
 * deliberate nav or the stub's own 10s auto-advance moves the current item
 * on, this flips false and the normal `<Stage/>` dispatch takes back over
 * for whatever comes next. Deliberately independent of the pin: an
 * unavailable lead is never pinned (see `sharedPinned`'s init) precisely so
 * this state doesn't linger.
 */
export function isSharedItemUnavailable(
  mode: TheaterMode,
  sharedUnavailable: boolean,
  sharedItemKey: string | null,
  currentKey: string | null,
): boolean {
  return (
    mode === 'shared' && sharedUnavailable && sharedItemKey !== null && currentKey === sharedItemKey
  )
}

export function TheaterShell({
  seed,
  mode = 'home',
  sharedItem,
  sharedUnavailable = false,
  authed = false,
  playlist,
  triageItems,
  initialTriageIndex,
  initialTriageTab,
  onTriageTabChange,
  onTriageResolved,
  onTriageRestored,
  onCollectionAdded,
  onClose,
}: TheaterShellProps) {
  const isTriage = mode === 'triage'
  // Collection mode (`/t/{username}/{tag}`) is a fixed, curated queue to loop
  // through — never a live blend with the anonymous community pulse. Triage
  // mode never loops either — its queue is a finite backlog with a real end
  // ("All caught up"), not a wraparound.
  const loop = mode === 'playlist'
  // Triage's Collection tab never blends the live pulse in; its Live tab
  // reuses the exact same live feed home/shared mode does.
  const [triageTab, setTriageTab] = useState<TriageTab>(initialTriageTab ?? 'live')
  // Flip locally first (instant switch), then let the page navigate to that
  // tab's route — see `onTriageTabChange`.
  const changeTriageTab = useCallback(
    (tab: TriageTab) => {
      setTriageTab(tab)
      onTriageTabChange?.(tab)
    },
    [onTriageTabChange],
  )
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
  // Ref-backed so `handleTriageLiveSave` (registered once) always sees the
  // current handler without re-creating itself on every grid render.
  const onCollectionAddedRef = useRef(onCollectionAdded)
  onCollectionAddedRef.current = onCollectionAdded

  const [triageSavedKeys, setTriageSavedKeys] = useState<Set<string>>(new Set())
  const triageSavedKeysRef = useRef(triageSavedKeys)
  useEffect(() => {
    triageSavedKeysRef.current = triageSavedKeys
  }, [triageSavedKeys])
  const [tagPickerItem, setTagPickerItem] = useState<{
    platform: string
    bookmarkId: string
  } | null>(null)
  const triageRecordedRef = useRef(false)
  const triageUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Separate from `triageUndoTimerRef` (which defers the server DELETE for a
  // 'delete' undo): this one just auto-dismisses the "Done/Later · Undo"
  // toast after the same 5s window, since archive/keep undos have nothing to
  // defer — the read/no-op already happened synchronously.
  const undoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  const clearUndoDismissTimer = useCallback(() => {
    if (undoDismissTimerRef.current) clearTimeout(undoDismissTimerRef.current)
    undoDismissTimerRef.current = null
  }, [])

  // Auto-dismiss the undo toast 5s after an archive/keep action — matching
  // `triageDelete`'s own 5s window. Guarded by identity (`u === action`) so a
  // stale timer left running from a superseded action can never wipe a
  // newer undo that's since replaced it.
  const armUndoDismiss = useCallback(
    (action: TriageUndoAction) => {
      clearUndoDismissTimer()
      undoDismissTimerRef.current = setTimeout(() => {
        undoDismissTimerRef.current = null
        setTriageUndo((u) => (shouldDismissUndo(u, action) ? null : u))
      }, 5000)
    },
    [clearUndoDismissTimer],
  )

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
    const action: TriageUndoAction = { type: 'archive', item, index: idx }
    setTriageUndo(action)
    armUndoDismiss(action)
    setTriageIndex(triageAdvance)
  }, [
    triageCurrentFeedItem,
    triageIndex,
    recordTriageStreak,
    onTriageResolved,
    commitPendingTriageDelete,
    armUndoDismiss,
  ])

  // Later: defer — advance without changing read state.
  const triageLater = useCallback(() => {
    if (!triageCurrentFeedItem) return
    recordTriageStreak()
    commitPendingTriageDelete()
    const action: TriageUndoAction = {
      type: 'keep',
      item: triageCurrentFeedItem,
      index: triageIndex,
    }
    setTriageUndo(action)
    armUndoDismiss(action)
    setTriageIndex(triageAdvance)
  }, [
    triageCurrentFeedItem,
    triageIndex,
    recordTriageStreak,
    commitPendingTriageDelete,
    armUndoDismiss,
  ])

  const triageDelete = useCallback(() => {
    if (!triageCurrentFeedItem) return
    recordTriageStreak()
    const item = triageCurrentFeedItem
    commitPendingTriageDelete()
    // A pending delete has its own 5s expiry (the commit timer above), so it
    // owns the toast's dismissal — any archive/keep dismiss timer still
    // running from a prior action is now moot.
    clearUndoDismissTimer()
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
    clearUndoDismissTimer,
  ])

  const triageDoUndo = useCallback(() => {
    if (!triageUndo) return
    clearUndoDismissTimer()
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
  }, [triageUndo, onTriageRestored, clearTriageUndoTimer, clearUndoDismissTimer])

  // ArrowUp "Back": pure navigation only — never touches read/delete state,
  // unlike `U` (which reverses the last action).
  const triageStepBack = useCallback(() => {
    setTriageIndex(triageStepBackIndex)
  }, [])

  // A video finished playing in triage's Collection tab ("My Collection is
  // just a different playlist in that same theater" — the owner's standing
  // directive, reversing the earlier "videos never auto-advance there"
  // rule). Deliberately NOT `triageLater`: finishing a video isn't a
  // decision the way tapping Later is — `triageLater` also records a streak
  // beat and pops the "Later · Undo" toast, both of which would misrepresent
  // a post the viewer simply watched to the end as one they consciously
  // deferred. This is pure navigation, exactly like `triageStepBack` but
  // forward — Done/Later/Delete remain the only ways to actually resolve an
  // item's read state; finishing playback just moves the queue along.
  // Landing past the last item is already handled for free: `triageFinished`
  // (`triageIndex >= triageQueue.length`) flips true and the Collection tab
  // renders `TriageAllClear`, same as after a real Done/Later/Delete.
  const triageAdvanceOnEnded = useCallback(() => {
    setTriageIndex(triageAdvance)
  }, [])

  // Flush any pending delete, and cancel the undo-toast dismiss timer, when
  // the shell unmounts (AuthedHome closes triage by conditionally unmounting
  // the whole `<TheaterShell/>`).
  useEffect(() => {
    if (!isTriage) return
    return () => {
      commitPendingTriageDelete()
      clearUndoDismissTimer()
    }
  }, [isTriage, commitPendingTriageDelete, clearUndoDismissTimer])

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
      // …and the live tab's own tag map, which is what renders the chips there.
      setLiveTagsByKey((prev) => ({
        ...prev,
        [`${platform}:${detail.bookmarkId}`]: detail.tags ?? [],
      }))
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

  // Tag-from-live target: tapping Tag on a live item first ensures the post
  // is SAVED (a tag row needs a bookmark row to hang off), then opens the
  // TagQuickPicker for it.
  const [liveTagTarget, setLiveTagTarget] = useState<{
    platform: TheaterItem['platform']
    bookmarkId: string
  } | null>(null)

  const handleTriageLiveSave = useCallback(async (item: TheaterItem): Promise<boolean> => {
    const key = theaterItemKey(item)
    const url = sourceUrl(item.platform, item.author, item.bookmarkId || '')
    if (!url) return false
    try {
      const res = await fetch('/api/bookmarks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, source: 'manual' }),
      })
      if (res.ok) {
        setTriageSavedKeys((prev) => new Set(prev).add(key))
        // Did we manage to hand the grid a ready-made row? If not (no
        // bookmarkId, a failed lookup, a row the feed didn't return) the grid
        // still has to learn about the post somehow, so fall back to the
        // refetch below rather than leaving it invisible until a reload.
        let placedInGrid = false
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
                // Hand the same row to the grid behind the overlay. It used to
                // fire `tweet-added`, whose only listener refetches the WHOLE
                // feed — resetting the grid to page 1 and losing however far
                // the viewer had scrolled, for one added post (state review).
                if (onCollectionAddedRef.current) {
                  onCollectionAddedRef.current(saved)
                  placedInGrid = true
                }
              }
            }
          } catch {
            // Queue/grid update is best-effort; the save itself succeeded.
          }
        }
        // Either way the Header's counts must move — this path only ever told
        // the local Save button.
        notifyCollectionChanged({ refetchFeed: !placedInGrid })
      }
      return res.ok
    } catch {
      // Best effort — the button simply won't flip to "Saved".
    }
    return false
  }, [])

  const handleTriageLiveTag = useCallback(
    async (item: TheaterItem) => {
      if (!item.bookmarkId) return
      const key = theaterItemKey(item)
      // Tagging implies keeping: save first when the post isn't in the
      // collection yet, then open the picker.
      if (!triageSavedKeysRef.current.has(key)) {
        const ok = await handleTriageLiveSave(item)
        if (!ok) return
      }
      setLiveTagTarget({ platform: item.platform, bookmarkId: item.bookmarkId })
    },
    [handleTriageLiveSave],
  )

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

  // Repeat mode (round 8): session-persisted like the sound preference —
  // read on mount (not the initializer, for the same SSR-hydration reason),
  // written on change. Playlist mode DOES expose it (owner: the playlist
  // player should show the repeat icon, selected): it opens on 'all' — looping
  // IS the playlist's resting state — and toggles all ⇄ one
  // (`nextRepeatMode`'s wrapOnly), so it deliberately skips the sessionStorage
  // read/write below: a playlist page's toggle is per-visit and must never
  // bleed into the home theater's persisted preference (or vice versa).
  //
  // Only the triage COLLECTION tab hides it — a finite backlog with its own
  // Done/Later semantics, where a stale 'one'/'all' would repeat or wrap a
  // queue with no visible control to turn it off. It used to be gated on
  // `!isTriage`, which was fine while triage was an overlay over the grid; the
  // moment authed `/` became `mode="triage"` on the LIVE tab, that silently
  // took the repeat button off the live theater for every signed-in viewer
  // (owner report: "the repeat icon isn't there anymore… I should be able to
  // continually repeat the whole live playlist or just repeat a single post").
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(loop ? 'all' : 'off')
  const repeatEnabled = !isTriageCollection
  const effectiveRepeatMode: RepeatMode = repeatEnabled ? repeatMode : 'off'
  const repeatModeRef = useRef(effectiveRepeatMode)
  repeatModeRef.current = effectiveRepeatMode
  // Persisted ACROSS visits (localStorage), not per-session: "keep playing" is
  // a standing preference about how the theater behaves when you run out of
  // unwatched posts, and a viewer who wants continuous play shouldn't have to
  // re-set it every visit — which is what made the control feel like a missing
  // setting rather than a switch. Deliberately NOT persisting 'one': that one
  // is about the post in front of you, and inheriting it next visit would
  // strand you looping something at random. So a session where you flip to
  // 'one' leaves your last durable off/all choice untouched.
  useEffect(() => {
    if (loop) return
    try {
      if (localStorage.getItem('adhx-theater-repeat') === 'all') setRepeatMode('all')
    } catch {
      // Storage unavailable — keep 'off'.
    }
  }, [loop])
  useEffect(() => {
    if (loop || repeatMode === 'one') return
    try {
      localStorage.setItem('adhx-theater-repeat', repeatMode)
    } catch {
      // Never let a storage failure break playback.
    }
  }, [loop, repeatMode])

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
  /**
   * The item the caught-up stage is parked on WITHOUT having played it — set
   * only by the mount-time "everything in the window is already watched" path.
   * Resuming from there must start ON this item, not after it (owner: loading
   * the theater went straight to caught-up and "Keep playing" started at
   * "2 out of 19" — item 1 was skipped, having never played).
   *
   * Holds the key rather than a boolean so it self-clears: if the viewer
   * browses somewhere else first, the keys no longer match and resuming
   * advances normally.
   */
  const parkedUnplayedKeyRef = useRef<string | null>(null)

  const [pinnedKey, setPinnedKey] = useState<string | null>(() =>
    sharedItem ? theaterItemKey(sharedItem) : null,
  )

  // shared-post-repeat: a SEPARATE pin from `pinnedKey` above (that one only
  // controls display ORDER; this one controls whether the shared post
  // REPEATS instead of letting auto-advance carry the visitor into the live
  // pulse). Starts true in shared mode — the meme/post the visitor followed
  // a link for is why they're here, and a 5s auto-advance would carry them
  // past it before they can Save/tag/copy the link. Cleared for the rest of
  // the session (never re-armed) the moment the visitor deliberately
  // navigates — see `goNextUser`/`goPrevUser`/`onSelectUser` below, which are
  // the ONLY call sites that clear it. Auto-advance itself (`goNext` called
  // from Stage's `onEnded`, the 'timed' `theater-advance` listener, or the
  // waiting-stage auto-arrival effect) must never clear it — that's the
  // entire point of the pin.
  // TASK 3: an unavailable lead is never pinned — there's nothing behind it
  // to repeat/protect the viewer from auto-advancing past, unlike a real
  // shared post.
  const [sharedPinned, setSharedPinned] = useState(mode === 'shared' && !sharedUnavailable)
  const clearSharedPin = useCallback(() => setSharedPinned(false), [])
  const sharedItemKey = mode === 'shared' && sharedItem ? theaterItemKey(sharedItem) : null

  // Set once a user has navigated (keyboard/rail click) — after that, the
  // opening pick below never overrides their choice.
  const hasNavigatedRef = useRef(false)
  const leadAppliedRef = useRef(false)

  // Set by the waiting stage's re-watch button: the viewer has explicitly
  // asked to go round the already-watched queue again, so the unseen boundary
  // stops applying for the rest of the session (repeat 'all' is the other
  // opt-in, handled via `loop`). Never set implicitly — that's the whole
  // point of the owner's "you would need to specifically click it".
  const [rewatching, setRewatching] = useState(false)

  // Does this surface order its queue unseen-first? The live feed does — home,
  // the authed Live tab, AND a shared preview page, whose queue below the
  // shared post IS that same live feed (owner: a preview page showed no
  // sections while `/` showed them — "we just need to be always consistent
  // here"). The shared post itself still leads, via `pinnedKey`, and is
  // excluded from the grouping by the lists. Only a curated tag playlist opts
  // out: it has one authored order and no notion of "what's new".
  const liveOrdering = !loop
  // ORDERING uses the arrival snapshot, never the live seen state — see
  // `orderLiveQueue`. Identity is stable per snapshot so the memos below
  // don't recompute as the viewer marks things seen.
  const seenOnEntry = seenSet.seenOnEntry
  const wasSeenOnEntry = useCallback((key: string) => seenOnEntry.includes(key), [seenOnEntry])

  // The list every index/nav computation below operates on: the live queue
  // ordered unseen-first, then the pinned key (if any) moved to the front.
  // Keep this as THE list used everywhere so the rail/mobile-chrome render
  // order matches keyboard order.
  // Fresh arrivals (polled in while this session was open) lead the queue —
  // read through a ref-free callback so the memo below re-runs when a poll
  // lands, which is exactly when the grouping changes.
  const isFreshKey = useCallback((key: string) => feed.freshKeys.has(key), [feed.freshKeys])
  const orderedItems = useMemo(
    () =>
      liveOrdering && seenSet.ready ? orderLiveQueue(items, wasSeenOnEntry, isFreshKey) : items,
    [items, liveOrdering, seenSet.ready, wasSeenOnEntry, isFreshKey],
  )
  const displayItems = useMemo(
    () => pinKeyFirst(orderedItems, pinnedKey),
    [orderedItems, pinnedKey],
  )

  // Where the already-watched block starts. 0 disables the boundary entirely
  // (nothing unseen, or the viewer opted into a re-watch / repeat 'all'), which
  // is exactly what `computeLiveNext` treats as "no boundary".
  // The shared post leads whether or not this viewer has seen it before, so a
  // re-visited shared link would otherwise start the queue with a WATCHED row
  // and zero the run — killing the boundary for the whole live queue behind
  // it. Count the lead as pending: it's the post they followed a link to.
  const wasSeenForRun = useCallback(
    (key: string) => (key === sharedItemKey ? false : wasSeenOnEntry(key)),
    [sharedItemKey, wasSeenOnEntry],
  )
  const unseenCount = useMemo(
    () =>
      liveOrdering && seenSet.ready && !rewatching
        ? unseenBlockLength(displayItems, wasSeenForRun)
        : 0,
    [displayItems, liveOrdering, seenSet.ready, rewatching, wasSeenForRun],
  )

  // Seed savedKeys with EXISTING collection membership: a live-tab post the
  // viewer already saved (this session or any other) must show "Saved", not
  // "Save". One bulk `/api/feed?id=…&id=…` lookup per batch of unseen items;
  // each id is checked at most once per mount.
  /**
   * Tags of posts on the LIVE tab, keyed `platform:bookmarkId`. The Collection
   * tab reads tags off its queue snapshot, but the live feed carries no tags at
   * all — so a tag added from the live tab had nothing to render (owner: "when
   * I tap the tag icon, it's not showing the tag under the description").
   * Seeded from the membership lookup below, which already fetches the saved
   * FeedItem (tags included), and kept current by the tags-changed listener.
   */
  const [liveTagsByKey, setLiveTagsByKey] = useState<Record<string, string[]>>({})

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
    const attempted = unknown.map((it) => theaterItemKey(it))
    fetch(`/api/feed?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('lookup failed'))))
      .then((d) => {
        const owned: FeedItem[] = d?.items ?? []
        if (!owned.length) return
        setTriageSavedKeys((prev) => {
          const next = new Set(prev)
          for (const f of owned) next.add(`${f.platform ?? 'twitter'}:${f.id}`)
          return next
        })
        setLiveTagsByKey((prev) => {
          const next = { ...prev }
          for (const f of owned) next[`${f.platform ?? 'twitter'}:${f.id}`] = f.tags ?? []
          return next
        })
      })
      .catch(() => {
        // The ids were marked "checked" BEFORE the request so a re-render
        // can't double-fetch them — but a failed lookup must not mark them
        // checked forever, or an already-saved post shows "Save" for the rest
        // of the session (state review). Un-mark so the next render retries.
        for (const k of attempted) membershipCheckedRef.current.delete(k)
      })
  }, [isTriage, triageTab, displayItems])

  // Kept in a ref (rather than effect deps) so goNext/goPrev/the dwell timer
  // (useTheaterDwell) only reset when `currentKey` itself changes, not on
  // every unrelated re-render (polling, seen-state updates, etc.).
  const itemsRef = useRef(displayItems)
  itemsRef.current = displayItems
  // Read fresh inside goNext/goPrev (empty-deps callbacks) without
  // re-registering them on every waiting/feed change.
  const waitingRef = useRef(waiting)
  waitingRef.current = waiting
  const freshKeysRef = useRef(feed.freshKeys)
  freshKeysRef.current = feed.freshKeys
  // Snapshot of `freshKeys` taken the moment waiting begins — anything
  // added to freshKeys AFTER this point is a genuinely new arrival the
  // waiting stage should auto-play into (see the effect near the bottom).
  // Staging an arrival ADDS its key here (rather than resnapshotting), so a
  // second item that arrived while the first played is still "new" when the
  // first one finishes and waiting resumes.
  const waitingBaselineFreshKeysRef = useRef<Set<string>>(new Set())
  // The fresh arrival the waiting stage auto-played into, if that's what's
  // on stage right now. While set, a NON-user advance off it (video ended /
  // timed dwell) re-enters the waiting stage instead of continuing into the
  // already-browsed queue (see `shouldRewaitAfterArrival`). Cleared by every
  // user-initiated navigation — deliberately browsing onward from the
  // arrival behaves exactly like browsing from anywhere else.
  const stagedFromWaitingKeyRef = useRef<string | null>(null)

  // Land on the first item immediately (no flash of an empty stage); a
  // moment later, once localStorage seen-state has hydrated, the queue
  // reorders unseen-first and the effect below re-points at its head.
  // In shared mode the seed's first item IS the shared post (buildSharedSeed
  // puts it first), so this already lands on it with no extra branching.
  useEffect(() => {
    if (currentKey === null && displayItems.length > 0) {
      setCurrentKey(theaterItemKey(displayItems[0]))
    }
  }, [displayItems, currentKey])

  useEffect(() => {
    // Shared mode never re-picks — the shared post is ALWAYS the initial
    // current item, whatever this viewer has seen elsewhere. Collection mode
    // never re-picks either: a curated tag collection always opens on its
    // first item, in curated order.
    if (sharedItem || loop) return
    if (!seenSet.ready || leadAppliedRef.current || hasNavigatedRef.current) return
    leadAppliedRef.current = true
    if (items.length === 0) return
    // `displayItems` is already ordered unseen-first by the time seen-state is
    // ready, so its head IS "the next post you haven't watched" — which is
    // also what makes a refresh resume where the viewer left off (owner), with
    // no session bookkeeping to persist. This replaced a "highest trendCount
    // among unseen" lead pick: the queue's own recency order is what the
    // viewer can predict, and playback now walks the whole unseen block rather
    // than one hand-picked post.
    const head = displayItems[0]
    if (!head) return
    if (unseenCount === 0) {
      // Everything in the live window has already been watched: park on the
      // caught-up stage rather than silently replaying. Getting out of it is
      // the explicit re-watch button (or repeat), never an auto-advance.
      waitingBaselineFreshKeysRef.current = new Set(freshKeysRef.current)
      // Parked, not finished: this item has not played, so a resume belongs on
      // it rather than after it.
      parkedUnplayedKeyRef.current = theaterItemKey(head)
      setWaiting(true)
    }
    setCurrentKey(theaterItemKey(head))
  }, [seenSet.ready, items, displayItems, unseenCount, sharedItem, loop])

  const currentIndex = useMemo(
    () => displayItems.findIndex((it) => theaterItemKey(it) === currentKey),
    [displayItems, currentKey],
  )
  const current: TheaterItem | null = currentIndex === -1 ? null : displayItems[currentIndex]
  // shared-post-repeat: is the shared post BOTH pinned AND actually on stage
  // right now? Gates the player-level repeat (Stage's `repeat` prop) and the
  // 'timed' auto-advance suppression below — see `isSharedPostPinned`'s doc
  // comment for why the "actually current" half matters.
  const isSharedPinnedOnCurrent = isSharedPostPinned(mode, sharedItemKey, sharedPinned, currentKey)
  // Round 8: the shared-post pin and the repeat button's 'one' mode are the
  // same player-level behavior (loop the current post, suppress every
  // auto-advance path) — this is THE combined signal every consumer uses:
  // Stage's `repeat` prop, the progress-line pin demotion, the chromes'
  // `repeatCurrent`, and the 'timed' advance guard below.
  const repeatCurrentActive = isSharedPinnedOnCurrent || effectiveRepeatMode === 'one'
  // Read fresh inside the `theater-advance` listener (empty-deps-registered
  // below) without re-registering that listener on every render.
  const repeatCurrentActiveRef = useRef(repeatCurrentActive)
  repeatCurrentActiveRef.current = repeatCurrentActive
  // The repeat BUTTON shows the truth the viewer experiences (browser-agent
  // finding: the peek bar said "On repeat" while the button said "Repeat:
  // off"): a pinned shared post IS repeat-one in effect, so the button
  // displays 'one' while the pin holds, and tapping it then releases the pin
  // (see `cycleRepeatMode`) — one control, state + action.
  const displayRepeatMode: RepeatMode = isSharedPinnedOnCurrent ? 'one' : effectiveRepeatMode
  const sharedPinActiveRef = useRef(isSharedPinnedOnCurrent)
  sharedPinActiveRef.current = isSharedPinnedOnCurrent
  // TASK 3: the current stage item is the shared lead AND it's an
  // unavailable (deleted/private/suspended) source — swaps in
  // `StageUnavailable` below instead of the normal `<Stage/>` dispatch.
  const isSharedUnavailableOnCurrent = isSharedItemUnavailable(
    mode,
    sharedUnavailable,
    sharedItemKey,
    currentKey,
  )
  // End-states for the peek bar's prev/next chevrons (tester feedback: at the
  // first post, pressing "back" silently did nothing). `currentIndex === -1`
  // (nothing current, e.g. an empty list) always reads as "can't navigate".
  // Collection mode loops, so both chevrons stay enabled the whole time
  // there's a current item — there's no waiting stage and no dead end.
  // Repeat 'all' navigates exactly like collection mode's loop: both
  // chevrons stay enabled whenever anything is current (round 8).
  const wrapNav = loop || effectiveRepeatMode === 'all'
  const canPrev = wrapNav ? currentIndex !== -1 : computeCanPrev(currentIndex, waiting)
  const canNext = wrapNav ? currentIndex !== -1 : computeCanNext(currentIndex, waiting)

  // Read fresh inside the `theater-advance` listener below without
  // re-registering that listener on every navigation (mirrors itemsRef).
  const currentRef = useRef(current)
  currentRef.current = current
  // Same trick for the unseen boundary — goNext is an empty-deps callback.
  const unseenCountRef = useRef(unseenCount)
  unseenCountRef.current = unseenCount
  const currentKeyRef = useRef(currentKey)
  currentKeyRef.current = currentKey
  // First still-unwatched index (LIVE seen state, not the arrival snapshot),
  // excluding the current item — see `computeLiveNext`'s `nextUnwatchedIndex`.
  // Kept in a ref because goNext is an empty-deps callback.
  const nextUnwatchedIndexRef = useRef<number | null>(null)
  nextUnwatchedIndexRef.current = (() => {
    if (!liveOrdering || !seenSet.ready) return null
    const found = displayItems.findIndex(
      (it, i) => i !== currentIndex && !seenSet.isSeen(theaterItemKey(it)),
    )
    return found === -1 ? null : found
  })()

  // `userInitiated` is passed as an ARGUMENT (not read from a ref) because the
  // updater below runs in React's render phase, long after the call returned —
  // a ref would already have been reset. Only `goNextUser` passes true; every
  // auto-advance path (video ended, timed dwell, arrival staging) leaves it
  // false, which is what makes the unseen boundary a boundary.
  const goNext = useCallback(
    (userInitiated = false) => {
      setCurrentKey((key) => {
        // Round 8: an auto-advance off the waiting stage's auto-played fresh
        // arrival goes back to waiting for the NEXT new send, never onward
        // into the queue the viewer already sat through. The accumulated
        // baseline already contains this arrival's key (added when it was
        // staged), so anything that arrived in the meantime is picked up by
        // the arrival effect immediately. User navigation never lands here —
        // `goNextUser` clears the staged key first.
        // Round 8's re-wait assumed everything behind the arrival was already
        // watched ("don't dump me back into the old playlist"). That holds only
        // while nothing is pending — otherwise re-waiting hides genuinely
        // unwatched posts, which is the same lie the boundary used to tell.
        if (
          shouldRewaitAfterArrival(stagedFromWaitingKeyRef.current, key, repeatModeRef.current) &&
          nextUnwatchedIndexRef.current === null
        ) {
          stagedFromWaitingKeyRef.current = null
          setWaiting(true)
          return key
        }
        const idx = itemsRef.current.findIndex((it) => theaterItemKey(it) === key)
        const next = computeLiveNext({
          length: itemsRef.current.length,
          index: idx,
          unseenCount: unseenCountRef.current,
          loop: loop || repeatModeRef.current === 'all',
          userInitiated,
          nextUnwatchedIndex: nextUnwatchedIndexRef.current,
        })
        if (next === null) return key
        if (next === 'waiting') {
          // Either the last post in the queue, or (auto-advance only) the end
          // of the unseen block — both hand over to the waiting stage instead
          // of clamping silently or replaying watched posts. Idempotent: a
          // repeat advance (e.g. another keypress) while already waiting must
          // not reset the baseline — that would make an item that arrived a
          // moment ago look "not new" and get missed by the fresh-arrival
          // effect below. Collection mode never reaches this branch
          // (computeLiveNext never returns 'waiting' when `loop` is true).
          if (!waitingRef.current) {
            // Got here by finishing the current item, so a resume advances.
            parkedUnplayedKeyRef.current = null
            waitingBaselineFreshKeysRef.current = new Set(freshKeysRef.current)
            setWaiting(true)
          }
          return key
        }
        hasNavigatedRef.current = true
        return theaterItemKey(itemsRef.current[next])
      })
    },
    [loop],
  )

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
      const prev = computeLoopedPrev(
        itemsRef.current.length,
        idx,
        loop || repeatModeRef.current === 'all',
      )
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

  // shared-post-repeat: USER-INITIATED navigation only — keyboard, the
  // chevron buttons, and dock/queue card selection all funnel through these
  // three, and only these three ever clear `sharedPinned`. `goNext`/`goPrev`/
  // `onSelect` themselves stay untouched because auto-advance (Stage's
  // `onEnded`, the 'timed' `theater-advance` listener, the waiting-stage
  // auto-arrival effect) calls them directly and must NEVER clear the pin.
  const goNextUser = useCallback(() => {
    clearSharedPin()
    // Deliberate navigation releases the fresh-arrival hold (round 8) — the
    // viewer choosing to continue past the arrival means "browse the queue",
    // not "wait again after this one".
    stagedFromWaitingKeyRef.current = null
    // `true` = user-initiated: browsing on past the unseen block into
    // already-watched posts is always allowed, it's only AUTO-advance that
    // stops at the boundary.
    goNext(true)
  }, [clearSharedPin, goNext])

  const goPrevUser = useCallback(() => {
    clearSharedPin()
    stagedFromWaitingKeyRef.current = null
    goPrev()
  }, [clearSharedPin, goPrev])

  const onSelectUser = useCallback(
    (key: string) => {
      clearSharedPin()
      stagedFromWaitingKeyRef.current = null
      onSelect(key)
    },
    [clearSharedPin, onSelect],
  )

  // The repeat button (round 8): one control cycling off → all → one.
  // Flipping to 'all' while parked on the waiting stage resumes playback
  // immediately by wrapping to the top of the queue — that's what "repeat
  // the playlist" means from the end of it.
  const cycleRepeatMode = useCallback(() => {
    // While the shared-post pin holds, the button displays 'one' (see
    // `displayRepeatMode`) — so a tap means "stop repeating this post":
    // release the pin and land on 'off', exactly what the displayed
    // one → off step promises. Only after that does the normal cycle apply.
    if (sharedPinActiveRef.current) {
      clearSharedPin()
      setRepeatMode('off')
      return
    }
    // Computed from the ref (not a state updater) so the waiting-stage exit
    // below is a plain side effect, never smuggled into an updater that
    // React may re-invoke (StrictMode double-render safety).
    const next = nextRepeatMode(repeatModeRef.current, loop)
    if (next === 'all' && waitingRef.current) {
      stagedFromWaitingKeyRef.current = null
      setWaiting(false)
      const first = itemsRef.current[0]
      if (first) setCurrentKey(theaterItemKey(first))
      // Same reason as `replayFromStart` — the key may not change, so the
      // paused stage needs telling explicitly.
      window.dispatchEvent(new CustomEvent('theater-resume'))
    }
    setRepeatMode(next)
  }, [clearSharedPin, loop])

  // The waiting stage's re-watch button — a deliberate navigation back to the
  // top of the queue. This is the explicit opt-in the owner asked for: it also
  // lifts the unseen boundary for the rest of the session (`rewatching`), so
  // auto-advance carries on through posts already watched instead of bouncing
  // straight back to the caught-up stage after one post.
  const replayFromStart = useCallback(() => {
    const first = itemsRef.current[0]
    if (!first) return
    hasNavigatedRef.current = true
    clearSharedPin()
    stagedFromWaitingKeyRef.current = null
    parkedUnplayedKeyRef.current = null
    setRewatching(true)
    setWaiting(false)
    setCurrentKey(theaterItemKey(first))
    // Resume explicitly. Entering the waiting stage fired `theater-pause` at a
    // still-mounted stage, and the auto-advance that got us here left
    // `currentKey` ON the last item — so when that item IS `items[0]` (the
    // common case: the unwatched run ended, nothing moved), this sets the key
    // it already had, `src` never changes, StageVideo's `[src]` effect never
    // re-runs, and nothing ever calls play() again. Owner report: "I click
    // rewatch all… it wasn't auto-playing for me."
    window.dispatchEvent(new CustomEvent('theater-resume'))
  }, [clearSharedPin])

  /**
   * "Keep playing" on the caught-up stage: the standing choice, taken at the
   * moment it matters. Sets repeat to whole-queue (persisted across visits, so
   * it's a preference rather than a one-off) and carries straight on into the
   * next post instead of returning to the top like `replayFromStart` does.
   *
   * The next index is computed here rather than through `goNext` because
   * `repeatModeRef` still says 'off' at this point — the state set above lands
   * a render later, so `goNext` would read the old value, hit the boundary and
   * bounce right back into the waiting stage.
   */
  const keepPlaying = useCallback(() => {
    hasNavigatedRef.current = true
    clearSharedPin()
    stagedFromWaitingKeyRef.current = null
    setRepeatMode('all')
    setWaiting(false)
    // Parked on an unplayed item (the caught-up-on-arrival case)? Start THERE.
    // Advancing would skip it, which is what produced "2 out of 19" on a
    // 19-post queue where nothing had played yet.
    const resumeOnCurrent = parkedUnplayedKeyRef.current === currentKeyRef.current
    parkedUnplayedKeyRef.current = null
    const list = itemsRef.current
    if (!resumeOnCurrent && list.length > 0) {
      const idx = list.findIndex((it) => theaterItemKey(it) === currentKeyRef.current)
      const next = list[(idx + 1 + list.length) % list.length]
      if (next) setCurrentKey(theaterItemKey(next))
    }
    window.dispatchEvent(new CustomEvent('theater-resume'))
  }, [clearSharedPin])

  const onRequestUnmute = useCallback(() => setMuted(false), [])
  // Explicit setter (not a blind toggle) — the chrome's audio button computes
  // the target value itself from its DISPLAYED state (which can diverge from
  // this `muted` prop; see TheaterMobileChrome/TheaterDesktopChrome's
  // `handleAudioTap`) and passes it straight through. This is the
  // persistence/next-item-initial-signal path; the gesture-context fast path
  // for actually flipping the live element is the synchronous
  // `theater-set-muted` window event the same tap dispatches.
  const onSetMuted = useCallback((next: boolean) => setMuted(next), [])

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

  // Space must never resume the paused stage hidden behind the waiting
  // overlay — ref-backed so the keyboard listener never re-registers.
  const isPlaybackHidden = useCallback(() => waitingRef.current, [])

  // Keyboard nav (extracted to useTheaterKeyboard.ts — see its doc comment
  // for the full ↓/→/j vs. triage-collection-tab keymap rationale).
  useTheaterKeyboard({
    isTriage,
    triageTab,
    goNext: goNextUser,
    goPrev: goPrevUser,
    setMuted,
    triageDone,
    triageLater,
    triageDelete,
    triageStepBack,
    triageDoUndo,
    onClose,
    isPlaybackHidden,
  })

  // Mark seen + fire the preview pulse once the current post has been staged
  // (extracted to useTheaterDwell.ts — see its doc comment for the full
  // collection/triage exemption rationale).
  useTheaterDwell({ currentKey, isTriageCollection, loop, itemsRef, seenSet })

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
    if (typeof window === 'undefined' || mode === 'playlist' || isTriage) return
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
      // This is the 'timed' 10s-dwell advance ONLY (see
      // TheaterProgressLine's kind 'timed') — triage's Collection tab's
      // timed items (photo/text/quote/article) still never auto-advance
      // this way, waiting instead on a deliberate Done/Later/Delete. Videos
      // in the Collection tab DO now auto-advance on end ("My Collection is
      // just a different playlist in that same theater"), but through
      // StageVideo/StageInstagram/StageYouTube's own `onEnded` callback (see
      // `triageAdvanceOnEnded` below) — never through this event. A
      // leftover mobile progress-line timer from the same content type
      // would otherwise fire this and silently step the (unrelated,
      // unrendered) live-feed cursor underneath it.
      if (isTriageCollection) return
      // shared-post-repeat / repeat 'one': belt-and-suspenders —
      // TheaterProgressLine's 'timed' kind is already suppressed to 'none'
      // while repeating (so this event is never actually dispatched for a
      // repeating item), but a stray/late-arriving dispatch from a
      // since-superseded timer must still be a no-op rather than advancing
      // past the repeating post.
      if (repeatCurrentActiveRef.current) return
      if (progressKindFor(currentRef.current) !== 'timed') return
      goNext()
    }
    window.addEventListener('theater-advance', handleAdvance)
    return () => window.removeEventListener('theater-advance', handleAdvance)
  }, [goNext, isTriageCollection])

  // Prefetch at most one item ahead (extracted to useTheaterPrefetch.ts).
  useTheaterPrefetch(currentIndex, displayItems)

  // Auto-play into the waiting stage: the moment a genuinely fresh item shows
  // up (present in `freshKeys` but not in the baseline snapshotted when
  // waiting began), stage it and clear waiting. Mid-feed arrivals never hit
  // this branch — it's gated on `waiting` — so today's "prepend quietly,
  // don't interrupt" behavior for a viewer mid-scroll is untouched.
  useEffect(() => {
    if (!waiting) return
    const arrived = findFreshArrival(feed.freshKeys, waitingBaselineFreshKeysRef.current)
    if (!arrived) return
    // Fold the staged key into the baseline (never resnapshot — an item that
    // arrived while this one plays must still read as new when waiting
    // resumes), and remember it so a non-user advance off it re-waits
    // instead of continuing into the already-browsed queue (round 8).
    waitingBaselineFreshKeysRef.current.add(arrived)
    stagedFromWaitingKeyRef.current = arrived
    // Pin the arrival to the FRONT of the display order (owner: the fresh
    // video read as "2 / 21" — the session's original lead-pick was still
    // occupying slot 1). The viewer has been through the whole queue by now,
    // so newest-first is the honest order.
    //
    // EXCEPT in shared mode, where `pinnedKey` is not a lead-pick but the
    // shared post itself — the one invariant of a preview page. Re-pointing it
    // at an arrival bumps the post the visitor followed a link to out of slot
    // 1, and leaves the "Shared post" heading (which tracks `sharedItemKey`)
    // labelling a row in the middle of the list (review finding).
    if (mode !== 'shared') setPinnedKey(arrived)
    setCurrentKey(arrived)
    setWaiting(false)
  }, [waiting, feed.freshKeys])

  // Entering the waiting stage pauses the (still-mounted, now-hidden) stage
  // — see the render comment above the <Stage/> below. Uses the same
  // deliberate-pause event the transport buttons use, so StageVideo's
  // catch-up attribution is disarmed correctly. On the next arrival the
  // src-change effect calls play() itself; no resume event needed.
  useEffect(() => {
    if (waiting) window.dispatchEvent(new CustomEvent('theater-pause'))
  }, [waiting])

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
  const isPlaylistAuthed = loop ? !!authMe.me?.authenticated : authed
  // Viewing your OWN public playlist: cloning it (or being told to "make
  // your own") is nonsense — the chromes swap those CTAs for a Manage link.
  const isPlaylistOwner =
    !!playlist && !!authMe.me?.user?.username && authMe.me.user.username === playlist.curator
  const [saveStatus, setSaveStatus] = useState<SavePlaylistStatus>('idle')
  const [showSignIn, setShowSignIn] = useState(false)
  // Which flavor of the shared sign-in modal is open — a single modal
  // instance below (mounted once) renders different copy/returnTo per
  // intent, rather than each chrome/CTA mounting its own SignInModal.
  const [signInIntent, setSignInIntent] = useState<'save-post' | 'save-playlist' | 'make-your-own'>(
    'save-post',
  )
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
    setSignInIntent('save-post')
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
        // …and tell the rest of the app a post was added, which this path
        // never did: only the local Save button knew (state review).
        notifyCollectionChanged()
      })
      .catch(() => {})
  }, [saveIntentOnLoad, mode, sharedItem, authMe.loading, authMe.me])

  const performClone = useCallback(async () => {
    if (!playlist) return
    setSaveStatus((s) => {
      if (s === 'saving' || s === 'saved') return s
      return 'saving'
    })
    try {
      const res = await fetch(
        `/api/share/tag/by-name/${encodeURIComponent(playlist.curator)}/${encodeURIComponent(playlist.tag)}/clone`,
        { method: 'POST' },
      )
      if (res.status === 401) {
        pendingSaveRef.current = true
        setSignInIntent('save-playlist')
        setShowSignIn(true)
        setSaveStatus('idle')
        return
      }
      if (!res.ok) throw new Error('clone failed')
      setSaveStatus('saved')
      // Cloning a playlist adds a pile of posts AND a tag to this account. It
      // used to announce none of that, so the Header's counts, the library
      // grid and the tags page all silently missed the whole import until a
      // reload (state review, 2026-08-22).
      notifyCollectionChanged({ tagsChanged: true })
    } catch {
      setSaveStatus('error')
    }
  }, [playlist])

  const handleSavePlaylist = useCallback(() => {
    if (!playlist) return
    if (!isPlaylistAuthed) {
      pendingSaveRef.current = true
      setSignInIntent('save-playlist')
      setShowSignIn(true)
      return
    }
    void performClone()
  }, [playlist, isPlaylistAuthed, performClone])

  // "Make your own" (playlist mode, non-owner viewers): an already-authed
  // visitor doesn't need the sign-up pitch — that CTA just takes them home to
  // start their own playlist. A signed-out visitor gets the sign-in modal
  // IN PLACE (owner review: navigating them away to `/?start=1` left them
  // "with no idea what they're supposed to do").
  const handleMakeYourOwn = useCallback(() => {
    if (isPlaylistAuthed) {
      // The library grid, not `/` — making a playlist means tagging your own
      // saved posts, and `/` serves the theater now.
      window.location.assign('/library')
      return
    }
    setSignInIntent('make-your-own')
    setShowSignIn(true)
  }, [isPlaylistAuthed])

  // If sign-in completes while the modal is open (in-modal magic link, no
  // reload), fire the deferred clone as soon as `useAuthMe()` reflects it.
  useEffect(() => {
    if (!pendingSaveRef.current || !isPlaylistAuthed) return
    pendingSaveRef.current = false
    void performClone()
  }, [isPlaylistAuthed, performClone])

  // Cross-reload path: a sign-in flow that redirects (e.g. the X OAuth
  // round-trip) lands back on `returnTo` with `?save=1`. Auto-clone once auth
  // state has settled, then strip the param so a manual refresh never
  // re-triggers it.
  useEffect(() => {
    if (!playlist || typeof window === 'undefined' || autoSaveTriggeredRef.current) return
    if (authMe.loading) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('save') !== '1') return
    autoSaveTriggeredRef.current = true
    params.delete('save')
    const qs = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    if (isPlaylistAuthed) void performClone()
  }, [playlist, authMe.loading, isPlaylistAuthed, performClone])

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
  // What the mobile peek bar's "3 / N" is out of: the unwatched run while
  // repeat is off, the whole queue once it isn't.
  //
  // Computed from the LIVE feed, which is the wrong list in triage's Collection
  // tab — that tab shows `triageQueue`. With no live feed loaded the length was
  // 0 and the counter read "1 / 0" over a queue with items in it (owner
  // report). The Collection tab has no unwatched-run notion anyway (no repeat,
  // no boundary — it's a finite backlog), so it passes nothing and the chrome
  // falls back to the length of the list it is actually rendering.
  const queueTotal = isTriageCollection
    ? undefined
    : computeQueueTotal({
        index: currentIndex,
        length: displayItems.length,
        unseenCount,
        repeatMode: effectiveRepeatMode,
      })
  const chromeCanPrev = isTriageCollection ? triageIndex > 0 : canPrev
  const chromeCanNext = isTriageCollection ? !triageFinished : canNext
  // The transport chevrons in triage's Collection tab are pure skip/back —
  // "next" is exactly "Later" (advance without changing read state); the
  // dedicated Done/Tag/Delete buttons handle actual actions. Home/shared/
  // collection use the User-wrapped nav (shared-post-repeat: these are the
  // deliberate-navigation call sites that clear the pin).
  const chromeOnPrev = isTriageCollection ? triageStepBack : goPrevUser
  const chromeOnNext = isTriageCollection ? triageLater : goNextUser
  const chromeOnSelect = isTriageCollection
    ? (key: string) => {
        const idx = triageQueue.findIndex((fi) => theaterItemKey(feedItemToTheaterItem(fi)) === key)
        if (idx !== -1) setTriageIndex(idx)
      }
    : onSelectUser

  const triageChrome: TheaterTriageChrome | undefined = isTriage
    ? {
        tab: triageTab,
        onTabChange: changeTriageTab,
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
        onLiveTag: handleTriageLiveTag,
        tags: isTriageCollection ? triageCurrentFeedItem?.tags : liveTagsByKey[currentKey ?? ''],
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
              <TriageAllClear
                total={triageTotal}
                streak={triageStreak}
                onClose={() => onClose?.()}
              />
            ) : triageCurrentFeedItem ? (
              <TriageStage
                feedItem={triageCurrentFeedItem}
                muted={muted}
                onRequestUnmute={onRequestUnmute}
                onEnded={triageAdvanceOnEnded}
                tags={triageCurrentFeedItem.tags}
              />
            ) : null
          ) : isSharedUnavailableOnCurrent && current ? (
            <StageUnavailable item={current} />
          ) : (
            <>
              {/* The stage stays MOUNTED (paused — see the waiting-pause
                  effect) underneath the waiting overlay, never swapped out:
                  StageVideo's persistent <video> element carries the user's
                  iOS unmuted-playback grant, and unmounting it across the
                  waiting stage is exactly what made a fresh arrival start
                  muted for a viewer whose sound was on (owner report). The
                  overlay's opaque #08070a covers it completely. */}
              <Stage
                item={current}
                muted={muted}
                onRequestUnmute={onRequestUnmute}
                onEnded={() => {
                  if (!showSignInRef.current) goNext()
                }}
                photoCaption={false}
                repeat={repeatCurrentActive}
              />
              {waiting && (
                <div className="absolute inset-0 z-10">
                  <StageWaiting
                    savedToday={feed.savedToday}
                    onReplay={displayItems.length > 0 ? replayFromStart : undefined}
                    replayCount={displayItems.length}
                    onKeepPlaying={
                      repeatEnabled && displayItems.length > 0 ? keepPlaying : undefined
                    }
                  />
                </div>
              )}
            </>
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
            Triage's Collection tab's 'timed' items (photo/text/quote/
            article) still never auto-advance this way (see `handleAdvance`
            above) — `collectionTabProgressKind` demotes only THAT kind to
            'none' there; 'video' items keep the real line and auto-advance
            on end through `TriageStage`'s own `onEnded` wiring instead. */}
        <TheaterProgressLine
          itemKey={chromeCurrentKey}
          kind={
            isDesktop
              ? progressKindForPin(
                  collectionTabProgressKind(progressKindFor(chromeCurrent), isTriageCollection),
                  repeatCurrentActive,
                )
              : 'none'
          }
        />
        {desktopDeclutter && (
          <button
            type="button"
            onClick={onToggleDesktopDeclutter}
            aria-label="Show controls"
            className="absolute right-4 top-4 z-20 hidden h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 lg:flex"
          >
            <Minimize2 size={18} />
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
          wasSeenOnEntry={liveOrdering ? wasSeenOnEntry : undefined}
          queueTotal={liveOrdering ? queueTotal : undefined}
          pinnedKey={sharedItemKey}
          onSelect={chromeOnSelect}
          onPrev={chromeOnPrev}
          onNext={chromeOnNext}
          canPrev={chromeCanPrev}
          canNext={chromeCanNext}
          muted={muted}
          onSetMuted={onSetMuted}
          playlist={playlist}
          isPlaylistOwner={isPlaylistOwner}
          saveStatus={saveStatus}
          onSavePlaylist={handleSavePlaylist}
          authed={authed}
          onRequestSignIn={openSignIn}
          repeatCurrent={repeatCurrentActive}
          repeatMode={repeatEnabled ? displayRepeatMode : undefined}
          onCycleRepeat={repeatEnabled ? cycleRepeatMode : undefined}
          triage={triageChrome}
        />
        <DesktopStageChrome
          mode={mode}
          current={chromeCurrent}
          sharedItem={sharedItem}
          authed={authed}
          declutter={desktopDeclutter}
          onToggleDeclutter={onToggleDesktopDeclutter}
          playlist={playlist}
          isPlaylistOwner={isPlaylistOwner}
          saveStatus={saveStatus}
          onSavePlaylist={handleSavePlaylist}
          onRequestSignIn={openSignIn}
          onRequestMakeYourOwn={handleMakeYourOwn}
          triage={triageChrome}
        />
        {/* Triage's Delete (and Done/Later) undo toast — auto-dismisses after
            5s (see `armUndoDismiss`/`commitPendingTriageDelete`'s timer).
            Works the same on both viewports, so it lives here rather than
            duplicated inside each chrome component. `bottom-36` (9rem/144px)
            clears the mobile action row (Later/Tag/Delete/Done — measured:
            80px bottom padding + 44px min-height = 124px from the screen
            bottom) with room to spare, and happens to match the desktop
            dock's own 124px height + margin, so one value now covers both
            viewports. Keyed by the action's identity so a same-type action
            right after another (e.g. Later, Later) still replays the
            entrance transition instead of looking like it never moved. */}
        {isTriageCollection && triageUndo && (
          <div className="pointer-events-none absolute inset-x-0 bottom-36 z-30 flex justify-center">
            <div
              key={`${triageUndo.type}-${triageUndo.item.platform ?? 'twitter'}-${triageUndo.item.id}-${triageUndo.index}`}
              className="pointer-events-auto flex animate-toast-in items-center gap-3 rounded-full bg-black/80 px-4 py-2 text-[13px] text-white shadow-lg backdrop-blur-md"
            >
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
        wasSeenOnEntry={liveOrdering ? wasSeenOnEntry : undefined}
        queueTotal={liveOrdering ? queueTotal : undefined}
        pinnedKey={sharedItemKey}
        savedToday={feed.savedToday}
        onSelect={chromeOnSelect}
        waiting={isTriageCollection ? false : waiting}
        muted={muted}
        onSetMuted={onSetMuted}
        canPrev={chromeCanPrev}
        canNext={chromeCanNext}
        onPrev={chromeOnPrev}
        onNext={chromeOnNext}
        declutter={desktopDeclutter}
        playlist={playlist}
        triage={triageChrome}
        repeatCurrent={repeatCurrentActive}
        repeatMode={repeatEnabled ? displayRepeatMode : undefined}
        onCycleRepeat={repeatEnabled ? cycleRepeatMode : undefined}
      />
      {/* `?ytdebug=1`/`?avdebug=1` diagnostics overlay (YtDebugOverlay.tsx) —
          mounted ONCE here so it serves every stage (StageVideo/StageYouTube/
          the chrome's audio button), not just the YouTube branches that used
          to embed it directly. Renders null with zero footprint when neither
          param is present. */}
      <YtDebugOverlay />
      {liveTagTarget && (
        <TagQuickPicker
          platform={liveTagTarget.platform}
          bookmarkId={liveTagTarget.bookmarkId}
          open
          onClose={() => setLiveTagTarget(null)}
        />
      )}
      <SignInModal
        open={showSignIn}
        onClose={() => {
          setShowSignIn(false)
          authMe.refresh()
        }}
        title={
          signInIntent === 'make-your-own'
            ? 'Make your own playlist'
            : playlist
              ? 'Save this playlist'
              : 'Save it to your collection'
        }
        subtitle={
          signInIntent === 'make-your-own'
            ? 'Sign up and start saving — anything you save can be tagged into playlists like this one.'
            : playlist
              ? `${playlist.count} ${playlist.count === 1 ? 'post' : 'posts'} from ${playlist.tag}, curated by @${playlist.curator} — save them to your collection.`
              : 'Your saved posts stay yours — sync your X bookmarks anytime from Settings.'
        }
        returnTo={
          signInIntent === 'make-your-own'
            ? '/library'
            : playlist
              ? `/t/${playlist.curator}/${playlist.tag}?save=1`
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
