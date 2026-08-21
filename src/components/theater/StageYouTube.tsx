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
import { Play } from 'lucide-react'
import { PlatformChip } from '@/components/matter'
import { isValidVideoId, youtubeEmbedUrl } from '@/lib/media/youtube'
import { previewPath } from '@/lib/activity/preview-path'
import { StageFrame, StageHeadline, StageCTA } from './stage-primitives'
import type { TheaterItem } from './types'

/**
 * Round-2 diagnostic breadcrumb (owner re-tested on iPhone after round 1 and
 * YouTube Shorts still never started, even though `buildEmbedSrc` already
 * carries `autoplay=1&mute=1&playsinline=1` and `onReady` sends `playVideo`
 * — i.e. iOS appears not to honor the URL-level params reliably in this
 * embed, so the fix below stops trusting them and drives startup entirely
 * through explicit postMessage commands instead). Gate behind `?ytdebug=1`
 * so production stays quiet; the owner can flip it on from their phone
 * (append `?ytdebug=1` to the theater URL) if a further round is needed.
 */
function isYtDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('ytdebug') === '1'
  } catch {
    return false
  }
}

function logStage(...args: unknown[]) {
  if (!isYtDebugEnabled()) return
  // eslint-disable-next-line no-console
  console.debug('[stage-yt]', ...args)
}

/** The embed's own origin — every inbound message is filtered to this, and
 * every outbound command is targeted at it. */
const YT_ORIGIN = 'https://www.youtube-nocookie.com'

/** If the player never reports a first `playing` state within this window
 * (dead/region-blocked/embedding-disabled Short that still loads an iframe),
 * treat it exactly like `onError` and advance rather than stalling the queue. */
const STALL_TIMEOUT_MS = 8_000

/**
 * Round 3/4 history — there is deliberately NO time-based "did the unmute
 * take" fallback anymore, for either the user-gesture or the automatic
 * catch-up unmute:
 *
 * Round 3 bug: a SUCCESSFUL unmute normally produces no further state
 * signal at all — the player just keeps playing at state 1 — so a 1.5s
 * "no signal yet = rejected" timer, armed after every unmute request,
 * treated silence as failure and re-muted a perfectly working unmute on a
 * loop (owner on-device report: tap → sound → 1.5s → muted again,
 * repeatedly). Round 3 first fixed this only for the user-gesture path
 * (trust the gesture, no timer) while keeping the timer for the automatic
 * catch-up unmute, reasoning a silent iOS rejection was more plausible
 * there with no gesture behind it.
 *
 * Round 4: the owner then reproduced the SAME loop on DESKTOP, where iOS's
 * cross-origin-gesture policy doesn't even apply — proving the timer was
 * never a reliable signal for EITHER path (a "successful, no signal" unmute
 * and a "silently rejected" unmute are indistinguishable by silence alone,
 * regardless of platform). The timer is removed entirely. The only signal
 * that ever reverts an unmute now is a real OBSERVED pause (`onStateChange`/
 * `infoDelivery` reporting state 2) with no corresponding user action — see
 * `applyPlayerState`'s state-2 branch, which calls `fallBackToMuted()`
 * regardless of `source`. An `infoDelivery` payload's `muted:false` (or
 * `volume>0`) is still treated as immediate positive confirmation the
 * instant it arrives — not because a timer needs disarming anymore, but so
 * a LATER, unrelated pause (e.g. the user's own pause button) is never
 * misattributed as this unmute having been rejected.
 */

/**
 * Round 2: never trust the embed URL's own `autoplay=1&mute=1` params on
 * iOS — send `mute` then `playVideo` explicitly ourselves, both on the load
 * handshake (before `onReady`, as a defensive early nudge) and on `onReady`
 * itself, and keep re-sending on this ladder while the player has never
 * reached state 1. Cleared the moment state 1 arrives (or on unmount/id
 * change) — see `scheduleStartupRetries`.
 */
