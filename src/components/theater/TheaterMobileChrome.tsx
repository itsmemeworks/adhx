'use client'

/**
 * Mobile theater chrome (spec §8): the full-bleed reel evolution of
 * `/trending/play`. Overlays the full-viewport <Stage/> with a top scrim
 * (brand + post meta — the Save CTA below covers sign-in), a bottom scrim
 * (author/caption + Download/Save/Share/Open), and an
 * Up-next bottom sheet — all `pointer-events-auto` islands inside an
 * otherwise `pointer-events-none` layer. A right-side thumb zone owns joined
 * swipe navigation + post actions; playback stays stable in the bottom bar.
 *
 * Rendered only below `lg` (`TheaterShell` mounts this alongside, not
 * instead of, the desktop `<Rail/>`).
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTheaterActionHotkeys } from './useTheaterActionHotkeys'
import { useTheaterQueueOverlay } from './useTheaterQueueOverlay'
import { useSheetDrag } from './useSheetDrag'
import {
  Bookmark,
  Repeat,
  Repeat1,
  Tag as TagIcon,
  ChevronUp,
  ChevronDown,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  ListFilter,
  List,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MatterLogo, PlatformGlyph, type ContentType } from '@/components/matter'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { PasteLinkButton } from '@/components/PasteLinkButton'
import { authorProfileUrl, previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { pingAnalytic } from '@/lib/analytics/client'
import { inferType } from '@/lib/trending/filter'
import { useSendFile } from './useSendFile'
import { useTheaterCopy } from './useTheaterCopy'
import { useTheaterStageTapDeclutter } from './useTheaterStageEvents'
import { useTheaterTransport } from './useTheaterTransport'
import { useClampExpand } from './useClampExpand'
import {
  theaterItemKey,
  isQuoteReader,
  offerArticleMode,
  PLATFORM_LABEL,
  repeatModeLabel,
} from './types'
import { QuoteArticleToggle } from './QuoteArticleToggle'
import { TheaterCaption } from './TheaterCaption'
import { TheaterProgressLine, progressKindFor, progressKindForPin } from './TheaterProgressLine'
import { UpNextList } from './UpNextList'
import { SavePlaylistButton } from './SavePlaylistButton'
import { SavePostButton, PersonalLiveSaveButton } from './SavePostButton'
import { FlameChip } from './TheaterMetaChips'
import { TheaterTagCount } from './TheaterTagCount'
import { tagActionLabel } from '@/lib/utils/tag'
import { TheaterCollectionActions } from './TheaterCollectionActions'
import { TheaterAvatarMenu } from './TheaterAvatarMenu'
import { TheaterQueueFilter } from './TheaterQueueFilter'
import {
  isTheaterQueueFilterActive,
  theaterQueueFilterLabel,
  theaterQueueTypePillState,
  theaterQueueTypePillToggleTargets,
  THEATER_QUEUE_TYPE_PILLS,
} from './theater-math'
import { THEATER_SHORTCUT_KEYS } from './theater-shortcuts'
import { StageIconButton } from './stage-primitives'
import { useMobileSwipeNavigation } from './useMobileSwipeNavigation'
import { TheaterMobileShareMenu } from './TheaterMobileShareMenu'
import type {
  RepeatMode,
  SavePlaylistStatus,
  TheaterPlaylistMeta,
  TheaterItem,
  TheaterMode,
  TheaterPersonalChrome,
  TheaterAccountTabs,
} from './types'

export interface TheaterMobileChromeProps {
  mode: TheaterMode
  current: TheaterItem | null
  items: TheaterItem[]
  currentKey: string | null
  isSeen: (key: string) => boolean
  seenReady: boolean
  freshKeys: ReadonlySet<string>
  newCount: number
  waiting?: boolean
  /** Whole queue size — looping copy uses this. Falls back to `items.length`. */
  queueTotal?: number
  /** Unused for Repeat-off copy (`N in queue` uses toPlay). */
  queuePlayed?: number
  /** Unseen remaining, or the looping pile size. */
  queueToPlay?: number
  /** Keep playing / Repeat this post. */
  queueLooping?: boolean
  /** First Seen row in Repeat-off Queue. `-1` hides the section. */
  seenStartIndex?: number
  onSelect: (key: string) => void
  /** Prev/next navigation for the peek chevrons and thumb-zone swipe gestures. */
  onPrev: () => void
  onNext: () => void
  /** Whether the corresponding swipe direction is available at either end of the list. */
  canPrev: boolean
  canNext: boolean
  /** Current sound state (owned by TheaterShell) — the audio button's fallback signal, see `liveMuted` below. */
  muted: boolean
  /**
   * Sets TheaterShell's `muted` state to an explicit value (not a blind
   * toggle — the audio button computes the target from the DISPLAYED state,
   * `displayMuted`, which can diverge from this `muted` prop; see
   * `handleAudioTap` below). This is the persistence path only — the
   * gesture-context fast path is the synchronous `theater-set-muted` window
   * event `handleAudioTap` dispatches alongside this call.
   */
  onSetMuted: (muted: boolean) => void
  /** Playlist mode (`/t/{username}/{tag}`): identity chrome + Save-playlist / Manage in the action row (Download/Copy stay, matching desktop). */
  playlist?: TheaterPlaylistMeta
  saveStatus?: SavePlaylistStatus
  onSavePlaylist?: () => void
  /** The signed-in viewer IS this playlist's curator — hide the clone CTA, show Manage. */
  isPlaylistOwner?: boolean
  /**
   * Whether the visiting user is signed in (verification-agent finding: at
   * mobile width, a signed-in viewer's Save on a shared page opened the
   * SIGN-IN modal — this chrome never had the authed branch the desktop
   * chrome's `(mode === 'shared' && authed)` SavePostButton covers). Shared
   * mode + authed renders the direct-save button instead.
   */
  authed?: boolean
  onRequestSignIn?: () => void
  /**
   * Shared mode: the shared post is pinned + repeating (no auto-advance), so
   * the 10s 'timed' progress line would tick toward an advance that never
   * comes — demote it to 'none' while pinned (video repeat is native
   * player-level and unaffected). The Queue control exposes "On repeat" to
   * assistive tech while the bottom repeat control carries the visual cue.
   */
  repeatCurrent?: boolean
  /**
   * The Spotify-style repeat control (round 8): current mode + the cycling
   * handler. Both absent in playlist mode (that queue always loops) and
   * collection (finite backlog) — the button only renders when the handler is
   * provided.
   */
  repeatMode?: RepeatMode
  onCycleRepeat?: () => void
  /** Collection mode: burger carries Live↔Collection; Collection tab adds Archive left of Download in the Live action row. */
  collection?: TheaterPersonalChrome
  /** Shared+authed: open the tag picker after the Save pill morphs to Tag. */
  onSharedTag?: (item: TheaterItem) => void
  /** Shared-lead tags (count on the Tag button). Collection/live use `collection.tags`. */
  itemTags?: string[]
  /** Signed-in shared preview: Live ⇄ Saved in the avatar menu + close. */
  accountTabs?: TheaterAccountTabs
  /**
   * Personal Live / Saved: add the pasted post in place instead of
   * navigating to its preview page. Same contract as DesktopStageChrome.
   */
  onPastePost?: (url: string) => boolean | Promise<boolean>
  /** Video/photo + quote: stacked article reader instead of full-bleed media. */
  articleMode?: boolean
  onToggleArticleMode?: () => void
  /** Live and Saved — omit on playlists. Empty `queueTypes` is All. */
  queueTypes?: ContentType[]
  /** Unfiltered queue used only to count the quick type choices. */
  typeFilterItems?: TheaterItem[]
  onToggleQueueType?: (type: ContentType) => void
  onClearQueueTypes?: () => void
}

