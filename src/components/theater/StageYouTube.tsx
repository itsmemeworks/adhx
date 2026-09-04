'use client'

/**
 * Official youtube-nocookie iframe (spec §3/§6), driven by the *raw* YouTube
 * IFrame postMessage protocol — not the `iframe_api` script, which
 * `script-src 'self' 'unsafe-inline'` (no external scripts) can't load. The
 * embed itself implements the protocol regardless of whether the controlling
 * page loaded the JS wrapper, so a bare `postMessage`/`message` exchange is
 * enough:
 *
 *   parent  -> iframe   {event:'listening', id, channel:'widget'} (handshake, on iframe load)
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
 * `progressKindFor()` (`TheaterProgressLine.tsx`) maps YouTube to the same
 * `'video'` kind as twitter/tiktok/instagram so the dock/peek-bar pause+audio
 * buttons render at all — they're gated on that kind in
 * `TheaterDesktopChrome`/`TheaterMobileChrome`. Round 5: the shared top
 * progress LINE now fills for YouTube too — `infoDelivery`'s (undocumented,
 * but observed reliable) `currentTime`/`duration` fields feed the same
 * `theater-video-progress` window event StageVideo dispatches on
 * `timeupdate`, so `TheaterProgressLine`'s 'video'-kind listener can't tell
 * the two apart.
 *
 * Round 9 (owner: bar still dead on autoplay until a click inside the
 * iframe — desktop and iOS). YouTube often streams `playerState` without
 * `currentTime` until the embed itself has a gesture; re-sending `listening`
 * (round 8) does not wake that reporter. When we have a duration we clock
 * the bar from play-start (or the last real time), snap whenever a real
 * `currentTime` / `mediaReferenceTime` arrives, and while starved also
 * pull `getCurrentTime`/`getDuration`. Interpolated times are display-only
 * — they never feed the catch-up unmute evidence path.
 *
 * Round 6 (owner on-device report: audio icon needed two presses to unmute):
 * `infoDelivery`'s `muted` field can be STALE — a heartbeat reflecting the
 * state from before our most recent `mute`/`unMute` command routinely lands
 * right after we send it. `lastCommandedMutedRef` gates this: a heartbeat is
 * only trusted when it agrees with what we last commanded; a contradicting
 * one is logged (`?ytdebug=1`) and ignored rather than flipping the
 * dock/peek-bar audio icon back for one render.
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
import { Play, Volume2 } from 'lucide-react'
import { PlatformChip } from '@/components/matter'
import { isValidVideoId, youtubeEmbedUrl } from '@/lib/media/youtube'
import { previewPath } from '@/lib/activity/preview-path'
import { StageFrame, StageHeadline, StageCTA } from './stage-primitives'
import { logStage, logStageVerbose } from './YtDebugOverlay'
import type { TheaterItem } from './types'
import {
  dispatchTheaterStageTap,
  dispatchTheaterUserPlaybackState,
  THEATER_SEEK,
  type TheaterSeekDetail,
} from './useTheaterStageEvents'

/** The embed's own origin — every inbound message is filtered to this, and
 * every outbound command is targeted at it. */
const YT_ORIGIN = 'https://www.youtube-nocookie.com'

/** If the player never reports a first `playing` state within this window
 * (dead/region-blocked/embedding-disabled Short that still loads an iframe),
 * treat it exactly like `onError` and advance rather than stalling the queue. */
const STALL_TIMEOUT_MS = 8_000

/** Round 6 (`?ytdebug=1` overlay): human-readable labels for the IFrame
 * protocol's numeric player states, so the on-screen ring buffer reads as
 * "state -> playing (1)" instead of a bare number. */
const YT_PLAYER_STATE_LABELS: Record<number, string> = {
  '-1': 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued',
}

function describeYtPlayerState(state: number): string {
  return `${YT_PLAYER_STATE_LABELS[state] ?? 'unknown'} (${state})`
}

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
 * Round 7 — the "almost always needs two taps" report, decoded from an
 * on-device `?ytdebug=1` screenshot (iOS Chrome): the FULL trace was
 * `state playing(1) -> requestUnmute(catchup) -> unMute -> infoDelivery
 * confirms unmute (muted:false) -> state paused(2)`, all within ~1s. Muted
 * autoplay was never the problem — the CATCH-UP unmute (no gesture behind
 * it) gets genuinely APPLIED by the player (the `muted:false` heartbeat is
 * real), and iOS then enforces its no-gesture-audio policy by PAUSING the
 * now-unmuted video moments later. Because round 4/6's logic treated that
 * `muted:false` confirmation as final proof and cleared
 * `unmuteAwaitingConfirmRef` immediately, the SUBSEQUENT state-2 arrived
 * with nothing armed to attribute it to — an ordinary pause, forever, with
 * a stale play overlay. This explains the "almost always"/flaky reports: a
 * session that reaches a YouTube item already wanting sound (carried over
 * from a previous unmuted item) hits this; a fresh muted session doesn't.
 *
 * Fix: `unmuteConfirmSourceRef` tracks which kind of request is in flight.
 * `user`-sourced unmutes (a real gesture — iOS doesn't police those) keep
 * round 4/6's behavior verbatim. `catchup`-sourced unmutes now need
 * SUSTAINED evidence: neither the `muted:false`/`volume>0` confirmation nor
 * a bare state-1 heartbeat clears the pending confirmation on their own —
 * only `infoDelivery`'s `currentTime` advancing >~1.5s past the value
 * recorded at the moment the catchup `unMute` was sent
 * (`catchupUnmuteBaselineTimeRef`, seeded from `lastKnownCurrentTimeRef`)
 * does. Payload-derived progress, not a wall-clock timer — consistent with
 * round 4's "no timers" lesson. If iOS's enforcement pause lands inside that
 * window (as the trace showed), it's now correctly seen as still-armed and
 * falls back to muted + `playVideo` — the video resumes muted, the audio
 * button pulses, and the user's own tap (through the synchronous
 * `theater-set-muted` gesture path elsewhere in this file) unmutes for real
 * and sticks.
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

