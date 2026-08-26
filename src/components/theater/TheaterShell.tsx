'use client'

/**
 * Theater orchestrator (spec §3/§4/§5/§6/§8): a full-width <Stage/> with
 * overlaid chrome and a bottom filmstrip dock on desktop (the "Filmstrip
 * dock" layout — see <DesktopStageChrome/>/<DesktopDock/> in
 * TheaterDesktopChrome.tsx, which replaced the old right-hand <Rail/>).
 * Owns current-item state, keyboard nav, mute state, the seen model + preview
 * pulse, and next-item prefetch. See docs/specs/theater-first.md.
 */

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { Minimize2 } from 'lucide-react'
import type { FeedItem } from '@/components/feed/types'
import type { ContentType } from '@/components/matter'
import { Stage } from './Stage'
import { StageWaiting } from './StageWaiting'
import { StageUnavailable } from './StageUnavailable'
import { StageResolving } from './StageResolving'
import { CollectionAllClear } from './CollectionAllClear'
import { StageVisualEmpty } from './StageVisualEmpty'
import { DesktopStageChrome, DesktopDock } from './TheaterDesktopChrome'
import { TheaterMobileChrome } from './TheaterMobileChrome'
import { YtDebugOverlay } from './YtDebugOverlay'
import { useTheaterFeed } from './useTheaterFeed'
import { useSeenSet } from './useSeenSet'
import { useTheaterKeyboard } from './useTheaterKeyboard'
import { TheaterShortcutsHelp } from './TheaterShortcutsHelp'
import { useTheaterPrefetch } from './useTheaterPrefetch'
import { useTheaterDwell } from './useTheaterDwell'
import { useTheaterStageTapDeclutter } from './useTheaterStageEvents'
import { TheaterProgressLine, progressKindFor, progressKindForPin } from './TheaterProgressLine'
import { feedItemToTheaterItem } from './collection-item'
import {
  CLIENT_EVENTS,
  notifyCollectionChanged,
  type CollectionFeedChangedDetail,
} from '@/lib/client-events'
import { theaterItemKey } from './types'
import { THEATER_SOUND_STORAGE_KEY } from './theater-storage'
import { useTheaterRepeatPrefs } from './useTheaterRepeatPrefs'
import { useTheaterQueueTypes } from './useTheaterQueueTypes'
import { fetchBookmarkMembership } from './fetch-bookmark-membership'
import { sourceUrl } from '@/lib/activity/preview-path'
import {
  readPlayedSavedKeys,
  savedStartIndex,
  writePlayedSavedKeys,
  writeSavedPlayingKey,
} from '@/lib/theater/saved-playing'
import {
  claimSharedAutoSave,
  consumePreviewOpenIntent,
  readSharedOpenContext,
  sharedAutoSaveReason,
} from '@/lib/theater/autosave-shared'
import {
  shouldCommitDelete,
  shouldDismissUndo,
  personalAdvanceOnEndedMatching,
  personalSkipMatching,
  personalStepBackMatching,
  applyTheaterTypeLens,
  feedItemMatchesQueueTypes,
  queueTypesForAddedItem,
  theaterQueueEmptyHeadline,
  orderLifoQueue,
  sortNewestFirst,
  sortFeedNewestFirst,
  firstPendingLiveKey,
  theaterUrlSyncPath,
  computeCanPrev,
  computeCanNext,
  findFreshArrival,
  nextRepeatMode,
  computeLoopedNext,
  computeLoopedPrev,
  isSharedPostPinned,
  isSharedItemUnavailable,
  type PersonalUndoAction,
} from './theater-math'
import { useIsDesktopViewport } from './useIsDesktopViewport'
import { useSharedPin } from './useSharedPin'
import { SharedResolveBridge } from './SharedResolveBridge'
import { useTheaterLiveUrl } from './useTheaterLiveUrl'
import { resolveTheaterChrome } from './theater-chrome'
import type { SharedResolveResult } from '@/lib/theater/shared-resolve'
import { SignInModal, useAuthMe } from '@/components/auth'
import { TagQuickPicker } from '@/components/tags'
import type {
  RepeatMode,
  SavePlaylistStatus,
  TheaterPlaylistMeta,
  TheaterFeedSeed,
  TheaterItem,
  TheaterMode,
  TheaterPersonalChrome,
  TheaterAccountTabs,
  PersonalTab,
} from './types'

export { personalKeyAction } from './useTheaterKeyboard'
export type { PersonalKeyAction } from './useTheaterKeyboard'
export { theaterQueueFilterLabel } from './theater-math'
export {
  shouldCommitDelete,
  shouldDismissUndo,
  personalAdvance,
  personalAdvanceOnEndedIndex,
  personalStepBackIndex,
  pinKeyFirst,
  applyTheaterTypeLens,
  personalAdvanceMatching,
  personalAdvanceOnEndedMatching,
  personalSkipMatching,
  personalStepBackMatching,
  feedItemMatchesQueueTypes,
  queueTypesForAddedItem,
  parseTheaterQueueTypes,
  serializeTheaterQueueTypes,
  toggleTheaterQueueType,
  theaterQueueEmptyHeadline,
  orderLifoQueue,
  sortNewestFirst,
  sortFeedNewestFirst,
  queueSectionHeading,
  QUEUE_NOW_PLAYING,
  QUEUE_NEXT,
  QUEUE_SEEN,
  firstPendingLiveKey,
  computeQueueCounts,
  formatQueueCount,
  theaterUrlSyncPath,
  theaterTabNavRestore,
  theaterTabNavAction,
  isFeedEnd,
  computeCanPrev,
  computeCanNext,
  findFreshArrival,
  nextRepeatMode,
  computeLoopedNext,
  computeLoopedPrev,
  isSharedPostPinned,
  isSharedItemUnavailable,
} from './theater-math'
export type { PersonalUndoAction, RepeatMode } from './theater-math'

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
   *
   * `sharedUnavailableReason` distinguishes a gone source (`source`, the
   * default) from an admin hide (`hidden`) so the stage does not claim a
   * YouTube Short "is no longer available on X".
   */
  sharedUnavailable?: boolean
  sharedUnavailableReason?: 'source' | 'hidden'
  /**
   * Shared preview: the page started FxTwitter / a scrape / oEmbed without
   * awaiting it so ADHX chrome can paint first. Settling replaces the URL
   * stub in place; a tweet that 404s flips `sharedUnavailable`.
   */
  sharedResolve?: Promise<SharedResolveResult>
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
   * Collection mode (`mode="personal"`, unified-theater-collection.md §2): the
   * snapshot of the authed Collection's active queue to collection — same
   * contract as the deleted `CollectionTheater`'s `initialQueue`. Taken once
   * at mount; AuthedTheater fetches the queue before mounting the shell.
   */
  personalItems?: FeedItem[]
  /** Where to start in the collection queue — a gallery click jumps to the clicked item (same contract as the deleted `CollectionTheater`'s `startIndex`). */
  initialPersonalIndex?: number
  /**
   * `/saved?open=` already picked the start. Do not clamp to newest-unread
   * when queue prefs hydrate — that snapped every mid-queue open.
   */
  preserveSavedStart?: boolean
  /** Which collection sub-tab to open on (`/live` is Live, `/saved` is Saved). */
  initialPersonalTab?: PersonalTab
  /**
   * Called when the viewer flips the Live ⇄ Saved switch. The switch
   * is a ROUTE on the signed-in theater (`/live` is Live, `/saved` is My
   * Collection — owner: "a specific route that they select"), so the page
   * passes a `router.push` here. The tab flips locally first when that
   * side already has items. Live never fetches Saved, so `2` only
   * navigates — a local flip would All Clear an empty mount snapshot.
   */
  onPersonalTabChange?: (tab: PersonalTab) => void
  /** Notify a caller an archive/delete landed. Identity is the full item — same numeric id exists across platforms. */
  onPostResolved?: (item: FeedItem, action: 'archive' | 'delete') => void
  /** Notify the Collection feed an archive was undone, so it can restore the item + active count. */
  onPostRestored?: (item: FeedItem) => void
  /**
   * A post was added to the collection from the theater (the Live tab's Save).
   * Hands the grid the ready-made row so it can place it in-line, instead of
   * the old `tweet-added` broadcast that made the grid throw away its whole
   * list — and its scroll position — to refetch page 1.
   */
  onCollectionAdded?: (item: FeedItem) => void
  /** Collection mode only — closes the overlay (it lives over `/`, there is no page to navigate back to). */
  onClose?: () => void
}

