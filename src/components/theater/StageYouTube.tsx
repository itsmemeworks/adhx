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
 *
 * NATIVE CHROME: `buildEmbedSrc()` sets `controls=0`/`disablekb=1`/`fs=0`/
 * `iv_load_policy=3` so YouTube's own seek bar, volume/CC/settings row,
 * keyboard shortcuts, and annotation cards never render — that surface
 * belongs to the theater's dock/peek-bar, not the embed (was showing through
 * on mobile, where unlike desktop hover-to-hide, native controls stay
 * persistent). None of this touches `enablejsapi` — the postMessage
 * protocol above is independent of `controls`. KNOWN LIMITATION: YouTube
 * still overlays its own title/channel card on load and on pause even with
 * `controls=0` — that's baked into the embed, and complying with YouTube's
 * ToS means leaving it; the fix here only removes the *interactive* chrome.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { PlatformChip } from '@/components/matter'
import { isValidVideoId, youtubeEmbedUrl } from '@/lib/media/youtube'
import { previewPath } from '@/lib/activity/preview-path'
import { StageFrame, StageHeadline, StageCTA } from './stage-primitives'
import type { TheaterItem } from './types'

/** The embed's own origin — every inbound message is filtered to this, and
 * every outbound command is targeted at it. */
const YT_ORIGIN = 'https://www.youtube-nocookie.com'

/** If the player never reports a first `playing` state within this window
 * (dead/region-blocked/embedding-disabled Short that still loads an iframe),
 * treat it exactly like `onError` and advance rather than stalling the queue. */
const STALL_TIMEOUT_MS = 8_000

/**
 * Backup window after sending `unMute`: if no further state signal arrives
 * at all (a silent stall rather than an explicit pause), fall back to muted
 * anyway. The common case is answered synchronously by an explicit state 2
 * (see `applyPlayerState`) — this timer only catches the rarer "nothing
 * happens" case.
 */
const UNMUTE_SETTLE_MS = 1_500

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
  /**
   * shared-post-repeat: the embed has no native `loop` param that survives
   * the JS-API path reliably, so an `ended` (state 0) is answered with
   * `seekTo(0, true)` + `playVideo` instead of calling `onEnded` — a
   * postMessage replay standing in for `<video loop>`. The stall watchdog
   * and `onError` are UNCHANGED by this: a Short that never actually starts,
   * or errors outright, still advances rather than looping on nothing.
   */
  repeat?: boolean
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

/** YouTube hard-requires a valid `origin` param whenever `enablejsapi=1` is
 * set — omitting it is "Error 153: video player configuration error" and the
 * player never loads. `NEXT_PUBLIC_APP_URL` can't provide it: it's a runtime
 * Fly secret, not a Docker build arg, so the baked client value is empty in
 * deploys. Use `window.location.origin` instead, resolved in an effect, and
 * gate the iframe on it — SSR and the client's first render both emit no
 * iframe, so there's no hydration mismatch and the origin is always the host
 * actually serving the page. */
function buildEmbedSrc(videoId: string, origin: string): string {
  const url = new URL(youtubeEmbedUrl(videoId))
  url.searchParams.set('enablejsapi', '1')
  url.searchParams.set('autoplay', '1')
  url.searchParams.set('mute', '1')
  url.searchParams.set('playsinline', '1')
  url.searchParams.set('rel', '0')
  // Suppress YouTube's own interactive chrome — ADHX's transport (dock/
  // peek-bar buttons driving the postMessage `command` protocol above) is
  // the only control surface; native controls/keyboard/fullscreen would
  // collide with the theater's own overlays (worst on touch, where YouTube's
  // chrome doesn't auto-hide the way it does on desktop hover).
  url.searchParams.set('controls', '0')
  url.searchParams.set('disablekb', '1')
  url.searchParams.set('fs', '0')
  url.searchParams.set('iv_load_policy', '3')
  url.searchParams.set('origin', origin)
  return url.toString()
}

interface YouTubeMessage {
  event?: string
  info?: unknown
}