/** Round 9 progress tick (see `lastTimeSignalAtRef`): interpolate the clay
 * bar while playing, and how long without a time-bearing payload counts as
 * starved (then pull listening + getCurrentTime + getDuration). A healthy
 * desktop heartbeat stream never trips the pull. */
const PROGRESS_TICK_MS = 250
const PROGRESS_STARVED_MS = 1_500
const SEEK_CONFIRM_TOLERANCE_SECONDS = 0.75
const SEEK_CONFIRM_TIMEOUT_MS = 2_500
const SEEK_CONFIRM_MAX_MISSES = 4

interface PendingSeek {
  target: number
  direction: -1 | 0 | 1
  requestedAt: number
  misses: number
}

/** Playback seconds from a YT info payload. iOS/desktop often omit
 * `currentTime` until an in-iframe gesture but still send
 * `mediaReferenceTime`. */
export function readYtCurrentTime(info: Record<string, unknown>): number | null {
  if (typeof info.currentTime === 'number' && Number.isFinite(info.currentTime)) {
    return info.currentTime
  }
  if (typeof info.mediaReferenceTime === 'number' && Number.isFinite(info.mediaReferenceTime)) {
    return info.mediaReferenceTime
  }
  return null
}

export function readYtDuration(info: Record<string, unknown>): number | null {
  if (typeof info.duration === 'number' && Number.isFinite(info.duration) && info.duration > 0) {
    return info.duration
  }
  return null
}

function listeningMessage(playerId: string): string {
  return JSON.stringify({ event: 'listening', id: playerId, channel: 'widget' })
}