/** Collapsed bottom bar including the device home-indicator safe area. */
const PEEK_H = 'calc(4.25rem + env(safe-area-inset-bottom))'
/** Shared style for Queue, Filter, and playback controls in the bottom bar. */
const PEEK_ICON_BTN =
  'inline-flex h-11 w-11 flex-none items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-inset hover:text-ink active:bg-inset active:text-ink'
/** Frosted post-action treatment for the right-side thumb rail. */
const RAIL_ACTION_BTN =
  'h-11 w-11 min-h-11 min-w-11 rounded-full border border-white/15 bg-black/20 text-white/90 shadow-[0_5px_18px_rgba(0,0,0,.18)] backdrop-blur-md transition-[transform,background-color] hover:bg-white/10 active:scale-95 active:bg-white/20'

export function TheaterMobileChrome({
  mode,
  current,
  items,
  currentKey,
  isSeen,
  seenReady,
  freshKeys,
  newCount,
  waiting = false,
  queueTotal,
  queuePlayed,
  queueToPlay,
  queueLooping,
  seenStartIndex = -1,
  onSelect,
  onPrev,
  onNext,
  canPrev,
  canNext,
  muted,
  onSetMuted,
  playlist,
  saveStatus = 'idle',
  onSavePlaylist,
  isPlaylistOwner = false,
  authed = false,
  onRequestSignIn,
  repeatCurrent = false,
  repeatMode,
  onCycleRepeat,
  collection,
  onSharedTag,
  itemTags,
  accountTabs,
  onPastePost,
  articleMode = false,
  onToggleArticleMode,
  queueTypes = [],
  typeFilterItems,
  onToggleQueueType,
  onClearQueueTypes,
}: TheaterMobileChromeProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const queueControlDescriptionId = useId()
  const quickFilterPanelId = useId()
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [quickFilterOpen, setQuickFilterOpen] = useState(false)
  const [sheetRestingClosed, setSheetRestingClosed] = useState(true)
  const [focusClosingSheet, setFocusClosingSheet] = useState(false)
  const closeSheet = useCallback(() => setSheetOpen(false), [])
  const focusClosingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusRestoreFrameRef = useRef<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const peekRef = useRef<HTMLDivElement>(null)
  const quickFilterRef = useRef<HTMLDivElement>(null)
  const quickFilterTriggerRef = useRef<HTMLButtonElement>(null)
  const quickFilterOpenRef = useRef(false)
  quickFilterOpenRef.current = quickFilterOpen
  const sheetDrag = useSheetDrag({ open: sheetOpen, onOpenChange: setSheetOpen, sheetRef, peekRef })
  const sheetContentHidden = !sheetOpen && !sheetDrag.dragging && sheetRestingClosed
  // Eager on a shared preview page: there's one post the visitor followed a
  // link FOR (pinned + repeating, not skimmed past), so the file should be
  // ready before they reach for Send — the only way the share sheet opens
  // inside the tap's own user activation. Elsewhere the 2s skim guard stands.
  useTheaterQueueOverlay({
    open: sheetOpen,
    onClose: closeSheet,
    containerRef: sheetRef,
    autoFocus: false,
  })
  const sendFile = useSendFile(current, { eager: mode === 'shared' })
  const { textCopied, copyText } = useTheaterCopy(current, (current?.text || '').trim())
  const rootRef = useRef<HTMLDivElement>(null)
  useTheaterActionHotkeys('mobile', rootRef)
  const { ref: captionRef, overflowing } = useClampExpand(currentKey)

  // `mediaKind` is the REAL content kind — drives the audio/pause buttons,
  // `paused`/`soundPulse` state, and the pause/resume handler in every tab.
  // `progressKind` additionally demotes 'timed' to 'none' while Repeat-one
  // (or the shared-post pin) is active, so the dwell line does not tick
  // toward an advance that will never happen. Saved uses the same
  // 10s dwell as Live for photo/text/quote/article.
  const mediaKind = progressKindFor(current, articleMode)
  const progressKind = progressKindForPin(mediaKind, repeatCurrent)
  const playbackControlDisabled = mediaKind !== 'video' && progressKind === 'none'

  // Pause/play button state. `'video'`-kind items mirror StageVideo's real
  // playing state (so the peek-bar button, or an autoplay retry, keeps the
  // button honest); `'timed'`-kind items have no underlying element to ask,
  // so the button owns that state itself, reset to playing whenever the
  // current post changes (a paused state must never leak to the next post).
  const { paused, displayMuted, soundPulse, queueCount, handleAudioTap, handleTogglePause } =
    useTheaterTransport({
      currentKey,
      kind: mediaKind,
      muted,
      onSetMuted,
      audioOnlyOnVideo: true,
      queue: {
        looping: queueLooping ?? false,
        played: queuePlayed ?? 0,
        toPlay: queueToPlay ?? 0,
        length: queueTotal ?? items.length,
      },
    })
  const swipeNavigation = useMobileSwipeNavigation({
    disabled: sheetOpen || !current,
    canPrev,
    canNext,
    onPrev,
    onNext,
  })
  // De-clutter: hides top/bottom scrims, post actions, and the visible swipe
  // capsule for an unobstructed stage. The bottom Queue/filter/transport bar
  // deliberately stays visible as the clear exit path; invisible swipe
  // navigation also remains active. A video/photo tap enters this mode and
  // starts a stopped clip.
  // Deliberately NOT reset on `currentKey`.
  const [declutter, setDeclutter] = useState(false)
  useTheaterStageTapDeclutter(declutter, setDeclutter)
  useEffect(() => {
    if (!current && declutter) setDeclutter(false)
  }, [current, declutter])
  useEffect(() => {
    setShareMenuOpen(false)
  }, [currentKey, sheetOpen, declutter])
  useEffect(
    () => () => {
      if (focusClosingTimeoutRef.current) clearTimeout(focusClosingTimeoutRef.current)
      if (focusRestoreFrameRef.current !== null) cancelAnimationFrame(focusRestoreFrameRef.current)
    },
    [],
  )
  useEffect(() => {
    setQuickFilterOpen(false)
  }, [sheetOpen, declutter])
  useEffect(() => {
    if (sheetOpen || sheetDrag.dragging) {
      setSheetRestingClosed(false)
      return
    }
    if (sheetRestingClosed) return
    const fallback = setTimeout(() => setSheetRestingClosed(true), 350)
    return () => clearTimeout(fallback)
  }, [sheetOpen, sheetDrag.dragging, sheetRestingClosed])
  useEffect(() => {
    if (!quickFilterOpenRef.current) return
    setQuickFilterOpen(false)
    const frame = requestAnimationFrame(() =>
      quickFilterTriggerRef.current?.focus({ preventScroll: true }),
    )
    return () => cancelAnimationFrame(frame)
  }, [currentKey])
  useEffect(() => {
    if (!quickFilterOpen) return
    const options = () => [
      ...(quickFilterRef.current?.querySelectorAll<HTMLButtonElement>(
        '[data-quick-filter-option]',
      ) ?? []),
    ]
    const initial =
      options().find((option) => {
        const pressed = option.getAttribute('aria-pressed')
        return pressed === 'true' || pressed === 'mixed'
      }) ?? options()[0]
    initial?.focus({ preventScroll: true })

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !quickFilterRef.current?.contains(target) &&
        !quickFilterTriggerRef.current?.contains(target)
      ) {
        setQuickFilterOpen(false)
      }
    }
    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setQuickFilterOpen(false)
        quickFilterTriggerRef.current?.focus({ preventScroll: true })
        return
      }
      const fromPanel =
        event.target instanceof Node && quickFilterRef.current?.contains(event.target)
      const fromTrigger =
        event.target instanceof Node && quickFilterTriggerRef.current?.contains(event.target)
      if ((fromPanel || fromTrigger) && (event.key === 'Enter' || event.key === ' ')) return
      if (fromPanel && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        event.stopImmediatePropagation()
        const rows = options()
        const currentIndex = rows.findIndex((option) => option === document.activeElement)
        const delta = event.key === 'ArrowRight' ? 1 : -1
        rows[(currentIndex + delta + rows.length) % rows.length]?.focus({ preventScroll: true })
        return
      }
      if (THEATER_SHORTCUT_KEYS.has(event.key)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDownCapture, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDownCapture, true)
    }
  }, [quickFilterOpen])

  const handleSelect = (key: string) => {
    onSelect(key)
  }

  const handleShare = async () => {
    if (!current) return false
    const path = previewPath(
      current.platform,
      current.author,
      current.bookmarkId || '',
      current.contentType,
    )
    const shareUrl = new URL(path, window.location.origin).toString()

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ url: shareUrl })
        pingAnalytic('post.copy', {
          platform: current.platform,
          id: current.bookmarkId || undefined,
          source: 'share',
        })
        return true
      } catch (err) {
        // User dismissed the sheet — a cancel, not a failure.
        if (err instanceof DOMException && err.name === 'AbortError') return false
        // Any other error: fall through to the clipboard fallback below.
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      pingAnalytic('post.copy', {
        platform: current.platform,
        id: current.bookmarkId || undefined,
      })
      return true
    } catch {
      // Clipboard can be denied (permissions/insecure context) — nothing
      // actionable to show beyond the button itself.
      return false
    }
  }

  // Peek-bar centre: Now playing + Next (`N in queue`) or every post (`N on
  // repeat`).
  const queueIndex = currentKey ? items.findIndex((it) => theaterItemKey(it) === currentKey) : -1
  const filterOn = Boolean(onToggleQueueType) && isTheaterQueueFilterActive(queueTypes)
  const peekNew = newCount > 0 && collection?.tab !== 'collection' ? ` · ${newCount} new` : ''
  const peekPosition =
    queueIndex !== -1 && queueCount
      ? `${queueCount.text}${peekNew}`
      : newCount > 0 && collection?.tab !== 'collection'
        ? `${newCount} new`
        : 'Queue'
  const peekLabel = peekPosition
  const queueDisplayCount = repeatCurrent
    ? '1'
    : (queueCount?.text.match(/^\d+/)?.[0] ?? String(queueTotal ?? items.length))
  const queueItemsBeingPlayed = repeatCurrent && current ? [current] : items
  const unseenQueueCount = seenReady
    ? queueItemsBeingPlayed.reduce(
        (count, item) => count + (isSeen(theaterItemKey(item)) ? 0 : 1),
        0,
      )
    : null
  const quickFilterItems = typeFilterItems ?? items
  const quickTypeCounts = new Map<ContentType, number>()
  for (const item of quickFilterItems) {
    const itemType = inferType(item)
    quickTypeCounts.set(itemType, (quickTypeCounts.get(itemType) ?? 0) + 1)
  }

  const trendCount = current ? (current.trendCount ?? current.saveCount ?? 0) : 0
  const displayTags = collection?.tags ?? itemTags
  const tagCount = displayTags?.length ?? 0
  const tagLabel = tagActionLabel(tagCount)
  const tagThisPostLabel = tagActionLabel(tagCount, { thisPost: true })
  const handle = current?.author ? current.author.replace(/^@+/, '') : ''
  // The stage IS the text for text/quote/article posts — repeating the body
  // (and the author header) in the bottom scrim doubles it up and buries the
  // stage. Those posts get a compact scrim: chip + actions only.
  const kind = current ? inferType(current) : null
  const textLike =
    (kind !== null && ['text', 'article'].includes(kind)) || isQuoteReader(current, false)
  const showArticleToggle = offerArticleMode(current, overflowing, articleMode)
  const caption = textLike || articleMode ? '' : (current?.text || '').trim()
  const hasCopyableText = Boolean((current?.text || '').trim())
  const canSwipe = canPrev || canNext
  const swipeLabel =
    canPrev && canNext
      ? 'Swipe up for next post or down for previous post'
      : canNext
        ? 'Swipe up for next post'
        : canPrev
          ? 'Swipe down for previous post'
          : 'Playback controls'

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-10 lg:hidden">
      <TheaterProgressLine itemKey={currentKey} kind={progressKind} />

      {/* Top scrim: brand (left) + flame/trend (right). De-clutter hides this
          whole scrim (meta included) — expected: immersion hides meta too.
          Collection mode replaces post meta with the tag/curator identity
          chrome (two rows). Open-on-source is the platform glyph in the
          action row, not a time chip. */}
      {collection ? (
        <div
          className={cn(
            'pointer-events-auto absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] transition-[opacity,transform] duration-200 ease-out',
            declutter && 'pointer-events-none -translate-y-3 opacity-0',
          )}
          style={{ background: 'linear-gradient(to bottom, rgba(11,11,17,.75), transparent)' }}
        >
          <a href="/" className="relative z-[71] flex items-center" aria-label="ADHX home">
            <MatterLogo size={16} surface="dark" />
          </a>
          <div className="relative z-[71] flex flex-none items-center gap-1.5">
            {current ? <FlameChip trendCount={trendCount} /> : null}
            {/* Same add-in-place paste as desktop — stay on Live / My
                Collection; do not bounce to a preview page. */}
            <PasteLinkButton iconOnly onPastePost={onPastePost} />
            {/* Live ⇄ Saved lives in this menu on mobile, as two
                sub-options under Theater (owner: a tab pill up here "is
                going to definitely cause overlap with the logo, the play
                stats, and the paste and burger menu… why not just put it in
                the burger menu for mobile?"). Desktop keeps its top-bar pill
                and also passes these rows so `.` + arrows can switch tabs.
                It's what freed the peek bar's centre slot for the queue
                position. */}
            <TheaterAvatarMenu
              theaterActive
              theaterTabs={{ tab: collection.tab, onTabChange: collection.onTabChange }}
            />
          </div>
        </div>
      ) : playlist ? (
        <div
          className={cn(
            'pointer-events-auto absolute inset-x-0 top-0 flex flex-col gap-1.5 px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] transition-[opacity,transform] duration-200 ease-out',
            declutter && 'pointer-events-none -translate-y-3 opacity-0',
          )}
          style={{ background: 'linear-gradient(to bottom, rgba(11,11,17,.75), transparent)' }}
        >
          {/* One row: brand left, #tag right (truncated). The full tag +
              count live in the expanded up-next sheet — the peek bar has
              no room for a 15-char tag. The logo is ALWAYS the plain home
              link here, owner and non-owner alike — a visitor viewing a
              shared tag must always be able to get back to the main theater
              (owner override: wiring it to open the "Make your own" modal
              instead left non-owners with no way home). Conversion is
              carried entirely by the Save-playlist CTA below, which
              already opens the sign-in modal in place for a signed-out
              visitor (`handleSaveCollection` in TheaterShell). */}
          <div className="relative z-[71] flex items-center justify-between gap-3">
            <a href="/" className="flex items-center" aria-label="ADHX home">
              <MatterLogo size={16} surface="dark" />
            </a>
            <span className="min-w-0 truncate text-[15px] font-bold text-white">
              #{playlist.tag}
            </span>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'pointer-events-auto absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] transition-[opacity,transform] duration-200 ease-out',
            declutter && 'pointer-events-none -translate-y-3 opacity-0',
          )}
          style={{ background: 'linear-gradient(to bottom, rgba(11,11,17,.75), transparent)' }}
        >
          <a href="/" className="relative z-[71] flex items-center" aria-label="ADHX home">
            <MatterLogo size={16} surface="dark" />
          </a>
          <div className="relative z-[71] flex flex-none items-center gap-1.5">
            {current ? <FlameChip trendCount={trendCount} /> : null}
            {/* Mobile equivalent of the desktop top bar's paste button (⌘V still works there)
                input (spec §8/DesktopStageChrome) — touch Safari has no
                paste gesture, so this covers the signed-out home theater and
                shared preview pages (collection/collection top scrims above
                have their own chrome and skip this). */}
            <PasteLinkButton iconOnly onPastePost={onPastePost} />
            {/* Signed-out visitors here (the home theater + shared preview
                pages) get a burger fallback in this same slot — Theater /
                Leaderboard / Sign in — instead of no navigation at all.
                Collection above never passes this (always reached authed);
                playlist mode's top scrim doesn't mount this component at
                all — its plain home logo plus the bottom scrim's
                Save-playlist CTA cover both navigation and signed-out
                conversion there. */}
            <TheaterAvatarMenu
              onRequestSignIn={onRequestSignIn}
              allowSignedOut
              theaterActive={mode === 'home' || !!accountTabs}
              theaterTabs={
                accountTabs
                  ? { tab: accountTabs.tab, onTabChange: accountTabs.onTabChange }
                  : undefined
              }
            />
          </div>
        </div>
      )}

      {/* Bottom scrim: author/caption plus the fixed post-action rail. Padded
          above the sheet's peek bar (opaque, themed) so the gradient tucks
          under it. The scrim is pointer-events-none so a typeset tweet /
          article stays scrollable — the thumb lands in the lower third,
          which used to be a full-width action row and swallowed the pan.
          Only the media caption and action rail capture taps. */}
      {current && (
        <div
          inert={declutter}
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 px-4 pb-3 pt-12 transition-[opacity,transform] duration-200 ease-out',
            declutter && 'translate-y-3 opacity-0',
          )}
          style={{
            paddingBottom: `calc(${PEEK_H} + 0.75rem)`,
            background: textLike
              ? 'linear-gradient(to top, rgba(11,11,17,.55) 0%, transparent 42%)'
              : 'linear-gradient(to top, rgba(11,11,17,.88) 0%, rgba(11,11,17,.55) 55%, transparent 100%)',
          }}
        >
          <div className={cn((!textLike || caption) && 'pointer-events-auto')}>
            {/* The poster's avatar + name — only for media posts. Text-like
                posts (text/quote/article) show the author on the stage
                itself, so this row stays hidden for them to avoid doubling
                up. Tapping an expandable caption opens Read. */}
            {!textLike &&
              !articleMode &&
              (() => {
                const profileUrl = authorProfileUrl(current.platform, current.author)
                const inner = (
                  <>
                    <AuthorAvatar
                      src={current.authorAvatarUrl ?? current.thumbnailUrl}
                      author={current.author}
                      size="sm"
                    />
                    <span className="min-w-0 truncate text-[13px] font-semibold text-white">
                      {current.authorName || (handle ? `@${handle}` : 'Saved post')}
                    </span>
                  </>
                )
                // Tappable author (round 8): jump to the creator's profile on
                // their own platform. Plain row when there's no handle.
                return profileUrl ? (
                  <a
                    href={profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[32px] items-center gap-2"
                    aria-label={`View @${handle} on ${PLATFORM_LABEL[current.platform] ?? current.platform}`}
                  >
                    {inner}
                  </a>
                ) : (
                  <div className="flex items-center gap-2">{inner}</div>
                )
              })()}
            {caption && !articleMode && (
              <TheaterCaption
                captionRef={captionRef}
                platform={current.platform}
                text={caption}
                links={current?.textLinks}
                hideTweetLinks={!!current?.quote}
                className="mt-1.5 text-[13.5px] leading-snug"
                onOpenRead={
                  showArticleToggle && onToggleArticleMode ? onToggleArticleMode : undefined
                }
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            {articleMode && showArticleToggle && onToggleArticleMode ? (
              <QuoteArticleToggle
                onToggle={onToggleArticleMode}
                iconOnly
                className="pointer-events-auto"
              />
            ) : null}
            <div
              className={cn(
                'pointer-events-auto fixed right-3 z-[30] gap-1.5 transition-[opacity,transform] duration-200 ease-out',
                sheetOpen || focusClosingSheet
                  ? 'bottom-[calc(70%+0.75rem)] flex flex-row items-center justify-end'
                  : 'bottom-[calc(13rem+env(safe-area-inset-bottom))] flex w-12 flex-col items-center [@media(max-height:520px)]:bottom-[calc(11rem+env(safe-area-inset-bottom))] [@media(max-height:520px)]:w-auto [@media(max-height:520px)]:flex-row',
                declutter && 'pointer-events-none translate-y-2 opacity-0',
              )}
              data-testid="mobile-control-actions"
            >
              {collection?.tab === 'collection' && (
                <TheaterCollectionActions
                  collection={collection}
                  variant="mobile"
                  className={cn(RAIL_ACTION_BTN, 'order-2 border-clay')}
                />
              )}
              {playlist && isPlaylistOwner ? (
                <StageIconButton
                  href={`/library?tag=${encodeURIComponent(playlist.tag)}`}
                  aria-label="Manage playlist"
                  className={cn(RAIL_ACTION_BTN, 'order-1')}
                >
                  <TagIcon size={16} />
                </StageIconButton>
              ) : playlist ? (
                <SavePlaylistButton
                  count={playlist.count}
                  status={saveStatus}
                  onSave={() => onSavePlaylist?.()}
                  iconOnly
                  className={cn(RAIL_ACTION_BTN, 'order-1 text-clay')}
                />
              ) : collection?.tab === 'collection' ? (
                <StageIconButton
                  onClick={(e) => {
                    e.stopPropagation()
                    collection.onTag()
                  }}
                  onTouchEnd={(e) => e.stopPropagation()}
                  aria-label={tagLabel}
                  className={cn(RAIL_ACTION_BTN, 'relative order-1')}
                  data-theater-action="tag"
                >
                  <TagIcon size={16} className={tagCount > 0 ? 'text-clay' : undefined} />
                  <TheaterTagCount count={tagCount} variant="badge" />
                </StageIconButton>
              ) : collection?.tab === 'live' ? (
                <>
                  <StageIconButton
                    onClick={(e) => {
                      e.stopPropagation()
                      collection.onLiveTag?.(current)
                    }}
                    onTouchEnd={(e) => e.stopPropagation()}
                    aria-label={tagThisPostLabel}
                    className={cn(RAIL_ACTION_BTN, 'relative order-1')}
                    data-theater-action="tag"
                  >
                    <TagIcon size={16} className={tagCount > 0 ? 'text-clay' : undefined} />
                    <TheaterTagCount count={tagCount} variant="badge" />
                  </StageIconButton>
                  <PersonalLiveSaveButton
                    current={current}
                    collection={collection}
                    className={cn(RAIL_ACTION_BTN, 'order-1 inline-flex flex-none text-clay')}
                    iconSize={16}
                    iconOnly
                  />
                </>
              ) : mode === 'shared' && authed ? (
                <SavePostButton
                  current={current}
                  iconOnly
                  className={cn(
                    RAIL_ACTION_BTN,
                    'order-1 inline-flex flex-none text-clay disabled:opacity-70',
                  )}
                  tags={displayTags}
                  onTag={onSharedTag ? () => onSharedTag(current) : undefined}
                />
              ) : (
                <StageIconButton
                  onClick={() => onRequestSignIn?.()}
                  aria-label="Save"
                  className={cn(RAIL_ACTION_BTN, 'order-1 text-clay')}
                  data-theater-action="save"
                >
                  <Bookmark size={16} />
                </StageIconButton>
              )}
              <TheaterMobileShareMenu
                open={shareMenuOpen}
                onOpenChange={setShareMenuOpen}
                kind={kind}
                actionKey={current ? theaterItemKey(current) : null}
                hasText={hasCopyableText}
                textCopied={textCopied}
                sendFile={sendFile}
                onCopyText={copyText}
                onShareLink={handleShare}
                alignTop={sheetOpen}
                triggerClassName={RAIL_ACTION_BTN}
              />
              {(() => {
                const openUrl = sourceUrl(
                  current.platform,
                  current.author,
                  current.bookmarkId ?? '',
                  current.contentType,
                )
                if (!openUrl) return null
                const platformLabel = PLATFORM_LABEL[current.platform] ?? current.platform
                return (
                  <StageIconButton
                    href={openUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open on ${platformLabel}`}
                    className={cn(RAIL_ACTION_BTN, 'order-first')}
                    data-theater-action="open"
                    onClick={() =>
                      pingAnalytic('post.open', {
                        platform: current.platform,
                        id: current.bookmarkId || undefined,
                      })
                    }
                  >
                    <PlatformGlyph platform={current.platform} size={16} />
                  </StageIconButton>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Right-side swipe capsule: a joined previous/next control makes the
          gesture boundary visible without stealing the whole stage from
          article scrolling, horizontal albums, links, or embedded players.
          The full capsule accepts vertical swipes; its two halves remain
          tappable fallbacks. */}
      {current && !sheetOpen ? (
        <div
          {...swipeNavigation}
          onClick={() => {
            if (declutter) setDeclutter(false)
          }}
          role="region"
          aria-label={swipeLabel}
          data-testid="mobile-swipe-zone"
          className={cn(
            'absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] right-0 z-[15] h-36 w-20 [@media(max-height:520px)]:h-28',
            canSwipe ? 'pointer-events-auto touch-none' : 'pointer-events-none',
          )}
        >
          <div
            inert={declutter}
            data-theater-swipe-control
            className={cn(
              'absolute bottom-2 right-3 flex h-28 w-12 flex-col gap-2 overflow-hidden rounded-full border border-white/20 bg-black/25 text-white/90 shadow-[0_8px_28px_rgba(0,0,0,.22)] backdrop-blur-md transition-[opacity,transform] duration-200 ease-out [@media(max-height:520px)]:h-20',
              declutter && 'pointer-events-none scale-95 opacity-0',
            )}
          >
            <button
              type="button"
              disabled={!canPrev}
              aria-disabled={!canPrev}
              onClick={onPrev}
              aria-label="Previous post"
              className="flex min-h-0 flex-1 items-center justify-center rounded-t-full pt-2 transition-colors hover:bg-white/10 active:bg-white/20 disabled:opacity-25"
            >
              <ChevronUp size={21} />
            </button>
            <button
              type="button"
              disabled={!canNext}
              aria-disabled={!canNext}
              onClick={onNext}
              aria-label="Next post"
              className="flex min-h-0 flex-1 items-center justify-center rounded-b-full pb-2 transition-colors hover:bg-white/10 active:bg-white/20 disabled:opacity-25"
            >
              <ChevronDown size={21} />
            </button>
          </div>
        </div>
      ) : null}

      {quickFilterOpen && onToggleQueueType && onClearQueueTypes ? (
        <div
          ref={quickFilterRef}
          id={quickFilterPanelId}
          role="group"
          aria-label="Quick post filters"
          data-testid="mobile-quick-filters"
          className="pointer-events-auto fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-2 right-24 z-[40] flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/15 bg-[#121117]/95 p-2 shadow-[0_12px_40px_rgba(0,0,0,.4)] backdrop-blur-xl"
        >
          <button
            type="button"
            aria-pressed={queueTypes.length === 0}
            aria-label={`All posts, ${quickFilterItems.length}`}
            data-quick-filter-option
            onClick={() => {
              if (queueTypes.length > 0) onClearQueueTypes()
            }}
            onKeyDown={(event) => event.stopPropagation()}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors',
              queueTypes.length === 0
                ? 'bg-clay text-white'
                : 'bg-white/10 text-white/80 hover:bg-white/15',
            )}
          >
            <span>All</span>
            <span className="tabular-nums opacity-70">{quickFilterItems.length}</span>
          </button>
          {THEATER_QUEUE_TYPE_PILLS.map((pill) => {
            const pressed = theaterQueueTypePillState(queueTypes, pill.types)
            const selected = pressed !== false
            const count = pill.types.reduce(
              (sum, type) => sum + (quickTypeCounts.get(type) ?? 0),
              0,
            )
            return (
              <button
                key={pill.label}
                type="button"
                aria-pressed={pressed}
                aria-label={`${pill.label}, ${count}`}
                data-quick-filter-option
                onClick={() => {
                  for (const type of theaterQueueTypePillToggleTargets(queueTypes, pill.types)) {
                    onToggleQueueType(type)
                  }
                }}
                onKeyDown={(event) => event.stopPropagation()}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors',
                  selected ? 'bg-clay text-white' : 'bg-white/10 text-white/80 hover:bg-white/15',
                )}
              >
                <span>{pill.label}</span>
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {/* Backdrop: closes the sheet + blocks taps on the stage below while
          it's open. Shown regardless of de-clutter — the sheet itself stays
          live there. */}
      {sheetOpen && (
        <div
          className="pointer-events-auto absolute inset-0"
          onClick={() => setSheetOpen(false)}
          aria-hidden
        />
      )}

      {/* Up-next sheet: a peek bar pinned to the bottom, dragged/tapped open
          to ~70% of the theater. Height is % of the fixed stage, not `dvh`,
          so iOS visual-viewport jumps (URL bar, focus) don't resize the
          sheet mid-animation. overflow-hidden clips the list to the sheet
          so a translating open never paints a full-screen black void.
          Transform-only (no layout thrash), theme-following surface —
          translucent so the stage reads through while collapsed, more
          opaque once open so the list stays comfortably readable.
          Unlike the scrims, de-clutter does NOT fade the Queue handle out;
          post actions and thumb controls do fade for an unobstructed stage. */}
      <div
        ref={sheetRef}
        style={sheetDrag.style}
        onTransitionEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.propertyName === 'transform' &&
            !sheetOpen &&
            !sheetDrag.dragging
          ) {
            setSheetRestingClosed(true)
          }
        }}
        className={cn(
          'pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex h-[70%] flex-col overflow-hidden overscroll-contain rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,.35)] backdrop-blur-md transition-[transform,background-color] duration-300 ease-out',
          sheetOpen ? 'bg-surface' : 'bg-surface/70',
          !sheetDrag.dragging &&
            (sheetOpen
              ? 'translate-y-0'
              : 'translate-y-[calc(100%-4.25rem-env(safe-area-inset-bottom))]'),
        )}
      >
        {/* Bottom bar: drag handle on top (tap toggles; a real pointer drag
            follows the finger 1:1 via useSheetDrag, snapping open/closed on
            release by distance or flick velocity — see the hook), then the
            Queue + Filter at left and transport at right. Post actions live
            in the stage rail; up/down navigation shares one swipe capsule. */}
        {/* Exactly PEEK_H tall (owner: the collapsed bar floated a few px
            high with list content peeking below it — the natural content
            height is ~6px shorter than the 4.25rem window the collapse
            transform reveals, so the top of UpNextList showed through).
            Pinning the wrapper to the same height the transform uses makes
            the visible window and the peek content one and the same. */}
        <div ref={peekRef} className="flex-none overflow-hidden" style={{ height: PEEK_H }}>
          <button
            type="button"
            {...sheetDrag.handlers}
            aria-expanded={sheetOpen}
            aria-label={sheetOpen ? 'Collapse up next' : 'Expand up next'}
            className="flex w-full touch-none items-center justify-center pb-0.5 pt-2"
          >
            <span className="h-1 w-9 rounded-full bg-hairline" aria-hidden />
          </button>

          <div className="relative flex items-center justify-between gap-1 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setSheetOpen((value) => !value)
                }}
                onTouchEnd={(event) => event.stopPropagation()}
                aria-expanded={sheetOpen}
                aria-label={sheetOpen ? 'Collapse up next' : 'Expand up next'}
                aria-describedby={queueControlDescriptionId}
                title={peekLabel}
                data-theater-action="show-all"
                className={cn(PEEK_ICON_BTN, 'relative w-auto gap-1.5 px-2.5')}
              >
                <List size={19} aria-hidden />
                <span
                  className="text-[12px] font-bold tabular-nums text-ink"
                  data-theater-play-count
                >
                  {queueDisplayCount}
                </span>
                {unseenQueueCount !== null && unseenQueueCount > 0 ? (
                  <span
                    className="absolute -right-1 -top-1 min-w-4 rounded-full bg-clay px-1 text-center text-[9px] font-bold leading-4 text-white"
                    aria-label={`${unseenQueueCount} unseen`}
                    data-theater-unseen-count
                  >
                    {unseenQueueCount}
                  </span>
                ) : null}
                <span id={queueControlDescriptionId} className="sr-only">
                  <span data-theater-queue-count={queueCount ? '' : undefined}>
                    {repeatCurrent ? 'On repeat' : peekLabel}
                  </span>
                  {unseenQueueCount !== null ? (
                    <span>{`. ${unseenQueueCount} unseen.`}</span>
                  ) : null}
                </span>
              </button>

              {onToggleQueueType && onClearQueueTypes ? (
                <button
                  ref={quickFilterTriggerRef}
                  type="button"
                  disabled={sheetOpen}
                  onClick={(event) => {
                    event.stopPropagation()
                    setQuickFilterOpen((value) => !value)
                  }}
                  onTouchEnd={(event) => event.stopPropagation()}
                  aria-expanded={quickFilterOpen}
                  aria-controls={quickFilterPanelId}
                  aria-label="Quick filter posts"
                  title={filterOn ? theaterQueueFilterLabel(queueTypes) : 'Filter post types'}
                  className={cn(
                    PEEK_ICON_BTN,
                    'relative',
                    filterOn && 'text-clay hover:text-clay active:text-clay',
                  )}
                >
                  <ListFilter size={19} aria-hidden />
                  {filterOn ? (
                    <span
                      className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-clay"
                      aria-hidden
                    />
                  ) : null}
                </button>
              ) : null}
            </div>

            <div
              className="flex items-center gap-0.5"
              data-testid="mobile-playback-controls"
              role="group"
              aria-label="Playback controls"
            >
              <button
                type="button"
                disabled={mediaKind !== 'video'}
                aria-disabled={mediaKind !== 'video'}
                onClick={handleAudioTap}
                aria-label={displayMuted ? 'Unmute' : 'Mute'}
                className={cn(
                  PEEK_ICON_BTN,
                  soundPulse && 'animate-sound-pulse',
                  mediaKind !== 'video' && 'opacity-35',
                )}
              >
                {displayMuted ? <VolumeX size={19} /> : <Volume2 size={19} />}
              </button>
              {(mediaKind === 'video' || progressKind !== 'none' || (repeatCurrent && current)) && (
                <button
                  type="button"
                  disabled={playbackControlDisabled}
                  aria-disabled={playbackControlDisabled}
                  onClick={handleTogglePause}
                  aria-label={paused ? 'Play' : 'Pause'}
                  className={cn(
                    PEEK_ICON_BTN,
                    'text-clay hover:text-clay active:text-clay',
                    playbackControlDisabled && 'opacity-35',
                  )}
                >
                  {paused ? (
                    <Play size={19} fill="currentColor" />
                  ) : (
                    <Pause size={19} fill="currentColor" />
                  )}
                </button>
              )}
              {onCycleRepeat && repeatMode ? (
                <button
                  type="button"
                  key={repeatMode}
                  onClick={onCycleRepeat}
                  aria-label={
                    repeatModeLabel(repeatMode, { saved: collection?.tab === 'collection' }).action
                  }
                  className={cn(
                    PEEK_ICON_BTN,
                    repeatMode !== 'off' && 'text-clay hover:text-clay active:text-clay',
                  )}
                  data-theater-action="repeat"
                >
                  {repeatMode === 'one' ? <Repeat1 size={19} /> : <Repeat size={19} />}
                </button>
              ) : null}
              <button
                type="button"
                onClick={(event) => {
                  event.currentTarget.blur()
                  if (sheetOpen) {
                    setFocusClosingSheet(true)
                    setSheetOpen(false)
                    setDeclutter(true)
                    if (focusClosingTimeoutRef.current) {
                      clearTimeout(focusClosingTimeoutRef.current)
                    }
                    focusClosingTimeoutRef.current = setTimeout(() => {
                      focusClosingTimeoutRef.current = null
                      setFocusClosingSheet(false)
                    }, 220)
                    return
                  }
                  if (focusClosingSheet) {
                    if (focusClosingTimeoutRef.current) {
                      clearTimeout(focusClosingTimeoutRef.current)
                      focusClosingTimeoutRef.current = null
                    }
                    setFocusClosingSheet(false)
                    focusRestoreFrameRef.current = requestAnimationFrame(() => {
                      focusRestoreFrameRef.current = requestAnimationFrame(() => {
                        focusRestoreFrameRef.current = null
                        setDeclutter(false)
                      })
                    })
                    return
                  }
                  setDeclutter((value) => !value)
                }}
                aria-label={declutter && !sheetOpen ? 'Show controls' : 'Hide controls'}
                className={PEEK_ICON_BTN}
                data-theater-action="expand"
              >
                {declutter && !sheetOpen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
              </button>
            </div>
          </div>
        </div>

        <div
          className={cn('flex min-h-0 flex-1 flex-col', sheetContentHidden && 'invisible')}
          aria-hidden={sheetContentHidden}
          inert={sheetContentHidden ? true : undefined}
          data-testid="mobile-sheet-content"
        >
          {playlist && (
            <div className="flex-none px-4 pb-2 pt-1">
              <p className="truncate text-[15px] font-bold text-ink">#{playlist.tag}</p>
              <p className="text-[12px] text-ink-3">
                {playlist.count} {playlist.count === 1 ? 'post' : 'posts'}
                {playlist.curator ? ` · @${playlist.curator}` : ''}
              </p>
            </div>
          )}
          {onToggleQueueType && onClearQueueTypes ? (
            <TheaterQueueFilter
              selected={queueTypes}
              onToggle={onToggleQueueType}
              onClear={onClearQueueTypes}
            />
          ) : null}
          <UpNextList
            items={items}
            currentKey={waiting ? null : currentKey}
            isSeen={isSeen}
            seenReady={seenReady}
            freshKeys={freshKeys}
            onSelect={handleSelect}
            repeatCurrent={repeatCurrent}
            seenStartIndex={seenStartIndex}
            className="min-h-0 flex-1 pb-[max(1rem,env(safe-area-inset-bottom))]"
          />
        </div>
      </div>
    </div>
  )
}