export function StageYouTube({ item, muted, onRequestUnmute, onEnded, repeat }: StageYouTubeProps) {
  const videoId = resolveYouTubeVideoId(item)
  const text = (item.text || '').trim()

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const readyRef = useRef(false)
  const hasPlayedRef = useRef(false)
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Sound is desired but a confirmed `playing` state hasn't happened yet for
  // this item — `applyPlayerState` re-fires `requestUnmute()` the instant
  // state 1 arrives.
  const pendingUnmuteRef = useRef(false)
  // An `unMute` command is in flight and we're watching the next state
  // signal to see whether iOS actually honored it.
  const unmuteAwaitingConfirmRef = useRef(false)
  const unmuteSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mutedRef = useRef(muted)
  const onEndedRef = useRef(onEnded)
  const onRequestUnmuteRef = useRef(onRequestUnmute)
  const repeatRef = useRef(repeat)
  const [playing, setPlaying] = useState(false)
  const [effectiveMuted, setEffectiveMuted] = useState(muted)
  const [clientOrigin, setClientOrigin] = useState<string | null>(null)

  useEffect(() => {
    setClientOrigin(window.location.origin)
  }, [])
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
  useEffect(() => {
    repeatRef.current = repeat
  }, [repeat])

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

  const clearUnmuteSettleTimer = useCallback(() => {
    if (unmuteSettleTimerRef.current) {
      clearTimeout(unmuteSettleTimerRef.current)
      unmuteSettleTimerRef.current = null
    }
  }, [])

  // iOS silently pauses (rather than erroring) a cross-origin iframe's
  // unmuted resume when it lacks its own gesture. Recover the same way
  // StageVideo does on an unmuted-continuation rejection: drop back to
  // muted and keep playing, and let `effectiveMuted` (already wired to the
  // `theater-muted-state` broadcast below) tell the chrome so the audio
  // button shows the pulsing-muted affordance again.
  const fallBackToMuted = useCallback(() => {
    unmuteAwaitingConfirmRef.current = false
    clearUnmuteSettleTimer()
    postCommand('mute')
    setEffectiveMuted(true)
    postCommand('playVideo')
  }, [postCommand, clearUnmuteSettleTimer])

  // The single path that ever asks the embed for sound. Never called before
  // a confirmed `playing` state (state 1) for the current item — iOS blocks
  // unmuted playback in a cross-origin iframe that never received its own
  // gesture, so asking before that point is exactly the bug: the player
  // never starts and the stall watchdog skips it. `applyPlayerState` calls
  // this again the moment state 1 arrives if a request is still pending.
  const requestUnmute = useCallback(() => {
    if (!hasPlayedRef.current) {
      pendingUnmuteRef.current = true
      return
    }
    pendingUnmuteRef.current = false
    unmuteAwaitingConfirmRef.current = true
    postCommand('unMute')
    // Optimistic — corrected back to true by `fallBackToMuted()` (or by a
    // later `infoDelivery` `muted` field) if iOS actually rejected it.
    setEffectiveMuted(false)
    clearUnmuteSettleTimer()
    unmuteSettleTimerRef.current = setTimeout(() => {
      // No further state signal at all followed the unMute — a silent
      // stall rather than an explicit pause. Recover the same way.
      if (unmuteAwaitingConfirmRef.current) fallBackToMuted()
    }, UNMUTE_SETTLE_MS)
  }, [postCommand, clearUnmuteSettleTimer, fallBackToMuted])

  // New item: reset per-video state and arm the stall watchdog. Keyed on
  // `videoId` — the iframe itself also carries `key={videoId}` below, so a
  // new video is a fresh element + a fresh handshake, never a stale one.
  useEffect(() => {
    readyRef.current = false
    hasPlayedRef.current = false
    pendingUnmuteRef.current = false
    unmuteAwaitingConfirmRef.current = false
    clearUnmuteSettleTimer()
    setPlaying(false)
    // The embed URL always carries mute=1 regardless of what the shell
    // wants — reflect that actual starting state rather than the shell's
    // desired one, so the audio affordance doesn't flash "unmuted" before
    // any unmute has actually been attempted (let alone confirmed).
    setEffectiveMuted(true)
    clearStallTimer()
    if (!videoId) return
    stallTimerRef.current = setTimeout(() => {
      if (!hasPlayedRef.current) advance()
    }, STALL_TIMEOUT_MS)
    return () => {
      clearStallTimer()
      clearUnmuteSettleTimer()
    }
  }, [videoId, advance, clearStallTimer, clearUnmuteSettleTimer])

  // Reconcile the shell's `muted` signal onto the live player — only on an
  // actual prop transition, same discipline as StageVideo. Muting is always
  // safe immediately; unmuting always funnels through `requestUnmute()`'s
  // confirmed-playing gate. If the handshake hasn't completed yet, `onReady`
  // below applies the latest value instead.
  useEffect(() => {
    if (!readyRef.current) return
    if (muted) {
      pendingUnmuteRef.current = false
      unmuteAwaitingConfirmRef.current = false
      clearUnmuteSettleTimer()
      setEffectiveMuted(true)
      postCommand('mute')
    } else {
      requestUnmute()
    }
  }, [muted, postCommand, requestUnmute, clearUnmuteSettleTimer])

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

      const applyPlayerState = (state: number | null) => {
        if (state === 1) {
          hasPlayedRef.current = true
          clearStallTimer()
          setPlaying(true)
          if (unmuteAwaitingConfirmRef.current) {
            // Kept playing right through the unmute — it took. Stop
            // watching for a rejection.
            unmuteAwaitingConfirmRef.current = false
            clearUnmuteSettleTimer()
          }
          // A confirmed playing state is exactly the signal `requestUnmute`
          // was waiting for — fire the deferred request now.
          if (pendingUnmuteRef.current) requestUnmute()
        } else if (state === 2) {
          setPlaying(false)
          if (unmuteAwaitingConfirmRef.current) {
            // iOS rejected the unmuted resume by silently pausing instead
            // of erroring — fall back to muted so the item keeps playing
            // (and the queue keeps advancing) instead of sitting paused
            // until the stall watchdog eventually skips it outright.
            fallBackToMuted()
          }
        } else if (state === 0) {
          setPlaying(false)
          // shared-post-repeat: stand in for `<video loop>` — the embed has
          // no reliable native loop param on the JS-API path, so an ended
          // state is answered with a seek-and-replay instead of advancing.
          // The stall watchdog and onError (below) are untouched: a Short
          // that never plays, or errors, still advances rather than looping
          // on nothing.
          if (repeatRef.current) {
            postCommand('seekTo', [0, true])
            postCommand('playVideo')
          } else {
            advance()
          }
        }
      }

      switch (data.event) {
        case 'onReady':
          readyRef.current = true
          // The URL already carries mute=1+autoplay=1. If the shell's
          // `muted` had already flipped false before the handshake
          // finished (e.g. the user unmuted on a previous item), do NOT
          // ask for sound yet — `requestUnmute()` just records the desire
          // and defers until a confirmed `playing` state actually arrives
          // (see the state-1 branch above). Asking here, before iOS has
          // seen this iframe play anything, is exactly the bug: an
          // unmuted-autoplay request with no in-iframe gesture gets
          // silently rejected and the player never starts, so the stall
          // watchdog skips a Short that would have played fine muted.
          if (!mutedRef.current) requestUnmute()
          postCommand('playVideo')
          break
        // The raw postMessage protocol streams player state inside
        // `infoDelivery` payloads ({info:{playerState, muted, ...}}) — the
        // discrete `onStateChange` event below is something the official
        // iframe_api SCRIPT synthesizes from these, so a bare-protocol
        // integration that only listens for onStateChange never sees state
        // 1 and the stall watchdog skips a video that is playing fine
        // (bitten on staging, 2026-08-21). Handle both shapes.
        case 'infoDelivery': {
          const info = data.info as { playerState?: unknown; muted?: unknown } | null | undefined
          if (info && typeof info === 'object') {
            if (typeof info.playerState === 'number') applyPlayerState(info.playerState)
            if (typeof info.muted === 'boolean') setEffectiveMuted(info.muted)
          }
          break
        }
        case 'onStateChange':
          applyPlayerState(typeof data.info === 'number' ? data.info : null)
          break
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
  }, [
    postCommand,
    clearStallTimer,
    advance,
    requestUnmute,
    fallBackToMuted,
    clearUnmuteSettleTimer,
  ])

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
      <StageFrame>
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
          {text && <StageHeadline>{text}</StageHeadline>}
          <StageCTA href={href} />
        </div>
      </StageFrame>
    )
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#08070a]">
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
        <div className="relative aspect-[9/16] h-[min(82vh,100%)] max-w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
          {clientOrigin && (
            <iframe
              key={videoId}
              id={playerId}
              ref={iframeRef}
              src={buildEmbedSrc(videoId, clientOrigin)}
              title={text || 'YouTube Short'}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              onLoad={handleLoad}
            />
          )}
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
