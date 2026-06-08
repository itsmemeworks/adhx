'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  X,
  Volume2,
  VolumeX,
  Play,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Plus,
  Flame,
} from 'lucide-react'
import { PlatformGlyph } from '@/components/matter'
import { isReelPlayable } from '@/lib/trending/filter'
import { sourceUrl } from '@/lib/activity/preview-path'
import type { TrendingItem } from '@/lib/trending/query'

/**
 * Trending Reel — a full-bleed, TikTok-style autoplay player for the trending
 * VIDEOS. Each clip autoplays muted, and **auto-advances when it ends**; swipe
 * (mobile) or arrow keys (desktop) skip, tap toggles play/pause, and a Save CTA
 * is pinned on every clip (the conversion hook — anyone can watch logged-out,
 * tap to save). It's the live, shareable face of /trending.
 *
 * v1 plays TikTok + X video only (clean MP4 + a native `ended` event). YouTube
 * (iframe) and Instagram (poster-only) are filtered out upstream via
 * {@link isReelPlayable} — see the Reel notes in lib/trending/filter.
 */

const POLL_MS = 15_000

function postKey(item: TrendingItem): string {
  return item.bookmarkId ? `${item.platform}:${item.bookmarkId}` : item.url
}

/** Build the inline MP4 stream URL for a playable reel item (TikTok | X). */
function reelVideoSrc(item: TrendingItem): string {
  const id = encodeURIComponent(item.bookmarkId ?? '')
  const author = encodeURIComponent(item.author ?? '')
  if (item.platform === 'tiktok') {
    return `/api/media/tiktok/video?username=${author}&id=${id}`
  }
  return `/api/media/video?author=${author}&tweetId=${id}&quality=hd`
}

