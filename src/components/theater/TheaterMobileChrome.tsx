'use client'

/**
 * Mobile theater chrome (spec §8): the full-bleed reel evolution of
 * `/trending/play`. Overlays the full-viewport <Stage/> with a top scrim
 * (brand + post meta — the Save CTA below covers sign-in), a bottom scrim
 * (author/caption + Download/Save/Share/Open), and an
 * Up-next bottom sheet — all `pointer-events-auto` islands inside an
 * otherwise `pointer-events-none` layer. Navigation is buttons + keyboard +
 * video-ended auto-advance only — there is no swipe gesture on the stage.
 *
 * Rendered only below `lg` (`TheaterShell` mounts this alongside, not
 * instead of, the desktop `<Rail/>`).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheaterActionHotkeys } from './useTheaterActionHotkeys'
import { useTheaterQueueOverlay } from './useTheaterQueueOverlay'
import { useSheetDrag } from './useSheetDrag'
import {
  Loader2,
  Share2,
  Bookmark,
  Check,
  Repeat,
  Repeat1,
  Tag as TagIcon,
  ChevronUp,
  ChevronDown,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Minimize2,
  Maximize2,
  ListFilter,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MatterLogo, PlatformGlyph, type ContentType } from '@/components/matter'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { PasteLinkButton } from '@/components/PasteLinkButton'
import { authorProfileUrl, previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { pingAnalytic } from '@/lib/analytics/client'
import { inferType } from '@/lib/trending/filter'
import { useSendFile } from './useSendFile'
import { fileSendCopy, textCopyAction } from './send-action'
import { useTheaterCopy } from './useTheaterCopy'
import { useTheaterStageEvents, useTheaterStageTapDeclutter } from './useTheaterStageEvents'
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
  formatQueueCount,
  isTheaterQueueFilterActive,
  theaterQueueFilterLabel,
} from './theater-math'
import { StageIconButton } from './stage-primitives'
import { logAV } from './YtDebugOverlay'
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
  /** Passed straight through to `UpNextList` for its section headings — the arrival snapshot the queue was grouped by. Absent only in playlist mode (one authored order, no groups); shared mode passes it and pins its lead post out of the grouping instead. */
  wasSeenOnEntry?: (key: string) => boolean
  /** The shared post on a preview page — pinned as the lead row and excluded from the section grouping (it isn't "what's new", it's the link the visitor followed). Passed straight to `UpNextList`. */
  pinnedKey?: string | null
  /** Whole queue size — looping copy uses this. Falls back to `items.length`. */
  queueTotal?: number
  /** Finished posts from this leftover run. */
  queuePlayed?: number
  /** How many posts this leftover run will play. */
  queueToPlay?: number
  /** Keep playing / Repeat this post. */
  queueLooping?: boolean
  onSelect: (key: string) => void
  /** Prev/next navigation for the peek bar's chevrons — the only mobile nav besides keyboard and video-ended auto-advance. */
  onPrev: () => void
  onNext: () => void
  /** Whether there's a previous/next post to navigate to — disables the corresponding chevron (in place, no layout shift) at either end of the list. */
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
   * player-level and unaffected). Also swaps the peek bar's "Up next" label
   * for a Repeat glyph + "On repeat" (owner: the loop had no visual cue and
   * read as a bug) and accents the next chevron — the deliberate way past
   * the repeat — with the clay treatment.
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
  onToggleQueueType?: (type: ContentType) => void
  onClearQueueTypes?: () => void
}

/** Height of the collapsed sheet's peek bar — kept in sync with the transform below. Two rows now (drag handle + the nav/pause/audio/de-clutter controls), taller than the old label-only bar. */
const PEEK_H = '4.25rem'
/** Shared style for the icon-only controls living in the peek bar — subtle on the themed (light/dark-following) surface, unlike the dark-stage scrim buttons above. */
const PEEK_ICON_BTN =
  'inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-inset hover:text-ink active:bg-inset active:text-ink'
/** Applied on top of `PEEK_ICON_BTN` for a disabled prev/next chevron at either end of the list — dimmed, no hover/active feedback, but the button stays in place (no layout shift) so the row never reflows. */
const PEEK_ICON_BTN_DISABLED =
  'opacity-35 hover:bg-transparent hover:text-ink-3 active:bg-transparent active:text-ink-3 disabled:cursor-default'

