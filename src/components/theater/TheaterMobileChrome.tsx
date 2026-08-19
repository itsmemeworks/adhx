'use client'

/**
 * Mobile theater chrome (spec §8): the full-bleed reel evolution of
 * `/trending/play`. Overlays the full-viewport <Stage/> with a top scrim
 * (brand + Connect), a bottom scrim (author/caption + Send/Save/Copy), and an
 * Up-next bottom sheet — all `pointer-events-auto` islands inside an
 * otherwise `pointer-events-none` layer so taps/swipes on the bare stage fall
 * through to `TheaterShell`'s swipe handler untouched.
 *
 * Rendered only below `lg` (`TheaterShell` mounts this alongside, not
 * instead of, the desktop `<Rail/>`).
 */

import { useEffect, useRef, useState } from 'react'
import {
  Send as SendIcon,
  Download as DownloadIcon,
  Loader2,
  Copy,
  Check,
  LogIn,
  Flame,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { MatterLogo, ConnectWithX, PlatformGlyph } from '@/components/matter'
import { previewPath, sourceUrl } from '@/lib/activity/preview-path'
import { useSendFile } from './useSendFile'
import { useClampExpand } from './Rail'
import { TheaterLinkedText } from './TheaterText'
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
}

/** Height of the collapsed sheet's peek bar — kept in sync with the transform below. */
const PEEK_H = '3.75rem'
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
  mode,
  current,
  items,
  currentKey,
  isSeen,
  seenReady,
  freshKeys,
  newCount,
  onSelect,
}: TheaterMobileChromeProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragStartYRef = useRef<number | null>(null)
  const sendFile = useSendFile(current)
  const { ref: captionRef, expanded, setExpanded, overflowing } = useClampExpand(currentKey)

  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    },
    [],
  )

  // Never let the sheet linger open over the next post (keyboard/swipe nav).
  useEffect(() => {
    setSheetOpen(false)
  }, [currentKey])

  const handleSelect = (key: string) => {
    setSheetOpen(false)
    onSelect(key)
  }

  const handleCopy = async () => {
    if (!current) return
    const path = previewPath(current.platform, current.author, current.bookmarkId || '')
    const shareUrl = new URL(path, window.location.origin).toString()
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
  const caption = (current?.text || '').trim()

  return (
    <div className="pointer-events-none absolute inset-0 z-10 lg:hidden">
      {/* Top scrim: brand + Connect. No close button — it's home. */}
      <div
        className="pointer-events-auto absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]"
        style={{ background: 'linear-gradient(to bottom, rgba(11,11,17,.75), transparent)' }}
      >
        <a href="/" className="flex items-center" aria-label="ADHX home">
          <MatterLogo size={16} className="[&>span]:text-white" />
        </a>
        {mode === 'home' && (
          <a
            href="/api/auth/twitter"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-[12px] font-semibold text-white backdrop-blur-md"
          >
            <ConnectWithX size={12} />
          </a>
        )}
      </div>

      {/* Bottom scrim: author/caption + Send / Save / Copy. Padded above the
          sheet's peek bar (opaque, themed) so the gradient tucks under it. */}
      {current && (
        <div
          className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col gap-3 px-4 pb-3 pt-12"
          style={{
            paddingBottom: `calc(${PEEK_H} + 0.75rem)`,
            background:
              'linear-gradient(to top, rgba(11,11,17,.88) 0%, rgba(11,11,17,.55) 55%, transparent 100%)',
          }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="min-w-0 truncate text-[13px] font-semibold text-white">
                {current.authorName || (handle ? `@${handle}` : 'Saved post')}
              </span>
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
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-clay-grad px-3 text-[13px] font-semibold text-white shadow-glow transition-opacity disabled:opacity-70"
              >
                {sendFile.sending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : sendFile.mode === 'share' ? (
                  <SendIcon size={15} />
                ) : (
                  <DownloadIcon size={15} />
                )}
                {sendFile.mode === 'share' ? 'Send' : 'Download'}
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
              onClick={handleCopy}
              aria-label="Link"
              className="inline-flex min-h-[44px] min-w-[44px] flex-none items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-md"
            >
              {copied ? <Check size={16} className="text-done" /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* Backdrop: closes the sheet + blocks stage swipe/tap while it's open. */}
      {sheetOpen && (
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
          consistency with the other opt-out regions. */}
      <div
        data-theater-scroll
        className={cn(
          'pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex h-[70dvh] touch-pan-y flex-col overscroll-contain rounded-t-2xl bg-surface shadow-[0_-8px_24px_rgba(0,0,0,.35)] transition-transform duration-300 ease-out',
          sheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-3.75rem)]',
        )}
      >
        <button
          type="button"
          onClick={() => setSheetOpen((v) => !v)}
          onTouchStart={handleHandleTouchStart}
          onTouchEnd={handleHandleTouchEnd}
          aria-expanded={sheetOpen}
          className="flex min-h-[44px] flex-none flex-col items-center justify-center gap-1.5 px-4 pb-2 pt-2.5"
        >
          <span className="h-1 w-9 rounded-full bg-hairline" aria-hidden />
          <span className="text-[12px] font-semibold text-ink-2">
            {newCount > 0 ? `Up next · ${newCount} new` : "You're all caught up"}
          </span>
        </button>

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
