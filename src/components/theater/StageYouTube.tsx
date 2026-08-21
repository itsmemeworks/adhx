'use client'

/**
 * Official youtube-nocookie iframe (spec §3/§6), driven by the *raw* YouTube
 * IFrame postMessage protocol — not the `iframe_api` script, which
 * `script-src 'self' 'unsafe-inline'` (no external scripts) can't load. The
 * embed itself implements the protocol regardless of whether the controlling
 * page loaded the JS wrapper, so a bare `postMessage`/`message` exchange is
 * enough:
 *
 *   parent  -> iframe   {event:'listening', id}                 (handshake, on iframe load)
 *   iframe  -> parent   {event:'onReady'}                       (player booted)
 *   iframe  -> parent   {event:'onStateChange', info: <state>}  (-1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued)
 *   iframe  -> parent   {event:'onError', info: <code>}         (101/150 = embedding disabled, etc.)
 *   parent  -> iframe   {event:'command', func:'playVideo'|'pauseVideo'|'mute'|'unMute', args:[]}
 *
 * This makes YouTube behave like every other platform in the theater: muted
 * autoplay (the `mute=1`+`autoplay=1` URL params, reinforced by a `playVideo`
 * command once the handshake completes), an `onEnded` advance on state 0,
 * the dock/peek-bar transport + audio buttons driving real `playVideo`/
 * `pauseVideo`/`mute`/`unMute` commands (via the same `theater-toggle-play`/
 * `theater-pause`/`theater-resume` events StageVideo answers), and an 8s
 * "never actually started" stall watchdog that skips the item instead of
 * parking the queue on a dead Short — mirroring `onError`.
 *
 * `progressKindFor()` (`TheaterProgressLine.tsx`) now maps YouTube to the
 * same `'video'` kind as twitter/tiktok/instagram so the dock/peek-bar
 * pause+audio buttons render at all — they're gated on that kind in
 * `TheaterDesktopChrome`/`TheaterMobileChrome`. The shared top progress
 * LINE still never fills for YouTube (the raw protocol's periodic
 * `infoDelivery` current-time payload isn't documented/stable enough to
 * trust for a scrub bar), which just reads as an empty track — acceptable,
 * and far better than the buttons not existing at all.
 *
 * THE GOTCHA (CLAUDE.md, bitten before): an `aspect-[9/16]` box around an
 * absolutely-positioned iframe collapses to zero height. The fix is a
 * concrete height on the box itself, derived from the stage's own `h-full`
 * ancestor via a `flex-1 min-h-0` wrapper.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { PlatformChip } from '@/components/matter'
import { isValidVideoId, youtubeEmbedUrl } from '@/lib/media/youtube'
import { previewPath } from '@/lib/activity/preview-path'
import type { TheaterItem } from './types'

/** The embed's own origin — every inbound message is filtered to this, and
 * every outbound command is targeted at it. */
const YT_ORIGIN = 'https://www.youtube-nocookie.com'

/** If the player never reports a first `playing` state within this window
 * (dead/region-blocked/embedding-disabled Short that still loads an iframe),
 * treat it exactly like `onError` and advance rather than stalling the queue. */
const STALL_TIMEOUT_MS = 8_000

export interface StageYouTubeProps {
  item: TheaterItem
  /** Muted until the user's first gesture (autoplay policy) — the same
   * shell-owned signal StageVideo/StageInstagram receive. */
  muted: boolean
  /** The dock/peek-bar audio button asked to unmute — tells the shell so
   * `muted` (and the next item's initial signal) follows. There's no
   * stage-tap affordance here (unlike StageVideo): a cross-origin iframe
   * swallows its own clicks, so the parent page never sees a tap on the
   * player itself. */
  onRequestUnmute: () => void
  /** Ended, errored, or stalled — the same advance path StageVideo's
   * `onEnded` drives. Omit (triage's Collection tab, which never
   * auto-advances — Done/Later/Delete are the only ways forward there) to
   * disable auto-advance entirely; every internal advance path is a no-op
   * without it. */
  onEnded?: () => void
}