/**
 * Mobile action row is icon-only (no room for pill labels). Save actions
 * keep a clay border on the same 44px glass circle as Share/Open — never
 * `border-clay/NN` (Matter colors are hex CSS vars; Tailwind opacity
 * modifiers silently drop).
 */
const ICON_SAVE = 'border-clay'

export function TheaterMobileChrome({
  mode,
  current,
  items,
  currentKey,
  isSeen,
  seenReady,
  freshKeys,
  newCount,
  wasSeenOnEntry,
  pinnedKey,
  queueTotal,
  queuePlayed,
  queueToPlay,
  queueLooping,
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
  onToggleQueueType,
  onClearQueueTypes,
}: TheaterMobileChromeProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const closeSheet = useCallback(() => setSheetOpen(false), [])
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const peekRef = useRef<HTMLDivElement>(null)
  const sheetDrag = useSheetDrag({ open: sheetOpen, onOpenChange: setSheetOpen, sheetRef, peekRef })
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

  // Pause/play button state. `'video'`-kind items mirror StageVideo's real
  // playing state (so the peek-bar button, or an autoplay retry, keeps the
  // button honest); `'timed'`-kind items have no underlying element to ask,
  // so the button owns that state itself, reset to playing whenever the
  // current post changes (a paused state must never leak to the next post).
  const { videoPlaying, timedPaused, setTimedPaused, liveMuted, setLiveMuted } =
    useTheaterStageEvents()
  // De-clutter: hides the top and bottom scrims (brand + caption/actions) for
  // an unobstructed view of the stage. The peek bar (nav/pause/audio + the
  // up-next sheet) deliberately stays visible and functional — the point is
  // an unobstructed view while still being able to skip quickly. A tap on
  // the video/photo also toggles this (and starts playback on enter).
  // Deliberately NOT reset on `currentKey`.
  const [declutter, setDeclutter] = useState(false)
  useTheaterStageTapDeclutter(declutter, setDeclutter)

  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    },
    [],
  )

  // Reset per-post playback chrome when the stage advances. Do not close
  // the up-next sheet — the owner keeps it open to watch the queue while
  // the next post plays (Escape / tap-away / the handle still collapse it).
  // 'video' items don't need the pause reset: StageVideo always (re)plays
  // a fresh src.
  useEffect(() => {
    setTimedPaused(false)
    // `liveMuted` describes the ELEMENT that was on stage, so it must not
    // outlive the item — the sibling `timedPaused` was reset here and this
    // wasn't (state review, 2026-08-22). Carried over, the audio icon showed
    // the previous post's real mute state until the new stage happened to
    // re-broadcast, which is the intermittent "mute flicks on and off while
    // watching" the owner reported. Null falls back to the shell's `muted`,
    // the intended state for a post that hasn't reported yet.
    setLiveMuted(null)
  }, [currentKey])

  const paused = mediaKind === 'video' ? !videoPlaying : timedPaused
  const displayMuted = liveMuted ?? muted
  // Sound affordance moved onto the peek-bar audio button on mobile
  // (StageVideo's centered "Tap for sound" pill is desktop-only now): pulse
  // while the current video is effectively muted AND actually playing, so a
  // paused or already-unmuted video never pulses.
  const soundPulse = mediaKind === 'video' && displayMuted && videoPlaying

  // Computed from the DISPLAYED state (not the shell's possibly-stale
  // `muted` prop) so the button always moves the direction the icon shows —
  // then dispatches synchronously (gesture-context fast path for
  // StageVideo/StageYouTube) alongside the shell setter (persistence, one
  // render later). See `onSetMuted`'s doc comment above.
  const handleAudioTap = () => {
    if (mediaKind !== 'video') return
    const next = !displayMuted
    logAV(
      `audio tap: displayed=${displayMuted ? 'muted' : 'unmuted'} -> requesting ${next ? 'muted' : 'unmuted'}`,
    )
    window.dispatchEvent(new CustomEvent('theater-set-muted', { detail: { muted: next } }))
    onSetMuted(next)
  }

  const handleTogglePause = () => {
    if (mediaKind === 'video') {
      window.dispatchEvent(new CustomEvent(videoPlaying ? 'theater-pause' : 'theater-resume'))
      return
    }
    if (mediaKind === 'timed') {
      setTimedPaused((was) => {
        window.dispatchEvent(new CustomEvent(was ? 'theater-resume' : 'theater-pause'))
        return !was
      })
    }
  }

  const handleSelect = (key: string) => {
    onSelect(key)
  }

  const handleShare = async () => {
    if (!current) return
    const path = previewPath(current.platform, current.author, current.bookmarkId || '')
    const shareUrl = new URL(path, window.location.origin).toString()

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ url: shareUrl })
        pingAnalytic('post.copy', {
          platform: current.platform,
          id: current.bookmarkId || undefined,
          source: 'share',
        })
        return
      } catch (err) {
        // User dismissed the sheet — a cancel, not a failure.
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Any other error: fall through to the clipboard fallback below.
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      pingAnalytic('post.copy', {
        platform: current.platform,
        id: current.bookmarkId || undefined,
      })
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard can be denied (permissions/insecure context) — nothing
      // actionable to show beyond the button itself.
    }
  }

  // Peek-bar centre: run progress (`16 of 23`) or looping pile (`24 on
  // repeat`). Live always stages the leftover head, so `3 / 7` was just
  // "you're on next".
  const queueIndex = currentKey ? items.findIndex((it) => theaterItemKey(it) === currentKey) : -1
  const filterOn = Boolean(onToggleQueueType) && isTheaterQueueFilterActive(queueTypes)
  const peekNew = newCount > 0 && collection?.tab !== 'collection' ? ` · ${newCount} new` : ''
  const queueCount = formatQueueCount({
    looping: queueLooping ?? false,
    played: queuePlayed ?? 0,
    toPlay: queueToPlay ?? 0,
    length: queueTotal ?? items.length,
  })
  const peekPosition =
    queueIndex !== -1 && queueCount
      ? `${queueCount.text}${peekNew}`
      : newCount > 0 && collection?.tab !== 'collection'
        ? `${newCount} new`
        : 'Up next'
  const peekLabel = peekPosition

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
  const fileAction = fileSendCopy(kind)
  const copyAction = textCopyAction(kind)

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
          <a href="/" className="flex items-center" aria-label="ADHX home">
            <MatterLogo size={16} className="[&>span]:text-white" />
          </a>
          <div className="flex flex-none items-center gap-1.5">
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
          <div className="flex items-center justify-between gap-3">
            <a href="/" className="flex items-center" aria-label="ADHX home">
              <MatterLogo size={16} className="[&>span]:text-white" />
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
          <a href="/" className="flex items-center" aria-label="ADHX home">
            <MatterLogo size={16} className="[&>span]:text-white" />
          </a>
          <div className="flex flex-none items-center gap-1.5">
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

      {/* Bottom scrim: author/caption + Send / Save / Share / Open. Padded
          above the sheet's peek bar (opaque, themed) so the gradient tucks
          under it. The scrim is pointer-events-none so a typeset tweet /
          article stays scrollable — the thumb lands in the lower third,
          which used to be a full-width action row and swallowed the pan.
          Only the media caption and the icon cluster capture taps. */}
      {current && (
        <div
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
                up. Caption stays two lines; Read is on the action row. */}
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
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            {showArticleToggle && onToggleArticleMode ? (
              <QuoteArticleToggle
                articleMode={articleMode}
                onToggle={onToggleArticleMode}
                iconOnly
                className="pointer-events-auto"
              />
            ) : null}
            <div className="pointer-events-auto ml-auto flex items-center justify-end gap-2">
              {collection?.tab === 'collection' && (
                <TheaterCollectionActions collection={collection} variant="mobile" />
              )}
              {sendFile.supported ? (
                <StageIconButton
                  onClick={() => {
                    // No awaits before this call — the tap must stay a fresh
                    // user gesture for iOS's share sheet (spec §2/§6).
                    void sendFile.send()
                  }}
                  disabled={sendFile.sending}
                  title={
                    sendFile.mode === 'share'
                      ? `Opens your share sheet with the ${kind === 'photo' ? 'photo' : 'video'}`
                      : fileAction.title
                  }
                  aria-label={
                    sendFile.sending
                      ? 'Getting file'
                      : sendFile.primed
                        ? 'Tap again'
                        : fileAction.label
                  }
                  className={sendFile.primed ? ICON_SAVE : undefined}
                  data-theater-action="download"
                >
                  {sendFile.sending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <fileAction.Icon size={16} />
                  )}
                </StageIconButton>
              ) : textLike && (current.text || '').trim() ? (
                <StageIconButton
                  onClick={() => void copyText()}
                  title={copyAction.title}
                  aria-label={textCopied ? copyAction.copiedLabel : copyAction.idleLabel}
                  data-theater-action="copy"
                >
                  {textCopied ? (
                    <Check size={16} className="text-done" />
                  ) : (
                    <copyAction.Icon size={16} />
                  )}
                </StageIconButton>
              ) : null}
              {playlist && isPlaylistOwner ? (
                <StageIconButton
                  href={`/library?tag=${encodeURIComponent(playlist.tag)}`}
                  aria-label="Manage playlist"
                >
                  <TagIcon size={16} />
                </StageIconButton>
              ) : playlist ? (
                <SavePlaylistButton
                  count={playlist.count}
                  status={saveStatus}
                  onSave={() => onSavePlaylist?.()}
                  iconOnly
                  className={ICON_SAVE}
                />
              ) : collection?.tab === 'collection' ? (
                <StageIconButton
                  onClick={(e) => {
                    e.stopPropagation()
                    collection.onTag()
                  }}
                  onTouchEnd={(e) => e.stopPropagation()}
                  aria-label={tagLabel}
                  className="relative"
                  data-theater-action="tag"
                >
                  <TagIcon
                    size={16}
                    className={tagCount > 0 ? 'text-clay' : undefined}
                    fill={tagCount > 0 ? 'currentColor' : 'none'}
                  />
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
                    className="relative"
                    data-theater-action="tag"
                  >
                    <TagIcon
                      size={16}
                      className={tagCount > 0 ? 'text-clay' : undefined}
                      fill={tagCount > 0 ? 'currentColor' : 'none'}
                    />
                    <TheaterTagCount count={tagCount} variant="badge" />
                  </StageIconButton>
                  <PersonalLiveSaveButton
                    current={current}
                    collection={collection}
                    className={cn(
                      'inline-flex min-h-[44px] min-w-[44px] flex-none items-center justify-center rounded-full border text-white',
                      ICON_SAVE,
                    )}
                    iconSize={16}
                    iconOnly
                  />
                </>
              ) : mode === 'shared' && authed ? (
                <SavePostButton
                  current={current}
                  iconOnly
                  className={cn(
                    'inline-flex min-h-[44px] min-w-[44px] flex-none items-center justify-center rounded-full border text-white disabled:opacity-70',
                    ICON_SAVE,
                  )}
                  tags={displayTags}
                  onTag={onSharedTag ? () => onSharedTag(current) : undefined}
                />
              ) : (
                <StageIconButton
                  onClick={() => onRequestSignIn?.()}
                  aria-label="Save"
                  className={ICON_SAVE}
                  data-theater-action="save"
                >
                  <Bookmark size={16} />
                </StageIconButton>
              )}
              <StageIconButton
                onClick={() => void handleShare()}
                aria-label="Share link"
                data-theater-action="link"
              >
                {copied ? <Check size={16} className="text-done" /> : <Share2 size={16} />}
              </StageIconButton>
              {(() => {
                const openUrl = sourceUrl(
                  current.platform,
                  current.author,
                  current.bookmarkId ?? '',
                )
                if (!openUrl) return null
                const platformLabel = PLATFORM_LABEL[current.platform] ?? current.platform
                return (
                  <StageIconButton
                    href={openUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open on ${platformLabel}`}
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
          Unlike the scrims, de-clutter does NOT fade this out — the
          reviewer wants the nav/pause/audio controls and the sheet available
          at all times, even while immersed, so only the top/bottom scrims
          above hide. */}
      <div
        ref={sheetRef}
        style={sheetDrag.style}
        className={cn(
          'pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex h-[70%] flex-col overflow-hidden overscroll-contain rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,.35)] backdrop-blur-md transition-[transform,background-color] duration-300 ease-out',
          sheetOpen ? 'bg-surface' : 'bg-surface/70',
          !sheetDrag.dragging && (sheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-4.25rem)]'),
        )}
      >
        {/* Peek bar: drag handle on top (tap toggles; a real pointer drag
            follows the finger 1:1 via useSheetDrag, snapping open/closed on
            release by distance or flick velocity — see the hook), then a
            control row — de-clutter fixed at the far left (never moves), the
            audio button to its right (always present — disabled on
            non-video, matching the desktop dock), the up-next label screen-centered
            (absolutely positioned over the bar so it lands at the true
            midpoint regardless of the side groups' unequal widths), and
            prev/pause/next on the right. All non-drag-handle buttons stop
            propagation on click AND touchend so pressing them never also
            toggles the sheet open/closed. */}
        {/* Exactly PEEK_H tall (owner: the collapsed bar floated a few px
            high with list content peeking below it — the natural content
            height is ~6px shorter than the 4.25rem window the collapse
            transform reveals, so the top of UpNextList showed through).
            Pinning the wrapper to the same height the transform uses makes
            the visible window and the peek content one and the same. */}
        <div ref={peekRef} className="h-[4.25rem] flex-none overflow-hidden">
          <button
            type="button"
            {...sheetDrag.handlers}
            aria-expanded={sheetOpen}
            aria-label={sheetOpen ? 'Collapse up next' : 'Expand up next'}
            className="flex w-full touch-none items-center justify-center pb-0.5 pt-2"
          >
            <span className="h-1 w-9 rounded-full bg-hairline" aria-hidden />
          </button>

          <div className="relative flex items-center px-2 pb-2">
            {/* De-clutter is always first (far left, fixed position); the audio
              button sits to its right on every post so the row never reflows.
              Non-video disables it (same as the desktop dock). */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeclutter((v) => !v)
                }}
                onTouchEnd={(e) => e.stopPropagation()}
                aria-label={declutter ? 'Show controls' : 'Hide controls'}
                className={PEEK_ICON_BTN}
                data-theater-action="expand"
              >
                {/* De-cluttering EXPANDS the stage — the enter action (declutter
                  false → true) reads outward (Maximize2); exiting reads
                  inward (Minimize2), restoring the compact chrome. */}
                {declutter ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              {/* Spotify-style repeat (round 8): off → all → one. Sits
                  between de-clutter and audio so neither ever shifts.
                  Clay = active. */}
              {onCycleRepeat && repeatMode && (
                <button
                  type="button"
                  // Keyed on the mode so each state change mounts a FRESH DOM
                  // node born directly in its final color — live-measured, the
                  // in-place off→one update (SSR/first paint is 'off' until
                  // currentKey resolves and the shared pin engages) left the
                  // node painting ink-3 even with the clay class AND an inline
                  // style present (cause never isolated; a stuck first-paint
                  // value is the best theory, hence also no transition-colors
                  // here).
                  key={repeatMode}
                  onClick={(e) => {
                    e.stopPropagation()
                    onCycleRepeat()
                  }}
                  onTouchEnd={(e) => e.stopPropagation()}
                  aria-label={
                    repeatModeLabel(repeatMode, { saved: collection?.tab === 'collection' }).action
                  }
                  className={cn(
                    'inline-flex h-10 w-10 flex-none items-center justify-center rounded-full hover:bg-inset active:bg-inset',
                    repeatMode !== 'off'
                      ? 'text-clay hover:text-clay active:text-clay'
                      : 'text-ink-3 hover:text-ink active:text-ink',
                  )}
                  // Belt-and-suspenders (same live finding as `key` above): an
                  // inline style outranks whatever won the cascade against the
                  // bare `text-clay` class on the in-place-updated node.
                  style={repeatMode !== 'off' ? { color: 'var(--m-accent)' } : undefined}
                  data-theater-action="repeat"
                >
                  {repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
                </button>
              )}
              <button
                type="button"
                disabled={mediaKind !== 'video'}
                aria-disabled={mediaKind !== 'video'}
                onClick={(e) => {
                  e.stopPropagation()
                  handleAudioTap()
                }}
                onTouchEnd={(e) => e.stopPropagation()}
                aria-label={displayMuted ? 'Unmute' : 'Mute'}
                className={cn(
                  PEEK_ICON_BTN,
                  soundPulse && 'animate-sound-pulse text-ink',
                  mediaKind !== 'video' && PEEK_ICON_BTN_DISABLED,
                )}
              >
                {displayMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>

            {/* Centre slot: leftover to play + pile size. Collection used to
                spend this on the Live/Collection tabs — they're in the top
                scrim now, so every mode gets the count. */}
            <div className="pointer-events-none absolute inset-x-0 flex justify-center">
              <button
                type="button"
                onClick={() => setSheetOpen((v) => !v)}
                aria-expanded={sheetOpen}
                aria-label={sheetOpen ? 'Collapse up next' : 'Expand up next'}
                title={filterOn ? theaterQueueFilterLabel(queueTypes) : undefined}
                data-theater-action="show-all"
                data-theater-queue-filter={filterOn ? '' : undefined}
                className={cn(
                  'pointer-events-auto flex max-w-[45%] items-center justify-center gap-1 truncate px-1 text-center text-[12px] font-semibold',
                  repeatCurrent || filterOn ? 'text-clay' : 'text-ink-2',
                )}
              >
                {repeatCurrent ? (
                  <>
                    <Repeat size={11} className="flex-none" aria-hidden />
                    <span className="truncate">On repeat</span>
                  </>
                ) : (
                  <>
                    {filterOn ? <ListFilter size={11} className="flex-none" aria-hidden /> : null}
                    <span
                      className="truncate"
                      data-theater-queue-count={queueCount ? '' : undefined}
                    >
                      {peekLabel}
                    </span>
                  </>
                )}
              </button>
            </div>

            <div className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                disabled={!canPrev}
                onClick={(e) => {
                  e.stopPropagation()
                  onPrev()
                }}
                onTouchEnd={(e) => e.stopPropagation()}
                aria-label="Previous post"
                aria-disabled={!canPrev}
                className={cn(PEEK_ICON_BTN, !canPrev && PEEK_ICON_BTN_DISABLED)}
              >
                <ChevronUp size={18} />
              </button>
              {/* Pause whenever there's something to pause: video playback,
                or the 10s dwell on a photo/text/article. */}
              {(mediaKind === 'video' || progressKind !== 'none') && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleTogglePause()
                  }}
                  onTouchEnd={(e) => e.stopPropagation()}
                  aria-label={paused ? 'Play' : 'Pause'}
                  className={PEEK_ICON_BTN}
                >
                  {paused ? (
                    <Play size={16} fill="currentColor" />
                  ) : (
                    <Pause size={16} fill="currentColor" />
                  )}
                </button>
              )}
              <button
                type="button"
                disabled={!canNext}
                onClick={(e) => {
                  e.stopPropagation()
                  onNext()
                }}
                onTouchEnd={(e) => e.stopPropagation()}
                aria-label="Next post"
                aria-disabled={!canNext}
                className={cn(
                  PEEK_ICON_BTN,
                  !canNext && PEEK_ICON_BTN_DISABLED,
                  // shared-post-repeat: while pinned, "continue" (past the
                  // repeating post) is the only forward move — accent it so
                  // the way out of the loop reads as an affordance, not a
                  // dead end.
                  repeatCurrent &&
                    canNext &&
                    'text-clay hover:bg-clay/10 hover:text-clay active:bg-clay/10 active:text-clay',
                )}
              >
                <ChevronDown size={18} />
              </button>
            </div>
          </div>
        </div>

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
          currentKey={currentKey}
          isSeen={isSeen}
          seenReady={seenReady}
          freshKeys={freshKeys}
          wasSeenOnEntry={wasSeenOnEntry}
          pinnedKey={pinnedKey}
          onSelect={handleSelect}
          repeatCurrent={repeatCurrent}
          className="min-h-0 flex-1 pb-[max(1rem,env(safe-area-inset-bottom))]"
        />
      </div>
    </div>
  )
}
