'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Live-drag gesture for the mobile Up-next sheet's peek handle
 * (`TheaterMobileChrome.tsx`). The handle used to only respond to a
 * tap/threshold check on touchend — a real drag did nothing until release,
 * which reads as broken to anyone who tries to pull the sheet up (owner
 * report). This tracks the finger during the gesture (sheet follows 1:1),
 * classifies a near-zero-movement release as the existing tap toggle, and
 * otherwise snaps open/closed by how far it travelled or how fast it was
 * flicked — the two pure decision functions below are unit-tested directly.
 *
 * Resting-position regression fix: once a gesture ends, `dragging` flips
 * back to `false` and the caller's `style` becomes `undefined` — at that
 * point the CSS classes (`translate-y-0` / `translate-y-[calc(100%-4.25rem)]`)
 * are the ONLY thing positioning the sheet, exactly as before this feature
 * existed. Two things previously undermined that:
 *   1. A drag's starting offset was computed from `open` + a height
 *      subtraction (`sheetHeight - peekHeight`), independent of wherever the
 *      sheet was ACTUALLY rendered. `PEEK_H` (the class's hardcoded
 *      4.25rem) is a hand-maintained approximation of the peek bar's real
 *      height, not derived from it — any drift between that constant and
 *      the peek bar's true rendered height (safe-area insets, a taller
 *      control row on video posts, sub-pixel layout) meant a drag could
 *      begin a few px away from the true resting spot. `getTranslateY` below
 *      reads the sheet's actual computed transform instead, so a drag always
 *      starts from exactly where the sheet visually already is.
 *   2. If `endDrag` never ran (a lost `pointerup`/`pointercancel` — capture
 *      quirks, the OS intercepting the gesture, a lost-capture edge case),
 *      `dragging` stayed `true` forever and the sheet froze wherever the
 *      last `pointermove` left it, a few px short of the true collapsed
 *      offset. The window-level listeners + `onLostPointerCapture` below are
 *      a backstop that guarantees the gesture always resolves and hands
 *      control back to the CSS classes.
 */

/** Below this much total finger travel (px), a pointer sequence is a tap, not a drag. */
const TAP_THRESHOLD_PX = 8

/** A release faster than this (px/ms) snaps in the flick's direction regardless of position — but only alongside `MIN_FLICK_DISTANCE_PX` below. */
const FLICK_VELOCITY_PX_MS = 0.5

/**
 * A flick can only override the travel hysteresis once the gesture has
 * covered at least this much distance. Velocity alone is a bad gate: a mis-
 * timestamped few-px thumb twitch (an accidental brush of the handle, or a
 * couple of tightly-spaced synthetic pointermove samples) easily clears
 * `FLICK_VELOCITY_PX_MS` while covering almost no ground, and would
 * otherwise fully toggle the sheet on what should have snapped straight back
 * (live-browser verification caught this). 24px is comfortably above the
 * 8px tap threshold — so it never fires on anything tap-classified — while
 * staying well under a genuine flick's typical travel (40px+), so a real
 * quick flick still overrides instantly.
 */
const MIN_FLICK_DISTANCE_PX = 24

/** Fraction of the open<->closed travel range that must be crossed to flip state absent a flick. */
const SNAP_THRESHOLD_RATIO = 0.28

/** How far back (ms) pointermove samples are kept for the release velocity estimate. */
const VELOCITY_WINDOW_MS = 100

/** True when the gesture's peak displacement never left tap territory. */
export function isTap(maxTravelPx: number): boolean {
  return Math.abs(maxTravelPx) < TAP_THRESHOLD_PX
}

/**
 * Reads an element's ACTUAL rendered translateY (from its computed
 * `transform`), not a value we independently derived. Used to start a drag
 * from wherever the sheet really is on screen right now — see the module
 * doc's point 1. Real browsers resolve computed `transform` to
 * `matrix(a, b, c, d, tx, ty)` (ty at index 5) or `matrix3d(...)` (ty at
 * index 13); jsdom instead echoes the literal `translate(...)`/`translateY()`
 * syntax back unresolved, so that's handled as a fallback too. Returns 0 for
 * `'none'` or anything unparseable.
 */
