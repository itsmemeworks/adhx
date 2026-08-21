/**
 * @vitest-environment jsdom
 *
 * `useSheetDrag` powers the mobile Up-next sheet's drag handle
 * (`TheaterMobileChrome.tsx`): before this hook the handle only reacted to
 * touchend, so an actual drag gesture did nothing until release and felt
 * broken (owner report). These tests cover the two pure decision functions
 * directly (`isTap`, `resolveSnap`) and drive the hook itself through a full
 * pointerdown/move/up sequence to verify live-follow + snap + tap-passthrough
 * end to end.
 *
 * Also covers the resting-position regression fix: `getTranslateY`'s parsing
 * of real browsers' resolved `matrix`/`matrix3d` transforms as well as
 * jsdom's unresolved `translate(...)`/`translateY(...)` echo, a drag
 * starting from the sheet's REAL rendered position rather than an
 * independently-measured estimate (so it can never pop on touch-down), and
 * `endDrag`'s idempotency + pointerId filtering (the window-level backstop
 * that guarantees a gesture always resolves relies on both).
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSheetDrag, isTap, resolveSnap, getTranslateY } from '@/components/theater/useSheetDrag'

describe('isTap', () => {
  it('is true for near-zero travel', () => {
    expect(isTap(0)).toBe(true)
    expect(isTap(4)).toBe(true)
    expect(isTap(-4)).toBe(true)
  })

  it('is false once travel reaches the threshold', () => {
    expect(isTap(8)).toBe(false)
    expect(isTap(30)).toBe(false)
    expect(isTap(-30)).toBe(false)
  })
})

describe('resolveSnap', () => {
  const travelDistance = 400

  it('keeps the sheet open when a drag from open travels less than the threshold', () => {
    expect(resolveSnap({ startOpen: true, dy: 50, travelDistance, velocity: 0 })).toBe('open')
  })

  it('closes the sheet when a drag from open crosses the threshold ratio', () => {
    expect(resolveSnap({ startOpen: true, dy: 200, travelDistance, velocity: 0 })).toBe('closed')
  })

  it('keeps the sheet closed when a drag from closed travels less than the threshold', () => {
    expect(resolveSnap({ startOpen: false, dy: -50, travelDistance, velocity: 0 })).toBe('closed')
  })

  it('opens the sheet when a drag from closed crosses the threshold ratio (upward)', () => {
    expect(resolveSnap({ startOpen: false, dy: -200, travelDistance, velocity: 0 })).toBe('open')
  })

  // A fast release alone is NOT enough to override the travel hysteresis —
  // it also has to have covered real ground (MIN_FLICK_DISTANCE_PX). Without
  // this, a mis-timestamped few-px thumb twitch that happens to clear the
  // velocity bar would fully toggle the sheet on what should snap straight
  // back (live-browser verification caught exactly this: 10px in ~20ms).
  it('a fast 10px move is below the flick-distance floor and snaps BACK to the starting state (both directions)', () => {
    expect(resolveSnap({ startOpen: true, dy: 10, travelDistance, velocity: 0.8 })).toBe('open')
    expect(resolveSnap({ startOpen: false, dy: -10, travelDistance, velocity: -0.8 })).toBe(
      'closed',
    )
  })

  it('a genuine 40px flick clears the distance floor and toggles instantly, in both directions', () => {
    expect(resolveSnap({ startOpen: true, dy: 40, travelDistance, velocity: 0.8 })).toBe('closed')
    expect(resolveSnap({ startOpen: false, dy: -40, travelDistance, velocity: -0.8 })).toBe('open')
  })

  it('a slow 10px move also snaps back (velocity alone was never enough either)', () => {
    expect(resolveSnap({ startOpen: true, dy: 10, travelDistance, velocity: 0.2 })).toBe('open')
    expect(resolveSnap({ startOpen: false, dy: -10, travelDistance, velocity: -0.2 })).toBe(
      'closed',
    )
  })

  it('a slow velocity does not override position even at larger (still sub-threshold) distances', () => {
    expect(resolveSnap({ startOpen: true, dy: 50, travelDistance, velocity: 0.2 })).toBe('open')
  })

  it('falls back to the starting state when there is no travel range', () => {
    expect(resolveSnap({ startOpen: true, dy: 200, travelDistance: 0, velocity: 0 })).toBe('open')
    expect(resolveSnap({ startOpen: false, dy: -200, travelDistance: 0, velocity: 0 })).toBe(
      'closed',
    )
  })
})

describe('getTranslateY', () => {
  function withTransform(transform: string): HTMLElement {
    const el = document.createElement('div')
    el.style.transform = transform
    document.body.appendChild(el)
    return el
  }

  it('is 0 for an element with no transform', () => {
    expect(getTranslateY(withTransform(''))).toBe(0)
  })

  it('parses a resolved 2D matrix (what real browsers report)', () => {
    expect(getTranslateY(withTransform('matrix(1, 0, 0, 1, 0, 150)'))).toBe(150)
  })

  it('parses a resolved matrix3d', () => {
    expect(getTranslateY(withTransform('matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 0,220,0,1)'))).toBe(220)
  })

  it('falls back to parsing translateY()/translate() directly (jsdom does not resolve to a matrix)', () => {
    expect(getTranslateY(withTransform('translateY(532px)'))).toBe(532)
    expect(getTranslateY(withTransform('translate(0px, -40px)'))).toBe(-40)
  })
})

/**
 * Real DOM elements (not plain objects) — `getTranslateY` calls
 * `getComputedStyle`, which requires an actual Element. `getBoundingClientRect`
 * is overridden per test to control the height-based fallback math;
 * `style.transform` controls what `getTranslateY` reads back.
 */
