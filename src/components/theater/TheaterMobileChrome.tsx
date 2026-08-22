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

import { useEffect, useRef, useState } from 'react'
import { useSheetDrag } from './useSheetDrag'
import {
  Download as DownloadIcon,
  Loader2,
  Share2,
  ExternalLink,
  Bookmark,
  Check,
  Copy as CopyIcon,
  Flame,
  Repeat,
  Repeat1,
  Clock,
  Tag as TagIcon,
  Trash2,
  ChevronUp,
  ChevronDown,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Minimize2,
  Maximize2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { addedToAdhxLabel, formatCompactRelativeTime, hasKnownTimestamp } from '@/lib/utils/format'
import { MatterLogo, PlatformGlyph } from '@/components/matter'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { PasteLinkButton } from '@/components/PasteLinkButton'
import { authorProfileUrl, previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { inferType } from '@/lib/trending/filter'
import { useSendFile } from './useSendFile'
import { useClampExpand } from './useClampExpand'
import { theaterItemKey, PLATFORM_LABEL, REPEAT_MODE_LABEL } from './types'
import { TheaterLinkedText } from './TheaterText'
import {
  TheaterProgressLine,
  progressKindFor,
  progressKindForPin,
  collectionTabProgressKind,
} from './TheaterProgressLine'
import { UpNextList } from './UpNextList'
import { SavePlaylistButton } from './SavePlaylistButton'
import { SavePostButton } from './TheaterDesktopChrome'
import { TheaterAvatarMenu } from './TheaterAvatarMenu'
import { StageIconButton } from './stage-primitives'
import { logAV } from './YtDebugOverlay'
import type {
  RepeatMode,
  SavePlaylistStatus,
  TheaterPlaylistMeta,
  TheaterItem,
  TheaterMode,
  TheaterTriageChrome,
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
  /** How many posts the position counter is out of — what will actually play from here (see `computeQueueTotal`). Falls back to `items.length`. */
  queueTotal?: number
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
  /** Playlist mode (`/t/{username}/{tag}`): identity chrome + swaps the bottom action row's Download/Save-login for the Save-playlist CTA. */
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
   * triage (finite backlog) — the button only renders when the handler is
   * provided.
   */
  repeatMode?: RepeatMode
  onCycleRepeat?: () => void
  /** Triage mode (unified-theater-triage.md §2): swaps the top scrim's post meta for a close button + the burger (which carries the Live↔Collection switch as Theater sub-options — the top scrim is too tight for a tab pill at phone widths, unlike desktop's top bar), and the bottom action row for Later/Tag/Delete/Done. */
  triage?: TheaterTriageChrome
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
 * Bottom-scrim action pills. Save (sign-in prompt, the triage live-tab
 * Save/Saved button) uses PILL_SAVE — glass with a clay border (round 8: the
 * solid clay fill was "too much"). Download/Copy are power-user affordances
 * on PILL_GLASS alongside Share/Open (mirrors GLASS/SAVE_OUTLINE in
 * TheaterDesktopChrome). SavePlaylistButton uses PILL_SAVE too (owner:
 * same orange outline as the Save button).
 */
const PILL_GLASS =
  'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-white/25 bg-white/[0.14] px-3 text-[13px] font-semibold text-white disabled:opacity-70'
/**
 * The Save-post pill (round 8, owner): a Bookmark glyph on the same
 * see-through glass as every other pill, distinguished by a clay border
 * instead of the old solid clay-grad fill (which was "too much"). Mirrors
 * `SAVE_OUTLINE` in TheaterDesktopChrome. NOTE: full-strength `border-clay`,
 * never `border-clay/NN` — the Matter colors are hex CSS vars, so Tailwind
 * can't compile opacity modifiers on them and silently drops the class
 * (caught live: the border rendered as the default hairline).
 */
const PILL_SAVE =
  'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-clay bg-white/[0.14] px-3 text-[13px] font-semibold text-white disabled:opacity-70'

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
  triage,
}: TheaterMobileChromeProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // "Copy" for text-like posts (round 8) — separate from the share-link
  // `copied` above so the two buttons' feedback never cross-flash.
  const [textCopied, setTextCopied] = useState(false)
  const textCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const peekRef = useRef<HTMLDivElement>(null)
  const sheetDrag = useSheetDrag({ open: sheetOpen, onOpenChange: setSheetOpen, sheetRef, peekRef })
  const sendFile = useSendFile(current)
  const { ref: captionRef, expanded, setExpanded, overflowing } = useClampExpand(currentKey)

  // `mediaKind` is the REAL content kind — drives the audio/pause buttons,
  // `paused`/`soundPulse` state, and the pause/resume handler in every tab.
  // `progressKind` additionally demotes 'timed' to 'none' in triage's
  // Collection tab (photo/text/quote/article still wait on a deliberate
  // Done/Later/Delete there — no 10s dwell auto-advance) and feeds ONLY
  // <TheaterProgressLine/> — the two must not be conflated, or forcing off
  // the dwell line for those items also silently hides/breaks the audio and
  // pause controls for collection-tab videos (which still play via
  // StageVideo/StageInstagram/StageYouTube and DO keep the 'video' kind —
  // "My Collection is just a different playlist in that same theater").
  const mediaKind = progressKindFor(current)
  const progressKind = progressKindForPin(
    collectionTabProgressKind(mediaKind, triage?.tab === 'collection'),
    repeatCurrent,
  )

  // Pause/play button state. `'video'`-kind items mirror StageVideo's real
  // playing state (so a tap on the video itself, or an autoplay retry, keeps
  // the button honest); `'timed'`-kind items have no underlying element to
  // ask, so the button owns that state itself, reset to playing whenever the
  // current post changes (a paused state must never leak to the next post).
  const [videoPlaying, setVideoPlaying] = useState(true)
  const [timedPaused, setTimedPaused] = useState(false)
  // Live mute signal from StageVideo (`effectiveMuted`, which can diverge
  // from the shell's `muted` prop when an unmuted-autoplay retry fails and
  // the element falls back to muted on its own). Starts null — until the
  // first event arrives, the button trusts the `muted` prop.
  const [liveMuted, setLiveMuted] = useState<boolean | null>(null)
  // De-clutter: hides the top and bottom scrims (brand + caption/actions) for
  // an unobstructed view of the stage. The peek bar (nav/pause/audio + the
  // up-next sheet) deliberately stays visible and functional — the point is
  // an unobstructed view while still being able to skip quickly. Deliberately
  // NOT reset on `currentKey` — a viewer who de-clutters wants it to stay
  // that way while browsing, not fight it back open on every navigation.
  const [declutter, setDeclutter] = useState(false)

  useEffect(() => {
    const handlePlaying = (e: Event) => {
      const detail = (e as CustomEvent<{ playing: boolean }>).detail
      if (detail) setVideoPlaying(detail.playing)
    }
    const handleMuted = (e: Event) => {
      const detail = (e as CustomEvent<{ muted: boolean }>).detail
      if (detail) setLiveMuted(detail.muted)
    }
    window.addEventListener('theater-playing-state', handlePlaying)
    window.addEventListener('theater-muted-state', handleMuted)
    return () => {
      window.removeEventListener('theater-playing-state', handlePlaying)
      window.removeEventListener('theater-muted-state', handleMuted)
    }
  }, [])

  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      if (textCopyTimeoutRef.current) clearTimeout(textCopyTimeoutRef.current)
    },
    [],
  )

  // Never let the sheet linger open over the next post (keyboard/swipe nav),
  // and never let a paused 'timed' item leak its pause into the next one —
  // 'video' items don't need this: StageVideo always (re)plays a fresh src.
  useEffect(() => {
    setSheetOpen(false)
    setTimedPaused(false)
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
    setSheetOpen(false)
    onSelect(key)
  }

  const handleShare = async () => {
    if (!current) return
    const path = previewPath(current.platform, current.author, current.bookmarkId || '')
    const shareUrl = new URL(path, window.location.origin).toString()

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ url: shareUrl })
        return
      } catch (err) {
        // User dismissed the sheet — a cancel, not a failure.
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Any other error: fall through to the clipboard fallback below.
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard can be denied (permissions/insecure context) — nothing
      // actionable to show beyond the button itself.
    }
  }

  // Copy the post's full text (round 8): text-like posts have no file to
  // download, so the Download slot carries this instead of vanishing.
  const handleCopyText = async () => {
    const text = (current?.text || '').trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setTextCopied(true)
      if (textCopyTimeoutRef.current) clearTimeout(textCopyTimeoutRef.current)
      textCopyTimeoutRef.current = setTimeout(() => setTextCopied(false), 1600)
    } catch {
      // Clipboard can be denied — nothing actionable to show.
    }
  }

  // Queue position for the peek bar's center label (owner: "Up next" wasn't
  // useful — show where you are in the queue instead). -1 (no current item /
  // empty list) falls back to the old label.
  const queueIndex = currentKey ? items.findIndex((it) => theaterItemKey(it) === currentKey) : -1

  const trendCount = current ? (current.trendCount ?? current.saveCount ?? 0) : 0
  const tagCount = triage?.tags?.length ?? 0
  const handle = current?.author ? current.author.replace(/^@+/, '') : ''
  // The stage IS the text for text/quote/article posts — repeating the body
  // (and the author header) in the bottom scrim doubles it up and buries the
  // stage. Those posts get a compact scrim: chip + actions only.
  const textLike = current ? ['text', 'quote', 'article'].includes(inferType(current)) : false
  const caption = textLike ? '' : (current?.text || '').trim()

  return (
    <div className="pointer-events-none absolute inset-0 z-10 lg:hidden">
      <TheaterProgressLine itemKey={currentKey} kind={progressKind} />

      {/* Top scrim: brand (left) + post meta (right) — the flame/trend badge
          and the platform+time link-out chip live HERE now, one fixed
          location on every content type, instead of repeating per-row in the
          bottom scrim. De-clutter hides this whole scrim (meta included) —
          expected: immersion hides meta too. Collection mode replaces post
          meta with the tag/curator identity chrome (two rows). */}
      {triage ? (
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
            {/* Live ⇄ My Collection lives in this menu on mobile, as two
                sub-options under Theater (owner: a tab pill up here "is
                going to definitely cause overlap with the logo, the play
                stats, and the paste and burger menu… why not just put it in
                the burger menu for mobile?"). Desktop keeps its top-bar pill
                and does NOT pass this — one control per surface, never both.
                It's what freed the peek bar's centre slot for the queue
                position. */}
            <TheaterAvatarMenu
              theaterActive
              theaterTabs={{ tab: triage.tab, onTabChange: triage.onTabChange }}
            />
            <button
              type="button"
              onClick={triage.onClose}
              aria-label="Close triage"
              className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full border border-white/25 bg-white/[0.14] text-white"
            >
              <X size={16} />
            </button>
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
          {/* One row: brand left, #tag right — the curator/count live in the
              peek bar's center label; a second scrim row was too much for
              phone widths (live review). The logo is ALWAYS the plain home
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
            {current && (
              <div className="flex flex-none items-center gap-2">
                {/* Same pill geometry + backdrop as the platform/time chip
                    beside it (round 8: the two read as mismatched heights). */}
                {trendCount >= 2 && (
                  <span className="inline-flex min-h-[32px] flex-none items-center gap-1 rounded-full bg-black/40 px-2.5 text-[11px] font-bold text-orange-300 backdrop-blur-sm">
                    <Flame size={11} className="text-orange-400" fill="currentColor" />
                    <span>{trendCount}</span>
                  </span>
                )}
                {(() => {
                  const src = sourceUrl(current.platform, current.author, current.bookmarkId ?? '')
                  const inner = (
                    <>
                      <PlatformGlyph platform={current.platform} size={12} />
                      {/* `addedAt` = when the post was first added to ADHX
                          (owner decision — never the source platform's date,
                          never the moving event time). Unknown → no time. */}
                      {hasKnownTimestamp(current.addedAt) && (
                        <span
                          className="font-mono text-[11px]"
                          title={addedToAdhxLabel(current.addedAt as string)}
                          aria-label={addedToAdhxLabel(current.addedAt as string)}
                          suppressHydrationWarning
                        >
                          {formatCompactRelativeTime(current.addedAt as string)}
                        </span>
                      )}
                    </>
                  )
                  const cls =
                    'inline-flex min-h-[32px] flex-none items-center gap-1.5 rounded-full bg-black/40 px-2.5 text-white/80 backdrop-blur-sm'
                  return src ? (
                    <a href={src} target="_blank" rel="noopener noreferrer" className={cls}>
                      {inner}
                    </a>
                  ) : (
                    <span className={cls}>{inner}</span>
                  )
                })()}
              </div>
            )}
            {/* Mobile equivalent of the desktop top bar's ⌘V paste-to-preview
                input (spec §8/DesktopStageChrome) — touch Safari has no
                paste gesture, so this covers the signed-out home theater and
                shared preview pages (triage/collection top scrims above
                have their own chrome and skip this). */}
            <PasteLinkButton iconOnly />
            {/* Signed-out visitors here (the home theater + shared preview
                pages) get a burger fallback in this same slot — Theater /
                Leaderboard / Sign in — instead of no navigation at all.
                Triage above never passes this (always reached authed);
                playlist mode's top scrim doesn't mount this component at
                all — its plain home logo plus the bottom scrim's
                Save-playlist CTA cover both navigation and signed-out
                conversion there. */}
            <TheaterAvatarMenu
              onRequestSignIn={onRequestSignIn}
              allowSignedOut
              theaterActive={mode === 'home'}
            />
          </div>
        </div>
      )}

      {/* Bottom scrim: author/caption + Send / Save / Share / Open. Padded
          above the sheet's peek bar (opaque, themed) so the gradient tucks
          under it. */}
      {current && (
        <div
          className={cn(
            'pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col gap-3 px-4 pb-3 pt-12 transition-[opacity,transform] duration-200 ease-out',
            declutter && 'pointer-events-none translate-y-3 opacity-0',
          )}
          style={{
            paddingBottom: `calc(${PEEK_H} + 0.75rem)`,
            background:
              'linear-gradient(to top, rgba(11,11,17,.88) 0%, rgba(11,11,17,.55) 55%, transparent 100%)',
          }}
        >
          <div>
            {/* The poster's avatar + name — only for media posts. Text-like
                posts (text/quote/article) show the author on the stage
                itself, so this row stays hidden for them to avoid doubling
                up. */}
            {!textLike &&
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
            {caption && (
              <div
                className={cn(
                  'mt-1.5',
                  expanded && 'rounded-lg bg-black/70 px-2 py-1.5 backdrop-blur-sm',
                )}
              >
                <p
                  ref={captionRef}
                  className={cn(
                    'text-[13.5px] leading-snug text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]',
                    expanded ? 'max-h-[38dvh] overflow-y-auto overscroll-contain' : 'line-clamp-2',
                  )}
                >
                  <TheaterLinkedText
                    platform={current.platform}
                    text={caption}
                    hasMedia
                    links={current?.textLinks}
                    hideTweetLinks={!!current?.quote}
                  />
                </p>
                {overflowing && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpanded((v) => !v)
                    }}
                    onTouchEnd={(e) => e.stopPropagation()}
                    className="mt-1 flex min-h-[44px] items-center text-[12.5px] font-semibold text-white/80 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]"
                  >
                    {expanded ? 'less' : 'more'}
                  </button>
                )}
              </div>
            )}

            {/* Tag chips (unified-theater-triage.md §B) — the Collection
                tab's current item only; display-only, nothing renders
                without tags. */}
            {triage?.tab === 'collection' && triage.tags && triage.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {triage.tags.map((t) => (
                  <span
                    key={t}
                    className="flex-none rounded-full border border-white/12 bg-white/[.06] px-2 py-0.5 text-[10.5px] text-white/55"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {triage && triage.tab === 'collection' ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={triage.onLater}
                className="inline-flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border border-white/25 bg-white/[0.14] text-[11px] font-semibold text-white"
              >
                <Clock size={16} />
                <span>Later</span>
              </button>
              <button
                type="button"
                onClick={triage.onTag}
                className={cn(
                  'inline-flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border bg-white/10 text-[11px] font-semibold backdrop-blur-md',
                  tagCount > 0 ? 'border-clay/50 text-clay' : 'border-white/25 text-white',
                )}
              >
                <TagIcon size={16} fill={tagCount > 0 ? 'currentColor' : 'none'} />
                <span>{tagCount > 0 ? `Tag · ${tagCount}` : 'Tag'}</span>
              </button>
              <button
                type="button"
                onClick={triage.onDelete}
                className="inline-flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border border-white/25 bg-white/[0.14] text-[11px] font-semibold text-white"
              >
                <Trash2 size={16} />
                <span>Delete</span>
              </button>
              <button
                type="button"
                onClick={triage.onDone}
                className="inline-flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl bg-done/25 text-[11px] font-semibold text-done"
              >
                <Check size={16} />
                <span>Done</span>
              </button>
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
                  >
                    <ExternalLink size={16} />
                  </StageIconButton>
                )
              })()}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {playlist && isPlaylistOwner ? (
                <a
                  href={`/library?tag=${encodeURIComponent(playlist.tag)}`}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-white/25 bg-white/[0.14] px-3 text-[13px] font-semibold text-white"
                >
                  <TagIcon size={15} />
                  <span>Manage playlist</span>
                </a>
              ) : playlist ? (
                <SavePlaylistButton
                  count={playlist.count}
                  status={saveStatus}
                  onSave={() => onSavePlaylist?.()}
                  className={PILL_SAVE}
                />
              ) : (
                <>
                  {sendFile.supported ? (
                    <button
                      type="button"
                      onClick={() => {
                        // No awaits before this call — the tap must stay a fresh
                        // user gesture for iOS's share sheet (spec §2/§6).
                        void sendFile.send()
                      }}
                      disabled={sendFile.sending}
                      title={
                        sendFile.mode === 'share'
                          ? 'Opens your share sheet with the file'
                          : 'Download the file'
                      }
                      className={PILL_GLASS}
                    >
                      {sendFile.sending ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <DownloadIcon size={15} />
                      )}
                      <span>Download</span>
                    </button>
                  ) : textLike && (current.text || '').trim() ? (
                    // Text-like posts have no file — the Download slot copies
                    // the post's full text instead (round 8, owner request).
                    <button
                      type="button"
                      onClick={() => void handleCopyText()}
                      className={PILL_GLASS}
                    >
                      {textCopied ? (
                        <Check size={15} className="text-done" />
                      ) : (
                        <CopyIcon size={15} />
                      )}
                      <span>{textCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                  ) : null}
                  {triage?.tab === 'live' ? (
                    <>
                      <StageIconButton
                        onClick={(e) => {
                          e.stopPropagation()
                          triage.onLiveTag?.(current)
                        }}
                        onTouchEnd={(e) => e.stopPropagation()}
                        aria-label="Tag this post"
                      >
                        <TagIcon size={16} />
                      </StageIconButton>
                      <button
                        type="button"
                        onClick={() => {
                          if (!triage.savedKeys.has(theaterItemKey(current))) triage.onSave(current)
                        }}
                        disabled={triage.savedKeys.has(theaterItemKey(current))}
                        className={PILL_SAVE}
                      >
                        {triage.savedKeys.has(theaterItemKey(current)) ? (
                          <Check size={15} />
                        ) : (
                          <Bookmark size={15} />
                        )}
                        <span>
                          {triage.savedKeys.has(theaterItemKey(current)) ? 'Saved' : 'Save'}
                        </span>
                      </button>
                    </>
                  ) : mode === 'shared' && authed ? (
                    // Signed-in viewers save directly — same branch the
                    // desktop chrome has always had (see `authed`'s doc
                    // comment above).
                    <SavePostButton current={current} className={PILL_SAVE} />
                  ) : (
                    <button type="button" onClick={() => onRequestSignIn?.()} className={PILL_SAVE}>
                      <Bookmark size={15} />
                      <span>Save</span>
                    </button>
                  )}
                </>
              )}
              <StageIconButton onClick={() => void handleShare()} aria-label="Share link">
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
                  >
                    <ExternalLink size={16} />
                  </StageIconButton>
                )
              })()}
            </div>
          )}
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
          to ~70dvh. Transform-only (no layout thrash), theme-following
          surface — translucent so the stage reads through while collapsed,
          more opaque once open so the list stays comfortably readable.
          Unlike the scrims, de-clutter does NOT fade this out — the
          reviewer wants the nav/pause/audio controls and the sheet available
          at all times, even while immersed, so only the top/bottom scrims
          above hide. */}
      <div
        ref={sheetRef}
        style={sheetDrag.style}
        className={cn(
          'pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex h-[70dvh] flex-col overscroll-contain rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,.35)] backdrop-blur-md transition-[transform,background-color] duration-300 ease-out',
          sheetOpen ? 'bg-surface' : 'bg-surface/70',
          !sheetDrag.dragging && (sheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-4.25rem)]'),
        )}
      >
        {/* Peek bar: drag handle on top (tap toggles; a real pointer drag
            follows the finger 1:1 via useSheetDrag, snapping open/closed on
            release by distance or flick velocity — see the hook), then a
            control row — de-clutter fixed at the far left (never moves), the
            audio button to its right (video posts only, so its presence
            never shifts de-clutter), the up-next label screen-centered
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
              button sits to its right and only exists for video posts — it
              hides, but de-clutter never moves. */}
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
              >
                {/* De-cluttering EXPANDS the stage — the enter action (declutter
                  false → true) reads outward (Maximize2); exiting reads
                  inward (Minimize2), restoring the compact chrome. */}
                {declutter ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              {/* Spotify-style repeat (round 8): off → all → one. Sits
                  between the fixed de-clutter button and the (video-only)
                  audio button so neither ever shifts. Clay = active. */}
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
                  aria-label={REPEAT_MODE_LABEL[repeatMode].action}
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
                >
                  {repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
                </button>
              )}
              {mediaKind === 'video' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAudioTap()
                  }}
                  onTouchEnd={(e) => e.stopPropagation()}
                  aria-label={displayMuted ? 'Unmute' : 'Mute'}
                  className={cn(
                    'inline-flex h-10 w-10 flex-none items-center justify-center rounded-full transition-colors hover:bg-inset hover:text-ink active:bg-inset active:text-ink',
                    soundPulse ? 'animate-sound-pulse text-ink' : 'text-ink-3',
                  )}
                >
                  {displayMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
              )}
            </div>

            {/* Centre slot: where you are in the queue. Triage used to spend
                this on the Live/Collection tabs — they're in the top scrim
                now (see above), so every mode gets the position, which is
                what the owner asked the count to be aware of. */}
            <div className="pointer-events-none absolute inset-x-0 flex justify-center">
              <button
                type="button"
                onClick={() => setSheetOpen((v) => !v)}
                aria-expanded={sheetOpen}
                aria-label={sheetOpen ? 'Collapse up next' : 'Expand up next'}
                className={cn(
                  'pointer-events-auto flex max-w-[45%] items-center justify-center gap-1 truncate px-1 text-center text-[12px] font-semibold',
                  repeatCurrent ? 'text-clay' : 'text-ink-2',
                )}
              >
                {playlist ? (
                  <>
                    <Repeat size={11} className="flex-none" aria-hidden />
                    <span className="truncate">
                      #{playlist.tag} · {playlist.count}
                    </span>
                  </>
                ) : repeatCurrent ? (
                  <>
                    <Repeat size={11} className="flex-none" aria-hidden />
                    <span className="truncate">On repeat</span>
                  </>
                ) : queueIndex !== -1 ? (
                  // Queue position ("3 / 7"), out of what will actually PLAY
                  // from here — the unwatched run while repeat is off, the
                  // whole queue once it isn't (see `computeQueueTotal`). The
                  // fresh-arrival count folds in when there is one, but only
                  // where "new" means anything: the Collection tab is a finite
                  // backlog, not the live pulse.
                  `${queueIndex + 1} / ${queueTotal ?? items.length}${
                    newCount > 0 && triage?.tab !== 'collection' ? ` · ${newCount} new` : ''
                  }`
                ) : newCount > 0 && triage?.tab !== 'collection' ? (
                  `${newCount} new`
                ) : (
                  'Up next'
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
              {/* Video always gets a pause button (even in the collection tab,
                where `progressKind` is forced 'none'); a 'timed' item only
                gets one where there's an actual auto-advance to pause — never
                in the collection tab, where pausing a static post is
                meaningless. */}
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
