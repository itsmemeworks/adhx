/**
 * Pure theater math — extracted from TheaterShell so the orchestrator file
 * is the React component, not a 500-line function catalogue. Behavior is
 * unchanged; TheaterShell re-exports everything so existing test imports
 * keep working.
 */
import type { FeedItem } from '@/components/feed/types'
import type { ContentType } from '@/components/matter'
import { theaterItemKey } from './types'
import { previewPath } from '@/lib/activity/preview-path'
import { hasKnownTimestamp } from '@/lib/utils/format'
import type { PersonalTab, RepeatMode, TheaterItem, TheaterMode } from './types'
import { inferType } from '@/lib/trending/filter'
import { inferCollectionContentType } from './collection-item'
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

/** Next Saved-queue index that `allowAt` accepts, or `length` (All Clear). */
export function personalAdvanceMatching(
  index: number,
  length: number,
  allowAt: (i: number) => boolean,
): number {
  for (let i = index + 1; i < length; i++) {
    if (allowAt(i)) return i
  }
  return length
}

/** Previous matching Saved-queue index, or `index` when none remain behind. */
export function personalStepBackMatching(index: number, allowAt: (i: number) => boolean): number {
  for (let i = index - 1; i >= 0; i--) {
    if (allowAt(i)) return i
  }
  return index
}

/** Ended-advance that skips filtered-out Saved items. Same wrap as unfiltered. */
export function personalAdvanceOnEndedMatching(
  index: number,
  length: number,
  repeatMode: RepeatMode,
  allowAt: (i: number) => boolean,
): number {
  if (repeatMode === 'one' || length <= 0) return index
  const next = personalAdvanceMatching(index, length, allowAt)
  if (next < length) return next
  if (repeatMode === 'all') {
    for (let i = 0; i < length; i++) {
      if (allowAt(i)) return i
    }
    return index
  }
  return next
}

/**
 * User Next on Saved. Unlike ended-advance, 'one' still moves — the viewer
 * asked to leave this post. Repeat 'all' wraps the list; 'off' walks off
 * the end so All Clear can render (one run).
 */
export function personalSkipMatching(
  index: number,
  length: number,
  repeatMode: RepeatMode,
  allowAt: (i: number) => boolean,
): number {
  if (length <= 0) return index
  const next = personalAdvanceMatching(index, length, allowAt)
  if (next < length) return next
  if (repeatMode === 'all') {
    for (let i = 0; i < length; i++) {
      if (allowAt(i)) return i
    }
    return index
  }
  return next
}

/**
 * Pure: move the item matching `pinnedKey` to the front of `items`, order
 * otherwise preserved. A missing key (not found, or already at index 0)
 * returns `items` unchanged (same reference) — cheap to call on every render.
 * Now playing stays at the top so a newer arrival sits as Next.
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

/** Same-tab paste: keep the interrupted post as Next under the new lead. */
export function pinKeySecond<
  T extends { platform: string; bookmarkId?: string | null; url: string },
>(items: T[], secondKey: string | null, firstKey?: string | null): T[] {
  if (!secondKey || secondKey === firstKey) return items
  const from = items.findIndex((it) => theaterItemKey(it) === secondKey)
  if (from === -1) return items
  const dest = firstKey && items[0] && theaterItemKey(items[0]) === firstKey ? 1 : 0
  if (from === dest) return items
  const copy = items.slice()
  const [item] = copy.splice(from, 1)
  copy.splice(Math.min(dest, copy.length), 0, item)
  return copy
}

/** Theater type pills, in the order they render. Empty selection = all types. */
export const THEATER_QUEUE_TYPES: ContentType[] = ['video', 'photo', 'text', 'article']

export const THEATER_QUEUE_TYPE_PILLS: { types: readonly ContentType[]; label: string }[] = [
  { types: ['video'], label: 'Videos' },
  { types: ['photo'], label: 'Photos' },
  { types: ['text', 'article'], label: 'Text' },
]

const QUEUE_TYPE_SET = new Set<string>(THEATER_QUEUE_TYPES)

function orderedQueueTypes(selected: Iterable<string>): ContentType[] {
  const allow = new Set<ContentType>()
  for (const raw of selected) {
    if (QUEUE_TYPE_SET.has(raw)) allow.add(raw as ContentType)
  }
  const next = THEATER_QUEUE_TYPES.filter((t) => allow.has(t))
  if (next.length === 0 || next.length === THEATER_QUEUE_TYPES.length) return []
  return next
}