export function TheaterShell({
  seed,
  mode = 'home',
  sharedItem,
  sharedUnavailable = false,
  sharedUnavailableReason = 'source',
  sharedResolve,
  authed = false,
  playlist,
  personalItems,
  initialPersonalIndex,
  preserveSavedStart = false,
  initialPersonalTab,
  onPersonalTabChange,
  onPostResolved,
  onPostRestored,
  onCollectionAdded,
  onClose,
}: TheaterShellProps) {
  const router = useRouter()
  const authMe = useAuthMe()
  const isPersonal = mode === 'personal'
  // Playlist mode (`/t/{username}/{tag}`) is a fixed curated queue that loops
  // (wrapOnly all⇄one). Saved (`/saved`) defaults to looping the list too,
  // with off = one run then All Clear. Live defaults to stop-when-caught-up.
  const loop = mode === 'playlist'
  // The personal theater's Collection tab never blends the live pulse in; its Live tab
  // reuses the exact same live feed home/shared mode does.
  const [personalTab, setPersonalTab] = useState<PersonalTab>(initialPersonalTab ?? 'live')
  // Flip locally first (instant switch), then let the page navigate — except
  // Live→Saved when this mount has no Saved snapshot (AuthedTheater only
  // fetches the queue on `/saved`). Local-flipping that empty list is All Clear.
  const changePersonalTab = useCallback(
    (next: PersonalTab) => {
      const savedSnapshotMissing = next === 'collection' && (personalItems?.length ?? 0) === 0
      if (!savedSnapshotMissing) setPersonalTab(next)
      onPersonalTabChange?.(next)
    },
    [onPersonalTabChange, personalItems],
  )
  // `collection` is the Saved tab (`/saved`). Public APIs still say collection.
  const isCollectionTab = isPersonal && personalTab === 'collection'

  const { effectiveRepeatMode, setRepeatMode, setSavedRepeatMode } = useTheaterRepeatPrefs({
    loop,
    isCollectionTab,
  })
  const repeatModeRef = useRef(effectiveRepeatMode)
  repeatModeRef.current = effectiveRepeatMode
  const signedIn = authed || !!authMe.me?.authenticated
  const goTheaterTab = useCallback(
    (tab: PersonalTab) => {
      if (isPersonal) {
        changePersonalTab(tab)
        return
      }
      if (mode !== 'shared' || !signedIn) return
      if (tab === 'live') return
      router.push('/saved')
    },
    [isPersonal, changePersonalTab, mode, signedIn, router],
  )
  const queueFilterAvailable = !loop
  const feed = useTheaterFeed(seed, { live: !loop && !isCollectionTab })
  const feedPrepend = feed.prependItem
  const seenSet = useSeenSet()
  const { items } = feed

  const [resolvedUnavailable, setResolvedUnavailable] = useState(false)
  const [sharedResolved, setSharedResolved] = useState(() => !sharedResolve)
  const leadUnavailable = sharedUnavailable || resolvedUnavailable
  const awaitingSharedResolve = Boolean(sharedResolve) && !sharedResolved
  const applySharedResolve = useCallback(
    (result: SharedResolveResult) => {
      setSharedResolved(true)
      if (!result.ok) {
        setResolvedUnavailable(true)
        return
      }
      feed.replaceItem(result.item)
    },
    [feed.replaceItem],
  )

  // --- Collection mode (unified-theater-collection.md §2): a separate, small state
  // machine ported from the deleted CollectionTheater/CollectionRail. It
  // deliberately does NOT share `items`/`currentKey`/goNext/goPrev with the
  // rest of the shell — those always describe the live pulse feed (used
  // directly by home/shared/collection modes, and by the collection theater's OWN Live tab);
  // the collection queue below is a wholly separate, non-live, non-looping list.
  // Archive splices the current post out of this snapshot; skip/next only
  // advances `personalIndex`.
  // Snapshot at mount — `/saved` fetches before painting the shell, and we
  // do not re-sync from props (that would jump the cursor on a parent refresh).
  // Other windows drop / prepend via `tweet-added` `{ removed }` / `{ added }`.
  const [personalQueue, setPersonalQueue] = useState<FeedItem[]>(() =>
    sortFeedNewestFirst(personalItems ?? []),
  )
  const personalQueueRef = useRef(personalQueue)
  personalQueueRef.current = personalQueue
  const queueTypesRef = useRef<ContentType[]>([])
  const typeFilterActiveRef = useRef(false)
  const allowPersonalIndex = useCallback((i: number) => {
    const queue = personalQueueRef.current
    const item = queue[i]
    if (!item) return false
    return feedItemMatchesQueueTypes(item, typeFilterActiveRef.current ? queueTypesRef.current : [])
  }, [])
  const [personalIndex, setPersonalIndex] = useState(() => Math.max(0, initialPersonalIndex ?? 0))
  const personalIndexRef = useRef(personalIndex)
  personalIndexRef.current = personalIndex
  const personalTabRef = useRef(personalTab)
  personalTabRef.current = personalTab
  // Adds may reset Videos → All. That is not a user filter tap — keep the
  // current post instead of jumping to the newest prepend. `?open=`
  // skips the first hydrate clamp for the same reason.
  const skipSavedClampRef = useRef(preserveSavedStart)
  const [personalUndo, setPersonalUndo] = useState<PersonalUndoAction | null>(null)
  // Ref-backed so `handlePersonalLiveSave` (registered once) always sees the
  // current handler without re-creating itself on every grid render.
  const onCollectionAddedRef = useRef(onCollectionAdded)
  onCollectionAddedRef.current = onCollectionAdded

  const [personalSavedKeys, setPersonalSavedKeys] = useState<Set<string>>(new Set())
  const personalSavedKeysRef = useRef(personalSavedKeys)
  useEffect(() => {
    personalSavedKeysRef.current = personalSavedKeys
  }, [personalSavedKeys])
  // Prepends sit at index 0 while the cursor stays put, so "everything
  // before the cursor is watched" would mark a brand-new save Watched.
  const [freshSavedKeys, setFreshSavedKeys] = useState<Set<string>>(() => new Set())
  const markFreshSaved = useCallback((key: string) => {
    setFreshSavedKeys((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }, [])
  const [tagPickerItem, setTagPickerItem] = useState<{
    platform: string
    bookmarkId: string
  } | null>(null)
  const personalUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Separate from `personalUndoTimerRef` (which defers the server DELETE for a
  // 'delete' undo): this one just auto-dismisses the "Done/Later · Undo"
  // toast after the same 5s window, since archive/keep undos have nothing to
  // defer — the read/no-op already happened synchronously.
  const undoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const personalTotal = personalQueue.length
  const personalRemaining = Math.max(0, personalTotal - personalIndex)
  const personalCurrentFeedItem: FeedItem | null =
    personalIndex < personalQueue.length ? personalQueue[personalIndex] : null
  const personalCurrentRef = useRef(personalCurrentFeedItem)
  personalCurrentRef.current = personalCurrentFeedItem
  const personalFinished = personalIndex >= personalQueue.length
  const personalDisplayItems = useMemo(
    () => personalQueue.map(feedItemToTheaterItem),
    [personalQueue],
  )
  const [playedSavedKeys, setPlayedSavedKeys] = useState<Set<string>>(() => readPlayedSavedKeys())
  const playedSavedKeysRef = useRef(playedSavedKeys)
  playedSavedKeysRef.current = playedSavedKeys
  const personalCurrentKey = personalCurrentFeedItem
    ? theaterItemKey(feedItemToTheaterItem(personalCurrentFeedItem))
    : null
  const prevSavedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevSavedKeyRef.current
    if (prev && prev !== personalCurrentKey) {
      setPlayedSavedKeys((s) => {
        if (s.has(prev)) return s
        const next = new Set(s)
        next.add(prev)
        return next
      })
    }
    prevSavedKeyRef.current = personalCurrentKey
  }, [personalCurrentKey])
  const personalIsSeen = useCallback((key: string) => playedSavedKeys.has(key), [playedSavedKeys])
  useEffect(() => {
    writePlayedSavedKeys(playedSavedKeys)
  }, [playedSavedKeys])

  useEffect(() => {
    if (!personalCurrentKey) return
    setFreshSavedKeys((prev) => {
      if (!prev.has(personalCurrentKey)) return prev
      const next = new Set(prev)
      next.delete(personalCurrentKey)
      return next
    })
  }, [personalCurrentKey])

  useEffect(() => {
    // `/live` mounts with an empty Saved snapshot. Writing from there
    // (a Live paste on an empty queue) would clobber the real cursor.
    if (!isPersonal || !isCollectionTab || !personalCurrentKey) return
    writeSavedPlayingKey(personalCurrentKey)
  }, [isPersonal, isCollectionTab, personalCurrentKey])

  const clearPersonalUndoTimer = useCallback(() => {
    if (personalUndoTimerRef.current) clearTimeout(personalUndoTimerRef.current)
    personalUndoTimerRef.current = null
  }, [])

  const clearUndoDismissTimer = useCallback(() => {
    if (undoDismissTimerRef.current) clearTimeout(undoDismissTimerRef.current)
    undoDismissTimerRef.current = null
  }, [])

  // Auto-dismiss the undo toast 5s after Archive. Guarded by identity
  // (`u === action`) so a stale timer from a superseded action can never
  // wipe a newer undo that's since replaced it.
  const armUndoDismiss = useCallback(
    (action: PersonalUndoAction) => {
      clearUndoDismissTimer()
      undoDismissTimerRef.current = setTimeout(() => {
        undoDismissTimerRef.current = null
        setPersonalUndo((u) => (shouldDismissUndo(u, action) ? null : u))
      }, 5000)
    },
    [clearUndoDismissTimer],
  )

  // A pending delete must be COMMITTED (not just cancelled) when the next
  // action lands within its 5s undo window, or the previous delete silently
  // never reaches the server. `shouldCommitDelete()` is the pure "is one
  // owed" check; this does the actual fetch + notification.
  const commitPendingDelete = useCallback(() => {
    if (!personalUndoTimerRef.current) return
    clearPersonalUndoTimer()
    setPersonalUndo((u) => {
      if (shouldCommitDelete(u) && u) {
        fetch(`/api/bookmarks/${u.item.id}?platform=${u.item.platform ?? 'twitter'}`, {
          method: 'DELETE',
        }).catch(() => {})
        onPostResolved?.(u.item, 'delete')
        notifyCollectionChanged({
          removed: { platform: u.item.platform ?? 'twitter', id: u.item.id },
        })
      }
      return null
    })
  }, [clearPersonalUndoTimer, onPostResolved])

  // Done: mark read and advance.
  /**
   * Take a post OUT of the collection queue (owner: "when I click Archive on a
   * post from my collection view it should just remove it from the list… it's
   * moving to the next item but it should completely remove it and update the
   * playlist"). Archive and Delete both resolve a post's fate, so both drop it
   * from the list rather than leaving it sitting there behind the cursor —
   * which also keeps the queue count honest.
   *
   * The index deliberately does NOT advance afterwards: removing element `idx`
   * shifts the next post INTO `idx`, so staying put IS advancing. Later is
   * different and still just advances — "show me this again" means keep it.
   */
  const removeFromPersonalQueue = useCallback((item: FeedItem) => {
    const platform = item.platform ?? 'twitter'
    // Removed by IDENTITY, not by the index the caller captured. These handlers
    // close over `personalIndex`, and the keyboard listener re-subscribes only
    // after a render — so two events landing in the same tick (OS key-repeat
    // on ArrowRight, a fast double-tap) both carried the SAME stale index, and
    // the second removal took whichever unresolved post had slid into that
    // slot. Filtering by key makes a repeat a no-op instead (review finding).
    //
    // `filter`, not `toSpliced`: the latter is ES2023 and Next's compiler does
    // not polyfill prototype methods, so on iOS 16.0-16.3 it is `undefined`
    // and pressing Archive would throw into the error boundary. This project
    // targets ES2017 for exactly that reason.
    //
    // If the dropped row sat *before* the cursor (another window archived an
    // earlier post), slide the index back so we stay on the same post.
    const removedAt = personalQueueRef.current.findIndex(
      (f) => f.id === item.id && (f.platform ?? 'twitter') === platform,
    )
    if (removedAt === -1) return
    // Keep the ref in lockstep so a same-tick second call (local Archive
    // also fires `tweet-added` with `removed`) is a no-op, not a second splice.
    personalQueueRef.current = personalQueueRef.current.filter(
      (f) => !(f.id === item.id && (f.platform ?? 'twitter') === platform),
    )
    setPersonalQueue(personalQueueRef.current)
    setPersonalIndex((i) => (removedAt < i ? i - 1 : i))
  }, [])

  const prependToPersonalQueue = useCallback(
    (item: FeedItem) => {
      const platform = item.platform ?? 'twitter'
      const exists = personalQueueRef.current.some(
        (f) => f.id === item.id && (f.platform ?? 'twitter') === platform,
      )
      if (exists) return false
      const oldLength = personalQueueRef.current.length
      const wasEmpty = oldLength === 0
      const wasFinished = personalIndexRef.current >= oldLength
      personalQueueRef.current = [item, ...personalQueueRef.current]
      setPersonalQueue(personalQueueRef.current)
      markFreshSaved(theaterItemKey(feedItemToTheaterItem(item)))
      // Stay on the playing post. All Clear (or an empty queue) jumps to
      // the new head — +1 past the end would keep CollectionAllClear up.
      setPersonalIndex((i) => (wasEmpty || wasFinished ? 0 : i + 1))
      return true
    },
    [markFreshSaved],
  )

  useEffect(() => {
    const onFeedChanged = (event: Event) => {
      const detail = (event as CustomEvent<CollectionFeedChangedDetail>).detail
      if (detail?.removed) {
        const item = personalQueueRef.current.find(
          (f) =>
            f.id === detail.removed!.id &&
            (f.platform ?? 'twitter') === (detail.removed!.platform || 'twitter'),
        )
        if (item) removeFromPersonalQueue(item)
        return
      }
      const added = detail?.added
      if (!added || typeof added.id !== 'string') return
      prependToPersonalQueue(added)
      feedPrepend?.(feedItemToTheaterItem(added))
      // Same rule as same-tab paste: a Videos queue must not hide a
      // text save (or vice versa). Reset even when Saved already had
      // the row — Live still prepends it, and a shared type filter
      // would otherwise leave the arrival invisible.
      skipSavedClampRef.current = true
      setQueueTypes((cur) => queueTypesForAddedItem(cur, added))
    }
    window.addEventListener(CLIENT_EVENTS.feedChanged, onFeedChanged)
    return () => window.removeEventListener(CLIENT_EVENTS.feedChanged, onFeedChanged)
  }, [removeFromPersonalQueue, prependToPersonalQueue, feedPrepend])

  const archiveCurrent = useCallback(() => {
    if (!personalCurrentFeedItem) return
    const item = personalCurrentFeedItem
    const idx = personalIndex
    fetch(`/api/bookmarks/${item.id}/read?platform=${item.platform ?? 'twitter'}`, {
      method: 'POST',
    }).catch(() => {})
    onPostResolved?.(item, 'archive')
    notifyCollectionChanged({
      removed: { platform: item.platform ?? 'twitter', id: item.id },
    })
    commitPendingDelete()
    const action: PersonalUndoAction = { type: 'archive', item, index: idx }
    setPersonalUndo(action)
    armUndoDismiss(action)
    removeFromPersonalQueue(item)
  }, [
    personalCurrentFeedItem,
    personalIndex,
    onPostResolved,
    commitPendingDelete,
    armUndoDismiss,
    removeFromPersonalQueue,
  ])

  // Skip: next post without changing read state and without a Later toast.
  // Transport / keyboard next on the collection tab (same as Live arrows).
  const skipCurrent = useCallback(() => {
    if (!personalCurrentFeedItem) return
    setPersonalIndex((i) =>
      personalSkipMatching(
        i,
        personalQueueRef.current.length,
        repeatModeRef.current,
        allowPersonalIndex,
      ),
    )
  }, [personalCurrentFeedItem, allowPersonalIndex])

  const undoLastAction = useCallback(() => {
    if (!personalUndo) return
    clearUndoDismissTimer()
    if (personalUndo.type === 'archive') {
      fetch(
        `/api/bookmarks/${personalUndo.item.id}/read?platform=${personalUndo.item.platform ?? 'twitter'}`,
        {
          method: 'DELETE',
        },
      ).catch(() => {})
      onPostRestored?.(personalUndo.item)
      notifyCollectionChanged()
    } else if (personalUndo.type === 'delete') {
      clearPersonalUndoTimer()
    }
    // Both actions REMOVED the post from the queue, so undo re-inserts it at
    // the position it held — otherwise "undo" would restore its read state
    // server-side while leaving it missing from the list.
    if (personalUndo.type === 'archive' || personalUndo.type === 'delete') {
      const { item, index } = personalUndo
      setPersonalQueue((prev) =>
        prev.some(
          (f) => f.id === item.id && (f.platform ?? 'twitter') === (item.platform ?? 'twitter'),
        )
          ? prev
          : (() => {
              const at = Math.min(Math.max(index, 0), prev.length)
              return [...prev.slice(0, at), item, ...prev.slice(at)]
            })(),
      )
    }
    setPersonalIndex(personalUndo.index)
    setPersonalUndo(null)
  }, [personalUndo, onPostRestored, clearPersonalUndoTimer, clearUndoDismissTimer])

  // ArrowUp "Back": pure navigation only — never touches read/delete state,
  // unlike `U` (which reverses the last action).
  const personalStepBack = useCallback(() => {
    setPersonalIndex((i) => personalStepBackMatching(i, allowPersonalIndex))
  }, [allowPersonalIndex])

  // A video ended, or a photo/text/article's 10s dwell finished, in My
  // Collection. Pure navigation — same as skip/next — not Archive.
  // Repeat 'off' walks past the last item (`personalFinished`) and shows
  // CollectionAllClear. Repeat 'all' wraps to 0; 'one' stays on the post
  // (Stage `repeat` loops the player; timed items suppress the dwell line).
  const personalQueueLengthRef = useRef(personalQueue.length)
  personalQueueLengthRef.current = personalQueue.length
  const personalFinishedRef = useRef(personalFinished)
  personalFinishedRef.current = personalFinished

  const personalAdvanceOnEnded = useCallback(() => {
    setPersonalIndex((i) =>
      personalAdvanceOnEndedMatching(
        i,
        personalQueueLengthRef.current,
        repeatModeRef.current,
        allowPersonalIndex,
      ),
    )
  }, [allowPersonalIndex])

  const keepPlayingCollection = useCallback(() => {
    setSavedRepeatMode('all')
    setPersonalIndex(0)
  }, [])

  // Flush any pending delete, and cancel the undo-toast dismiss timer, when
  // the shell unmounts (AuthedHome closes collection by conditionally unmounting
  // the whole `<TheaterShell/>`).
  useEffect(() => {
    if (!isPersonal) return
    return () => {
      commitPendingDelete()
      clearUndoDismissTimer()
    }
  }, [isPersonal, commitPendingDelete, clearUndoDismissTimer])

  // Keep tags live wherever the picker can open: Collection queue, Live tab,
  // and a signed-in shared preview (autosave → Tag). `TagQuickPicker`
  // broadcasts the post's full list on every toggle/create. The collection
  // queue is a mount snapshot, so this is the one place those items mutate
  // in place. Shared/live chips read `liveTagsByKey`.
  useEffect(() => {
    function handleTagsChanged(e: Event) {
      const detail = (e as CustomEvent<{ platform?: string; bookmarkId?: string; tags?: string[] }>)
        .detail
      if (!detail?.bookmarkId) return
      const platform = detail.platform ?? 'twitter'
      setLiveTagsByKey((prev) => ({
        ...prev,
        [`${platform}:${detail.bookmarkId}`]: detail.tags ?? [],
      }))
      if (!isPersonal) return
      setPersonalQueue((prev) =>
        prev.map((item) =>
          item.id === detail.bookmarkId && (item.platform ?? 'twitter') === platform
            ? { ...item, tags: detail.tags ?? [] }
            : item,
        ),
      )
    }
    window.addEventListener('bookmark-tags-changed', handleTagsChanged)
    return () => window.removeEventListener('bookmark-tags-changed', handleTagsChanged)
  }, [isPersonal])

  // Dialog a11y: move focus into the overlay on mount, restore on unmount.
  useEffect(() => {
    if (!isPersonal) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    shellRef.current?.focus()
    return () => {
      previousFocusRef.current?.focus?.()
    }
  }, [isPersonal])

  // Lock the underlying page's scroll while the collection overlay is mounted.
  useEffect(() => {
    if (!isPersonal) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isPersonal])

  // Tag-from-live target: tapping Tag on a live item first ensures the post
  // is SAVED (a tag row needs a bookmark row to hang off), then opens the
  // TagQuickPicker for it.
  const [liveTagTarget, setLiveTagTarget] = useState<{
    platform: TheaterItem['platform']
    bookmarkId: string
  } | null>(null)

  const handlePersonalLiveSave = useCallback(
    async (item: TheaterItem): Promise<boolean> => {
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
          setPersonalSavedKeys((prev) => new Set(prev).add(key))
          // Did we manage to hand the grid a ready-made row? If not (no
          // bookmarkId, a failed lookup, a row the feed didn't return) the grid
          // still has to learn about the post somehow, so fall back to the
          // refetch below rather than leaving it invisible until a reload.
          let placedInGrid = false
          let saved: FeedItem | undefined
          // Pull the freshly saved bookmark into the OPEN collection queue too, so
          // switching to the Collection tab shows it without a page reload
          // (the queue is a snapshot taken when the overlay opened).
          if (item.bookmarkId) {
            try {
              const q = new URLSearchParams({ hideArchived: 'false', filter: 'all', limit: '5' })
              q.append('id', item.bookmarkId)
              q.append('idPlatform', item.platform ?? 'twitter')
              const fres = await fetch(`/api/feed?${q}`)
              if (fres.ok) {
                const data = await fres.json()
                saved = (data.items ?? []).find(
                  (f: FeedItem) =>
                    (f.platform ?? 'twitter') === item.platform && f.id === item.bookmarkId,
                )
                if (saved) {
                  const row = saved
                  prependToPersonalQueue(row)
                  // Hand the same row to the grid behind the overlay. It used to
                  // fire `tweet-added`, whose only listener refetches the WHOLE
                  // feed — resetting the grid to page 1 and losing however far
                  // the viewer had scrolled, for one added post (state review).
                  if (onCollectionAddedRef.current) {
                    onCollectionAddedRef.current(row)
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
          notifyCollectionChanged(
            saved ? { refetchFeed: false, added: saved } : { refetchFeed: !placedInGrid },
          )
        }
        return res.ok
      } catch {
        // Best effort — the button simply won't flip to "Saved".
      }
      return false
    },
    [prependToPersonalQueue],
  )

  const handlePastePost = useCallback(
    async (url: string): Promise<boolean> => {
      try {
        const res = await fetch('/api/bookmarks/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, source: 'manual' }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) return false

        const platform: string = data?.platform ?? 'twitter'
        const id: string | undefined = data?.bookmark?.id
        if (!id) {
          notifyCollectionChanged({ refetchFeed: true })
          return true
        }

        const q = new URLSearchParams({ hideArchived: 'false', filter: 'all', limit: '5' })
        q.append('id', id)
        q.append('idPlatform', platform)
        const fres = await fetch(`/api/feed?${q}`)
        if (!fres.ok) {
          notifyCollectionChanged({ refetchFeed: true })
          return true
        }
        const feedJson = await fres.json()
        const saved: FeedItem | undefined = (feedJson.items ?? []).find(
          (f: FeedItem) => (f.platform ?? 'twitter') === platform && f.id === id,
        )
        if (!saved) {
          notifyCollectionChanged({ refetchFeed: true })
          return true
        }

        const row = saved
        const theaterItem = feedItemToTheaterItem(row)
        const key = theaterItemKey(theaterItem)
        setPersonalSavedKeys((prev) => new Set(prev).add(key))
        markFreshSaved(key)
        // Same LIFO rule as prependToPersonalQueue / a second-window add:
        // newest goes to the top. Play it now only when caught up; otherwise
        // keep the playing post and the arrival is Next.
        const playingSaved = personalQueueRef.current[personalIndexRef.current]
        const wasFinished = personalFinishedRef.current || personalQueueRef.current.length === 0
        const rest = personalQueueRef.current.filter(
          (f) => !(f.id === row.id && (f.platform ?? 'twitter') === (row.platform ?? 'twitter')),
        )
        const nextQueue = [row, ...rest]
        personalQueueRef.current = nextQueue
        setPersonalQueue(nextQueue)
        if (wasFinished || !playingSaved) {
          setPersonalIndex(0)
        } else {
          const idx = nextQueue.findIndex(
            (f) =>
              f.id === playingSaved.id &&
              (f.platform ?? 'twitter') === (playingSaved.platform ?? 'twitter'),
          )
          setPersonalIndex(idx === -1 ? 0 : idx)
          if (personalTabRef.current !== 'collection') {
            writeSavedPlayingKey(theaterItemKey(feedItemToTheaterItem(playingSaved)))
          }
        }
        feedPrepend(theaterItem)
        skipSavedClampRef.current = true
        setQueueTypes((cur) => queueTypesForAddedItem(cur, row))

        if (onCollectionAddedRef.current) {
          onCollectionAddedRef.current(row)
        }
        // Same-tab tweet-added would re-prepend and bump the index. Other
        // windows still hear `{ added }` over BroadcastChannel.
        notifyCollectionChanged({ refetchFeed: false, added: row })
        return true
      } catch {
        return false
      }
    },
    [feedPrepend, markFreshSaved],
  )

  const handleSharedTag = useCallback((item: TheaterItem) => {
    if (!item.bookmarkId) return
    setLiveTagTarget({ platform: item.platform, bookmarkId: item.bookmarkId })
  }, [])

  const handlePersonalLiveTag = useCallback(
    async (item: TheaterItem) => {
      if (!item.bookmarkId) return
      const key = theaterItemKey(item)
      // Tagging implies keeping: save first when the post isn't in the
      // collection yet, then open the picker.
      if (!personalSavedKeysRef.current.has(key)) {
        const ok = await handlePersonalLiveSave(item)
        if (!ok) return
      }
      setLiveTagTarget({ platform: item.platform, bookmarkId: item.bookmarkId })
    },
    [handlePersonalLiveSave],
  )

  const [muted, setMuted] = useState(true)
  const [articleMode, setArticleMode] = useState(false)
  const toggleArticleMode = useCallback(() => setArticleMode((v) => !v), [])

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
      if (sessionStorage.getItem(THEATER_SOUND_STORAGE_KEY) === 'on') setMuted(false)
    } catch {
      // Storage can be unavailable (private mode) — keep the muted default.
    }
  }, [])
  useEffect(() => {
    try {
      sessionStorage.setItem(THEATER_SOUND_STORAGE_KEY, muted ? 'off' : 'on')
    } catch {
      // Same — never let a storage failure break playback.
    }
  }, [muted])

  const {
    queueTypes,
    setQueueTypes,
    queuePrefReady,
    typeFilterActive,
    toggleQueueType,
    clearQueueTypes,
  } = useTheaterQueueTypes(queueFilterAvailable)
  queueTypesRef.current = queueTypes
  typeFilterActiveRef.current = typeFilterActive

  const personalLensItems = useMemo(
    () => applyTheaterTypeLens(personalDisplayItems, typeFilterActive ? queueTypes : []),
    [personalDisplayItems, typeFilterActive, queueTypes],
  )
  const personalLensIndex = useMemo(() => {
    if (!personalCurrentFeedItem) return personalLensItems.length
    const key = theaterItemKey(feedItemToTheaterItem(personalCurrentFeedItem))
    const idx = personalLensItems.findIndex((it) => theaterItemKey(it) === key)
    return idx
  }, [personalCurrentFeedItem, personalLensItems])

  useEffect(() => {
    if (!isCollectionTab || !queuePrefReady) return
    if (skipSavedClampRef.current) {
      skipSavedClampRef.current = false
      return
    }
    const queue = personalQueueRef.current
    const types = typeFilterActive ? queueTypes : []
    const next = savedStartIndex(queue.length, {
      playingIndex: skipSavedClampRef.current ? personalIndexRef.current : 0,
      matches: (i) => {
        const item = queue[i]
        return !!item && feedItemMatchesQueueTypes(item, types)
      },
    })
    if (next !== personalIndexRef.current) setPersonalIndex(next)
    // Tab flips are not a clamp — Live paste keeps the Saved cursor
    // (`isCollectionTab` is not a dep). Remount newest-first start is
    // AuthedTheater; `?open=` sets preserveSavedStart so hydrate does
    // not snap a library tap back to the first unread.
  }, [queuePrefReady, typeFilterActive, queueTypes])

  const isDesktop = useIsDesktopViewport()
  // Desktop de-clutter: collapses the dock for a full-bleed stage.
  // Desktop-only concept — mobile has its own independent de-clutter state
  // local to TheaterMobileChrome. Persists across item navigation (not reset
  // on `currentKey`), same as the mobile one.
  const [desktopDeclutter, setDesktopDeclutter] = useState(false)
  const onToggleDesktopDeclutter = useCallback(() => setDesktopDeclutter((v) => !v), [])
  useTheaterStageTapDeclutter(desktopDeclutter, setDesktopDeclutter)
  const [currentKey, setCurrentKey] = useState<string | null>(() =>
    sharedItem ? theaterItemKey(sharedItem) : null,
  )
  useEffect(() => {
    setArticleMode(false)
  }, [isCollectionTab ? personalCurrentKey : currentKey])
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

  const { sharedPinned, clearSharedPin, sharedItemKey } = useSharedPin(
    mode,
    sharedItem,
    leadUnavailable,
    signedIn,
  )

  // Set once a user has navigated (keyboard/rail click) — after that, the
  // opening pick below never overrides their choice.
  const hasNavigatedRef = useRef(false)
  const leadAppliedRef = useRef(false)

  // Set by the waiting stage's re-watch button: the viewer has explicitly
  // asked to go round the already-watched queue again, so the unseen boundary
  // stops applying for the rest of the session (repeat 'all' is the other
  // opt-in, handled via `loop`). Never set implicitly — that's the whole
  // point of the owner's "you would need to specifically click it".
  // Live / Saved / shared preview: newest-first LIFO. Curated tag playlists
  // keep their authored order.
  const liveOrdering = !loop
  const isSeenNow = useCallback((key: string) => seenSet.isSeen(key), [seenSet.isSeen])
  const onlyUnseen = liveOrdering && seenSet.ready && effectiveRepeatMode === 'off'
  // Pin now-playing only on Repeat off: a newer arrival must sit as Next.
  // Repeat all walks newest-first and wraps. Pinning there keeps current at
  // index 0, so Next is always the newest other post — a two-item loop.
  const pinLiveCurrent = onlyUnseen && !waiting
  const lensItems = useMemo(
    () =>
      applyTheaterTypeLens(
        items,
        typeFilterActive ? queueTypes : [],
        sharedItem ? sharedItemKey : null,
      ),
    [items, typeFilterActive, queueTypes, sharedItem, sharedItemKey],
  )
  const displayItems = useMemo(
    () =>
      liveOrdering
        ? orderLifoQueue(lensItems, {
            currentKey,
            onlyUnseen,
            isSeen: isSeenNow,
            keepKey: sharedItemKey,
            pinCurrent: pinLiveCurrent,
          })
        : lensItems,
    [liveOrdering, lensItems, currentKey, onlyUnseen, isSeenNow, sharedItemKey, pinLiveCurrent],
  )
  const queueItems = useMemo(
    () =>
      liveOrdering && onlyUnseen
        ? orderLifoQueue(lensItems, {
            currentKey,
            onlyUnseen,
            isSeen: isSeenNow,
            keepKey: sharedItemKey,
            pinCurrent: pinLiveCurrent,
            appendSeen: true,
          })
        : displayItems,
    [
      liveOrdering,
      onlyUnseen,
      lensItems,
      currentKey,
      isSeenNow,
      sharedItemKey,
      pinLiveCurrent,
      displayItems,
    ],
  )
  const unseenCount = displayItems.length

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
    if (!isPersonal || personalTab !== 'live') return
    fetchBookmarkMembership(displayItems, membershipCheckedRef.current, (owned) => {
      setPersonalSavedKeys((prev) => {
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
  }, [isPersonal, personalTab, displayItems])

  // Shared preview: seed tags for the lead (and any pulse items we land on)
  // so a reload of an already-tagged save shows Tag N. The
  // tags-changed listener above covers in-session adds.
  useEffect(() => {
    if (mode !== 'shared' || !authMe.me?.authenticated) return
    fetchBookmarkMembership(displayItems, membershipCheckedRef.current, (owned) => {
      setLiveTagsByKey((prev) => {
        const next = { ...prev }
        for (const f of owned) next[`${f.platform ?? 'twitter'}:${f.id}`] = f.tags ?? []
        return next
      })
    })
  }, [mode, authMe.me?.authenticated, displayItems])

  // Kept in a ref (rather than effect deps) so goNext/goPrev/the dwell timer
  // (useTheaterDwell) only reset when `currentKey` itself changes, not on
  // every unrelated re-render (polling, seen-state updates, etc.).
  const itemsRef = useRef(displayItems)
  itemsRef.current = displayItems
  const lensItemsRef = useRef(lensItems)
  lensItemsRef.current = lensItems
  const fullQueue = () =>
    itemsRef.current.length > 0 ? itemsRef.current : sortNewestFirst(lensItemsRef.current)
  // Read fresh inside goNext/goPrev (empty-deps callbacks) without
  // re-registering them on every waiting/feed change.
  const waitingRef = useRef(waiting)
  waitingRef.current = waiting
  const isSeenRef = useRef(seenSet.isSeen)
  isSeenRef.current = seenSet.isSeen
  const freshKeysRef = useRef(feed.freshKeys)
  freshKeysRef.current = feed.freshKeys
  // Snapshot of `freshKeys` taken the moment waiting begins — anything
  // added to freshKeys AFTER this point is a genuinely new arrival the
  // waiting stage should auto-play into (see the effect near the bottom).
  // Staging an arrival ADDS its key here (rather than resnapshotting), so a
  // second item that arrived while the first played is still "new" when the
  // first one finishes and waiting resumes.
  const waitingBaselineFreshKeysRef = useRef<Set<string>>(new Set())

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
    if (!typeFilterActive) return
    if (displayItems.length === 0) {
      // Seen-only lens (Videos + every video already watched): park on
      // the newest matching post and wait. Do not clear currentKey —
      // that painted "Nothing playing" / "No videos" over caught-up.
      if (
        lensItems.length > 0 &&
        liveOrdering &&
        !loop &&
        !isCollectionTab &&
        effectiveRepeatMode === 'off'
      ) {
        const park = theaterItemKey(sortNewestFirst(lensItems)[0])
        if (currentKey !== park) setCurrentKey(park)
        if (!waiting) {
          waitingBaselineFreshKeysRef.current = new Set(freshKeysRef.current)
          parkedUnplayedKeyRef.current = park
          setWaiting(true)
        }
        return
      }
      // Empty lens (no posts of this type). Keep currentKey under the
      // empty overlay so All / Show every post restores the same post
      // instead of a blank "Nothing playing" stage.
      return
    }
    if (currentKey && displayItems.some((it) => theaterItemKey(it) === currentKey)) return
    // The current post is the wrong type. Never leave currentKey pointing
    // at a row that is no longer in the lens — that paints "Nothing playing"
    // with Next/Prev dead (Videos while a text post was on stage).
    const pending = firstPendingLiveKey(displayItems, seenSet.isSeen)
    const nextKey = pending ?? theaterItemKey(displayItems[0])
    if (nextKey !== currentKey) setCurrentKey(nextKey)
    if (
      !pending &&
      liveOrdering &&
      !loop &&
      !isCollectionTab &&
      effectiveRepeatMode === 'off' &&
      !waiting
    ) {
      waitingBaselineFreshKeysRef.current = new Set(freshKeysRef.current)
      setWaiting(true)
    }
  }, [
    typeFilterActive,
    displayItems,
    lensItems,
    currentKey,
    seenSet.isSeen,
    liveOrdering,
    loop,
    isCollectionTab,
    effectiveRepeatMode,
    waiting,
  ])

  // All / Show every post after an empty type lens: if we parked on
  // waiting because the lens had nothing left to play, resume the first
  // unseen row instead of keeping a blank caught-up overlay.
  useEffect(() => {
    if (typeFilterActive || isCollectionTab || loop || !waiting) return
    const pending = firstPendingLiveKey(lensItems, seenSet.isSeen)
    if (!pending) return
    if (currentKey !== pending) setCurrentKey(pending)
    setWaiting(false)
  }, [typeFilterActive, isCollectionTab, loop, waiting, lensItems, currentKey, seenSet.isSeen])

  useEffect(() => {
    // Shared mode never re-picks — the shared post is ALWAYS the initial
    // current item, whatever this viewer has seen elsewhere. Playlist mode
    // never re-picks either: a curated tag collection always opens on its
    // first item, in curated order.
    //
    // Saved is the same theater with a different playlist. It must
    // not inherit the live feed's caught-up / waiting machinery — that
    // paused the collection stage on load (and ate Space) whenever every
    // live post was already seen. Return before consuming `leadAppliedRef`
    // so a later flip to Live can still apply the live lead pick.
    if (sharedItem || loop || isCollectionTab) return
    if (!seenSet.ready || !queuePrefReady || leadAppliedRef.current || hasNavigatedRef.current)
      return
    leadAppliedRef.current = true
    const pending = firstPendingLiveKey(lensItems, seenSet.isSeen)
    const head =
      displayItems[0] ?? (pending ? lensItems.find((it) => theaterItemKey(it) === pending) : null)
    if (!pending) {
      const parked = sortNewestFirst(lensItems)[0]
      if (!parked) return
      waitingBaselineFreshKeysRef.current = new Set(freshKeysRef.current)
      parkedUnplayedKeyRef.current = theaterItemKey(parked)
      setWaiting(true)
      setCurrentKey(theaterItemKey(parked))
      return
    }
    if (!head) return
    setCurrentKey(theaterItemKey(head))
  }, [
    seenSet.ready,
    queuePrefReady,
    displayItems,
    lensItems,
    sharedItem,
    loop,
    isCollectionTab,
    seenSet.isSeen,
  ])

  const currentIndex = useMemo(
    () => displayItems.findIndex((it) => theaterItemKey(it) === currentKey),
    [displayItems, currentKey],
  )
  const current: TheaterItem | null = useMemo(() => {
    if (currentIndex !== -1) return displayItems[currentIndex] ?? null
    if (!currentKey) return null
    return (
      lensItems.find((it) => theaterItemKey(it) === currentKey) ??
      items.find((it) => theaterItemKey(it) === currentKey) ??
      null
    )
  }, [currentIndex, displayItems, currentKey, lensItems, items])
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
  /**
   * A queue of ONE that is supposed to loop cannot loop by NAVIGATING:
   * `computeLoopedNext(1, 0, true)` returns 0 — the index it is already on —
   * so the shell sets the key it already has, React bails on the identical
   * state, and the video never restarts. Owner report: a single-post tag
   * playlist "isn't looping".
   *
   * Looping one post IS the player-level behaviour this flag already drives
   * (native `loop` on the video, no auto-advance, no timed progress line
   * ticking toward an advance that can never happen), so route it here rather
   * than teaching navigation to re-fire a no-op. Covers a one-post playlist
   * and repeat-all over a one-post queue alike.
   */
  const loopingSingleItem =
    (isCollectionTab ? personalLensItems.length : displayItems.length) === 1 &&
    (loop || effectiveRepeatMode === 'all')
  const repeatCurrentActive =
    isSharedPinnedOnCurrent || effectiveRepeatMode === 'one' || loopingSingleItem
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
    leadUnavailable,
    sharedItemKey,
    currentKey,
  )
  const resolvingSharedLead =
    awaitingSharedResolve &&
    mode === 'shared' &&
    currentKey === sharedItemKey &&
    sharedItem?.platform === 'twitter'
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
  const currentKeyRef = useRef(currentKey)
  currentKeyRef.current = currentKey
  const goNext = useCallback(() => {
    setCurrentKey((key) => {
      const idx = itemsRef.current.findIndex((it) => theaterItemKey(it) === key)
      const next = computeLoopedNext(
        itemsRef.current.length,
        idx,
        loop || repeatModeRef.current === 'all',
      )
      if (next === null) return key
      if (next === 'waiting') {
        const pending = firstPendingLiveKey(itemsRef.current, isSeenRef.current, key)
        if (pending) {
          hasNavigatedRef.current = true
          if (waitingRef.current) setWaiting(false)
          return pending
        }
        if (!waitingRef.current) {
          parkedUnplayedKeyRef.current = null
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
    const leaving = currentKeyRef.current
    if (leaving) {
      seenSet.markSeen(leaving)
    }
    // Browsing leaves the "parked, never played" case even if a full
    // walk later lands back on the same key.
    parkedUnplayedKeyRef.current = null
    clearSharedPin()
    goNext()
  }, [clearSharedPin, goNext, seenSet.markSeen])

  const goPrevUser = useCallback(() => {
    parkedUnplayedKeyRef.current = null
    clearSharedPin()
    goPrev()
  }, [clearSharedPin, goPrev])

  const onSelectUser = useCallback(
    (key: string) => {
      parkedUnplayedKeyRef.current = null
      clearSharedPin()
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
      setWaiting(false)
      const first = fullQueue()[0]
      if (first) setCurrentKey(theaterItemKey(first))
      // Same reason as `replayFromStart` — the key may not change, so the
      // paused stage needs telling explicitly.
      window.dispatchEvent(new CustomEvent('theater-resume'))
    }
    if (
      next === 'all' &&
      isCollectionTab &&
      personalFinishedRef.current &&
      personalQueueLengthRef.current > 0
    ) {
      setPersonalIndex(0)
    }
    setRepeatMode(next)
  }, [clearSharedPin, loop, isCollectionTab])

  // Re-watch all: mark the current playlist unseen and play newest-first
  // as a fresh Repeat-off run. Finished posts go to Seen again.
  const replayFromStart = useCallback(() => {
    const list = sortNewestFirst(lensItemsRef.current)
    const first = list[0]
    if (!first) return
    seenSet.unmarkSeen(list.map((it) => theaterItemKey(it)))
    hasNavigatedRef.current = true
    clearSharedPin()
    parkedUnplayedKeyRef.current = null
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
  }, [clearSharedPin, seenSet.unmarkSeen])

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
    setRepeatMode('all')
    setWaiting(false)
    // Parked on an unplayed item (the caught-up-on-arrival case)? Start THERE.
    // Advancing would skip it, which is what produced "2 out of 19" on a
    // 19-post queue where nothing had played yet.
    const resumeOnCurrent = parkedUnplayedKeyRef.current === currentKeyRef.current
    parkedUnplayedKeyRef.current = null
    const list = fullQueue()
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
  // Collection never enters waiting; keep the gate honest if it ever did.
  const isCollectionTabRef = useRef(isCollectionTab)
  isCollectionTabRef.current = isCollectionTab
  const isPlaybackHidden = useCallback(() => waitingRef.current && !isCollectionTabRef.current, [])

  // Keyboard nav (extracted to useTheaterKeyboard.ts — see its doc comment
  // for the full ↓/→/j vs. collection-collection-tab keymap rationale).
  const [helpOpen, setHelpOpen] = useState(false)
  const onToggleHelp = useCallback(() => setHelpOpen((open) => !open), [])
  useTheaterKeyboard({
    isPersonal,
    personalTab,
    goNext: isCollectionTab ? skipCurrent : goNextUser,
    goPrev: isCollectionTab ? personalStepBack : goPrevUser,
    setMuted,
    undoLastAction,
    onClose,
    onTabChange: isPersonal || (mode === 'shared' && signedIn) ? goTheaterTab : undefined,
    helpOpen,
    onToggleHelp,
    isPlaybackHidden,
  })

  // Mark seen + fire the preview pulse once the current post has been staged
  // (extracted to useTheaterDwell.ts — see its doc comment for the full
  // collection/collection exemption rationale).
  useTheaterDwell({
    currentKey,
    isCollectionTab,
    loop,
    itemsRef,
    seenSet,
    paused: resolvingSharedLead || waiting,
  })

  useTheaterLiveUrl({ mode, isCollectionTab, currentKey, itemsRef })

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
      // shared-post-repeat / repeat 'one': belt-and-suspenders —
      // TheaterProgressLine's 'timed' kind is already suppressed to 'none'
      // while repeating (so this event is never actually dispatched for a
      // repeating item), but a stray/late-arriving dispatch from a
      // since-superseded timer must still be a no-op rather than advancing
      // past the repeating post.
      if (repeatCurrentActiveRef.current) return
      if (isCollectionTab) {
        // Saved: same 10s dwell event as Live; videos still advance
        // via Stage `onEnded` → `personalAdvanceOnEnded`. Check the
        // collection item (not the live `currentRef`) so we never step the
        // unread queue from a Live-tab timer that is no longer on stage.
        const item = personalCurrentRef.current
          ? feedItemToTheaterItem(personalCurrentRef.current)
          : null
        if (progressKindFor(item, articleMode) !== 'timed') return
        personalAdvanceOnEnded()
        return
      }
      if (progressKindFor(currentRef.current, articleMode) !== 'timed') return
      const leaving = currentKeyRef.current
      if (leaving) {
        seenSet.markSeen(leaving)
      }
      goNext()
    }
    window.addEventListener('theater-advance', handleAdvance)
    return () => window.removeEventListener('theater-advance', handleAdvance)
  }, [goNext, isCollectionTab, articleMode, personalAdvanceOnEnded, seenSet.markSeen])

  // Prefetch at most one item ahead (extracted to useTheaterPrefetch.ts).
  useTheaterPrefetch(currentIndex, displayItems)

  // Auto-play into the waiting stage: the moment a genuinely fresh item shows
  // up (present in `freshKeys` but not in the baseline snapshotted when
  // waiting began), stage it and clear waiting. Mid-feed arrivals never hit
  // this branch — it's gated on `waiting` — so today's "prepend quietly,
  // don't interrupt" behavior for a viewer mid-scroll is untouched.
  useEffect(() => {
    if (!waiting) return
    if (isCollectionTab) return
    const arrived = findFreshArrival(
      feed.freshKeys,
      waitingBaselineFreshKeysRef.current,
      typeFilterActive ? (key) => displayItems.some((it) => theaterItemKey(it) === key) : undefined,
    )
    // Arrivals that landed while unseen posts were still playing are
    // already in the waiting baseline, so findFreshArrival misses them.
    // They are still unseen — play those before claiming caught-up.
    const pending = arrived ?? firstPendingLiveKey(displayItems, seenSet.isSeen, currentKey)
    if (!pending) return
    // Fold the staged key into the baseline (never resnapshot — an item that
    // arrived while this one plays must still read as new when waiting
    // resumes), and remember it so a non-user advance off it re-waits
    // instead of continuing into the already-browsed queue (round 8).
    waitingBaselineFreshKeysRef.current.add(pending)
    setCurrentKey(pending)
    setWaiting(false)
  }, [
    waiting,
    feed.freshKeys,
    isCollectionTab,
    mode,
    typeFilterActive,
    displayItems,
    currentKey,
    seenSet.isSeen,
  ])

  // Entering the waiting stage pauses the (still-mounted, now-hidden) stage
  // — see the render comment above the <Stage/> below. Uses the same
  // deliberate-pause event the transport buttons use, so StageVideo's
  // catch-up attribution is disarmed correctly. On the next arrival the
  // src-change effect calls play() itself; no resume event needed.
  useEffect(() => {
    if (waiting && !isCollectionTab) window.dispatchEvent(new CustomEvent('theater-pause'))
    if (isCollectionTab && personalFinished) window.dispatchEvent(new CustomEvent('theater-pause'))
  }, [waiting, isCollectionTab, personalFinished])

  // Live ⇄ Saved flips local tab state before the route changes. A Live
  // caught-up `theater-pause` would otherwise leave the shared <video>
  // paused on Saved. Resume for Saved, but keep `waiting` — the overlay is
  // already hidden by `!isCollectionTab`. Forgetting caught-up meant coming
  // back to Live kept playing the Saved video at the same timecode (same
  // persistent <video>, often the same src).
  useEffect(() => {
    if (!isCollectionTab || !waiting) return
    window.dispatchEvent(new CustomEvent('theater-resume'))
  }, [isCollectionTab, waiting])

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
  const isPlaylistAuthed = loop ? !!authMe.me?.authenticated : authed
  // Viewing your OWN public playlist: cloning it (or being told to "make
  // your own") is nonsense — the chromes swap those CTAs for a Manage link.
  const isPlaylistOwner =
    !!playlist && !!authMe.me?.user?.username && authMe.me.user.username === playlist.curator
  // Signed-in preview: same Live ⇄ Saved cluster as `/`. Live is
  // current (this page is the live pulse with a pinned lead); Saved
  // and Close are the personal-theater routes. Do not pass `personalChrome`
  // — that would swap the shared Save/Tag pill for the live-tab pair.
  const sharedAccountTabs: TheaterAccountTabs | undefined =
    mode === 'shared' && signedIn
      ? {
          tab: 'live',
          onTabChange: (tab) => {
            if (tab === 'live') return
            router.push('/saved')
          },
          onClose: () => router.push('/library'),
        }
      : undefined
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

  // Shared-lead save. Two ways in, one POST:
  //  1. `?save=1` after a sign-in round-trip — explicit, even on reload.
  //  2. A *new open* of this preview (prefix / paste / /share). Refresh of
  //     a theater-rewritten address bar, back/forward, and in-app hops
  //     (e.g. /trending → preview) do not save. `useTheaterDwell` is
  //     unrelated — it only pulses `/api/activity/preview`.
  // Waits for authMe to settle; signed-out landings never save (Save still
  // opens the modal). Announces success so SavePostButton flips to "Saved".
  useEffect(() => {
    if (mode !== 'shared' || !sharedItem) return
    if (awaitingSharedResolve) return
    if (authMe.loading) return
    if (sharedAutoSaveRef.current) return
    const authenticated = !!authMe.me?.authenticated
    const ctx = readSharedOpenContext()
    const reason = sharedAutoSaveReason({
      mode,
      hasSharedItem: true,
      sharedUnavailable: leadUnavailable,
      authenticated,
      saveIntentOnLoad,
      navigationType: ctx.navigationType,
      documentPath: ctx.documentPath,
      currentPath: ctx.currentPath,
      openIntent: ctx.openIntent,
    })
    if (!reason) {
      // `?save=1` after an expired link: wait for in-modal sign-in.
      if (saveIntentOnLoad && !authenticated) return
      consumePreviewOpenIntent()
      sharedAutoSaveRef.current = true
      return
    }
    consumePreviewOpenIntent()
    sharedAutoSaveRef.current = true
    const key = theaterItemKey(sharedItem)
    if (!claimSharedAutoSave(key)) return
    const url = sourceUrl(sharedItem.platform, sharedItem.author, sharedItem.bookmarkId ?? '')
    if (!url) return
    const body = reason === 'save-intent' ? { url } : { url, source: 'url_prefix' as const }
    void fetch('/api/bookmarks/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((res) => {
        if (!res.ok) return
        window.dispatchEvent(
          new CustomEvent('theater-post-saved', {
            detail: { key },
          }),
        )
        notifyCollectionChanged()
      })
      .catch(() => {})
  }, [
    saveIntentOnLoad,
    mode,
    sharedItem,
    leadUnavailable,
    awaitingSharedResolve,
    authMe.loading,
    authMe.me,
  ])

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

  // --- Effective render inputs: the personal theater's Collection tab is a wholly
  // separate list from the general `current`/`displayItems` (which always
  // describe the live pulse feed — used directly by home/shared/collection
  // modes, and by the collection theater's own Live tab). Everything below picks the right
  // source once, so the chrome components stay mode-agnostic wherever
  // possible.
  const collectionStageTheaterItem = personalCurrentFeedItem
    ? feedItemToTheaterItem(personalCurrentFeedItem)
    : null
  // All Clear parks on the last row (like Live waiting) so the <video>
  // stays mounted under the overlay.
  const collectionParkedTheaterItem =
    collectionStageTheaterItem ??
    (personalFinished && personalQueue.length > 0
      ? feedItemToTheaterItem(personalQueue[personalQueue.length - 1])
      : null)
  const {
    chromeCurrent,
    chromeItems,
    chromeCurrentKey,
    chromeIsSeen,
    chromeSeenReady,
    chromeFreshKeys,
    chromeNewCount,
    queueTotal,
    queuePlayed,
    queueToPlay,
    queueLooping,
    chromeCanPrev,
    chromeCanNext,
    seenStartIndex,
  } = resolveTheaterChrome({
    isCollectionTab,
    personalFinished,
    collectionStageTheaterItem,
    waiting,
    current,
    personalDisplayItems: orderLifoQueue(personalLensItems, {
      currentKey: personalCurrentKey,
      onlyUnseen: effectiveRepeatMode === 'off',
      isSeen: personalIsSeen,
      pinCurrent: effectiveRepeatMode === 'off' && !personalFinished && !!personalCurrentKey,
    }),
    personalQueueItems: orderLifoQueue(personalLensItems, {
      currentKey: personalCurrentKey,
      onlyUnseen: effectiveRepeatMode === 'off',
      isSeen: personalIsSeen,
      pinCurrent: effectiveRepeatMode === 'off' && !personalFinished && !!personalCurrentKey,
      appendSeen: effectiveRepeatMode === 'off',
    }),
    displayItems,
    queueItems,
    currentKey,
    personalIsSeen,
    isSeen: seenSet.isSeen,
    seenReady: seenSet.ready,
    freshKeys: feed.freshKeys,
    personalFreshKeys: freshSavedKeys,
    newCount,
    unseenCount,
    effectiveRepeatMode,
    personalIndex: personalLensIndex >= 0 ? personalLensIndex : 0,
    canPrev,
    canNext,
  })
  // Collection transport matches Live: next/prev skip without changing
  // archive state. Archive is a button, not a chevron.
  const chromeOnPrev = isCollectionTab ? personalStepBack : goPrevUser
  const chromeOnNext = isCollectionTab ? skipCurrent : goNextUser
  const chromeOnSelect = isCollectionTab
    ? (key: string) => {
        const idx = personalQueue.findIndex(
          (fi) => theaterItemKey(feedItemToTheaterItem(fi)) === key,
        )
        if (idx !== -1) setPersonalIndex(idx)
      }
    : onSelectUser

  const personalChrome: TheaterPersonalChrome | undefined = isPersonal
    ? {
        tab: personalTab,
        onTabChange: changePersonalTab,
        onDone: archiveCurrent,
        onTag: () => {
          if (!personalCurrentFeedItem) return
          setTagPickerItem({
            platform: personalCurrentFeedItem.platform ?? 'twitter',
            bookmarkId: personalCurrentFeedItem.id,
          })
        },
        onSave: handlePersonalLiveSave,
        onLiveTag: handlePersonalLiveTag,
        tags: isCollectionTab ? personalCurrentFeedItem?.tags : liveTagsByKey[currentKey ?? ''],
        savedKeys: personalSavedKeys,
        remaining: typeFilterActive
          ? personalQueue
              .slice(personalIndex)
              .filter((fi) => feedItemMatchesQueueTypes(fi, queueTypes)).length
          : personalRemaining,
        onClose: () => onClose?.(),
      }
    : undefined

  return (
    <div
      ref={shellRef}
      role={isPersonal ? 'dialog' : undefined}
      aria-modal={isPersonal ? true : undefined}
      aria-label={isPersonal ? 'Saved' : undefined}
      tabIndex={isPersonal ? -1 : undefined}
      className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#08070a] outline-none"
    >
      {sharedResolve ? (
        <Suspense fallback={null}>
          <SharedResolveBridge promise={sharedResolve} onResult={applySharedResolve} />
        </Suspense>
      ) : null}
      {/* Full-width stage on every viewport (spec §8, "Filmstrip dock"):
          below lg the mobile chrome overlays it full-viewport as before;
          at lg+ <DesktopStageChrome/> overlays it with the top bar/post
          overlay/actions, and <DesktopDock/> (a sibling, in-flow below) is
          the bottom filmstrip queue — no more side-by-side rail column. */}
      <div className="relative h-full w-full flex-1 overflow-hidden">
        {/* isolate + z-0: Read's video band is z-20 inside the stage. Without
            a stacking context here that z-20 paints over sibling chrome (z-10
            paste / flame / avatar) and steals those clicks. */}
        <div className="absolute inset-0 isolate z-0" data-testid="theater-stage">
          {isCollectionTab && typeFilterActive && personalLensItems.length === 0 ? (
            <StageVisualEmpty
              headline={theaterQueueEmptyHeadline(queueTypes, 'Saved')}
              onShowAll={clearQueueTypes}
            />
          ) : resolvingSharedLead ? (
            <StageResolving handle={sharedItem?.author} />
          ) : isSharedUnavailableOnCurrent && current ? (
            <StageUnavailable item={current} reason={sharedUnavailableReason} />
          ) : (
            <>
              {/* Stage stays mounted under waiting / All Clear so the
                  persistent <video> keeps the iOS unmute grant. */}
              <Stage
                item={isCollectionTab ? collectionParkedTheaterItem : current}
                muted={muted}
                onRequestUnmute={onRequestUnmute}
                onEnded={() => {
                  if (showSignInRef.current) return
                  if (isCollectionTab) {
                    personalAdvanceOnEnded()
                    return
                  }
                  const leaving = currentKeyRef.current
                  if (leaving) {
                    seenSet.markSeen(leaving)
                  }
                  goNext()
                }}
                photoCaption={false}
                repeat={repeatCurrentActive}
                articleMode={articleMode}
                covered={(waiting && !isCollectionTab) || (isCollectionTab && personalFinished)}
              />
              {typeFilterActive &&
              (isCollectionTab ? personalLensItems : lensItems).length === 0 ? (
                <div className="absolute inset-0 z-10">
                  <StageVisualEmpty
                    headline={theaterQueueEmptyHeadline(
                      queueTypes,
                      isCollectionTab ? 'Saved' : 'Live',
                    )}
                    onShowAll={clearQueueTypes}
                  />
                </div>
              ) : isCollectionTab && personalFinished ? (
                <div className="absolute inset-0 z-10">
                  <CollectionAllClear
                    total={personalTotal}
                    onClose={() => onClose?.()}
                    onKeepPlaying={personalTotal > 0 ? keepPlayingCollection : undefined}
                  />
                </div>
              ) : waiting && !isCollectionTab ? (
                <div className="absolute inset-0 z-10">
                  <StageWaiting
                    savedToday={feed.savedToday}
                    onReplay={lensItems.length > 0 ? replayFromStart : undefined}
                    replayCount={lensItems.length}
                    onKeepPlaying={lensItems.length > 0 ? keepPlaying : undefined}
                  />
                </div>
              ) : null}
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
            Saved uses the same 'timed' dwell as Live; videos keep
            the real line and also auto-advance on end through Stage
            `onEnded`. */}
        <TheaterProgressLine
          itemKey={chromeCurrentKey}
          kind={
            resolvingSharedLead
              ? 'none'
              : isDesktop
                ? progressKindForPin(
                    progressKindFor(chromeCurrent, articleMode),
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
            className="absolute bottom-6 left-5 z-20 hidden h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 lg:flex"
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
          queueTotal={queueTotal}
          queuePlayed={queuePlayed}
          queueToPlay={queueToPlay}
          queueLooping={queueLooping}
          seenStartIndex={seenStartIndex}
          waiting={isCollectionTab ? false : waiting}
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
          repeatMode={displayRepeatMode}
          onCycleRepeat={cycleRepeatMode}
          collection={personalChrome}
          onSharedTag={mode === 'shared' ? handleSharedTag : undefined}
          itemTags={mode === 'shared' ? liveTagsByKey[chromeCurrentKey ?? ''] : undefined}
          accountTabs={sharedAccountTabs}
          onPastePost={isPersonal ? handlePastePost : undefined}
          articleMode={articleMode}
          onToggleArticleMode={toggleArticleMode}
          queueTypes={queueTypes}
          onToggleQueueType={queueFilterAvailable ? toggleQueueType : undefined}
          onClearQueueTypes={queueFilterAvailable ? clearQueueTypes : undefined}
        />
        <DesktopStageChrome
          mode={mode}
          current={chromeCurrent}
          authed={authed}
          declutter={desktopDeclutter}
          onToggleDeclutter={onToggleDesktopDeclutter}
          playlist={playlist}
          isPlaylistOwner={isPlaylistOwner}
          saveStatus={saveStatus}
          onSavePlaylist={handleSavePlaylist}
          onRequestSignIn={openSignIn}
          onRequestMakeYourOwn={handleMakeYourOwn}
          collection={personalChrome}
          onSharedTag={mode === 'shared' ? handleSharedTag : undefined}
          itemTags={mode === 'shared' ? liveTagsByKey[chromeCurrentKey ?? ''] : undefined}
          accountTabs={sharedAccountTabs}
          onPastePost={isPersonal ? handlePastePost : undefined}
          articleMode={articleMode}
          onToggleArticleMode={toggleArticleMode}
        />
        {/* Collection Archive undo toast — auto-dismisses after 5s
            (`armUndoDismiss`). Same placement on both viewports. `bottom-36`
            clears the mobile action row. Keyed by the action's identity so
            a second Archive still replays the entrance transition. */}
        {isCollectionTab && personalUndo && (
          <div className="pointer-events-none absolute inset-x-0 bottom-36 z-30 flex justify-center">
            <div
              key={`${personalUndo.type}-${personalUndo.item.platform ?? 'twitter'}-${personalUndo.item.id}-${personalUndo.index}`}
              className="pointer-events-auto flex animate-toast-in items-center gap-3 rounded-full bg-black/80 px-4 py-2 text-[13px] text-white shadow-lg backdrop-blur-md"
            >
              <span>{personalUndo.type === 'archive' ? 'Archived' : personalUndo.type}</span>
              <button type="button" onClick={undoLastAction} className="font-semibold text-clay">
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
        queueTotal={queueTotal}
        queuePlayed={queuePlayed}
        queueToPlay={queueToPlay}
        queueLooping={queueLooping}
        seenStartIndex={seenStartIndex}
        savedToday={feed.savedToday}
        onSelect={chromeOnSelect}
        waiting={isCollectionTab ? false : waiting}
        muted={muted}
        onSetMuted={onSetMuted}
        canPrev={chromeCanPrev}
        canNext={chromeCanNext}
        onPrev={chromeOnPrev}
        onNext={chromeOnNext}
        declutter={desktopDeclutter}
        onToggleDeclutter={onToggleDesktopDeclutter}
        playlist={playlist}
        collection={personalChrome}
        repeatCurrent={repeatCurrentActive}
        repeatMode={displayRepeatMode}
        onCycleRepeat={cycleRepeatMode}
        articleMode={articleMode}
        queueTypes={queueTypes}
        onToggleQueueType={queueFilterAvailable ? toggleQueueType : undefined}
        onClearQueueTypes={queueFilterAvailable ? clearQueueTypes : undefined}
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
              : 'Save this post'
        }
        subtitle={
          signInIntent === 'make-your-own'
            ? 'Sign up and start saving — anything you save can be tagged into playlists like this one.'
            : playlist
              ? `${playlist.count} ${playlist.count === 1 ? 'post' : 'posts'} from ${playlist.tag}, curated by @${playlist.curator} — save them to Saved.`
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
      {isPersonal && tagPickerItem && (
        <TagQuickPicker
          platform={tagPickerItem.platform}
          bookmarkId={tagPickerItem.bookmarkId}
          open
          onClose={() => setTagPickerItem(null)}
        />
      )}
      <TheaterShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