/**
 * The theater's `bookmarkId` for a YouTube item IS the 11-char video id
 * (see `previewPath` / `TrendingItem.bookmarkId`). Returns null when it
 * doesn't look like one, so the stage can fall back to a poster instead of
 * pointing an iframe at garbage.
 */
export function resolveYouTubeVideoId(item: Pick<TheaterItem, 'bookmarkId'>): string | null {
  const id = item.bookmarkId || ''
  return isValidVideoId(id) ? id : null
}

/** The app's own canonical origin, baked at build time — used for the
 * embed's `origin` param instead of `window.location.origin` so server and
 * client render the identical `src` (no hydration mismatch). */
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || ''

function buildEmbedSrc(videoId: string): string {
  const url = new URL(youtubeEmbedUrl(videoId))
  url.searchParams.set('enablejsapi', '1')
  url.searchParams.set('autoplay', '1')
  url.searchParams.set('mute', '1')
  url.searchParams.set('playsinline', '1')
  url.searchParams.set('rel', '0')
  if (APP_ORIGIN) url.searchParams.set('origin', APP_ORIGIN)
  return url.toString()
}

interface YouTubeMessage {
  event?: string
  info?: unknown
}

export function StageYouTube({ item, muted, onRequestUnmute, onEnded }: StageYouTubeProps) {
  const videoId = resolveYouTubeVideoId(item)
  const text = (item.text || '').trim()

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const readyRef = useRef(false)
  const hasPlayedRef = useRef(false)
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mutedRef = useRef(muted)
  const onEndedRef = useRef(onEnded)
  const onRequestUnmuteRef = useRef(onRequestUnmute)
  const [playing, setPlaying] = useState(false)
  const [effectiveMuted, setEffectiveMuted] = useState(muted)
  // Stable id for the `listening` handshake, mirrored onto the iframe's own
  // `id` attribute (the protocol's documented convention).
  const playerId = `yt-player-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])
  useEffect(() => {
    onEndedRef.current = onEnded
  }, [onEnded])
  useEffect(() => {
    onRequestUnmuteRef.current = onRequestUnmute
  }, [onRequestUnmute])

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current)
      stallTimerRef.current = null
    }
  }, [])

  // The single advance path: `onEnded`, `onError`, and the stall watchdog
  // all funnel through here, exactly matching StageVideo's one-caller
  // discipline for its own advance signal.
  const advance = useCallback(() => {
    clearStallTimer()
    onEndedRef.current?.()
  }, [clearStallTimer])

  const postCommand = useCallback((func: string, args: unknown[] = []) => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.postMessage(JSON.stringify({ event: 'command', func, args }), YT_ORIGIN)
  }, [])

  // New item: reset per-video state and arm the stall watchdog. Keyed on
  // `videoId` — the iframe itself also carries `key={videoId}` below, so a
  // new video is a fresh element + a fresh handshake, never a stale one.
  useEffect(() => {
    readyRef.current = false
    hasPlayedRef.current = false
    setPlaying(false)
    setEffectiveMuted(mutedRef.current)
    clearStallTimer()
    if (!videoId) return
    stallTimerRef.current = setTimeout(() => {
      if (!hasPlayedRef.current) advance()
    }, STALL_TIMEOUT_MS)
    return clearStallTimer
  }, [videoId, advance, clearStallTimer])

  // Reconcile the shell's `muted` signal onto the live player — only on an
  // actual prop transition, same discipline as StageVideo. If the handshake
  // hasn't completed yet, `onReady` below applies the latest value instead.
  useEffect(() => {
    setEffectiveMuted(muted)
    if (readyRef.current) postCommand(muted ? 'mute' : 'unMute')
  }, [muted, postCommand])

  // Broadcast playing/muted state so the dock/peek-bar transport + audio
  // buttons stay in sync, exactly like StageVideo.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('theater-playing-state', { detail: { playing } }))
  }, [playing])
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('theater-muted-state', { detail: { muted: effectiveMuted } }),
    )
  }, [effectiveMuted])

  // The protocol handshake + event stream.
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.origin !== YT_ORIGIN) return
      const frame = iframeRef.current
      if (!frame || e.source !== frame.contentWindow) return

      let data: YouTubeMessage | null = null
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (!data || typeof data !== 'object') return

      switch (data.event) {
        case 'onReady':
          readyRef.current = true
          // The URL already carries mute=1+autoplay=1; this just (a) syncs
          // sound if the shell's `muted` had already flipped false before
          // the handshake finished, and (b) nudges playback for browsers
          // that leave a freshly-ready player cued rather than playing.
          if (!mutedRef.current) postCommand('unMute')
          postCommand('playVideo')
          break
        case 'onStateChange': {
          const state = typeof data.info === 'number' ? data.info : null
          if (state === 1) {
            hasPlayedRef.current = true
            clearStallTimer()
            setPlaying(true)
          } else if (state === 2) {
            setPlaying(false)
          } else if (state === 0) {
            setPlaying(false)
            advance()
          }
          break
        }
        case 'onError':
          // 101/150 = embedding disabled by the uploader; other codes cover
          // invalid/removed/private videos. None of them are recoverable
          // from here — skip rather than stall the queue.
          advance()
          break
        default:
          break
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [postCommand, clearStallTimer, advance])

  // Space bar / the stage's play-pause affordance (`theater-toggle-play`,
  // dispatched by TheaterShell) — flips based on the last known state.
  useEffect(() => {
    function handleToggle() {
      if (!readyRef.current) return
      postCommand(playing ? 'pauseVideo' : 'playVideo')
    }
    window.addEventListener('theater-toggle-play', handleToggle)
    return () => window.removeEventListener('theater-toggle-play', handleToggle)
  }, [playing, postCommand])

  // Explicit pause/resume — the dock/peek-bar transport button's fixed
  // (not toggling) commands, same as StageVideo's `theater-pause`/
  // `theater-resume` handlers.
  useEffect(() => {
    function handlePause() {
      if (readyRef.current) postCommand('pauseVideo')
    }
    function handleResume() {
      if (readyRef.current) postCommand('playVideo')
    }
    window.addEventListener('theater-pause', handlePause)
    window.addEventListener('theater-resume', handleResume)
    return () => {
      window.removeEventListener('theater-pause', handlePause)
      window.removeEventListener('theater-resume', handleResume)
    }
  }, [postCommand])

  function handleLoad() {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.postMessage(JSON.stringify({ event: 'listening', id: playerId }), YT_ORIGIN)
  }

  if (!videoId) {
    const href = previewPath(item.platform, item.author, item.bookmarkId || '')
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#08070a]">
        {item.thumbnailUrl ? (
          <>
            <img
              src={item.thumbnailUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-contain opacity-60"
            />
            <div className="absolute inset-0 bg-[#08070a]/55" aria-hidden />
          </>
        ) : null}
        <div className="relative flex max-w-xl flex-col items-center gap-4 px-6 text-center">
          <PlatformChip platform="youtube" />
          {text && (
            <h2 className="font-serif text-2xl leading-tight text-white sm:text-3xl">{text}</h2>
          )}
          <a
            href={href}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-clay-grad px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-opacity hover:opacity-90"
          >
            Open preview
            <ArrowRight size={15} />
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#08070a]">
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
        <div className="relative aspect-[9/16] h-[min(82vh,100%)] max-w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
          <iframe
            key={videoId}
            id={playerId}
            ref={iframeRef}
            src={buildEmbedSrc(videoId)}
            title={text || 'YouTube Short'}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            onLoad={handleLoad}
          />
        </div>
      </div>
      {text && (
        <div className="flex-shrink-0 px-6 pb-6 sm:px-10 sm:pb-8">
          <p className="line-clamp-1 text-center text-sm text-white/70">{text}</p>
        </div>
      )}
    </div>
  )
}