/** `adhx-theater-types` JSON. Invalid / all / none → `[]` (unfiltered). */
export function parseTheaterQueueTypes(raw: string | null | undefined): ContentType[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return orderedQueueTypes(parsed.filter((t): t is string => typeof t === 'string'))
  } catch {
    return []
  }
}

export function serializeTheaterQueueTypes(selected: readonly ContentType[]): string | null {
  const next = orderedQueueTypes(selected)
  return next.length === 0 ? null : JSON.stringify(next)
}

export function isTheaterQueueFilterActive(selected: readonly ContentType[]): boolean {
  return orderedQueueTypes(selected).length > 0
}

/**
 * Tap a type pill: empty (All) + Videos → `[video]`; last type off → All.
 * Selecting every type collapses back to All.
 */
export function toggleTheaterQueueType(
  selected: readonly ContentType[],
  type: ContentType,
): ContentType[] {
  if (!QUEUE_TYPE_SET.has(type)) return orderedQueueTypes(selected)
  if (selected.length === 0) return [type]
  const next = new Set(orderedQueueTypes(selected))
  if (next.has(type)) next.delete(type)
  else next.add(type)
  return orderedQueueTypes(next)
}

/** Visual pill state when one control represents one or more stored content types. */
export function theaterQueueTypePillState(
  selected: readonly ContentType[],
  types: readonly ContentType[],
): boolean | 'mixed' {
  const selectedCount = types.filter((type) => selected.includes(type)).length
  if (selectedCount === 0) return false
  if (selectedCount === types.length) return true
  return 'mixed'
}

/**
 * Types a grouped pill should toggle. A partial legacy selection completes
 * the group; a fully selected group turns every member off.
 */
export function theaterQueueTypePillToggleTargets(
  selected: readonly ContentType[],
  types: readonly ContentType[],
): ContentType[] {
  const allSelected = types.every((type) => selected.includes(type))
  return allSelected ? [...types] : types.filter((type) => !selected.includes(type))
}

/**
 * Keep only the selected types. `keepKey` (the shared-preview lead)
 * stays even when its type is filtered out, so a pasted tweet isn't yanked
 * from under the visitor. Home lead-picks are not kept — changing the
 * filter should skip a post you happened to land on.
 */
export function applyTheaterTypeLens<T extends TheaterItem>(
  items: T[],
  selected: readonly ContentType[],
  keepKey: string | null = null,
): T[] {
  const allow = orderedQueueTypes(selected)
  if (allow.length === 0) return items
  const allowSet = new Set(allow)
  const next = items.filter(
    (it) => (keepKey !== null && theaterItemKey(it) === keepKey) || allowSet.has(inferType(it)),
  )
  return next.length === items.length ? items : next
}

/** Saved FeedItem counterpart to {@link applyTheaterTypeLens}. All = keep. */
export function feedItemMatchesQueueTypes(
  item: FeedItem,
  selected: readonly ContentType[],
): boolean {
  const allow = orderedQueueTypes(selected)
  if (allow.length === 0) return true
  return allow.includes(inferCollectionContentType(item))
}

/**
 * After a paste-to-add: keep the filter when the new post is already in
 * it, otherwise reset to All so the save isn't invisible behind Text /
 * Videos / …
 */
export function queueTypesForAddedItem(
  selected: readonly ContentType[],
  item: FeedItem,
): ContentType[] {
  if (feedItemMatchesQueueTypes(item, selected)) return orderedQueueTypes(selected)
  return []
}

function selectedQueueTypeLabels(selected: readonly ContentType[]): string[] {
  const allow = new Set(orderedQueueTypes(selected))
  return THEATER_QUEUE_TYPE_PILLS.filter((pill) => pill.types.some((type) => allow.has(type))).map(
    (pill) => pill.label,
  )
}

/** Tooltip / empty-state copy for an active type filter. */
export function theaterQueueFilterLabel(selected: readonly ContentType[]): string {
  const labels = selectedQueueTypeLabels(selected)
  if (labels.length === 0) return 'Queue'
  if (labels.length <= 2) return labels.join(' · ')
  return `${labels.length} types`
}

export function theaterQueueEmptyHeadline(
  selected: readonly ContentType[],
  surface: 'Live' | 'Saved' = 'Live',
): string {
  const labels = selectedQueueTypeLabels(selected).map((label) => label.toLowerCase())
  if (labels.length === 0) return `Nothing in ${surface} right now`
  if (labels.length === 1) return `No ${labels[0]} in ${surface} right now`
  if (labels.length === 2) return `No ${labels[0]} or ${labels[1]} in ${surface} right now`
  const head = labels.slice(0, -1).join(', ')
  return `No ${head}, or ${labels[labels.length - 1]} in ${surface} right now`
}

