/**
 * @vitest-environment jsdom
 *
 * `useClampExpand` only measures whether a 2-line caption overflows. Read
 * appears from that flag — there is no sticky expand preference anymore.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { resetClampExpandPreference, useClampExpand } from '@/components/theater/useClampExpand'

afterEach(() => {
  resetClampExpandPreference()
  vi.unstubAllGlobals()
})

describe('useClampExpand — overflow measurement', () => {
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
  })

  it('re-measures when resetKey changes (theater advancing)', () => {
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

    function Probe({ itemKey }: { itemKey: string }) {
      const { ref, overflowing } = useClampExpand(itemKey)
      return <p ref={ref} data-testid="cap" data-overflow={String(overflowing)} />
    }

    const { rerender } = render(<Probe itemKey="item-a" />)
    const el = screen.getByTestId('cap')
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 200 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 40 })
    act(() => notify([] as unknown as ResizeObserverEntry[], {} as ResizeObserver))
    expect(el.dataset.overflow).toBe('true')

    rerender(<Probe itemKey="item-b" />)
    expect(screen.getByTestId('cap').dataset.overflow).toBe('true')
  })

  it('keeps overflowing after the caption unmounts so Watch can toggle back to Read', () => {
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

    function Probe({ show }: { show: boolean }) {
      const { ref, overflowing } = useClampExpand('same-post')
      return (
        <div>
          <span data-testid="flag">{String(overflowing)}</span>
          {show ? <p ref={ref} data-testid="cap" /> : null}
        </div>
      )
    }

    const { rerender } = render(<Probe show />)
    const el = screen.getByTestId('cap')
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 200 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 40 })
    act(() => notify([] as unknown as ResizeObserverEntry[], {} as ResizeObserver))
    expect(screen.getByTestId('flag')).toHaveTextContent('true')

    rerender(<Probe show={false} />)
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 0 })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 0 })
    act(() => notify([] as unknown as ResizeObserverEntry[], {} as ResizeObserver))
    expect(screen.getByTestId('flag')).toHaveTextContent('true')

    rerender(<Probe show />)
    expect(screen.getByTestId('flag')).toHaveTextContent('true')
  })
})
