/**
 * @vitest-environment jsdom
 *
 * CardViewer (unified gallery viewer) — nav + actions.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CardViewer } from '@/components/feed/CardViewer'
import type { FeedItem } from '@/components/feed/types'

const item = (over: Partial<FeedItem> = {}): FeedItem =>
  ({
    id: '111',
    platform: 'twitter',
    author: 'alice',
    authorName: 'Alice',
    authorProfileImageUrl: null,
    text: 'hello world tweet',
    tweetUrl: 'https://x.com/alice/status/111',
    processedAt: '2026-06-05T00:00:00Z',
    isRead: false,
    media: null,
    links: null,
    tags: [],
    ...over,
  }) as unknown as FeedItem

const mockFetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }))
global.fetch = mockFetch as unknown as typeof fetch

function props(over = {}) {
  return {
    item: item(),
    index: 2,
    total: 10,
    onClose: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onMarkRead: vi.fn(),
    onTagAdd: vi.fn(),
    onTagRemove: vi.fn(),
    onRemoveItem: vi.fn(),
    availableTags: [],
    ...over,
  }
}

describe('CardViewer', () => {
  beforeEach(() => mockFetch.mockClear())

  it('renders the item + 1-based counter', () => {
    render(<CardViewer {...props()} />)
    expect(screen.getByText('hello world tweet')).toBeInTheDocument()
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
  })

  it('prev/next buttons and arrow keys navigate', () => {
    const p = props()
    render(<CardViewer {...p} />)
    fireEvent.click(screen.getByLabelText('Next'))
    expect(p.onNext).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Previous'))
    expect(p.onPrev).toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(p.onNext).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(p.onPrev).toHaveBeenCalledTimes(2)
  })

  it('R toggles read and Escape closes', () => {
    const p = props()
    render(<CardViewer {...p} />)
    fireEvent.keyDown(window, { key: 'r' })
    expect(p.onMarkRead).toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(p.onClose).toHaveBeenCalled()
  })

  it('delete hits the DELETE endpoint then notifies the feed', async () => {
    const p = props()
    render(<CardViewer {...p} />)
    fireEvent.click(screen.getByLabelText('Delete'))
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/api/bookmarks/111', expect.objectContaining({ method: 'DELETE' })),
    )
    expect(p.onRemoveItem).toHaveBeenCalled()
  })
})