export interface StageYouTubeProps {
  item: TheaterItem
  /** Muted until the user's first gesture (autoplay policy) — the same
   * shell-owned signal StageVideo/StageInstagram receive. */
  muted: boolean
  /** The dock/peek-bar audio button asked to unmute — tells the shell so
   * `muted` (and the next item's initial signal) follows. */
  onRequestUnmute: () => void
  /** Ended, errored, or stalled — the same advance path StageVideo's
   * `onEnded` drives. The personal theater's Collection tab now wires this through to pure
   * queue navigation ("Saved is just a different playlist in that
   * same theater" — Done/Later/Delete still decide read state, finishing
   * playback just moves along). Omit to disable auto-advance entirely —
   * every internal advance path is a no-op without it. */
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
  /** Pause the iframe player while an opaque Theater overlay covers it. */
  covered?: boolean
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

export function StageYouTube({
  item,
  muted,
  onRequestUnmute,
  onEnded,
  repeat,
  covered = false,
}: StageYouTubeProps) {
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
  // An `unMute` command is in flight. Never cleared by a timer (round 4: see
  // the history note above `requestUnmute`) — only by real evidence, and
  // WHICH evidence counts depends on `unmuteConfirmSourceRef` (round 7, see
  // its own comment): a `user`-sourced unmute clears on an `infoDelivery`
  // muted:false/volume>0 confirmation or state 1 (kept playing right through
  // it) — a real gesture, so iOS doesn't police it. A `catchup`-sourced
  // unmute needs MORE: iOS's own enforcement pattern here is
  // confirm-then-pause (a device trace showed `infoDelivery` reporting
  // muted:false, immediately followed by state 2) — so neither the
  // muted:false/volume confirmation NOR a bare state-1 heartbeat clears a
  // catchup await; only sustained playback progress does (see
  // `catchupUnmuteBaselineTimeRef`). Whatever the source, an OBSERVED pause
  // (state 2) while this is still true is treated as a rejection.
  const unmuteAwaitingConfirmRef = useRef(false)
  // Which `requestUnmute` call this pending confirmation belongs to — set at
  // the top of `requestUnmute` itself, read by `applyPlayerState` and the
  // `infoDelivery` handler to decide which clearing rule applies (see
  // `unmuteAwaitingConfirmRef`'s comment above).
  const unmuteConfirmSourceRef = useRef<'user' | 'catchup'>('catchup')
  // Round 7 (owner on-device `?ytdebug=1` trace, iOS Chrome): a catchup
  // (gesture-less) unmute on iOS gets APPLIED — `infoDelivery` reports
  // muted:false — and then iOS pauses the now-unmuted-without-a-gesture
  // video moments later, all within ~1s. The muted:false confirmation is
  // therefore NOT proof the unmute stuck; only proof iOS *saw* it before
  // deciding whether to police it. The real signal is currentTime
  // continuing to advance well past that point. Set once, at the moment
  // `requestUnmute('catchup')` sends the command (the "value at unmute
  // time"), from `lastKnownCurrentTimeRef`; cleared (`null`) once sustained
  // progress clears the pending confirmation, or on any new item.
  const catchupUnmuteBaselineTimeRef = useRef<number | null>(null)
  // The most recent `currentTime` reported by any `infoDelivery` heartbeat —
  // payload-derived, not a wall-clock reading, per the standing
  // evidence-only/no-timers discipline. Used only to seed
  // `catchupUnmuteBaselineTimeRef` at the moment a catchup unmute is
  // requested.
  const lastKnownCurrentTimeRef = useRef<number | null>(null)
  // Round 8 (owner on-device report: the clay progress bar never fills on a
  // plain autoplay — it only appears after tapping the video itself, e.g. a
  // double-tap seek): on iOS the embed can stream `infoDelivery` heartbeats
  // that carry `playerState` (playback tracking works, ended auto-advance
  // works) WITHOUT ever including `currentTime`/`duration` until an
  // in-iframe gesture wakes YouTube's own progress reporter. The raw
  // protocol has a pull path though: re-sending the `listening` handshake
  // makes the player answer with an `initialDelivery` snapshot of its full
  // state (the same mechanism the official iframe_api script uses at boot,
  // where it retries `listening` on an interval until it hears back). So:
  // while state 1 is confirmed AND no time-bearing payload has arrived
  // recently (this ref, wall-clock of the last one), poll `listening` and
  // parse `initialDelivery` through the same handler as `infoDelivery`. On
  // desktop (heartbeats flow normally) the starvation window never opens and
  // no extra message is ever sent. This is a data poll, not a
  // state-attribution timer — the round-4 "no timers" rule (about *judging
  // unmute success* by wall-clock silence) is untouched.
  const lastTimeSignalAtRef = useRef(0)
  // Round 9: last duration / playbackRate from any payload, plus a wall-clock
  // origin used to interpolate the clay bar when YouTube starves currentTime.
  // `progressOriginMsRef` is null while paused (originTime is frozen).
  const lastKnownDurationRef = useRef<number | null>(null)
  const lastKnownRateRef = useRef(1)
  const progressOriginTimeRef = useRef<number | null>(null)
  const progressOriginMsRef = useRef<number | null>(null)
  // YouTube can deliver a heartbeat queued before a seek command. Keep the
  // desired target authoritative until a payload confirms the player reached
  // it, otherwise that stale heartbeat visibly snaps the timeline backward.
  const pendingSeekRef = useRef<PendingSeek | null>(null)
  // Round 6: what we last explicitly told the player to be (via `mute`/
  // `unMute`) — the mute-state counterpart of `hasPlayedRef`'s "only trust
  // evidence" discipline. `infoDelivery` streams frequently enough that a
  // heartbeat reporting the OPPOSITE of our most recent command routinely
  // arrives just after we send it — a message the player queued/sent
  // *before* processing our command, not evidence the command failed (a
  // real rejection is signalled only by an OBSERVED pause — see
  // `applyPlayerState`'s state-2 branch). Without this guard, that stale
  // echo overwrites `effectiveMuted` back to the pre-command value for one
  // render, which the dock/peek-bar audio icon shows as the tap having
  // "failed" — reported on-device as needing two presses to unmute.
  const lastCommandedMutedRef = useRef(muted)
  // Round 2: the bounded mute+playVideo retry ladder, live only until the
  // player confirms state 1.
  const startupRetryTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const mutedRef = useRef(muted)
  const onEndedRef = useRef(onEnded)
  const onRequestUnmuteRef = useRef(onRequestUnmute)
  const repeatRef = useRef(repeat)
  const coveredRef = useRef(covered)
  const playingRef = useRef(false)
  const shouldPlayRef = useRef(true)
  const pausedByCoverRef = useRef(false)
  const pendingAdvanceRef = useRef(false)
  const pendingReplayRef = useRef(false)
  coveredRef.current = covered
  // Defense-in-depth for `armStallTimer`'s fired callback (see its own
  // comment): the latest `videoId`, so a stall timer can refuse to act if
  // it somehow fires after the displayed item has already moved on.
  const currentVideoIdRef = useRef(videoId)
  // Round 6 (`?ytdebug=1` overlay): the last playerState value actually
  // logged, so `applyPlayerState` can surface every genuine transition on
  // the on-screen ring buffer without also logging the SAME state on every
  // repeated `infoDelivery` heartbeat while it holds steady (e.g. dozens of
  // `playerState: 1` reports a second while a video just plays normally).
  const lastLoggedStateRef = useRef<number | null>(null)
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
    if (coveredRef.current) {
      pendingAdvanceRef.current = true
      return
    }
    pendingAdvanceRef.current = false
    clearStallTimer()
    clearStartupRetryTimers()
    onEndedRef.current?.()
  }, [clearStallTimer, clearStartupRetryTimers])

  const postCommand = useCallback((func: string, args: unknown[] = []) => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.postMessage(JSON.stringify({ event: 'command', func, args }), YT_ORIGIN)
  }, [])

  const estimatePlaybackSeconds = useCallback((): number | null => {
    const originTime = progressOriginTimeRef.current
    if (originTime == null) return lastKnownCurrentTimeRef.current
    const originMs = progressOriginMsRef.current
    if (originMs == null) return originTime
    return originTime + ((Date.now() - originMs) / 1000) * lastKnownRateRef.current
  }, [])

  const publishEstimatedProgress = useCallback(() => {
    const duration = lastKnownDurationRef.current
    if (duration == null || duration <= 0) return
    const t = estimatePlaybackSeconds()
    if (t == null) return
    window.dispatchEvent(
      new CustomEvent('theater-video-progress', {
        detail: { progress: t / duration, duration },
      }),
    )
  }, [estimatePlaybackSeconds])

  const startProgressClock = useCallback((time: number) => {
    progressOriginTimeRef.current = time
    progressOriginMsRef.current = Date.now()
  }, [])

  const freezeProgressClock = useCallback(() => {
    const t = estimatePlaybackSeconds()
    if (t != null) progressOriginTimeRef.current = t
    progressOriginMsRef.current = null
  }, [estimatePlaybackSeconds])

  // Mirror native-video scrubbing through YouTube's command protocol. The
  // progress line only becomes seekable after the player has reported a
  // duration, so a missing duration is a safe no-op during startup.
  useEffect(() => {
    const handleSeek = (event: Event) => {
      const detail = (event as CustomEvent<TheaterSeekDetail>).detail
      const duration = lastKnownDurationRef.current
      if (
        coveredRef.current ||
        !detail ||
        !Number.isFinite(detail.progress) ||
        duration == null ||
        duration <= 0
      ) {
        return
      }
      const progress = Math.min(1, Math.max(0, detail.progress))
      const seconds = progress * duration
      const from = estimatePlaybackSeconds() ?? lastKnownCurrentTimeRef.current ?? seconds
      pendingSeekRef.current = {
        target: seconds,
        direction: Math.sign(seconds - from) as -1 | 0 | 1,
        requestedAt: Date.now(),
        misses: 0,
      }
      lastKnownCurrentTimeRef.current = seconds
      if (playing) {
        startProgressClock(seconds)
      } else {
        progressOriginTimeRef.current = seconds
        progressOriginMsRef.current = null
      }
      postCommand('seekTo', [seconds, true])
      window.dispatchEvent(
        new CustomEvent('theater-video-progress', { detail: { progress, duration } }),
      )
    }
    window.addEventListener(THEATER_SEEK, handleSeek)
    return () => window.removeEventListener(THEATER_SEEK, handleSeek)
  }, [estimatePlaybackSeconds, playing, postCommand, startProgressClock])

  // Round 2: never trust the embed URL's `autoplay=1&mute=1` params alone —
  // drive startup explicitly, mute BEFORE play every time. Used by the load
  // handshake (defensive early nudge), `onReady`, and each startup retry
  // rung.
  const sendMuteAndPlay = useCallback(
    (tag: string) => {
      if (coveredRef.current || !shouldPlayRef.current) {
        if (coveredRef.current) pausedByCoverRef.current = shouldPlayRef.current
        lastCommandedMutedRef.current = true
        postCommand('mute')
        postCommand('pauseVideo')
        return
      }
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
        if (coveredRef.current) return
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
    logStage(
      'observed pause while awaiting unmute confirmation -> attributed as rejection, falling back to muted',
    )
    unmuteAwaitingConfirmRef.current = false
    catchupUnmuteBaselineTimeRef.current = null
    lastCommandedMutedRef.current = true
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
  // `source` DOES change behavior again as of round 7 (reversing round 4's
  // "no longer changes behavior" — see `unmuteAwaitingConfirmRef`'s comment
  // for the full mechanism): a `user` tap is a real gesture iOS doesn't
  // police, so it keeps round 4/6's immediate-evidence clearing. A `catchup`
  // request has no gesture behind it, and a device trace showed iOS applying
  // it and THEN pausing moments later — so it needs sustained playback
  // progress, not just a confirmation echo, before we stop watching for that
  // pause. Both still only ever REVERT on an OBSERVED pause (state 2, in
  // `applyPlayerState`) — never a timer.
  const requestUnmute = useCallback(
    (source: 'user' | 'catchup') => {
      if (coveredRef.current) {
        pendingUnmuteRef.current = true
        pendingUnmuteSourceRef.current = source
        return
      }
      if (!hasPlayedRef.current) {
        pendingUnmuteRef.current = true
        pendingUnmuteSourceRef.current = source
        return
      }
      pendingUnmuteRef.current = false
      unmuteAwaitingConfirmRef.current = true
      unmuteConfirmSourceRef.current = source
      if (source === 'catchup') {
        // Default to 0 when no `currentTime` heartbeat has arrived yet — a
        // catchup unmute typically fires very early in an item's playback
        // (right as state 1 first confirms), so "haven't heard a time yet"
        // and "still near the start" are the same case in practice. Without
        // this default, an item that never happens to report `currentTime`
        // before the unmute request could never accumulate the sustained
        // evidence needed to clear it.
        catchupUnmuteBaselineTimeRef.current = lastKnownCurrentTimeRef.current ?? 0
        logStage(
          `requestUnmute(catchup) baseline currentTime=${catchupUnmuteBaselineTimeRef.current}`,
        )
      } else {
        catchupUnmuteBaselineTimeRef.current = null
      }
      lastCommandedMutedRef.current = false
      logStage(`requestUnmute(${source}) -> unMute`)
      postCommand('unMute')
      // Optimistic — corrected back to true by `fallBackToMuted()` only on
      // a real observed pause (state 2), or reinforced by a later
      // `infoDelivery` `muted`/`volume` field confirming it took (user
      // source), or sustained currentTime progress (catchup source).
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
    unmuteConfirmSourceRef.current = 'catchup'
    catchupUnmuteBaselineTimeRef.current = null
    lastKnownCurrentTimeRef.current = null
    lastKnownDurationRef.current = null
    lastKnownRateRef.current = 1
    progressOriginTimeRef.current = null
    progressOriginMsRef.current = null
    pendingSeekRef.current = null
    lastLoggedStateRef.current = null
    shouldPlayRef.current = true
    pausedByCoverRef.current = false
    pendingAdvanceRef.current = false
    pendingReplayRef.current = false
    clearStartupRetryTimers()
    setPlaying(false)
    playingRef.current = false
    setNeverStarted(false)
    // The embed URL always carries mute=1 regardless of what the shell
    // wants — reflect that actual starting state rather than the shell's
    // desired one, so the audio affordance doesn't flash "unmuted" before
    // any unmute has actually been attempted (let alone confirmed).
    setEffectiveMuted(true)
    lastCommandedMutedRef.current = true
    if (!videoId) return
    armStallTimer(videoId)
    return () => {
      clearStallTimer()
      clearStartupRetryTimers()
    }
  }, [videoId, armStallTimer, clearStallTimer, clearStartupRetryTimers])

  // Shared by both the `[muted]` prop-reconcile effect below AND the
  // synchronous `theater-set-muted` listener (gesture-unmute fix): muting is
  // always safe immediately; unmuting always funnels through
  // `requestUnmute()`'s confirmed-playing gate. No-ops before the handshake
  // completes — `onReady` applies the latest value instead once it does.
  const applyMuted = useCallback(
    (next: boolean, source: 'user' | 'catchup' = 'user', origin: 'event' | 'prop' = 'event') => {
      if (!readyRef.current) return
      if (next) {
        const alreadyMuted = lastCommandedMutedRef.current
        pendingUnmuteRef.current = false
        unmuteAwaitingConfirmRef.current = false
        catchupUnmuteBaselineTimeRef.current = null
        lastCommandedMutedRef.current = true
        setEffectiveMuted(true)
        if (!alreadyMuted) postCommand('mute')
        return
      }

      // The synchronous event normally applies a choice before the matching
      // React prop arrives. Do not send twice or reclassify a queued catch-up.
      if (origin === 'prop' && pendingUnmuteRef.current) return

      const upgradesCatchup =
        origin === 'event' &&
        source === 'user' &&
        ((pendingUnmuteRef.current && pendingUnmuteSourceRef.current === 'catchup') ||
          (unmuteAwaitingConfirmRef.current && unmuteConfirmSourceRef.current === 'catchup'))
      if (lastCommandedMutedRef.current === false && !upgradesCatchup) return
      if (
        source === 'catchup' &&
        (pendingUnmuteRef.current || lastCommandedMutedRef.current === false)
      ) {
        return
      }
      requestUnmute(source)
    },
    [postCommand, requestUnmute],
  )

  // Reconcile the shell's `muted` signal onto the live player — only on an
  // actual prop transition, same discipline as StageVideo. This is the
  // async/persistence path (a React state update flowing back down as a
  // prop, one render behind the tap) — the gesture-context fast path is the
  // `theater-set-muted` listener below, which applies the SAME value
  // synchronously inside the tap. By the time this effect runs, the element
  // is usually already correct, so this is idempotent housekeeping, not the
  // primary mechanism.
  useEffect(() => {
    applyMuted(muted, 'user', 'prop')
  }, [muted, applyMuted])

  // An opaque Theater state (paste resolver, waiting, All Clear) must suspend
  // the iframe just like StageVideo's `covered` prop. Remember whether this
  // transition interrupted active/startup playback so an already user-paused
  // Short stays paused when the overlay leaves.
  useEffect(() => {
    if (covered) {
      clearStallTimer()
      clearStartupRetryTimers()
      pausedByCoverRef.current = shouldPlayRef.current
      pendingUnmuteRef.current = !mutedRef.current
      pendingUnmuteSourceRef.current = 'catchup'
      unmuteAwaitingConfirmRef.current = false
      catchupUnmuteBaselineTimeRef.current = null
      freezeProgressClock()
      playingRef.current = false
      setPlaying(false)
      if (readyRef.current) postCommand('pauseVideo')
      return
    }

    if (pendingAdvanceRef.current) {
      advance()
      return
    }
    if (!pausedByCoverRef.current) return
    pausedByCoverRef.current = false
    if (!readyRef.current) return
    if (pendingReplayRef.current) {
      pendingReplayRef.current = false
      lastKnownCurrentTimeRef.current = 0
      progressOriginTimeRef.current = 0
      postCommand('seekTo', [0, true])
    }
    armStallTimer(videoId)
    if (!mutedRef.current) {
      lastCommandedMutedRef.current = true
      setEffectiveMuted(true)
      postCommand('mute')
    }
    postCommand('playVideo')
  }, [
    covered,
    videoId,
    armStallTimer,
    clearStallTimer,
    clearStartupRetryTimers,
    advance,
    freezeProgressClock,
    postCommand,
  ])

  // Gesture-context fast path (mobile round 7 — the persistent
  // double-tap-to-unmute bug): the chrome's audio button dispatches this
  // SYNCHRONOUSLY, from inside its own click handler's call stack, alongside
  // (not instead of) calling the shell's setter above. For StageVideo this
  // distinction is what makes WebKit honor the unmute; for this
  // postMessage-based cross-origin player it can't hurt either way — YouTube's
  // own embed governs its unmute policy internally, but routing the command
  // from within the tap's gesture context costs nothing and keeps every
  // stage on one consistent contract.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ muted: boolean; source?: 'user' | 'catchup' }>).detail
      if (!detail) return
      logStage(`theater-set-muted(${detail.muted}, ${detail.source ?? 'user'}) applied`)
      applyMuted(detail.muted, detail.source ?? 'user', 'event')
    }
    window.addEventListener('theater-set-muted', handler)
    return () => window.removeEventListener('theater-set-muted', handler)
  }, [applyMuted])

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
      // The generic entry log is console-only (`logStageVerbose`) — this
      // fires on EVERY inbound postMessage, including `infoDelivery`
      // heartbeats that can arrive several times a second while a video
      // plays, which would otherwise burn the on-screen overlay's whole
      // 8-line window on repeats. The transitions that actually matter are
      // logged separately below, only when something changes.
      logStageVerbose('message', data.event, data.info)

      const applyPlayerState = (state: number | null) => {
        if (state !== null && state !== lastLoggedStateRef.current) {
          lastLoggedStateRef.current = state
          logStage(`state -> ${describeYtPlayerState(state)}`)
        }
        if (state === 1) {
          hasPlayedRef.current = true
          clearStallTimer()
          clearStartupRetryTimers()
          if (coveredRef.current || !shouldPlayRef.current) {
            if (coveredRef.current) pausedByCoverRef.current = shouldPlayRef.current
            freezeProgressClock()
            playingRef.current = false
            setPlaying(false)
            postCommand('pauseVideo')
            return
          }
          if (progressOriginMsRef.current == null) {
            startProgressClock(
              lastKnownCurrentTimeRef.current ?? progressOriginTimeRef.current ?? 0,
            )
          }
          playingRef.current = true
          setPlaying(true)
          if (unmuteAwaitingConfirmRef.current && unmuteConfirmSourceRef.current === 'user') {
            // Kept playing right through the unmute — it took. Stop
            // watching for a rejection. (`catchup` sources do NOT clear
            // here — round 7's device trace showed iOS's enforcement can
            // arrive as its OWN later state-1/state-2 pair, so a bare state-1
            // heartbeat is no more proof for catchup than the muted:false
            // confirmation is; only sustained currentTime progress, checked
            // in the `infoDelivery` handler below, clears it.)
          }
          // A confirmed playing state is exactly the signal `requestUnmute`
          // was waiting for — fire the deferred request now, preserving
          // whichever `source` it was originally requested with.
          if (pendingUnmuteRef.current) requestUnmute(pendingUnmuteSourceRef.current)
        } else if (state === 2) {
          freezeProgressClock()
          playingRef.current = false
          setPlaying(false)
          if (unmuteAwaitingConfirmRef.current) {
            // iOS rejected the unmuted resume by silently pausing instead
            // of erroring — fall back to muted so the item keeps playing
            // (and the queue keeps advancing) instead of sitting paused
            // until the stall watchdog eventually skips it outright.
            fallBackToMuted()
          }
        } else if (state === 0) {
          freezeProgressClock()
          playingRef.current = false
          setPlaying(false)
          // Mirror StageVideo's own ended-state dispatch: the bar visibly
          // reaches full before either looping (repeat) or the item
          // advances away.
          window.dispatchEvent(
            new CustomEvent('theater-video-progress', {
              detail: { progress: 1, duration: lastKnownDurationRef.current ?? undefined },
            }),
          )
          if (coveredRef.current) {
            if (repeatRef.current) {
              pendingReplayRef.current = true
            } else {
              advance()
            }
            return
          }
          if (repeatRef.current) {
            lastKnownCurrentTimeRef.current = 0
            progressOriginTimeRef.current = 0
          }
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
          if (!coveredRef.current && shouldPlayRef.current) scheduleStartupRetries()
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
          if (shouldPlayRef.current && !mutedRef.current && !pendingUnmuteRef.current) {
            requestUnmute('catchup')
          }
          break
        // The raw postMessage protocol streams player state inside
        // `infoDelivery` payloads ({info:{playerState, muted, ...}}) — the
        // discrete `onStateChange` event below is something the official
        // iframe_api SCRIPT synthesizes from these, so a bare-protocol
        // integration that only listens for onStateChange never sees state
        // 1 and the stall watchdog skips a video that is playing fine
        // (bitten on staging, 2026-08-21). Handle both shapes.
        // `initialDelivery` is the player's full-state snapshot answer to a
        // `listening` handshake — same `info` shape as `infoDelivery`, so it
        // flows through the same parsing (round 8: it's also the progress
        // poll's data source when iOS starves the heartbeat stream of
        // currentTime — see `lastTimeSignalAtRef`).
        case 'apiInfoDelivery':
        case 'initialDelivery':
        case 'infoDelivery': {
          const info = data.info as
            | {
                playerState?: unknown
                muted?: unknown
                volume?: unknown
                currentTime?: unknown
                mediaReferenceTime?: unknown
                duration?: unknown
                playbackRate?: unknown
              }
            | null
            | undefined
          if (info && typeof info === 'object') {
            if (typeof info.playerState === 'number') applyPlayerState(info.playerState)
            if (typeof info.muted === 'boolean') {
              // Round 6 (owner on-device report: audio icon needed two
              // presses to unmute): `infoDelivery` streams frequently enough
              // that a heartbeat reflecting the state from BEFORE our most
              // recent `mute`/`unMute` command routinely lands right after we
              // send it. Only trust this field as new information when it
              // AGREES with what we last commanded — a heartbeat reporting
              // the OPPOSITE is a stale echo, not evidence the command
              // failed (see `lastCommandedMutedRef`'s doc comment; a real
              // rejection is only ever an OBSERVED pause, handled below).
              if (info.muted === lastCommandedMutedRef.current) {
                setEffectiveMuted(info.muted)
              } else {
                logStage(
                  `infoDelivery muted:${info.muted} contradicts last command (${lastCommandedMutedRef.current}) — ignored as stale`,
                )
              }
              // Real evidence, checked as soon as it arrives: a heartbeat
              // reporting `muted:false` while we're watching an unmute
              // request is the player itself confirming it took. Not a
              // timer-disarm anymore (round 4 removed the timer) — this
              // stops a LATER, unrelated pause from being misattributed as
              // THIS unmute having been rejected.
              //
              // Round 7 (device trace): for a `user`-sourced request this is
              // still enough — a real gesture, iOS doesn't police it. For
              // `catchup`, this confirmation is NOT enough on its own: the
              // trace showed iOS applying the unmute (this exact signal) and
              // then pausing moments later anyway. Stay armed; only
              // sustained `currentTime` progress (below) clears a catchup
              // await.
              if (unmuteAwaitingConfirmRef.current && info.muted === false) {
                if (unmuteConfirmSourceRef.current === 'user') {
                  logStage('infoDelivery confirms unmute (muted:false, user) — clearing pending')
                  unmuteAwaitingConfirmRef.current = false
                } else {
                  logStage(
                    'infoDelivery confirms unmute (muted:false, catchup) — awaiting sustained progress before clearing pending',
                  )
                }
              }
            } else if (
              unmuteAwaitingConfirmRef.current &&
              typeof info.volume === 'number' &&
              info.volume > 0
            ) {
              if (unmuteConfirmSourceRef.current === 'user') {
                logStage('infoDelivery confirms unmute (volume>0, user) — clearing pending')
                unmuteAwaitingConfirmRef.current = false
              } else {
                logStage(
                  'infoDelivery confirms unmute (volume>0, catchup) — awaiting sustained progress before clearing pending',
                )
              }
            }
            // Round 5/9: drive the shared clay progress bar the same way
            // StageVideo does. Prefer a real time payload; otherwise keep
            // interpolating from duration + play-start (YouTube often
            // withholds currentTime until an in-iframe gesture).
            const reportedTime = readYtCurrentTime(info)
            const reportedDuration = readYtDuration(info)
            if (reportedDuration != null) lastKnownDurationRef.current = reportedDuration
            if (typeof info.playbackRate === 'number' && info.playbackRate > 0) {
              lastKnownRateRef.current = info.playbackRate
            }
            const pendingSeek = pendingSeekRef.current
            let acceptedReportedTime = reportedTime
            let resolvedPendingSeek = false
            if (reportedTime != null && pendingSeek != null) {
              const reachedTarget =
                pendingSeek.direction > 0
                  ? reportedTime >= pendingSeek.target - SEEK_CONFIRM_TOLERANCE_SECONDS
                  : pendingSeek.direction < 0
                    ? reportedTime <= pendingSeek.target + SEEK_CONFIRM_TOLERANCE_SECONDS
                    : Math.abs(reportedTime - pendingSeek.target) <= SEEK_CONFIRM_TOLERANCE_SECONDS
              const confirmationExpired =
                Date.now() - pendingSeek.requestedAt >= SEEK_CONFIRM_TIMEOUT_MS ||
                pendingSeek.misses >= SEEK_CONFIRM_MAX_MISSES
              if (reachedTarget || confirmationExpired) {
                pendingSeekRef.current = null
                resolvedPendingSeek = true
              } else {
                pendingSeek.misses += 1
                acceptedReportedTime = null
                logStageVerbose(
                  `ignoring pre-seek time ${reportedTime.toFixed(2)} while awaiting ${pendingSeek.target.toFixed(2)}`,
                )
              }
            }
            if (
              acceptedReportedTime != null &&
              resolvedPendingSeek &&
              unmuteAwaitingConfirmRef.current &&
              unmuteConfirmSourceRef.current === 'catchup'
            ) {
              catchupUnmuteBaselineTimeRef.current = acceptedReportedTime
            }
            if (acceptedReportedTime != null) {
              startProgressClock(acceptedReportedTime)
              lastKnownCurrentTimeRef.current = acceptedReportedTime
              lastTimeSignalAtRef.current = Date.now()
            }
            if (acceptedReportedTime != null && lastKnownDurationRef.current) {
              window.dispatchEvent(
                new CustomEvent('theater-video-progress', {
                  detail: {
                    progress: acceptedReportedTime / lastKnownDurationRef.current,
                    duration: lastKnownDurationRef.current,
                  },
                }),
              )
            } else {
              publishEstimatedProgress()
            }
            // Round 7: the sustained-playback-progress evidence a `catchup`
            // unmute needs (see `catchupUnmuteBaselineTimeRef`'s comment) —
            // REAL payload time only, never the interpolated clock. Runs
            // AFTER `applyPlayerState` above in this same payload, so if
            // this heartbeat also carried `playerState: 2`,
            // `fallBackToMuted()` has already cleared
            // `unmuteAwaitingConfirmRef` and this is a harmless no-op.
            if (acceptedReportedTime != null) {
              if (
                unmuteAwaitingConfirmRef.current &&
                unmuteConfirmSourceRef.current === 'catchup' &&
                catchupUnmuteBaselineTimeRef.current !== null &&
                acceptedReportedTime - catchupUnmuteBaselineTimeRef.current > 1.5
              ) {
                logStage(
                  `catchup unmute sustained (currentTime ${acceptedReportedTime.toFixed(2)} vs baseline ${catchupUnmuteBaselineTimeRef.current.toFixed(2)}) — clearing pending`,
                )
                unmuteAwaitingConfirmRef.current = false
                catchupUnmuteBaselineTimeRef.current = null
              }
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
    startProgressClock,
    freezeProgressClock,
    publishEstimatedProgress,
  ])

  // Round 9: while playing, interpolate the clay bar from duration + the
  // progress clock, and if no real time payload arrives within the
  // starvation window, pull listening + getCurrentTime + getDuration.
  // A healthy heartbeat stream never trips the pull. Interpolated ticks
  // never write `lastTimeSignalAtRef` (that's payload-only).
  useEffect(() => {
    if (!playing) return
    if (progressOriginMsRef.current == null) {
      startProgressClock(lastKnownCurrentTimeRef.current ?? progressOriginTimeRef.current ?? 0)
    }
    lastTimeSignalAtRef.current = Date.now()
    const timer = setInterval(() => {
      publishEstimatedProgress()
      if (Date.now() - lastTimeSignalAtRef.current <= PROGRESS_STARVED_MS) return
      const win = iframeRef.current?.contentWindow
      if (!win) return
      logStage('progress starved — pulling listening + getCurrentTime + getDuration')
      win.postMessage(listeningMessage(playerId), YT_ORIGIN)
      win.postMessage(
        JSON.stringify({ event: 'command', func: 'getCurrentTime', args: [] }),
        YT_ORIGIN,
      )
      win.postMessage(
        JSON.stringify({ event: 'command', func: 'getDuration', args: [] }),
        YT_ORIGIN,
      )
    }, PROGRESS_TICK_MS)
    return () => clearInterval(timer)
  }, [playing, playerId, startProgressClock, publishEstimatedProgress])

  // Space bar / the stage's play-pause affordance (`theater-toggle-play`,
  // dispatched by TheaterShell) — flips based on the last known state.
  useEffect(() => {
    function handleToggle() {
      if (!readyRef.current || coveredRef.current) return
      shouldPlayRef.current = !playing
      dispatchTheaterUserPlaybackState(playing)
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
      shouldPlayRef.current = false
      if (readyRef.current) postCommand('pauseVideo')
    }
    function handleResume() {
      shouldPlayRef.current = true
      if (readyRef.current && !coveredRef.current) postCommand('playVideo')
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
    win.postMessage(listeningMessage(playerId), YT_ORIGIN)
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
    dispatchTheaterStageTap()
    readyRef.current = false
    hasPlayedRef.current = false
    pendingUnmuteRef.current = false
    unmuteAwaitingConfirmRef.current = false
    unmuteConfirmSourceRef.current = 'catchup'
    catchupUnmuteBaselineTimeRef.current = null
    lastKnownCurrentTimeRef.current = null
    lastKnownDurationRef.current = null
    lastKnownRateRef.current = 1
    progressOriginTimeRef.current = null
    progressOriginMsRef.current = null
    lastLoggedStateRef.current = null
    clearStartupRetryTimers()
    shouldPlayRef.current = true
    setPlaying(false)
    setEffectiveMuted(true)
    setNeverStarted(false)
    if (!mutedRef.current) requestUnmute('user')
    logStage('tap-to-play: reloading the iframe fresh inside a user gesture')
    setReloadNonce((n) => n + 1)
    armStallTimer(videoId)
  }

  function handlePreferredSoundTap() {
    dispatchTheaterStageTap()
    requestUnmute('user')
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
            <>
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
              {!muted && effectiveMuted ? (
                <button
                  type="button"
                  onClick={handlePreferredSoundTap}
                  className="absolute inset-0 z-10 flex items-end justify-center pb-8 text-white"
                  aria-label="Enable sound"
                >
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur-md">
                    <Volume2 className="h-4 w-4" />
                    <span>Tap for sound</span>
                  </span>
                </button>
              ) : null}
            </>
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