/** Queue overlay: the row on stage, then everything that will play after it. */
export const QUEUE_NOW_PLAYING = 'Now playing'
export const QUEUE_NEXT = 'Next'
/** Repeat off only: already-watched rows after Now / Next. */
export const QUEUE_SEEN = 'Seen'

/**
 * The timestamp the LIFO queue sorts by — the same value the row chips
 * display. Live uses when the post first hit ADHX (`addedAt`); Saved maps
 * the user's own save time onto `addedAt`.
 */
export function queueAddedMs(item: { addedAt?: string | null; createdAt: string }): number {
  const added = hasKnownTimestamp(item.addedAt) ? Date.parse(item.addedAt as string) : NaN
  if (Number.isFinite(added)) return added
  const created = Date.parse(item.createdAt)
  return Number.isFinite(created) ? created : 0
}

/** Newest-added first. Same reference when already sorted. */
export function sortNewestFirst<T extends { addedAt?: string | null; createdAt: string }>(
  items: T[],
): T[] {
  if (items.length < 2) return items
  const sorted = items.slice().sort((a, b) => queueAddedMs(b) - queueAddedMs(a))
  return sorted.every((item, i) => item === items[i]) ? items : sorted
}

/** Saved unread pile: newest save first (`processedAt`). */
export function sortFeedNewestFirst(items: FeedItem[]): FeedItem[] {
  if (items.length < 2) return items
  const sorted = items.slice().sort((a, b) => {
    const ta = Date.parse(a.processedAt || a.createdAt || '')
    const tb = Date.parse(b.processedAt || b.createdAt || '')
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
  })
  return sorted.every((item, i) => item === items[i]) ? items : sorted
}

/**
 * Heading above a Queue row.
 * Repeat off: Now playing, Next (what's left to play), then Seen.
 * Repeat: Now playing and Next only.
 */
export function queueSectionHeading(
  index: number,
  currentIndex: number,
  seenStartIndex = -1,
): { label: string } | null {
  const hasSeen = seenStartIndex >= 0
  if (hasSeen && index === seenStartIndex) return { label: QUEUE_SEEN }
  if (currentIndex < 0) {
    if (hasSeen) return null
    return index === 0 ? { label: QUEUE_NEXT } : null
  }
  if (index === currentIndex) return { label: QUEUE_NOW_PLAYING }
  if (index === currentIndex + 1 && (!hasSeen || index < seenStartIndex)) {
    return { label: QUEUE_NEXT }
  }
  return null
}

export interface OrderLifoQueueOpts {
  currentKey?: string | null
  /** Repeat off: drop seen rows (except the one still on stage / keepKey). */
  onlyUnseen?: boolean
  isSeen?: (key: string) => boolean
  /** Opened preview stays even if this viewer has seen it before. */
  keepKey?: string | null
  /** Repeat off only: pin now playing so a newer arrival is Next. Never on Repeat all. */
  pinCurrent?: boolean
  /** Same-tab paste: the interrupted post sits as Next under the new lead. */
  pinNextKey?: string | null
  /** Repeat off Queue: keep seen rows after Now / Next. Playback omits this. */
  appendSeen?: boolean
}

/**
 * Live / Saved playback order: newest first. Repeat off keeps only unseen
 * posts (plus the row on stage). A mid-play arrival sorts to the top, then
 * now playing is pinned so it plays next when the current post ends.
 * Repeat all must not pin — Next walks the full newest-first list.
 */
export function orderLifoQueue<
  T extends { platform: string; bookmarkId?: string | null; url: string } & {
    addedAt?: string | null
    createdAt: string
  },
>(items: T[], opts: OrderLifoQueueOpts = {}): T[] {
  const newest = sortNewestFirst(items)
  const isSeen = opts.isSeen ?? (() => false)
  const playable = opts.onlyUnseen
    ? newest.filter((it) => {
        const key = theaterItemKey(it)
        if (opts.keepKey && key === opts.keepKey) return true
        if (opts.pinCurrent && opts.currentKey && key === opts.currentKey) return true
        return !isSeen(key)
      })
    : newest
  const pinned =
    opts.pinCurrent && opts.currentKey ? pinKeyFirst(playable, opts.currentKey) : playable
  const ordered = opts.pinNextKey ? pinKeySecond(pinned, opts.pinNextKey, opts.currentKey) : pinned
  if (!opts.onlyUnseen || !opts.appendSeen) return ordered
  const playableKeys = new Set(ordered.map((it) => theaterItemKey(it)))
  const seen = newest.filter((it) => !playableKeys.has(theaterItemKey(it)))
  return seen.length === 0 ? ordered : [...ordered, ...seen]
}

