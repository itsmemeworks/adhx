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
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSheetDrag, isTap, resolveSnap } from '@/components/theater/useSheetDrag'

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

  it('a fast downward flick closes regardless of how little distance was travelled', () => {
    expect(resolveSnap({ startOpen: true, dy: 10, travelDistance, velocity: 0.8 })).toBe('closed')
  })

  it('a fast upward flick opens regardless of how little distance was travelled', () => {
    expect(resolveSnap({ startOpen: false, dy: -10, travelDistance, velocity: -0.8 })).toBe('open')
  })

  it('a slow velocity does not override position', () => {
    expect(resolveSnap({ startOpen: true, dy: 50, travelDistance, velocity: 0.2 })).toBe('open')
  })

  it('falls back to the starting state when there is no travel range', () => {
    expect(resolveSnap({ startOpen: true, dy: 200, travelDistance: 0, velocity: 0 })).toBe('open')
    expect(resolveSnap({ startOpen: false, dy: -200, travelDistance: 0, velocity: 0 })).toBe(
      'closed',
    )
  })
})

/** A minimal stand-in for the elements useSheetDrag measures via getBoundingClientRect. */
function fakeEl(height: number): HTMLElement {
  return { getBoundingClientRect: () => ({ height }) } as unknown as HTMLElement
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
  function setup(open: boolean) {
    const sheetRef = { current: fakeEl(600) }
    const peekRef = { current: fakeEl(68) }
    const onOpenChange = vi.fn()
    const { result } = renderHook(() => useSheetDrag({ open, onOpenChange, sheetRef, peekRef }))
    return { result, onOpenChange }
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
})
