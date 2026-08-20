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
import {
  Download as DownloadIcon,
  Loader2,
  Share2,
  ExternalLink,
  Check,
  LogIn,
  Flame,
  Repeat,
  ChevronUp,
  ChevronDown,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Minimize2,
  Maximize2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { MatterLogo, PlatformGlyph } from '@/components/matter'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { inferType } from '@/lib/trending/filter'
import { useSendFile } from './useSendFile'
import { useClampExpand } from './useClampExpand'
import { PLATFORM_LABEL } from './types'
import { TheaterLinkedText } from './TheaterText'
import { TheaterProgressLine, progressKindFor } from './TheaterProgressLine'
import { UpNextList } from './UpNextList'
import { SaveCollectionButton } from './SaveCollectionButton'
import type { SaveCollectionStatus, TheaterCollectionMeta, TheaterItem, TheaterMode } from './types'

export interface TheaterMobileChromeProps {
  mode: TheaterMode
  current: TheaterItem | null
  items: TheaterItem[]
  currentKey: string | null
  isSeen: (key: string) => boolean
  seenReady: boolean
  freshKeys: ReadonlySet<string>
  newCount: number
  onSelect: (key: string) => void
  /** Prev/next navigation for the peek bar's chevrons — the only mobile nav besides keyboard and video-ended auto-advance. */
  onPrev: () => void
  onNext: () => void
  /** Whether there's a previous/next post to navigate to — disables the corresponding chevron (in place, no layout shift) at either end of the list. */
  canPrev: boolean
  canNext: boolean
  /** Current sound state (owned by TheaterShell) — the audio button's fallback signal, see `liveMuted` below. */
  muted: boolean
  /** Flips TheaterShell's `muted` state. */
  onToggleMute: () => void
  /** Collection mode (`/t/{username}/{tag}`): identity chrome + swaps the bottom action row's Download/Save-login for the Save-collection CTA. */
  collection?: TheaterCollectionMeta
  saveStatus?: SaveCollectionStatus
  onSaveCollection?: () => void
  onRequestSignIn?: () => void
}

/** Height of the collapsed sheet's peek bar — kept in sync with the transform below. Two rows now (drag handle + the nav/pause/audio/de-clutter controls), taller than the old label-only bar. */
const PEEK_H = '4.25rem'
/** Shared style for the icon-only controls living in the peek bar — subtle on the themed (light/dark-following) surface, unlike the dark-stage scrim buttons above. */
const PEEK_ICON_BTN =
  'inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-inset hover:text-ink active:bg-inset active:text-ink'
/** Applied on top of `PEEK_ICON_BTN` for a disabled prev/next chevron at either end of the list — dimmed, no hover/active feedback, but the button stays in place (no layout shift) so the row never reflows. */
const PEEK_ICON_BTN_DISABLED =
  'opacity-35 hover:bg-transparent hover:text-ink-3 active:bg-transparent active:text-ink-3 disabled:cursor-default'
/** Minimum finger travel (px) on the peek handle to count as a drag, not a tap. */
const DRAG_THRESHOLD = 30

export function TheaterMobileChrome({
  current,
  items,
  currentKey,
  isSeen,
  seenReady,
  freshKeys,
  newCount,
  onSelect,
  onPrev,
  onNext,
  canPrev,
  canNext,
  muted,
  onToggleMute,
  collection,
  saveStatus = 'idle',
  onSaveCollection,
  onRequestSignIn,
}: TheaterMobileChromeProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragStartYRef = useRef<number | null>(null)
  const sendFile = useSendFile(current)
  const { ref: captionRef, expanded, setExpanded, overflowing } = useClampExpand(currentKey)

  const kind = progressKindFor(current)

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

  const paused = kind === 'video' ? !videoPlaying : timedPaused
  const displayMuted = liveMuted ?? muted
  // Sound affordance moved onto the peek-bar audio button on mobile
  // (StageVideo's centered "Tap for sound" pill is desktop-only now): pulse
  // while the current video is effectively muted AND actually playing, so a
  // paused or already-unmuted video never pulses.
  const soundPulse = kind === 'video' && displayMuted && videoPlaying

  const handleTogglePause = () => {
    if (kind === 'video') {
      window.dispatchEvent(new CustomEvent(videoPlaying ? 'theater-pause' : 'theater-resume'))
      return
    }
    if (kind === 'timed') {
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

  // Drag the peek handle: up opens, down closes, a near-zero drag is a tap
  // toggle. preventDefault suppresses the ghost click Safari/Chrome fire
  // after a touch sequence, so the onClick fallback (mouse/VoiceOver) never
  // double-toggles a real touch.
  const handleHandleTouchStart = (e: React.TouchEvent) => {
    dragStartYRef.current = e.touches[0].clientY
  }
  const handleHandleTouchEnd = (e: React.TouchEvent) => {
    const start = dragStartYRef.current
    dragStartYRef.current = null
    if (start == null) return
    e.preventDefault()
    const dy = e.changedTouches[0].clientY - start
    if (dy <= -DRAG_THRESHOLD) setSheetOpen(true)
    else if (dy >= DRAG_THRESHOLD) setSheetOpen(false)
    else setSheetOpen((v) => !v)
  }

  const trendCount = current ? (current.trendCount ?? current.saveCount ?? 0) : 0
  const handle = current?.author ? current.author.replace(/^@+/, '') : ''
  // The stage IS the text for text/quote/article posts — repeating the body
  // (and the author header) in the bottom scrim doubles it up and buries the
  // stage. Those posts get a compact scrim: chip + actions only.
  const textLike = current ? ['text', 'quote', 'article'].includes(inferType(current)) : false
  const caption = textLike ? '' : (current?.text || '').trim()

  return (
    <div className="pointer-events-none absolute inset-0 z-10 lg:hidden">
      <TheaterProgressLine itemKey={currentKey} kind={kind} />

      {/* Top scrim: brand (left) + post meta (right) — the flame/trend badge
          and the platform+time link-out chip live HERE now, one fixed
          location on every content type, instead of repeating per-row in the
          bottom scrim. De-clutter hides this whole scrim (meta included) —
          expected: immersion hides meta too. Collection mode replaces post
          meta with the tag/curator identity chrome (two rows). */}
      {collection ? (
        <div
          className={cn(
            'pointer-events-auto absolute inset-x-0 top-0 flex flex-col gap-1.5 px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] transition-[opacity,transform] duration-200 ease-out',
            declutter && 'pointer-events-none -translate-y-3 opacity-0',
          )}
          style={{ background: 'linear-gradient(to bottom, rgba(11,11,17,.75), transparent)' }}
        >
          <div className="flex items-center justify-between">
            <a href="/" className="flex items-center" aria-label="ADHX home">
              <MatterLogo size={16} className="[&>span]:text-white" />
            </a>
            <span className="flex-none rounded-full bg-clay/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-clay">
              Collection
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[15px] font-bold text-white">
              {collection.tag}
            </span>
            <span className="flex-none font-mono text-[10.5px] text-white/60">
              by @{collection.curator} · {collection.count} ·{' '}
              <Repeat size={9} className="inline" aria-hidden />
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
          {current && (
            <div className="flex flex-none items-center gap-2">
              {trendCount >= 2 && (
                <span className="inline-flex flex-none items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-bold text-orange-300">
                  <Flame size={11} className="text-orange-400" fill="currentColor" />
                  {trendCount}
                </span>
              )}
              {(() => {
                const src = sourceUrl(current.platform, current.author, current.bookmarkId ?? '')
                const inner = (
                  <>
                    <PlatformGlyph platform={current.platform} size={12} />
                    <span className="font-mono text-[11px]" suppressHydrationWarning>
                      {formatCompactRelativeTime(current.createdAt)}
                    </span>
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
            {!textLike && (
              <div className="flex items-center gap-2">
                <AuthorAvatar
                  src={current.authorAvatarUrl ?? current.thumbnailUrl}
                  author={current.author}
                  size="sm"
                />
                <span className="min-w-0 truncate text-[13px] font-semibold text-white">
                  {current.authorName || (handle ? `@${handle}` : 'Saved post')}
                </span>
              </div>
            )}
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
          </div>

          <div className="flex items-center gap-2">
            {collection ? (
              <SaveCollectionButton
                count={collection.count}
                status={saveStatus}
                onSave={() => onSaveCollection?.()}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-clay-grad px-3 text-[13px] font-semibold text-white shadow-glow transition-opacity disabled:opacity-70"
              />
            ) : (
              <>
                {sendFile.supported && (
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
                        ? 'Opens your share sheet with the video file'
                        : 'Download the video file'
                    }
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-clay-grad px-3 text-[13px] font-semibold text-white shadow-glow transition-opacity disabled:opacity-70"
                  >
                    {sendFile.sending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <DownloadIcon size={15} />
                    )}
                    Download
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRequestSignIn?.()}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 text-[13px] font-semibold text-white backdrop-blur-md"
                >
                  <LogIn size={15} />
                  Save
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => void handleShare()}
              aria-label="Share link"
              className="inline-flex min-h-[44px] min-w-[44px] flex-none items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-md"
            >
              {copied ? <Check size={16} className="text-done" /> : <Share2 size={16} />}
            </button>
            {(() => {
              const openUrl = sourceUrl(current.platform, current.author, current.bookmarkId ?? '')
              if (!openUrl) return null
              const platformLabel = PLATFORM_LABEL[current.platform] ?? current.platform
              return (
                <a
                  href={openUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open on ${platformLabel}`}
                  className="inline-flex min-h-[44px] min-w-[44px] flex-none items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-md"
                >
                  <ExternalLink size={16} />
                </a>
              )
            })()}
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
          to ~70dvh. Transform-only (no layout thrash), theme-following
          surface — translucent so the stage reads through while collapsed,
          more opaque once open so the list stays comfortably readable.
          Unlike the scrims, de-clutter does NOT fade this out — the
          reviewer wants the nav/pause/audio controls and the sheet available
          at all times, even while immersed, so only the top/bottom scrims
          above hide. */}
      <div
        className={cn(
          'pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex h-[70dvh] flex-col overscroll-contain rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,.35)] backdrop-blur-md transition-[transform,background-color] duration-300 ease-out',
          sheetOpen ? 'translate-y-0 bg-surface' : 'translate-y-[calc(100%-4.25rem)] bg-surface/70',
        )}
      >
        {/* Peek bar: drag handle on top (tap/drag toggles the sheet, as
            before), then a control row — de-clutter fixed at the far left
            (never moves), the audio button to its right (video posts only,
            so its presence never shifts de-clutter), the up-next label
            screen-centered (absolutely positioned over the bar so it lands
            at the true midpoint regardless of the side groups' unequal
            widths), and prev/pause/next on the right. All non-drag-handle
            buttons stop propagation on click AND touchend so pressing them
            never also toggles the sheet open/closed. */}
        <button
          type="button"
          onClick={() => setSheetOpen((v) => !v)}
          onTouchStart={handleHandleTouchStart}
          onTouchEnd={handleHandleTouchEnd}
          aria-expanded={sheetOpen}
          aria-label={sheetOpen ? 'Collapse up next' : 'Expand up next'}
          className="flex w-full flex-none items-center justify-center pb-0.5 pt-2"
        >
          <span className="h-1 w-9 rounded-full bg-hairline" aria-hidden />
        </button>

        <div className="relative flex flex-none items-center px-2 pb-2">
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
              {declutter ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
            </button>
            {kind === 'video' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleMute()
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

          <div className="pointer-events-none absolute inset-x-0 flex justify-center">
            <button
              type="button"
              onClick={() => setSheetOpen((v) => !v)}
              aria-expanded={sheetOpen}
              aria-label={sheetOpen ? 'Collapse up next' : 'Expand up next'}
              className="pointer-events-auto flex max-w-[45%] items-center justify-center gap-1 truncate px-1 text-center text-[12px] font-semibold text-ink-2"
            >
              {collection ? (
                <>
                  <Repeat size={11} className="flex-none" aria-hidden />
                  <span className="truncate">
                    {collection.tag} · {collection.count}
                  </span>
                </>
              ) : newCount > 0 ? (
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
            {kind !== 'none' && (
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
              className={cn(PEEK_ICON_BTN, !canNext && PEEK_ICON_BTN_DISABLED)}
            >
              <ChevronDown size={18} />
            </button>
          </div>
        </div>

        <UpNextList
          items={items}
          currentKey={currentKey}
          isSeen={isSeen}
          seenReady={seenReady}
          freshKeys={freshKeys}
          newCount={newCount}
          onSelect={handleSelect}
          className="min-h-0 flex-1 pb-[max(1rem,env(safe-area-inset-bottom))]"
        />
      </div>
    </div>
  )
}