const STARTUP_RETRY_DELAYS_MS = [1_000, 2_500, 5_000]

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
  // Which kind of request is pending — preserved across the defer so the
  // deferred fire still gets the right fallback treatment (see
  // `requestUnmute`'s `source` param).
  const pendingUnmuteSourceRef = useRef<'user' | 'catchup'>('catchup')
  // An `unMute` command is in flight. Cleared by real evidence only — an
  // `infoDelivery` muted:false/volume>0 confirmation, or state 1 (kept
  // playing right through it) — never by a timer (round 4: see the history
  // note above `requestUnmute`). Only an OBSERVED pause (state 2) while
  // this is true is treated as a rejection.
  const unmuteAwaitingConfirmRef = useRef(false)
  // Round 2: the bounded mute+playVideo retry ladder, live only until the
  // player confirms state 1.
  const startupRetryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const mutedRef = useRef(muted)
  const onEndedRef = useRef(onEnded)
  const onRequestUnmuteRef = useRef(onRequestUnmute)
  const repeatRef = useRef(repeat)
  // Defense-in-depth for `armStallTimer`'s fired callback (see its own
  // comment): the latest `videoId`, so a stall timer can refuse to act if
  // it somehow fires after the displayed item has already moved on.
  const currentVideoIdRef = useRef(videoId)
  const [playing, setPlaying] = useState(false)
  const [effectiveMuted, setEffectiveMuted] = useState(muted)
  const [clientOrigin, setClientOrigin] = useState<string | null>(null)
  // Round 2: a pinned shared/collection post (`repeat`) whose stall
  // watchdog fired with the player never having started. The live queue's
  // watchdog still advances past a dead Short (unchanged) — but a pinned
  // post has nowhere to advance TO without abandoning the pin, so this
  // shows a tap-to-play overlay instead. The tap forces a full iframe
  // reload inside the user's own gesture (`reloadNonce`), which iOS honors
  // far more reliably than a postMessage command sent to a frame that never
  // got its own gesture.
  const [neverStarted, setNeverStarted] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)

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
    currentVideoIdRef.current = videoId
  }, [videoId])
  useEffect(() => {
    repeatRef.current = repeat
  }, [repeat])

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current)
      stallTimerRef.current = null
    }
  }, [])

  const clearStartupRetryTimers = useCallback(() => {
    startupRetryTimersRef.current.forEach(clearTimeout)
    startupRetryTimersRef.current = []
  }, [])

  // The single advance path: `onEnded`, `onError`, and the stall watchdog
  // (live-queue case) all funnel through here, exactly matching StageVideo's
  // one-caller discipline for its own advance signal.
  const advance = useCallback(() => {
    clearStallTimer()
    clearStartupRetryTimers()
    onEndedRef.current?.()
  }, [clearStallTimer, clearStartupRetryTimers])

  const postCommand = useCallback((func: string, args: unknown[] = []) => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.postMessage(JSON.stringify({ event: 'command', func, args }), YT_ORIGIN)
  }, [])

  // Round 2: never trust the embed URL's `autoplay=1&mute=1` params alone —
  // drive startup explicitly, mute BEFORE play every time. Used by the load
  // handshake (defensive early nudge), `onReady`, and each startup retry
  // rung.
  const sendMuteAndPlay = useCallback(
    (tag: string) => {
      logStage(tag, '-> mute, playVideo')
      postCommand('mute')
      postCommand('playVideo')
    },
    [postCommand],
  )

  const scheduleStartupRetries = useCallback(() => {
    clearStartupRetryTimers()
    STARTUP_RETRY_DELAYS_MS.forEach((delay, idx) => {
      const timer = setTimeout(() => {
        if (hasPlayedRef.current) return
        logStage(
          `startup retry rung ${idx + 1}/${STARTUP_RETRY_DELAYS_MS.length} fired (never reached state 1 yet)`,
        )
        sendMuteAndPlay(`startup-retry-${idx + 1}`)
      }, delay)
      startupRetryTimersRef.current.push(timer)
    })
  }, [clearStartupRetryTimers, sendMuteAndPlay])

  // The "never actually started" watchdog. In the live queue (no `repeat`),
  // a dead/region-blocked Short is skipped exactly as before. A PINNED
  // shared/collection post (`repeat`) has nowhere to advance to without
  // abandoning the pin, so it shows a tap-to-play overlay instead — see
  // `neverStarted` above.
  //
  // `forVideoId` is captured explicitly (not read from the `videoId` in
  // render scope) because this callback is memoized once and reused across
  // renders — closing over `videoId` directly would freeze it at whichever
  // render first created the callback. The fired timer then checks
  // `forVideoId` against `currentVideoIdRef` (kept fresh below) before doing
  // anything: under normal React reconciliation this is always true (a
  // manual advance to a different item either unmounts this component
  // entirely — different platform/type — or, for a same-platform swap,
  // this same effect's cleanup already clears the old timer before the new
  // one is armed; both paths are covered by regression tests). This check
  // is a second, independent guard against a leaked timer ever mis-firing
  // an advance into whatever item happens to be current when it goes off —
  // defense in depth for a reported (but not reproduced) live-theater
  // double-advance, not a fix for a confirmed leak.
  const armStallTimer = useCallback(
    (forVideoId: string | null) => {
      clearStallTimer()
      stallTimerRef.current = setTimeout(() => {
        if (forVideoId !== currentVideoIdRef.current) return
        if (hasPlayedRef.current) return
        if (repeatRef.current) {
          logStage('stall: pinned/repeat item never started — showing tap-to-play overlay')
          clearStartupRetryTimers()
          setNeverStarted(true)
          return
        }
        logStage('stall: item never started — advancing (live queue)')
        advance()
      }, STALL_TIMEOUT_MS)
    },
    [clearStallTimer, clearStartupRetryTimers, advance],
  )

  // iOS silently pauses (rather than erroring) a cross-origin iframe's
  // unmuted resume when it lacks its own gesture. Recover the same way
  // StageVideo does on an unmuted-continuation rejection: drop back to
  // muted and keep playing, and let `effectiveMuted` (already wired to the
  // `theater-muted-state` broadcast below) tell the chrome so the audio
  // button shows the pulsing-muted affordance again.
  const fallBackToMuted = useCallback(() => {
    unmuteAwaitingConfirmRef.current = false
    postCommand('mute')
    setEffectiveMuted(true)
    postCommand('playVideo')
  }, [postCommand])

  // The single path that ever asks the embed for sound. Never called before
  // a confirmed `playing` state (state 1) for the current item — iOS blocks
  // unmuted playback in a cross-origin iframe that never received its own
  // gesture, so asking before that point is exactly the bug: the player
  // never starts and the stall watchdog skips it. `applyPlayerState` calls
  // this again the moment state 1 arrives if a request is still pending.
  //
  // `source` no longer changes behavior (round 4 — see the history note
  // above) — kept purely so `?ytdebug=1` logs show WHY an unmute was
  // requested (a real audio-button tap vs. the shell arriving
  // already-unmuted from a previous item), which is useful context if a
  // future report needs it. Both paths are trusted identically: only an
  // OBSERVED pause (state 2, in `applyPlayerState`) ever reverts either
  // one.
  const requestUnmute = useCallback(
    (source: 'user' | 'catchup') => {
      if (!hasPlayedRef.current) {
        pendingUnmuteRef.current = true
        pendingUnmuteSourceRef.current = source
        return
      }
      pendingUnmuteRef.current = false
      unmuteAwaitingConfirmRef.current = true
      logStage(`requestUnmute(${source}) -> unMute`)
      postCommand('unMute')
      // Optimistic — corrected back to true by `fallBackToMuted()` only on
      // a real observed pause (state 2), or reinforced by a later
      // `infoDelivery` `muted`/`volume` field confirming it took.
      setEffectiveMuted(false)
    },
    [postCommand],
  )

  // New item: reset per-video state and arm the stall watchdog. Keyed on
  // `videoId` — the iframe itself also carries `key={videoId}` below, so a
  // new video is a fresh element + a fresh handshake, never a stale one.
  // `reloadNonce` is intentionally NOT a dependency — the tap-to-play
  // handler below does its own equivalent reset before bumping it, so this
  // effect re-running on the same `videoId` isn't needed for that path.
  useEffect(() => {
    readyRef.current = false
    hasPlayedRef.current = false
    pendingUnmuteRef.current = false
    pendingUnmuteSourceRef.current = 'catchup'
    unmuteAwaitingConfirmRef.current = false
    clearStartupRetryTimers()
    setPlaying(false)
    setNeverStarted(false)
    // The embed URL always carries mute=1 regardless of what the shell
    // wants — reflect that actual starting state rather than the shell's
    // desired one, so the audio affordance doesn't flash "unmuted" before
    // any unmute has actually been attempted (let alone confirmed).
    setEffectiveMuted(true)
    if (!videoId) return
    armStallTimer(videoId)
    return () => {
      clearStallTimer()
      clearStartupRetryTimers()
    }
  }, [videoId, armStallTimer, clearStallTimer, clearStartupRetryTimers])

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
      setEffectiveMuted(true)
      postCommand('mute')
    } else {
      // A prop transition to unmuted is always a deliberate user gesture
      // (the audio-button tap flips the shell's `muted`, which flows down
      // here) — never the automatic catch-up path (that one only ever
      // fires from `onReady`/`applyPlayerState` below, not from a `muted`
      // prop CHANGE, since the prop doesn't change on catch-up — it arrives
      // already-false).
      requestUnmute('user')
    }
  }, [muted, postCommand, requestUnmute])

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
      logStage('message', data.event, data.info)

      const applyPlayerState = (state: number | null) => {
        if (state === 1) {
          hasPlayedRef.current = true
          clearStallTimer()
          clearStartupRetryTimers()
          setPlaying(true)
          if (unmuteAwaitingConfirmRef.current) {
            // Kept playing right through the unmute — it took. Stop
            // watching for a rejection.
            unmuteAwaitingConfirmRef.current = false
          }
          // A confirmed playing state is exactly the signal `requestUnmute`
          // was waiting for — fire the deferred request now, preserving
          // whichever `source` it was originally requested with.
          if (pendingUnmuteRef.current) requestUnmute(pendingUnmuteSourceRef.current)
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
          // Round 2: never trust the embed URL's own `autoplay=1&mute=1`
          // params — iOS appears not to honor them reliably in this embed
          // (owner re-test: still never started even with them set and a
          // bare `playVideo` sent here). Drive startup explicitly instead:
          // mute BEFORE play, then keep re-sending on a bounded ladder
          // until state 1 is confirmed (cleared above the moment it is).
          sendMuteAndPlay('onReady')
          scheduleStartupRetries()
          // If the shell's `muted` had already flipped false before the
          // handshake finished (e.g. the user unmuted on a previous item),
          // do NOT ask for sound yet — `requestUnmute()` just records the
          // desire and defers until a confirmed `playing` state actually
          // arrives (see the state-1 branch above). Asking here, before iOS
          // has seen this iframe play anything, is exactly round 1's bug:
          // an unmuted-autoplay request with no in-iframe gesture gets
          // silently rejected and the player never starts. This is the
          // 'catchup' case — no gesture backs it, so a silent rejection
          // (round 2) is plausible; see `requestUnmute`'s comment for how
          // that differs from a user-gesture unmute (round 3).
          if (!mutedRef.current) requestUnmute('catchup')
          break
        // The raw postMessage protocol streams player state inside
        // `infoDelivery` payloads ({info:{playerState, muted, ...}}) — the
        // discrete `onStateChange` event below is something the official
        // iframe_api SCRIPT synthesizes from these, so a bare-protocol
        // integration that only listens for onStateChange never sees state
        // 1 and the stall watchdog skips a video that is playing fine
        // (bitten on staging, 2026-08-21). Handle both shapes.
        case 'infoDelivery': {
          const info = data.info as
            { playerState?: unknown; muted?: unknown; volume?: unknown } | null | undefined
          if (info && typeof info === 'object') {
            if (typeof info.playerState === 'number') applyPlayerState(info.playerState)
            if (typeof info.muted === 'boolean') {
              setEffectiveMuted(info.muted)
              // Real evidence, checked as soon as it arrives: a heartbeat
              // reporting `muted:false` while we're watching an unmute
              // request is the player itself confirming it took. Not a
              // timer-disarm anymore (round 4 removed the timer) — this
              // stops a LATER, unrelated pause from being misattributed as
              // THIS unmute having been rejected.
              if (unmuteAwaitingConfirmRef.current && info.muted === false) {
                logStage('infoDelivery confirms unmute (muted:false) — clearing pending')
                unmuteAwaitingConfirmRef.current = false
              }
            } else if (
              unmuteAwaitingConfirmRef.current &&
              typeof info.volume === 'number' &&
              info.volume > 0
            ) {
              logStage('infoDelivery confirms unmute (volume>0) — clearing pending')
              unmuteAwaitingConfirmRef.current = false
            }
          }
          break
        }
        case 'onStateChange':
          applyPlayerState(typeof data.info === 'number' ? data.info : null)
          break
        case 'onError':
          // 101/150 = embedding disabled by the uploader; other codes cover
          // invalid/removed/private videos. None of them are recoverable
          // from here — skip rather than stall the queue (unchanged by
          // round 2 — only the "never started" watchdog case grew a
          // pinned-post exception, see `armStallTimer`).
          logStage('onError', data.info)
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
    sendMuteAndPlay,
    scheduleStartupRetries,
    clearStartupRetryTimers,
    clearStallTimer,
    advance,
    requestUnmute,
    fallBackToMuted,
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
    logStage('iframe onLoad — listening handshake + defensive mute/play nudge')
    win.postMessage(JSON.stringify({ event: 'listening', id: playerId }), YT_ORIGIN)
    // Round 2: a defensive early nudge, before `onReady` even confirms the
    // player is listening — harmless if ignored (the player isn't ready
    // yet), but on iOS a command sent this early sometimes lands before the
    // URL-level `autoplay=1` params get a chance to be silently dropped.
    sendMuteAndPlay('onLoad-defensive')
  }

  // Round 2: the pinned tap-to-play recovery. A real tap inside our own
  // page is a genuine user gesture — reloading the iframe's `src` inside
  // that gesture (via `reloadNonce`, forcing a full remount even though
  // `videoId` is unchanged) is far more reliably honored by iOS than any
  // postMessage command sent to a cross-origin frame that never got its own
  // gesture. Resets exactly what a fresh mount resets; `onLoad`/`onReady`
  // on the new iframe drive the rest (mute-first nudge, retry ladder,
  // stall watchdog) normally.
  function handleTapToPlay() {
    readyRef.current = false
    hasPlayedRef.current = false
    pendingUnmuteRef.current = false
    unmuteAwaitingConfirmRef.current = false
    clearStartupRetryTimers()
    setPlaying(false)
    setEffectiveMuted(true)
    setNeverStarted(false)
    logStage('tap-to-play: reloading the iframe fresh inside a user gesture')
    setReloadNonce((n) => n + 1)
    armStallTimer(videoId)
  }

  if (neverStarted) {
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
        <div className="relative flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={handleTapToPlay}
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md"
            aria-label="Play video"
          >
            <Play size={26} fill="currentColor" />
          </button>
          <StageCTA href={href} />
        </div>
      </StageFrame>
    )
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
              key={`${videoId}-${reloadNonce}`}
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
