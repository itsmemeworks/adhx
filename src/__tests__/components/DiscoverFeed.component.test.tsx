/**
 * @vitest-environment jsdom
 *
 * The in-grid "Connect with X" CTA (interleaved every ~18 real cards for
 * signed-out visitors only) must not disturb the feed mechanics it's layered
 * on top of: `visible.flatMap` builds the CTA from `visible` at render time,
 * never touching the `items` state array that polling/dedupe/pagination own.
 * These tests assert the CTA appears/hides correctly and — by checking the
 * real-card (`<article>`) count stays exactly equal to the item count in
 * every scenario — that the underlying item list is never mutated by it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { DiscoverFeed, type ActivityItem } from '@/components/discover/DiscoverFeed'

class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function makeItems(count: number): ActivityItem[] {
  return Array.from({ length: count }, (_, i) => {
    const n = count - i // newest first, matching the API's ordering
    return {
      action: 'save',
      platform: 'twitter',
      bookmarkId: String(n),
      author: `user${n}`,
      authorName: `User ${n}`,
      text: `Post number ${n}`,
      url: `/user${n}/status/${n}`,
      createdAt: new Date(2026, 0, 1, 0, 0, n).toISOString(),
      saveCount: 1,
      trendCount: 1,
    }
  })
}

function mockFetchWith(items: ActivityItem[], authenticated: boolean) {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/api/auth/twitter/status')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ authenticated }),
      } as Response)
    }
    if (url.includes('/api/activity')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items, hasMore: false, recentActivity: 0 }),
      } as Response)
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  }) as unknown as typeof fetch
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('DiscoverFeed in-grid CTA', () => {
  it('interleaves exactly one CTA card after the 18th real card for signed-out visitors', async () => {
    const items = makeItems(20)
    mockFetchWith(items, false)
    render(<DiscoverFeed />)

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))
    expect(screen.getByText(/Like what you.re seeing/)).toBeInTheDocument()
    expect(screen.getAllByText(/Like what you.re seeing/)).toHaveLength(1)
  })

  it('places a second CTA after the 36th card for a longer feed', async () => {
    const items = makeItems(40)
    mockFetchWith(items, false)
    render(<DiscoverFeed />)

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(40))
    expect(screen.getAllByText(/Like what you.re seeing/)).toHaveLength(2)
  })

  it('never shows the CTA for signed-in visitors, regardless of feed length', async () => {
    const items = makeItems(40)
    mockFetchWith(items, true)
    render(<DiscoverFeed />)

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(40))
    expect(screen.queryByText(/Like what you.re seeing/)).not.toBeInTheDocument()
  })

  it('dismissing one CTA hides every instance and persists to localStorage, without touching the real cards', async () => {
    const items = makeItems(40)
    mockFetchWith(items, false)
    render(<DiscoverFeed />)

    await waitFor(() => expect(screen.getAllByText(/Like what you.re seeing/)).toHaveLength(2))

    fireEvent.click(screen.getAllByLabelText('Dismiss')[0])

    await waitFor(() =>
      expect(screen.queryByText(/Like what you.re seeing/)).not.toBeInTheDocument(),
    )
    expect(screen.getAllByRole('article')).toHaveLength(40)
    expect(localStorage.getItem('adhx-trending-cta-dismissed')).toBe('1')
  })

  it('stays dismissed across a remount (persisted preference)', async () => {
    localStorage.setItem('adhx-trending-cta-dismissed', '1')
    const items = makeItems(20)
    mockFetchWith(items, false)
    render(<DiscoverFeed />)

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(20))
    expect(screen.queryByText(/Like what you.re seeing/)).not.toBeInTheDocument()
  })
})
