'use client'

import { useCallback, useMemo, useRef, useState } from 'react'

/**
 * Live-drag gesture for the mobile Up-next sheet's peek handle
 * (`TheaterMobileChrome.tsx`). The handle used to only respond to a
 * tap/threshold check on touchend — a real drag did nothing until release,
 * which reads as broken to anyone who tries to pull the sheet up (owner
 * report). This tracks the finger during the gesture (sheet follows 1:1),
 * classifies a near-zero-movement release as the existing tap toggle, and
 * otherwise snaps open/closed by how far it travelled or how fast it was
 * flicked — the two pure decision functions below are unit-tested directly.
 */

/** Below this much total finger travel (px), a pointer sequence is a tap, not a drag. */
const TAP_THRESHOLD_PX = 8

/** A release faster than this (px/ms) snaps in the flick's direction regardless of position. */
const FLICK_VELOCITY_PX_MS = 0.5

/** Fraction of the open<->closed travel range that must be crossed to flip state absent a flick. */
const SNAP_THRESHOLD_RATIO = 0.28

/** How far back (ms) pointermove samples are kept for the release velocity estimate. */
const VELOCITY_WINDOW_MS = 100

/** True when the gesture's peak displacement never left tap territory. */
export function isTap(maxTravelPx: number): boolean {
  return Math.abs(maxTravelPx) < TAP_THRESHOLD_PX
}

/**
 * Decides open vs. closed at release. `dy` is the signed vertical distance
 * travelled from gesture start (positive = downward, toward closed);
 * `travelDistance` is the sheet's full open<->closed range in px; `velocity`
 * is signed px/ms at release (positive = moving downward). A fast flick wins
 * outright; otherwise the sheet flips only once the finger has crossed
 * `SNAP_THRESHOLD_RATIO` of the travel range away from where it started —
 * short drags snap back to the starting state.
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
  if (Math.abs(velocity) > FLICK_VELOCITY_PX_MS) {
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
      const travelDistance = Math.max(
        0,
        sheetEl.getBoundingClientRect().height - peekEl.getBoundingClientRect().height,
      )
      const baseTranslate = open ? 0 : travelDistance
      startRef.current = { y: e.clientY, baseTranslate, travelDistance, startOpen: open }
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
    if (!start) return
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
    (e: React.PointerEvent) => {
      const start = startRef.current
      startRef.current = null
      setDragging(false)
      setDragTranslate(null)
      if (!start) return
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
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick },
  }
}
