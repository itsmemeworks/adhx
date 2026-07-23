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
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
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
  unreadOnly: false,
  stats: { total: 1, unread: 1 },
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
})