export function getTranslateY(el: Element): number {
  const { transform } = window.getComputedStyle(el)
  if (!transform || transform === 'none') return 0

  const matrix3d = transform.match(/^matrix3d\(([^)]+)\)$/)
  if (matrix3d) {
    const ty = parseFloat(matrix3d[1].split(',')[13]?.trim())
    return Number.isFinite(ty) ? ty : 0
  }
  const matrix2d = transform.match(/^matrix\(([^)]+)\)$/)
  if (matrix2d) {
    const ty = parseFloat(matrix2d[1].split(',')[5]?.trim())
    return Number.isFinite(ty) ? ty : 0
  }
  const translateY = transform.match(/translateY\(\s*(-?[\d.]+)px\s*\)/)
  if (translateY) return parseFloat(translateY[1])
  const translate = transform.match(/^translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)$/)
  if (translate) return parseFloat(translate[2])

  return 0
}

/**
 * Decides open vs. closed at release. `dy` is the signed vertical distance
 * travelled from gesture start (positive = downward, toward closed);
 * `travelDistance` is the sheet's full open<->closed range in px; `velocity`
 * is signed px/ms at release (positive = moving downward). A fast flick wins
 * outright, but ONLY once `dy` also clears `MIN_FLICK_DISTANCE_PX` — velocity
 * by itself isn't enough (see that constant's doc). Short of that, the sheet
 * flips only once the finger has crossed `SNAP_THRESHOLD_RATIO` of the travel
 * range away from where it started — short drags (fast or slow) snap back to
 * the starting state.
 */
export function resolveSnap({
  startOpen,
  dy,
  travelDistance,
  velocity,
}: {
  startOpen: boolean
  dy: number
  travelDistance: number
  velocity: number
}): 'open' | 'closed' {
  if (Math.abs(velocity) > FLICK_VELOCITY_PX_MS && Math.abs(dy) >= MIN_FLICK_DISTANCE_PX) {
    return velocity < 0 ? 'open' : 'closed'
  }
  if (travelDistance <= 0) return startOpen ? 'open' : 'closed'
  const traveled = dy / travelDistance
  if (startOpen) {
    return traveled > SNAP_THRESHOLD_RATIO ? 'closed' : 'open'
  }
  return traveled < -SNAP_THRESHOLD_RATIO ? 'open' : 'closed'
}

interface Sample {
  y: number
  t: number
}

export interface UseSheetDragOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The sheet element — its full height sets the drag's travel range. */
  sheetRef: React.RefObject<HTMLElement | null>
  /** The always-visible peek bar — its height is the "closed" resting translateY. */
  peekRef: React.RefObject<HTMLElement | null>
}

/**
 * Pointer-driven drag for the handle. Consumers spread `handlers` onto the
 * handle element and, while `dragging`, apply `style` to the sheet in place
 * of its normal (transitioned) open/closed transform class.
 */