function fakeEl(height: number): HTMLElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({ height }) as DOMRect
  document.body.appendChild(el)
  return el
}

function pointerEvent(overrides: Partial<React.PointerEvent> & { clientY: number }) {
  return {
    pointerType: 'touch',
    pointerId: 1,
    button: 0,
    timeStamp: 0,
    currentTarget: { setPointerCapture: vi.fn() },
    ...overrides,
  } as unknown as React.PointerEvent
}

describe('useSheetDrag', () => {
  /**
   * `closedTranslateY` is what the sheet is ACTUALLY rendered at while
   * closed (its real CSS resting position) — defaults to the height-based
   * 600 - 68 = 532 so most tests behave as if there's zero drift between
   * the measured heights and the true CSS offset. Tests that need to prove
   * the drift-immune touch-down fix pass a deliberately different value.
   */
  function setup(open: boolean, closedTranslateY = 532) {
    const sheetEl = fakeEl(600)
    if (!open) sheetEl.style.transform = `translateY(${closedTranslateY}px)`
    const sheetRef = { current: sheetEl }
    const peekRef = { current: fakeEl(68) }
    const onOpenChange = vi.fn()
    const { result } = renderHook(() => useSheetDrag({ open, onOpenChange, sheetRef, peekRef }))
    return { result, onOpenChange, sheetEl }
  }

  it('follows the finger during the drag (live translateY) and disables the transition', () => {
    const { result } = setup(false)
    act(() => result.current.handlers.onPointerDown(pointerEvent({ clientY: 500, timeStamp: 0 })))
    expect(result.current.dragging).toBe(true)
    // Starting closed: base translate = 600 - 68 = 532.
    expect(result.current.style?.transform).toBe('translateY(532px)')

    act(() => result.current.handlers.onPointerMove(pointerEvent({ clientY: 400, timeStamp: 50 })))
    // Moved up 100px from the closed base -> 532 - 100 = 432.
    expect(result.current.style?.transform).toBe('translateY(432px)')
    expect(result.current.style?.transition).toBe('none')
  })

  it('a small pointer movement resolves as a tap and toggles open state', () => {
    const { result, onOpenChange } = setup(false)
    act(() => result.current.handlers.onPointerDown(pointerEvent({ clientY: 500, timeStamp: 0 })))
    act(() => result.current.handlers.onPointerMove(pointerEvent({ clientY: 498, timeStamp: 10 })))
    act(() => result.current.handlers.onPointerUp(pointerEvent({ clientY: 498, timeStamp: 20 })))

    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(result.current.dragging).toBe(false)
  })

  it('a real drag past the threshold snaps open on release (slow enough not to count as a flick)', () => {
    const { result, onOpenChange } = setup(false)
    act(() => result.current.handlers.onPointerDown(pointerEvent({ clientY: 500, timeStamp: 0 })))
    act(() =>
      result.current.handlers.onPointerMove(pointerEvent({ clientY: 200, timeStamp: 1000 })),
    )
    act(() => result.current.handlers.onPointerUp(pointerEvent({ clientY: 200, timeStamp: 1000 })))

    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('a released click immediately after a resolved drag/tap is swallowed once', () => {
    const { result, onOpenChange } = setup(false)
    act(() => result.current.handlers.onPointerDown(pointerEvent({ clientY: 500, timeStamp: 0 })))
    act(() => result.current.handlers.onPointerUp(pointerEvent({ clientY: 500, timeStamp: 5 })))
    expect(onOpenChange).toHaveBeenCalledTimes(1)

    // The compatibility/native click that follows a touch or mouse release
    // must not double-toggle.
    act(() => result.current.handlers.onClick())
    expect(onOpenChange).toHaveBeenCalledTimes(1)

    // A later, independent click (keyboard activation) works normally.
    act(() => result.current.handlers.onClick())
    expect(onOpenChange).toHaveBeenCalledTimes(2)
  })

  it('pointercancel ends the drag without forcing a snap decision beyond the gesture so far', () => {
    const { result, onOpenChange } = setup(true)
    act(() => result.current.handlers.onPointerDown(pointerEvent({ clientY: 100, timeStamp: 0 })))
    act(() => result.current.handlers.onPointerMove(pointerEvent({ clientY: 150, timeStamp: 200 })))
    act(() =>
      result.current.handlers.onPointerCancel(pointerEvent({ clientY: 150, timeStamp: 200 })),
    )
    expect(result.current.dragging).toBe(false)
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  // Resting-position regression: a drag's starting offset used to come from
  // `open ? 0 : (measured sheet height - measured peek height)` — independent
  // of wherever the sheet was ACTUALLY rendered. If that measured estimate
  // ever drifted from the real CSS resting position (the peek bar's true
  // height differing from the hand-maintained PEEK_H comment, safe-area
  // insets, sub-pixel layout), touching the handle popped the sheet a few px
  // the instant you pressed down — before any movement.
  it('starts a drag from the REAL rendered position, not the height-based estimate, even when they drift', () => {
    // The sheet is actually resting at 524px closed, but the height math
    // (600 - 68) would estimate 532 — an 8px drift.
    const { result } = setup(false, 524)
    act(() => result.current.handlers.onPointerDown(pointerEvent({ clientY: 500, timeStamp: 0 })))
    // No pop: the live transform starts at the real 524, not the estimated 532.
    expect(result.current.style?.transform).toBe('translateY(524px)')
  })

  it('once dragging ends, dragging/style always fully clear — the CSS classes are the only thing positioning the sheet at rest', () => {
    const { result, onOpenChange } = setup(false)
    act(() => result.current.handlers.onPointerDown(pointerEvent({ clientY: 500, timeStamp: 0 })))
    act(() => result.current.handlers.onPointerMove(pointerEvent({ clientY: 300, timeStamp: 100 })))
    act(() => result.current.handlers.onPointerUp(pointerEvent({ clientY: 300, timeStamp: 100 })))
    expect(result.current.dragging).toBe(false)
    expect(result.current.style).toBeUndefined()
    expect(onOpenChange).toHaveBeenCalledTimes(1)
  })

  // The window-level pointerup/pointercancel backstop (added so a drag can
  // never get permanently stuck if the handle's own event is lost) fires
  // `endDrag` a second time for the same gesture in the browser. `endDrag`
  // must be a no-op the second time — otherwise the backstop itself would
  // double-toggle the sheet.
  it('ending the same gesture twice (the window-listener backstop) does not double-toggle', () => {
    const { result, onOpenChange } = setup(false)
    act(() => result.current.handlers.onPointerDown(pointerEvent({ clientY: 500, timeStamp: 0 })))
    act(() => result.current.handlers.onPointerUp(pointerEvent({ clientY: 500, timeStamp: 5 })))
    expect(onOpenChange).toHaveBeenCalledTimes(1)

    // Simulates the backstop's window pointercancel firing right after the
    // handle's own pointerup already resolved the gesture.
    act(() => result.current.handlers.onPointerCancel(pointerEvent({ clientY: 500, timeStamp: 5 })))
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(result.current.dragging).toBe(false)
  })

  it('ignores pointermove/pointerup from a different pointerId than the one that started the drag', () => {
    const { result, onOpenChange } = setup(false)
    act(() => result.current.handlers.onPointerDown(pointerEvent({ clientY: 500, timeStamp: 0 })))

    // A second, unrelated pointer moving/releasing must not affect this drag.
    act(() =>
      result.current.handlers.onPointerMove(
        pointerEvent({ clientY: 100, timeStamp: 10, pointerId: 2 }),
      ),
    )
    expect(result.current.style?.transform).toBe('translateY(532px)') // unchanged
    act(() =>
      result.current.handlers.onPointerUp(
        pointerEvent({ clientY: 100, timeStamp: 10, pointerId: 2 }),
      ),
    )
    expect(result.current.dragging).toBe(true) // still dragging — that pointerup wasn't ours
    expect(onOpenChange).not.toHaveBeenCalled()

    // The real pointer can still end it normally.
    act(() => result.current.handlers.onPointerUp(pointerEvent({ clientY: 500, timeStamp: 20 })))
    expect(result.current.dragging).toBe(false)
    expect(onOpenChange).toHaveBeenCalledTimes(1)
  })
})
