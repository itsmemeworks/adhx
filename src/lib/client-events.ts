/**
 * Cross-component client notifications.
 *
 * The app coordinates "something changed, refresh yourself" across components
 * that don't share a React tree (the Header, the library grid, the theater,
 * the tags page) with `window` CustomEvents. That works, but the events were
 * dispatched ad hoc from a dozen call sites and every site had to remember
 * which ones to fire — so most fired SOME of them. The result was the owner's
 * report that "certain areas of the website don't update when things happen":
 * saving from the theater's Live tab left the Header's counts stale, and
 * cloning a whole playlist dispatched nothing at all, so the library grid, the
 * Header and the tags page all silently missed a bulk add.
 *
 * Mutations should call the helpers here instead of dispatching by hand. Each
 * one documents exactly who listens, so adding a listener means updating one
 * comment rather than auditing every call site.
 */

/** Header refreshes its saved/active counts. Listener: `src/components/Header.tsx`. */
const STATS_UPDATED = 'stats-updated'
/**
 * The library grid refetches its feed from scratch. Listener:
 * `src/app/useSyncListener.ts` → `fetchFeed(true)`.
 *
 * NOTE the cost: a full refetch DISCARDS any optimistic local change to the
 * grid, and re-applies the active filter/search — so a caller that has already
 * placed the new item in the grid itself (the library's paste-to-add) must not
 * fire this, or the post it just added disappears behind the current filter.
 */
const FEED_CHANGED = 'tweet-added'
/** The tags page + FilterBar refresh tag lists and counts. */
const TAGS_CHANGED = 'bookmark-tags-changed'

function fire(name: string, detail?: unknown): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(detail === undefined ? new Event(name) : new CustomEvent(name, { detail }))
}

export interface CollectionChangedOptions {
  /**
   * Whether the library grid should refetch. Default true — most callers add
   * or remove posts they have NOT rendered themselves. Pass false only when
   * you have already updated the grid in place and a refetch would undo it.
   */
  refetchFeed?: boolean
  /**
   * Whether tag lists/counts changed too — cloning a playlist adds a tag as
   * well as posts, so the tags page's counts move.
   */
  tagsChanged?: boolean
}

/**
 * Posts were added to or removed from the signed-in user's collection.
 * Refreshes the Header's counts, and by default the library grid too.
 */
export function notifyCollectionChanged(options: CollectionChangedOptions = {}): void {
  const { refetchFeed = true, tagsChanged = false } = options
  fire(STATS_UPDATED)
  if (refetchFeed) fire(FEED_CHANGED)
  if (tagsChanged) fire(TAGS_CHANGED)
}

/**
 * A single bookmark's tags changed. `tags` is the complete new list for that
 * bookmark, so listeners can patch in place instead of refetching.
 */
export function notifyTagsChanged(detail: {
  platform: string
  bookmarkId: string
  tags: string[]
}): void {
  fire(TAGS_CHANGED, detail)
}

/** Event names, for listeners (and tests) that need to subscribe. */
export const CLIENT_EVENTS = {
  statsUpdated: STATS_UPDATED,
  feedChanged: FEED_CHANGED,
  tagsChanged: TAGS_CHANGED,
} as const
