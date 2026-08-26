/**
 * @vitest-environment jsdom
 *
 * FeedGrid infinite scroll — regression coverage.
 *
 * The bug: the IntersectionObserver used to be created in an effect with an
 * empty dependency array, tied to a plain `useRef`. That effect ran once, on
 * first mount — while `loading && items.length === 0` was still true, so
 * `FeedGrid` was rendering `<LoadingSkeleton />` and the sentinel div didn't
 * exist in the DOM yet. The observer was created but never `.observe()`'d
 * anything, and since the effect's deps never changed, it never ran again
 * once real items (and the sentinel) appeared — infinite scroll was dead.
 *
 * The fix replaced the ref+effect with a callback ref (`sentinelRef`), which
 * re-invokes every time the sentinel node itself mounts/unmounts, so the
 * observer attaches the moment the sentinel exists — regardless of what the
 * component was rendering before that.
 */
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FeedGrid } from '@/components/feed/FeedGrid'
import { fixtures } from '../fixtures/tweets'
import { fxTwitterToFeedItem } from '../fixtures/tweets/helpers'

/** Controllable fake IntersectionObserver: records observed nodes and lets
 * the test fire the intersection callback on demand. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  callback: IntersectionObserverCallback
  observedNodes: Element[] = []
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }
  observe(node: Element) {
    this.observedNodes.push(node)
  }
  unobserve(node: Element) {
    this.observedNodes = this.observedNodes.filter((n) => n !== node)
  }
  disconnect() {
    this.observedNodes = []
  }
  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}

const items = [fxTwitterToFeedItem(fixtures['plain-text'])]

const baseProps = {
  lastSyncAt: null as string | null,
  sortField: 'processedAt' as const,
  hideArchived: false,
  stats: { total: 1, active: 1 },
  onExpand: vi.fn(),
  onShowAll: vi.fn(),
}

function anyObserverObserved(): boolean {
  return FakeIntersectionObserver.instances.some((o) => o.observedNodes.length > 0)
}

function lastObserverWithNode(): FakeIntersectionObserver {
  const found = [...FakeIntersectionObserver.instances]
    .reverse()
    .find((o) => o.observedNodes.length > 0)
  if (!found) throw new Error('no IntersectionObserver instance observed a node')
  return found
}

describe('FeedGrid infinite scroll', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not observe anything while the initial loading skeleton is shown (no sentinel in the DOM)', () => {
    const onLoadMore = vi.fn()
    render(<FeedGrid {...baseProps} items={[]} loading hasMore={true} onLoadMore={onLoadMore} />)
    // The skeleton has no sentinel div at all — nothing should be observed yet.
    expect(anyObserverObserved()).toBe(false)
  })

  it('attaches the observer to the sentinel once items replace the skeleton, and onLoadMore fires on intersection', () => {
    const onLoadMore = vi.fn()
    const { rerender } = render(
      <FeedGrid {...baseProps} items={[]} loading hasMore={true} onLoadMore={onLoadMore} />,
    )
    expect(anyObserverObserved()).toBe(false)

    // Items load in — the grid (and its sentinel) now render for real. Pre-fix,
    // the empty-dep effect never re-ran here, so no observer would ever attach.
    rerender(
      <FeedGrid
        {...baseProps}
        items={items}
        loading={false}
        hasMore={true}
        onLoadMore={onLoadMore}
      />,
    )

    expect(anyObserverObserved()).toBe(true)
    const observer = lastObserverWithNode()

    observer.trigger(true)
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('does not call onLoadMore while a load is already in flight', () => {
    const onLoadMore = vi.fn()
    render(<FeedGrid {...baseProps} items={items} loading hasMore={true} onLoadMore={onLoadMore} />)
    expect(anyObserverObserved()).toBe(true)
    const observer = lastObserverWithNode()

    observer.trigger(true)
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('does not render a sentinel (nothing to observe) once hasMore is false', () => {
    const onLoadMore = vi.fn()
    render(
      <FeedGrid
        {...baseProps}
        items={items}
        loading={false}
        hasMore={false}
        onLoadMore={onLoadMore}
      />,
    )
    expect(anyObserverObserved()).toBe(false)
  })

  it.each(['grid', 'list', 'bento'] as const)(
    'wires %s selection state and tag name into its native primary action',
    (view) => {
      const onExpand = vi.fn()
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)
      render(
        <FeedGrid
          {...baseProps}
          items={items}
          loading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          onExpand={onExpand}
          tagSelectTag="research"
          view={view}
        />,
      )

      const selectionAction = screen.getByRole('button', {
        name: /add text by .*: .* to #research/i,
      })
      expect(selectionAction).toHaveAttribute('aria-pressed', 'false')
      fireEvent.click(selectionAction)

      expect(onExpand).not.toHaveBeenCalled()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(selectionAction).toHaveAttribute('aria-pressed', 'true')
      expect(selectionAction).toHaveAccessibleName(/remove text by .*: .* from #research/i)
    },
  )

  it.each(['list', 'bento'] as const)(
    'leaves the existing implicit accessible name unchanged in normal %s mode',
    (view) => {
      const { container } = render(
        <FeedGrid
          {...baseProps}
          items={items}
          loading={false}
          hasMore={false}
          onLoadMore={vi.fn()}
          view={view}
        />,
      )

      const primaryAction = container.querySelector('button')
      expect(primaryAction).not.toBeNull()
      expect(primaryAction).not.toHaveAttribute('aria-label')
      expect(primaryAction).not.toHaveAttribute('aria-pressed')
    },
  )
})