export function ReelPlayer({ initialItems }: { initialItems: TrendingItem[] }) {
  // The play queue — seeded from the server, kept playable-only, extended by the
  // live poll (new clips append to the end so they never disrupt the current one).
  const [queue, setQueue] = useState<TrendingItem[]>(() => initialItems.filter(isReelPlayable))
  const [index, setIndex] = useState(0)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)
  const [chrome, setChrome] = useState(true) // overlay visible
  const [showControls, setShowControls] = useState(false) // native <video controls>

  const videoRef = useRef<HTMLVideoElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const chromeTimer = useRef<number | null>(null)

  const current = queue[index]
  const count = queue.length

  const goNext = useCallback(() => {
    setIndex((i) => (count === 0 ? 0 : (i + 1) % count))
    setPaused(false)
  }, [count])

  const goPrev = useCallback(() => {
    setIndex((i) => (count === 0 ? 0 : (i - 1 + count) % count))
    setPaused(false)
  }, [count])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
      setPaused(false)
    } else {
      v.pause()
      setPaused(true)
    }
  }, [])

  // Briefly reveal the chrome, then auto-hide while playing (TikTok-style) —
  // the same behavior whether or not native controls are on, so the info /
  // overlay always fades out and a tap brings it (and the native scrubber) back.
  const flashChrome = useCallback(() => {
    setChrome(true)
    if (chromeTimer.current) window.clearTimeout(chromeTimer.current)
    chromeTimer.current = window.setTimeout(() => setChrome(false), 2800)
  }, [])

  // Toggle the native video controls (scrubber/timeline/fullscreen), revealing
  // the chrome briefly (it then auto-hides like everything else).
  const toggleControls = useCallback(() => {
    setShowControls((c) => !c)
    flashChrome()
  }, [flashChrome])

  useEffect(() => {
    flashChrome()
    return () => {
      if (chromeTimer.current) window.clearTimeout(chromeTimer.current)
    }
  }, [index, flashChrome])

  // Keyboard controls (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'j') {
        e.preventDefault()
        goNext()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'k') {
        e.preventDefault()
        goPrev()
      } else if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'm') {
        setMuted((m) => !m)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, togglePlay])

  // Pause when the tab is hidden; resume (if the user hadn't paused) on return —
  // browsers stop background video and otherwise leave it un-restartable.
  useEffect(() => {
    const onVis = () => {
      const v = videoRef.current
      if (!v) return
      if (document.hidden) v.pause()
      else if (!paused) v.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [paused])

  // Live poll: append newly-trending playable clips to the end of the queue.
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/activity', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!alive || !Array.isArray(data.items)) return
        const fresh = (data.items as TrendingItem[]).filter(isReelPlayable)
        setQueue((prev) => {
          const seen = new Set(prev.map(postKey))
          const additions = fresh.filter((it) => !seen.has(postKey(it)))
          return additions.length ? [...prev, ...additions] : prev
        })
      } catch {
        /* transient — keep the current queue */
      }
    }
    const t = window.setInterval(load, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [])

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
    // Any touch re-reveals the chrome. touchstart is the reliable signal on
    // mobile — native video controls swallow the synthesized click, so the
    // container's onClick never fires there.
    flashChrome()
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dy = t.clientY - start.y
    const dx = t.clientX - start.x
    // Vertical swipes drive the reel (TikTok convention: up = next).
    if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx)) {
      if (dy < 0) goNext()
      else goPrev()
    }
  }

  if (count === 0 || !current) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-black px-6 text-center">
        <p className="text-[15px] text-white/70">No trending videos to play right now.</p>
        <Link
          href="/trending"
          className="rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-black"
        >
          Back to Trending
        </Link>
      </div>
    )
  }

  const trendCount = current.trendCount ?? current.saveCount ?? 0
  const origin = sourceUrl(current.platform, current.author, current.bookmarkId ?? '')
  const caption = (current.text || '').trim()

  return (
    <div
      className="fixed inset-0 z-[100] select-none overflow-hidden bg-black"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      // Catch-all: a tap anywhere re-reveals the chrome. Essential when native
      // controls are on — they intercept the tap on the <video>, so without
      // this the overlay (skip / controls-toggle) can't be brought back.
      onClick={flashChrome}
    >
      {/* The clip. key forces a clean remount per item; the poster covers the
          brief load so there's no black flash between clips. */}
      <video
        key={postKey(current)}
        ref={videoRef}
        src={reelVideoSrc(current)}
        poster={current.thumbnailUrl ?? undefined}
        autoPlay
        muted={muted}
        playsInline
        preload="auto"
        controls={showControls}
        className="absolute inset-0 h-full w-full object-contain"
        onClick={() => {
          // With native controls on, let them own play/pause + scrubbing —
          // a body tap just keeps the chrome visible.
          if (!showControls) togglePlay()
          flashChrome()
        }}
        onEnded={goNext}
        // A dud clip (e.g. a heuristic false-positive with no real video)
        // shouldn't stall the reel — skip to the next.
        onError={goNext}
      />

      {/* Tap-to-pause affordance when paused (native controls show their own) */}
      {paused && !showControls && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
            <Play size={28} fill="currentColor" />
          </span>
        </div>
      )}

      {/* Top bar: close · progress · live · skip · mute · controls toggle.
          Skip + controls live here so they're reachable on every viewport
          (mobile had swipe-only before). It auto-hides with the rest — even
          when native controls are on — because iOS renders its own buttons in
          the top corners (fullscreen / volume) that would otherwise clash with
          a pinned bar. A tap re-reveals it (and swipe still skips videos). */}
      <div
        className={`absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent px-4 pb-10 pt-4 transition-opacity duration-300 ${
          chrome ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <Link
          href="/trending"
          aria-label="Close reel"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md"
        >
          <X size={18} />
        </Link>
        <span className="rounded-full bg-white/15 px-2.5 py-1 font-mono text-[12px] font-semibold text-white backdrop-blur-md">
          {index + 1} / {count}
        </span>
        <span className="hidden items-center gap-1.5 rounded-full bg-clay/90 px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-wide text-white sm:flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Trending
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous video"
            onClick={() => {
              goPrev()
              flashChrome()
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md hover:bg-white/25"
          >
            <SkipBack size={17} fill="currentColor" />
          </button>
          <button
            type="button"
            aria-label="Next video"
            onClick={() => {
              goNext()
              flashChrome()
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md hover:bg-white/25"
          >
            <SkipForward size={17} fill="currentColor" />
          </button>
          <button
            type="button"
            aria-label={muted ? 'Unmute' : 'Mute'}
            onClick={() => {
              setMuted((m) => !m)
              flashChrome()
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md hover:bg-white/25"
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            type="button"
            aria-label={showControls ? 'Hide video controls' : 'Show video controls'}
            aria-pressed={showControls}
            onClick={toggleControls}
            className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-md ${
              showControls ? 'bg-white text-black' : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            <SlidersHorizontal size={17} />
          </button>
        </div>
      </div>

      {/* Bottom: author + caption + source, and the Save CTA. Hidden entirely
          while native controls are on — it sits over the scrubber and would dim
          + block it (the controls are reachable from the pinned top bar). The
          container is pointer-events-none so taps fall through to the video; the
          interactive children opt back in. */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 bg-gradient-to-t from-black/75 to-transparent px-4 pb-6 pt-16 transition-opacity duration-300 ${
          chrome && !showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="min-w-0 flex-1">
          <a
            href={origin ?? current.url}
            target={origin ? '_blank' : undefined}
            rel={origin ? 'noopener noreferrer' : undefined}
            className="pointer-events-auto mb-1.5 inline-flex items-center gap-2 hover:opacity-80"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md">
              <PlatformGlyph platform={current.platform} size={14} />
            </span>
            <span className="truncate font-mono text-[13px] font-semibold text-white">
              {current.author ? `@${current.author.replace(/^@+/, '')}` : 'View original'}
            </span>
            {trendCount >= 2 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-bold text-orange-300 backdrop-blur-sm">
                <Flame size={11} className="text-orange-400" fill="currentColor" />
                {trendCount}
              </span>
            )}
          </a>
          {caption && (
            <p className="line-clamp-2 max-w-[640px] text-[13.5px] leading-snug text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">
              {caption}
            </p>
          )}
        </div>

        {/* Save → the on-ADHX preview page (handles auth + Add to Collection).
            Opens in a new tab so the reel keeps playing behind it. */}
        <a
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto flex flex-none items-center gap-1.5 rounded-full bg-clay-grad px-4 py-2.5 text-[14px] font-semibold text-white shadow-glow"
        >
          <Plus size={15} />
          Save
        </a>
      </div>
    </div>
  )
}
