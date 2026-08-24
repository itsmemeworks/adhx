/**
 * Pure theater math — extracted from TheaterShell so the orchestrator file
 * is the React component, not a 500-line function catalogue. Behavior is
 * unchanged; TheaterShell re-exports everything so existing test imports
 * keep working.
 */
import type { FeedItem } from '@/components/feed/types'
import { theaterItemKey } from './types'
import { previewPath } from '@/lib/activity/preview-path'
import { hasKnownTimestamp } from '@/lib/utils/format'
import type { RepeatMode, TheaterItem, TheaterMode } from './types'
import { SAVED_PATH, isSavedPath } from '@/lib/theater/collection-href'

export interface PersonalUndoAction {
  type: 'archive' | 'keep' | 'delete'
  item: FeedItem
  index: number
}

/** Pure: does committing a pending delete-undo owe the server a DELETE call?
 * Only when the pending undo is itself a `'delete'` — an `'archive'`/`'keep'`
 * undo never scheduled one, so committing it (by doing nothing) is correct. */
export function shouldCommitDelete(undo: PersonalUndoAction | null): boolean {
  return undo?.type === 'delete'
}

/** Pure: should an undo-toast dismiss timer armed for `expiring` actually
 * clear the toast when it fires? Only when `current` is still that exact
 * action (identity, not value, equality — a fresh action object is created
 * on every Done/Later/Delete, even a repeat of the same type). A `false`
 * result means a newer action has since replaced it, and the stale timer
 * must be a no-op rather than wiping the newer undo out from under it. */
export function shouldDismissUndo(
  current: PersonalUndoAction | null,
  expiring: PersonalUndoAction,
): boolean {
  return current === expiring
}

/** Pure: the collection queue index after Done/Later/Delete — always a plain
 * advance, regardless of which of the three actions fired. */
export function personalAdvance(index: number): number {
  return index + 1
}

/**
 * Pure: the collection queue index after a video ends. Later/Archive still
 * use `personalAdvance` (a real decision can land on All Clear). Playback
 * wrapping is only for the repeat control: 'one' stays put, 'all' wraps to
 * 0 at the end, 'off' walks past the last item so All Clear can render.
 */
export function personalAdvanceOnEndedIndex(
  index: number,
  length: number,
  repeatMode: RepeatMode,
): number {
  if (repeatMode === 'one' || length <= 0) return index
  const next = index + 1
  if (next >= length) return repeatMode === 'all' ? 0 : next
  return next
}

/** Pure: the collection queue index after ArrowUp ("Back") — steps to the
 * previous item without going below the start of the queue. */
export function personalStepBackIndex(index: number): number {
  return Math.max(0, index - 1)
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
 * After Live `replaceState` onto `/{user}/status/{id}`, Next's router may
 * still think the page is `/live` or `/saved`, so `router.push` lags or
 * no-ops and the chrome flips while the bar stays on the preview path.
 *
 * Put `dest` in the bar first (the tab the viewer asked for), then push.
 * Returns null when the bar already matches a theater tab — Next can
 * navigate from there without a history write.
 */
export function theaterTabNavRestore(
  browserPath: string,
  dest: '/live' | typeof SAVED_PATH,
): '/live' | typeof SAVED_PATH | null {
  if (browserPath === dest) return null
  if (browserPath === '/live' || isSavedPath(browserPath)) return null
  return dest
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