export function useSheetDrag({ open, onOpenChange, sheetRef, peekRef }: UseSheetDragOptions) {
  const [dragging, setDragging] = useState(false)
  const [dragTranslate, setDragTranslate] = useState<number | null>(null)
  const startRef = useRef<{
    y: number
    pointerId: number
    baseTranslate: number
    travelDistance: number
    startOpen: boolean
  } | null>(null)
  const samplesRef = useRef<Sample[]>([])
  const maxTravelRef = useRef(0)
  // A real drag (or a pointer-classified tap, which we resolve ourselves)
  // must not ALSO fire the button's native `click` — that would immediately
  // toggle the state we just set. Touch fires a compatibility click after
  // pointerup; mouse fires a real one. Either way we swallow exactly the
  // next click, then let clicks work normally again (keyboard activation
  // dispatches `click` with no preceding pointer sequence at all).
  const suppressNextClickRef = useRef(false)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const sheetEl = sheetRef.current
      const peekEl = peekRef.current
      if (!sheetEl || !peekEl) return
      // Start from the REAL rendered position (see module doc point 1), not
      // `open ? 0 : (measured height difference)` — that guarantees zero pop
      // at touch-down regardless of any drift between the peek bar's actual
      // height and the CSS class's hardcoded closed offset.
      const baseTranslate = getTranslateY(sheetEl)
      // The clamp/snap-ratio ceiling: when starting CLOSED, `baseTranslate`
      // already IS the real closed offset — use it directly (exact, no
      // estimate). When starting OPEN, the closed offset isn't currently
      // rendered to read, so fall back to the height-based estimate; any
      // imprecision there only affects how far mid-drag values travel while
      // the finger is still down; release always clears fully to the CSS
      // classes, so the resting position is unaffected either way.
      const travelDistance = open
        ? Math.max(
            0,
            sheetEl.getBoundingClientRect().height - peekEl.getBoundingClientRect().height,
          )
        : baseTranslate
      startRef.current = {
        y: e.clientY,
        pointerId: e.pointerId,
        baseTranslate,
        travelDistance,
        startOpen: open,
      }
      samplesRef.current = [{ y: e.clientY, t: e.timeStamp }]
      maxTravelRef.current = 0
      setDragging(true)
      setDragTranslate(baseTranslate)
      e.currentTarget.setPointerCapture?.(e.pointerId)
    },
    [open, sheetRef, peekRef],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const start = startRef.current
    if (!start || e.pointerId !== start.pointerId) return
    const dy = e.clientY - start.y
    maxTravelRef.current = Math.max(maxTravelRef.current, Math.abs(dy))
    const clamped = Math.min(start.travelDistance, Math.max(0, start.baseTranslate + dy))
    setDragTranslate(clamped)
    samplesRef.current.push({ y: e.clientY, t: e.timeStamp })
    const cutoff = e.timeStamp - VELOCITY_WINDOW_MS
    while (samplesRef.current.length > 2 && samplesRef.current[0].t < cutoff) {
      samplesRef.current.shift()
    }
  }, [])

  const endDrag = useCallback(
    (e: { clientY: number; pointerId?: number }) => {
      const start = startRef.current
      if (!start || (e.pointerId != null && e.pointerId !== start.pointerId)) return
      startRef.current = null
      setDragging(false)
      setDragTranslate(null)
      suppressNextClickRef.current = true

      if (isTap(maxTravelRef.current)) {
        onOpenChange(!start.startOpen)
        return
      }

      const dy = e.clientY - start.y
      const samples = samplesRef.current
      let velocity = 0
      if (samples.length >= 2) {
        const first = samples[0]
        const last = samples[samples.length - 1]
        const dt = last.t - first.t
        if (dt > 0) velocity = (last.y - first.y) / dt
      }

      const snap = resolveSnap({
        startOpen: start.startOpen,
        dy,
        travelDistance: start.travelDistance,
        velocity,
      })
      onOpenChange(snap === 'open')
    },
    [onOpenChange],
  )

  const onPointerUp = useCallback((e: React.PointerEvent) => endDrag(e), [endDrag])
  const onPointerCancel = useCallback((e: React.PointerEvent) => endDrag(e), [endDrag])
  // Fires whenever capture is released for ANY reason (a normal release
  // already handled above, but also e.g. the browser reclaiming it) — a
  // second safety net alongside the window listeners below so a drag can
  // never get permanently stuck away from the resting position.
  const onLostPointerCapture = useCallback((e: React.PointerEvent) => endDrag(e), [endDrag])

  // Backstop: if the handle's own pointerup/pointercancel is ever lost
  // (capture quirks, the OS stealing the gesture), a pointerup/pointercancel
  // ANYWHERE still ends the drag — see module doc point 2. `endDrag` is
  // idempotent (guarded by `startRef`), so this never double-applies a
  // gesture the local handlers already resolved.
  useEffect(() => {
    if (!dragging) return
    const handleWindowEnd = (e: PointerEvent) => endDrag(e)
    window.addEventListener('pointerup', handleWindowEnd)
    window.addEventListener('pointercancel', handleWindowEnd)
    return () => {
      window.removeEventListener('pointerup', handleWindowEnd)
      window.removeEventListener('pointercancel', handleWindowEnd)
    }
  }, [dragging, endDrag])

  const onClick = useCallback(() => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
    // No pointer sequence preceded this — keyboard/assistive-tech activation.
    onOpenChange(!open)
  }, [onOpenChange, open])

  const style = useMemo(() => {
    if (!dragging || dragTranslate == null) return undefined
    return { transform: `translateY(${dragTranslate}px)`, transition: 'none' } as const
  }, [dragging, dragTranslate])

  return {
    dragging,
    style,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture,
      onClick,
    },
  }
}
