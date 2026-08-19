'use client'

/**
 * Mobile theater chrome (spec §8): the full-bleed reel evolution of
 * `/trending/play`. Overlays the full-viewport <Stage/> with a top scrim
 * (brand only — the Save CTA below covers sign-in), a bottom scrim
 * (author/caption + Download/Save/Share), and an
 * Up-next bottom sheet — all `pointer-events-auto` islands inside an
 * otherwise `pointer-events-none` layer so taps/swipes on the bare stage fall
 * through to `TheaterShell`'s swipe handler untouched.
 *
 * Rendered only below `lg` (`TheaterShell` mounts this alongside, not
 * instead of, the desktop `<Rail/>`).
 */

import { useEffect, useRef, useState } from 'react'
import {
  Download as DownloadIcon,
  Loader2,
  Share2,
  Check,
  LogIn,
  Flame,
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
import { previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { inferType } from '@/lib/trending/filter'
import { useSendFile } from './useSendFile'
import { useClampExpand } from './Rail'
import { TheaterLinkedText } from './TheaterText'
import { TheaterProgressLine, progressKindFor } from './TheaterProgressLine'
import { UpNextList } from './UpNextList'
import type { TheaterItem, TheaterMode } from './types'

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
  /** Prev/next navigation for the peek bar's chevrons (text posts can't swipe — their body scrolls/selects). */
  onPrev: () => void
  onNext: () => void
  /** Current sound state (owned by TheaterShell) — the audio button's fallback signal, see `liveMuted` below. */
  muted: boolean
  /** Flips TheaterShell's `muted` state. */
  onToggleMute: () => void
}

/** Height of the collapsed sheet's peek bar — kept in sync with the transform below. Two rows now (drag handle + the nav/pause/audio/de-clutter controls), taller than the old label-only bar. */
const PEEK_H = '4.25rem'
/** Shared style for the icon-only controls living in the peek bar — subtle on the themed (light/dark-following) surface, unlike the dark-stage scrim buttons above. */
const PEEK_ICON_BTN =
  'inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-inset hover:text-ink active:bg-inset active:text-ink'
/** Minimum finger travel (px) on the peek handle to count as a drag, not a tap. */
const DRAG_THRESHOLD = 30

/**
 * Pure swipe-gesture decision (spec §8): vertical swipe on the stage only,
 * gated to a dominant vertical axis so horizontal scrubbing/taps never fire
 * navigation. `dx`/`dy` are `touchend.clientX/Y - touchstart.clientX/Y`.
 */
export function swipeDirection(dx: number, dy: number): 'next' | 'prev' | null {
  const THRESHOLD = 48
  if (Math.abs(dy) < THRESHOLD) return null
  if (Math.abs(dy) <= Math.abs(dx) * 1.5) return null
  return dy < 0 ? 'next' : 'prev'
}

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
  muted,
  onToggleMute,
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
  // De-clutter: hides every chrome overlay (scrims, nav cluster, sheet peek
  // bar) for an unobstructed view of the stage. Deliberately NOT reset on
  // `currentKey` — a viewer who de-clutters wants it to stay that way while
  // browsing, not fight it back open on every swipe.
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

      {/* Top scrim: brand only. No close button — it's home. The Save CTA in
          the bottom scrim covers sign-in, so there's no separate Connect
          button up here. */}
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
      </div>

      {/* Bottom scrim: author/caption + Send / Save / Copy. Padded above the
          sheet's peek bar (opaque, themed) so the gradient tucks under it. */}
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
            <div className="flex items-center gap-2">
              {!textLike && (
                <span className="min-w-0 truncate text-[13px] font-semibold text-white">
                  {current.authorName || (handle ? `@${handle}` : 'Saved post')}
                </span>
              )}
              {trendCount >= 2 && (
                <span className="inline-flex flex-none items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-bold text-orange-300">
                  <Flame size={11} className="text-orange-400" fill="currentColor" />
                  {trendCount}
                </span>
              )}
              {/* Link-out to the original post: platform glyph + human time,
                  top-right of the preview (mirrors the desktop rail's chip). */}
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
                  'ml-auto inline-flex min-h-[32px] flex-none items-center gap-1.5 rounded-full bg-black/40 px-2.5 text-white/80 backdrop-blur-sm'
                return src ? (
                  <a
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    className={cls}
                  >
                    {inner}
                  </a>
                ) : (
                  <span className={cls}>{inner}</span>
                )
              })()}
            </div>
            {caption && (
              <div
                className={cn(
                  'mt-1.5',
                  expanded && 'rounded-lg bg-black/70 px-2 py-1.5 backdrop-blur-sm',
                )}
              >
                <p
                  ref={captionRef}
                  data-theater-scroll={expanded || undefined}
                  className={cn(
                    'text-[13.5px] leading-snug text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]',
                    expanded
                      ? 'max-h-[38dvh] touch-pan-y overflow-y-auto overscroll-contain'
                      : 'line-clamp-2',
                  )}
                >
                  <TheaterLinkedText
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
            <a
              href="/api/auth/twitter"
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 text-[13px] font-semibold text-white backdrop-blur-md"
            >
              <LogIn size={15} />
              Save
            </a>
            <button
              type="button"
              onClick={() => void handleShare()}
              aria-label="Share link"
              className="inline-flex min-h-[44px] min-w-[44px] flex-none items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-md"
            >
              {copied ? <Check size={16} className="text-done" /> : <Share2 size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* Backdrop: closes the sheet + blocks stage swipe/tap while it's open. */}
      {sheetOpen && !declutter && (
        <div
          className="pointer-events-auto absolute inset-0"
          onClick={() => setSheetOpen(false)}
          aria-hidden
        />
      )}

      {/* Up-next sheet: a peek bar pinned to the bottom, dragged/tapped open
          to ~70dvh. Transform-only (no layout thrash), theme-following
          surface (unlike the hardcoded-dark scrims above it). The sheet is a
          separate DOM sibling from the stage's swipe wrapper, so a drag here
          never reaches TheaterShell's gesture handler regardless —
          `data-theater-scroll` + touch-action are added anyway for
          consistency with the other opt-out regions. De-clutter fades the
          whole sheet out (on top of its own open/closed transform) without
          losing that transform's state, so it's exactly where it was when
          the viewer restores the chrome. */}
      <div
        data-theater-scroll
        className={cn(
          'absolute inset-x-0 bottom-0 z-20 flex h-[70dvh] touch-pan-y flex-col overscroll-contain rounded-t-2xl bg-surface shadow-[0_-8px_24px_rgba(0,0,0,.35)] transition-[opacity,transform] duration-300 ease-out',
          sheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-4.25rem)]',
          declutter ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100',
        )}
      >
        {/* Peek bar: drag handle on top (tap/drag toggles the sheet, as
            before), then a control row — prev/pause/next on the left, the
            up-next label in the middle (also toggles the sheet), and
            audio/de-clutter on the right. The nav and de-clutter buttons
            replace the old floating right-edge cluster entirely; they stop
            propagation on click AND touchend so pressing them never also
            toggles the sheet open/closed. */}
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

        <div className="flex flex-none items-center gap-0.5 px-2 pb-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPrev()
            }}
            onTouchEnd={(e) => e.stopPropagation()}
            aria-label="Previous post"
            className={PEEK_ICON_BTN}
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
            onClick={(e) => {
              e.stopPropagation()
              onNext()
            }}
            onTouchEnd={(e) => e.stopPropagation()}
            aria-label="Next post"
            className={PEEK_ICON_BTN}
          >
            <ChevronDown size={18} />
          </button>

          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            aria-expanded={sheetOpen}
            aria-label={sheetOpen ? 'Collapse up next' : 'Expand up next'}
            className="min-w-0 flex-1 truncate px-1 text-center text-[12px] font-semibold text-ink-2"
          >
            {newCount > 0 ? `Up next · ${newCount} new` : "You're all caught up"}
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
              className={PEEK_ICON_BTN}
            >
              {displayMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setDeclutter(true)
            }}
            onTouchEnd={(e) => e.stopPropagation()}
            aria-label="Hide controls"
            className={PEEK_ICON_BTN}
          >
            <Minimize2 size={16} />
          </button>
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

      {/* The one control left on screen while de-cluttered — restores every
          overlay above. */}
      {declutter && (
        <button
          type="button"
          onClick={() => setDeclutter(false)}
          aria-label="Show controls"
          className="pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white/80 backdrop-blur-sm transition-opacity duration-200 active:bg-black/55"
        >
          <Maximize2 size={18} />
        </button>
      )}
    </div>
  )
}
