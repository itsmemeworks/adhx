'use client'

/**
 * `?ytdebug=1` (or `?avdebug=1` — same gate, widened name kept for
 * back-compat with existing bookmarked debug URLs) on-screen diagnostics
 * (round 2: console breadcrumbs for `StageYouTube.tsx`; round 6: the
 * on-screen overlay; gesture-unmute round: widened to cover `StageVideo.tsx`
 * and the chrome's audio button too — the mobile double-tap-to-unmute bug
 * reported against a Twitter/TikTok video, not YouTube, needed the same
 * screenshot-friendly diagnostics StageYouTube already had). Reading iOS
 * Safari's console requires a Mac tether, which is too much friction for the
 * owner to reach for on every retest — this mirrors the breadcrumbs into a
 * tiny on-screen panel (last ~8 curated lines, second-precision timestamps)
 * so a phone screenshot is enough. Zero footprint when neither param is
 * present: the ring buffer stays empty and `<YtDebugOverlay/>` renders null.
 * Mounted ONCE, at `TheaterShell` level, so it serves every stage rather than
 * only the YouTube branches.
 *
 * `logStage` is the call every MEANINGFUL protocol moment in StageYouTube.tsx
 * goes through — startup nudges, each retry rung, state transitions, mute
 * confirmations/rejections (including the round-6 stale-echo guard), and the
 * stall/error branches. `logSV` is StageVideo's counterpart (mount, play()
 * rejections, the `[muted]` reconcile, the synchronous `theater-set-muted`
 * event, catch-up attempts/reverts, pause events); `logAV` is the shared
 * chrome's audio-button tap. All three write to `console.debug` (for a
 * tethered session) AND append a line to the SAME on-screen ring buffer,
 * prefixed `[yt]`/`[sv]`/`[av]` respectively so a screenshot can tell the
 * source apart.
 *
 * `logStageVerbose` is console-only, for the high-volume, low-signal
 * per-message entry log (StageYouTube's protocol handler logs every inbound
 * postMessage, including `infoDelivery` heartbeats that can fire several
 * times a second while a video plays) — routing that through the ring buffer
 * too would burn the whole 8-line window on heartbeat noise and push the
 * actually-interesting events (a stall firing, a rejected unmute) off top.
 * The state transitions those heartbeats carry are already surfaced via
 * `logStage` separately, only when the state actually changes.
 */

import { useEffect, useState } from 'react'

const MAX_LINES = 8

export interface YtDebugLine {
  time: string
  text: string
  /** Consecutive identical lines collapse into one entry with a bumped
   * count, rather than each burning a slot in the small rolling window. */
  count: number
}

export const YT_DEBUG_LINE_EVENT = 'yt-debug-line'

let ring: YtDebugLine[] = []

function nowLabel(): string {
  return new Date().toTimeString().slice(0, 8)
}

function safeStringify(value: unknown): string {
  if (value === undefined) return ''
  if (value === null) return 'null'
  try {
    const s = JSON.stringify(value)
    return s.length > 60 ? `${s.slice(0, 57)}...` : s
  } catch {
    return String(value)
  }
}

function appendLine(text: string) {
  if (typeof window === 'undefined') return
  const last = ring[ring.length - 1]
  if (last && last.text === text) {
    ring = [...ring.slice(0, -1), { ...last, time: nowLabel(), count: last.count + 1 }]
  } else {
    ring = [...ring, { time: nowLabel(), text, count: 1 }].slice(-MAX_LINES)
  }
  window.dispatchEvent(new CustomEvent<YtDebugLine[]>(YT_DEBUG_LINE_EVENT, { detail: ring }))
}

/** A snapshot of the current ring buffer — used for a component's initial
 * render, before it has a chance to receive its first event. */
export function getYtDebugLines(): YtDebugLine[] {
  return ring
}

/** Test-only: the ring buffer is module-level (survives across renders by
 * design, for the overlay's initial-mount snapshot) but must not leak
 * between test cases. */
export function resetYtDebugLines(): void {
  ring = []
}

/**
 * Round 2: gate every diagnostic behind an explicit opt-in so production
 * stays quiet — the owner flips it on from their phone by appending
 * `?ytdebug=1` (YouTube-only history) OR `?avdebug=1` (the widened
 * audio/video name — either works, both gate the same overlay) to the
 * theater URL.
 */
export function isYtDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('ytdebug') === '1' || params.get('avdebug') === '1'
  } catch {
    return false
  }
}

function logCurated(prefix: string, args: unknown[]) {
  if (!isYtDebugEnabled()) return
  // eslint-disable-next-line no-console
  console.debug(prefix, ...args)
  appendLine(
    `${prefix} ${args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' ')}`,
  )
}

export function logStage(...args: unknown[]) {
  logCurated('[yt]', args)
}

export function logStageVerbose(...args: unknown[]) {
  if (!isYtDebugEnabled()) return
  // eslint-disable-next-line no-console
  console.debug('[yt]', ...args)
}

/** StageVideo's counterpart to `logStage` — same gate, same ring buffer,
 * `[sv]` prefix. */
export function logSV(...args: unknown[]) {
  logCurated('[sv]', args)
}

/** The shared chrome's audio-button tap — not tied to either player. */
export function logAV(...args: unknown[]) {
  logCurated('[av]', args)
}

/** Fixed, bottom-left, above the mobile peek bar (`PEEK_H` in
 * TheaterMobileChrome.tsx is 4.25rem — `bottom-24` clears it with room to
 * spare, matching the same offset the undo toast uses for the same reason).
 * `pointer-events-none` — purely a read-only diagnostic, never intercepts a
 * tap meant for the chrome underneath it. */
export function YtDebugOverlay() {
  const [lines, setLines] = useState<YtDebugLine[]>(() => getYtDebugLines())

  useEffect(() => {
    function handle(e: Event) {
      setLines([...(e as CustomEvent<YtDebugLine[]>).detail])
    }
    window.addEventListener(YT_DEBUG_LINE_EVENT, handle)
    return () => window.removeEventListener(YT_DEBUG_LINE_EVENT, handle)
  }, [])

  if (!isYtDebugEnabled()) return null

  return (
    <div
      className="pointer-events-none fixed bottom-24 left-2 z-[90] max-w-[75vw] space-y-0.5 rounded-md bg-black/75 px-2 py-1.5 font-mono text-[10px] leading-tight text-lime-300 lg:bottom-6"
      aria-hidden
    >
      {lines.length === 0 ? (
        <div className="text-white/40">[av/sv/yt] waiting for events…</div>
      ) : (
        lines.map((line, i) => (
          <div key={i} className="truncate">
            <span className="text-white/40">{line.time}</span> {line.text}
            {line.count > 1 && <span className="text-white/40"> ×{line.count}</span>}
          </div>
        ))
      )}
    </div>
  )
}