/**
 * First live-queue row that still needs to play. Fresh arrivals count
 * even when they landed before the caught-up stage started — "caught up"
 * means nothing unwatched remains.
 */
export function firstPendingLiveKey<
  T extends { platform: string; bookmarkId?: string | null; url: string },
>(items: T[], isSeen: (key: string) => boolean, exceptKey?: string | null): string | null {
  for (const item of items) {
    const key = theaterItemKey(item)
    if (exceptKey && key === exceptKey) continue
    if (!isSeen(key)) return key
  }
  return null
}

export interface QueueCount {
  looping: boolean
  played: number
  toPlay: number
  length: number
}

/**
 * Dock / peek count.
 * Repeat off: Now playing + Next (`N in queue`). Seen is not counted.
 * Repeat all: every post in the queue (`N on repeat`).
 * Repeat this post: `1 on repeat`.
 */
export function computeQueueCounts(opts: {
  length: number
  unseenCount: number
  repeatMode: RepeatMode
}): QueueCount {
  const { length, unseenCount, repeatMode } = opts
  if (repeatMode === 'one') {
    const n = length > 0 ? 1 : 0
    return { looping: true, played: 0, toPlay: n, length: n }
  }
  if (repeatMode === 'all') {
    return { looping: true, played: 0, toPlay: length, length }
  }
  const remaining = Math.max(0, unseenCount)
  return { looping: false, played: 0, toPlay: remaining, length }
}

/** Peek / dock copy. Unseen remaining is `N in queue`. Repeat is `N on repeat`. */
export function formatQueueCount(
  count: QueueCount | null | undefined,
): { text: string; ariaLabel: string } | null {
  if (!count) return null
  const { looping, toPlay, length } = count
  if (looping) {
    if (length <= 0) return null
    return { text: `${length} on repeat`, ariaLabel: `${length} on repeat` }
  }
  if (toPlay <= 0) return null
  return { text: `${toPlay} in queue`, ariaLabel: `${toPlay} in queue` }
}

/**
 * Pure: the canonical preview path to sync the address bar to for the given
 * item, or null when there isn't a well-formed one to sync to. `previewPath()`
 * happily builds a malformed path (e.g. `//status/123`) from an empty author,
 * so the "both an id AND an author are present" guard lives here rather than
 * there — a post missing either leaves the address bar alone.
 */
export function theaterUrlSyncPath(
  item: Pick<TheaterItem, 'platform' | 'bookmarkId' | 'author' | 'contentType'> | null,
): string | null {
  if (!item || !item.bookmarkId || !item.author) return null
  return previewPath(item.platform, item.author, item.bookmarkId, item.contentType)
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
 * Live `replaceState`s the bar onto a preview path. Putting `dest` in the
 * bar *before* `router.push` made Playwright (and a following `1`/`2`)
 * treat the other tab as already landed while this page was still mounted
 * — `next === pageTab` then no-op'd the real navigation.
 *
 * Cross-tab: only push. Same-tab: rewrite a leftover preview path.
 */
export function theaterTabNavAction(
  pageTab: PersonalTab,
  next: PersonalTab,
  browserPath: string,
): {
  replace: '/live' | typeof SAVED_PATH | null
  push: '/live' | typeof SAVED_PATH | null
} {
  const dest = next === 'live' ? '/live' : SAVED_PATH
  if (next === pageTab) {
    return { replace: theaterTabNavRestore(browserPath, dest), push: null }
  }
  return { replace: null, push: dest }
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
 *
 * `allowKey` (Live type filter) skips arrivals that are not in the playable
 * queue — a text preview must not yank a Videos-filtered waiting stage.
 */
export function findFreshArrival(
  freshKeys: ReadonlySet<string>,
  baseline: ReadonlySet<string>,
  allowKey?: (key: string) => boolean,
): string | null {
  for (const key of freshKeys) {
    if (baseline.has(key)) continue
    if (allowKey && !allowKey(key)) continue
    return key
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
