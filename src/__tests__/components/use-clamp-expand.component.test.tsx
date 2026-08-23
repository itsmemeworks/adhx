/**
 * @vitest-environment jsdom
 *
 * `useClampExpand`'s show more/less state is a *sticky* preference: an
 * explicit expand or collapse survives the theater advancing to a new item
 * (the resetKey changing), and is shared across independent hook instances
 * (desktop chrome + mobile chrome are both mounted at once).
 *
 * Moved from theater-rail.component.test.tsx when the hook moved out of the
 * deleted Rail.tsx into its own module.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import { resetClampExpandPreference, useClampExpand } from '@/components/theater/useClampExpand'

afterEach(() => {
  resetClampExpandPreference()
})

describe('useClampExpand — sticky expand preference', () => {
  it('an explicit expand survives a resetKey change (theater advancing to a new item)', () => {
    const { result, rerender } = renderHook(({ key }) => useClampExpand(key), {
      initialProps: { key: 'item-a' },
    })

    act(() => result.current.setExpanded(true))
    expect(result.current.expanded).toBe(true)

    rerender({ key: 'item-b' })
    expect(result.current.expanded).toBe(true)
  })

  it('an explicit collapse also survives a resetKey change', () => {
    const { result, rerender } = renderHook(({ key }) => useClampExpand(key), {
      initialProps: { key: 'item-a' },
    })

    act(() => result.current.setExpanded(true))
    act(() => result.current.setExpanded(false))
    expect(result.current.expanded).toBe(false)

    rerender({ key: 'item-b' })
    expect(result.current.expanded).toBe(false)
  })

  it('is shared across independent hook instances (desktop + mobile chrome)', () => {
    const { result: desktop } = renderHook(() => useClampExpand('shared-a'))
    act(() => desktop.current.setExpanded(true))

    // A second instance mounted afterwards (e.g. the mobile chrome) picks up
    // the same preference as its initial state.
    const { result: mobile } = renderHook(() => useClampExpand('shared-a'))
    expect(mobile.current.expanded).toBe(true)
  })

  it('toggle flips the sticky preference', () => {
    const { result } = renderHook(() => useClampExpand('item-a'))
    act(() => result.current.toggle())
    expect(result.current.expanded).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.expanded).toBe(false)
  })

  it('re-measures overflow when the caption resizes after first paint', () => {
    let notify: ResizeObserverCallback = () => undefined
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          notify = cb
        }
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    )

    function Probe() {
      const { ref, overflowing } = useClampExpand('late-layout')
      return <p ref={ref} data-testid="cap" data-overflow={String(overflowing)} />
    }

    render(<Probe />)
    const el = screen.getByTestId('cap')
    expect(el.dataset.overflow).toBe('false')

    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 200 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 40 })
    act(() => notify([] as unknown as ResizeObserverEntry[], {} as ResizeObserver))
    expect(el.dataset.overflow).toBe('true')

    vi.unstubAllGlobals()
  })
})
