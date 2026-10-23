'use client'

/**
 * `?avdebug=1` on-screen audio/video diagnostics. The mobile
 * double-tap-to-unmute bug needed screenshot-friendly breadcrumbs, and reading
 * iOS Safari's console requires a Mac tether, which is too much friction for
 * the owner to reach for on every retest — this mirrors the breadcrumbs into a
 * tiny on-screen panel (last ~8 curated lines, second-precision timestamps)
 * so a phone screenshot is enough. Zero footprint when the param is absent:
 * the ring buffer stays empty and `<AvDebugOverlay/>` renders null. Mounted
 * ONCE, at `TheaterShell` level, so it serves every stage.
 *
 * `logSV` is StageVideo's call (mount, play() rejections, the `[muted]`
 * reconcile, the synchronous `theater-set-muted` event, catch-up
 * attempts/reverts, pause events); `logAV` is the shared chrome's audio-button
 * tap. Both write to `console.debug` (for a tethered session) AND append a
 * line to the SAME on-screen ring buffer, prefixed `[sv]`/`[av]` so a
 * screenshot can tell the source apart.
 */

import { useEffect, useState } from 'react'

const MAX_LINES = 8

export interface AvDebugLine {
  time: string
  text: string
  /** Consecutive identical lines collapse into one entry with a bumped
   * count, rather than each burning a slot in the small rolling window. */
  count: number
}

export const AV_DEBUG_LINE_EVENT = 'av-debug-line'

let ring: AvDebugLine[] = []

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
  window.dispatchEvent(new CustomEvent<AvDebugLine[]>(AV_DEBUG_LINE_EVENT, { detail: ring }))
}

/** A snapshot of the current ring buffer — used for a component's initial
 * render, before it has a chance to receive its first event. */
export function getAvDebugLines(): AvDebugLine[] {
  return ring
}

/** Test-only: the ring buffer is module-level (survives across renders by
 * design, for the overlay's initial-mount snapshot) but must not leak
 * between test cases. */
export function resetAvDebugLines(): void {
  ring = []
}

/**
 * Gate every diagnostic behind an explicit opt-in so production stays quiet —
 * the owner flips it on from their phone by appending `?avdebug=1` to the
 * theater URL.
 */
export function isAvDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('avdebug') === '1'
  } catch {
    return false
  }
}

function logCurated(prefix: string, args: unknown[]) {
  if (!isAvDebugEnabled()) return
  // eslint-disable-next-line no-console
  console.debug(prefix, ...args)
  appendLine(
    `${prefix} ${args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' ')}`,
  )
}

/** StageVideo's breadcrumbs — `[sv]` prefix. */
export function logSV(...args: unknown[]) {
  logCurated('[sv]', args)
}

/** The shared chrome's audio-button tap — not tied to a player. */
export function logAV(...args: unknown[]) {
  logCurated('[av]', args)
}

/** Fixed, bottom-left, above the mobile peek bar (`PEEK_H` in
 * TheaterMobileChrome.tsx is 4.25rem — `bottom-24` clears it with room to
 * spare, matching the same offset the undo toast uses for the same reason).
 * `pointer-events-none` — purely a read-only diagnostic, never intercepts a
 * tap meant for the chrome underneath it. */
export function AvDebugOverlay() {
  const [lines, setLines] = useState<AvDebugLine[]>(() => getAvDebugLines())

  useEffect(() => {
    function handle(e: Event) {
      setLines([...(e as CustomEvent<AvDebugLine[]>).detail])
    }
    window.addEventListener(AV_DEBUG_LINE_EVENT, handle)
    return () => window.removeEventListener(AV_DEBUG_LINE_EVENT, handle)
  }, [])

  if (!isAvDebugEnabled()) return null

  return (
    <div
      className="pointer-events-none fixed bottom-24 left-2 z-[90] max-w-[75vw] space-y-0.5 rounded-md bg-black/75 px-2 py-1.5 font-mono text-[10px] leading-tight text-lime-300 lg:bottom-6"
      aria-hidden
    >
      {lines.length === 0 ? (
        <div className="text-nx-ink/40">[av/sv] waiting for events…</div>
      ) : (
        lines.map((line, i) => (
          <div key={i} className="truncate">
            <span className="text-nx-ink/40">{line.time}</span> {line.text}
            {line.count > 1 && <span className="text-nx-ink/40"> ×{line.count}</span>}
          </div>
        ))
      )}
    </div>
  )
}
