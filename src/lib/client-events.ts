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
 *
 * Same-tab listeners hear the window event. Other open tabs/windows hear the
 * same payload via BroadcastChannel (`adhx-client-events`) — Archive in one
 * Saved theater must drop the post in the others.
 */

import type { FeedItem } from '@/components/feed/types'

/** Header refreshes its saved/active counts. Listener: `src/components/Header.tsx`. */
const STATS_UPDATED = 'stats-updated'
/**
 * The library grid refetches its feed from scratch. Listener:
 * `src/app/useSyncListener.ts` → `fetchFeed(true)`.
 * Saved theater also listens when `detail.removed` / `detail.added` is set
 * and splices or prepends that post in its snapshot (`TheaterShell`).
 *
 * NOTE the cost: a full refetch DISCARDS any optimistic local change to the
 * grid, and re-applies the active filter/search — so a caller that has already
 * placed the new item in the grid itself (the library's paste-to-add) must not
 * fire this, or the post it just added disappears behind the current filter.
 */
const FEED_CHANGED = 'tweet-added'
/** The tags page + FilterBar refresh tag lists and counts. */
const TAGS_CHANGED = 'bookmark-tags-changed'

const CROSS_TAB_CHANNEL = 'adhx-client-events'
const AUTH_SCOPE_CHANNEL = 'adhx-auth-scope'

type BridgePayload = { name: string; detail?: unknown; accountId: string }
type AuthScopePayload = { type: 'auth-scope-changed'; accountId: string | null }

let channel: BroadcastChannel | null = null
let authScopeChannel: BroadcastChannel | null = null
// `undefined` means the auth request has not settled (or is being refreshed);
// `null` is a settled signed-out state. Collection events are only eligible
// for cross-tab delivery when both documents know the same immutable account.
let clientEventAccountId: string | null | undefined
let lastSettledClientEventAccountId: string | null | undefined
let pendingAuthScopeAccountId: string | null | undefined
const eventAccounts = new WeakMap<Event, string | null>()
const authScopeListeners = new Set<(accountId: string | null) => void>()

function fireLocal(name: string, detail: unknown, accountId: string | null): void {
  if (typeof window === 'undefined') return
  const event = detail === undefined ? new Event(name) : new CustomEvent(name, { detail })
  eventAccounts.set(event, accountId)
  window.dispatchEvent(event)
}

/**
 * Keep the bridge aligned with `/api/auth/me`.
 *
 * Pass `undefined` while auth is unresolved, `null` for a settled signed-out
 * document, and the immutable users.id for a signed-in account. No value is
 * persisted: this identity exists only in memory and local BroadcastChannel
 * envelopes.
 */
export function setClientEventAccount(
  accountId: string | null | undefined,
  options: { broadcast?: boolean } = {},
): void {
  clientEventAccountId = accountId
  if (accountId === undefined) return

  pendingAuthScopeAccountId = undefined
  const previous = lastSettledClientEventAccountId
  lastSettledClientEventAccountId = accountId
  // Initial discovery announces too: a login callback may have opened/reloaded
  // this tab after changing the shared cookie, so it has no in-memory "before"
  // value. Same-account receivers ignore the signal; receiver-driven refetches
  // pass `broadcast: false` to avoid echo loops.
  if (previous === accountId || options.broadcast === false) return
  try {
    getAuthScopeChannel()?.postMessage({
      type: 'auth-scope-changed',
      accountId,
    } satisfies AuthScopePayload)
  } catch {
    // The local account scope is still authoritative for this document.
  }
}

/**
 * Receiver-side defense for account-owned state. Events created by this
 * module carry an in-memory scope; scoped events only match a settled copy of
 * the same account. Unmarked/legacy events are rejected, especially while
 * auth is unresolved; signed-out helper events carry an explicit null scope.
 */
export function clientEventMatchesAccount(
  event: Event,
  accountId: string | null | undefined,
): boolean {
  if (accountId === undefined || !eventAccounts.has(event)) return false
  return eventAccounts.get(event) === accountId
}

/** Account gate for listeners that do not otherwise consume `useAuthMe()`. */
export function clientEventMatchesCurrentAccount(event: Event): boolean {
  return clientEventMatchesAccount(event, clientEventAccountId)
}

export function subscribeClientEventAuthScopeChange(
  listener: (accountId: string | null) => void,
): () => void {
  authScopeListeners.add(listener)
  return () => authScopeListeners.delete(listener)
}

function getAuthScopeChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  if (authScopeChannel) return authScopeChannel
  try {
    authScopeChannel = new BroadcastChannel(AUTH_SCOPE_CHANNEL)
    authScopeChannel.onmessage = (event: MessageEvent<AuthScopePayload>) => {
      const data = event.data
      if (
        !data ||
        data.type !== 'auth-scope-changed' ||
        (typeof data.accountId !== 'string' && data.accountId !== null)
      ) {
        return
      }
      // A duplicate same-account announcement is harmless and should not
      // churn `/api/auth/me`. A real transition invalidates collection event
      // delivery before any listener can begin its refetch.
      if (
        clientEventAccountId === data.accountId &&
        lastSettledClientEventAccountId === data.accountId
      ) {
        return
      }
      if (clientEventAccountId === undefined && pendingAuthScopeAccountId === data.accountId) {
        return
      }
      pendingAuthScopeAccountId = data.accountId
      clientEventAccountId = undefined
      authScopeListeners.forEach((listener) => listener(data.accountId))
    }
  } catch {
    return null
  }
  return authScopeChannel
}

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  if (channel) return channel
  try {
    channel = new BroadcastChannel(CROSS_TAB_CHANNEL)
    channel.onmessage = (event: MessageEvent<BridgePayload>) => {
      const data = event.data
      if (
        !data ||
        typeof data.name !== 'string' ||
        typeof data.accountId !== 'string' ||
        typeof clientEventAccountId !== 'string' ||
        data.accountId !== clientEventAccountId
      ) {
        return
      }
      fireLocal(data.name, data.detail, data.accountId)
    }
  } catch {
    return null
  }
  return channel
}

/** Open the cross-tab bridge so this document can receive events it never sent. */
export function startClientEventBridge(): void {
  getChannel()
  getAuthScopeChannel()
}

/** Test-only: drop the cached channel so the next notify rebinds. */
export function resetClientEventBridgeForTests(): void {
  try {
    channel?.close()
  } catch {
    // jsdom stubs may not implement close.
  }
  try {
    authScopeChannel?.close()
  } catch {
    // jsdom stubs may not implement close.
  }
  channel = null
  authScopeChannel = null
  clientEventAccountId = undefined
  lastSettledClientEventAccountId = undefined
  pendingAuthScopeAccountId = undefined
}

function fire(name: string, detail?: unknown, opts?: { local?: boolean }): void {
  if (typeof window === 'undefined') return
  const accountId = clientEventAccountId
  // While auth is unresolved, mutation-derived events are unsafe even in this
  // document: the request may have used a cookie switched by another tab.
  if (accountId === undefined) return
  if (opts?.local !== false) fireLocal(name, detail, accountId)
  // A settled signed-out document may still use explicit same-tab events, but
  // never puts collection data on the origin-wide channel.
  if (accountId === null) return
  try {
    getChannel()?.postMessage({ name, detail, accountId } satisfies BridgePayload)
  } catch {
    // Closed channel / restricted context — same-tab listeners already ran.
  }
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
  /** Drop this post from any Saved theater snapshot (this tab and others). */
  removed?: { platform: string; id: string }
  /**
   * Prepend this post in any open Saved / Live theater. When `refetchFeed`
   * is false the same-tab `tweet-added` is skipped (the caller already
   * placed the row) but other windows still hear it over BroadcastChannel.
   */
  added?: FeedItem
}

export type CollectionFeedChangedDetail = {
  removed?: { platform: string; id: string }
  added?: FeedItem
}

/**
 * Posts were added to or removed from the signed-in user's collection.
 * Refreshes the Header's counts, and by default the library grid too.
 */
export function notifyCollectionChanged(options: CollectionChangedOptions = {}): void {
  const { refetchFeed = true, tagsChanged = false, removed, added } = options
  fire(STATS_UPDATED)
  if (removed) {
    fire(FEED_CHANGED, { removed })
  } else if (added) {
    // Other windows always need the row. Same-tab tweet-added would make
    // useSyncListener refetch and undo an optimistic library prepend.
    fire(FEED_CHANGED, { added }, { local: refetchFeed })
  } else if (refetchFeed) {
    fire(FEED_CHANGED)
  }
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

/** Refresh account-local count displays without carrying collection data. */
export function notifyStatsUpdated(): void {
  fire(STATS_UPDATED)
}

/** Event names, for listeners (and tests) that need to subscribe. */
export const CLIENT_EVENTS = {
  statsUpdated: STATS_UPDATED,
  feedChanged: FEED_CHANGED,
  tagsChanged: TAGS_CHANGED,
} as const
