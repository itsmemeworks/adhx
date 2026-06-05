/**
 * @vitest-environment jsdom
 *
 * TriageMode interaction tests — drive the archive/keep/undo logic with a
 * mocked fetch (queue load, streak, and action endpoints), since the live
 * logged-in UI can't be exercised headlessly.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TriageMode } from '@/components/feed/TriageMode'
import type { FeedItem } from '@/components/feed/types'

const item = (id: string, text: string): FeedItem =>
  ({
    id,
    platform: 'twitter',
    author: 'alice',
    authorName: 'Alice',
    authorProfileImageUrl: null,
    text,
    tweetUrl: `https://x.com/alice/status/${id}`,
    processedAt: '2026-06-05T00:00:00Z',
    isRead: false,
    media: null,
    links: null,
    tags: [],
  }) as unknown as FeedItem

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

function routeMock(queue: FeedItem[]) {
  mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
    const u = String(url)
    if (u.startsWith('/api/feed')) return Promise.resolve({ ok: true, json: async () => ({ items: queue }) })
    if (u.startsWith('/api/triage/streak')) {
      const body = opts?.method === 'POST'
        ? { current: 1, longest: 1, grew: 1 }
        : { current: 0, longest: 0, lastActiveDate: null }
      return Promise.resolve({ ok: true, json: async () => body })
    }
    // action endpoints (read / delete / tags)
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) })
  })
}

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  filter: 'all',
  platformFilter: 'all',
  search: '',
  selectedTags: [],
  availableTags: [],
}

describe('TriageMode', () => {
  beforeEach(() => mockFetch.mockReset())

  it('loads the unread queue and shows the first card + progress', async () => {
    routeMock([item('1', 'first tweet'), item('2', 'second tweet')])
    render(<TriageMode {...baseProps} />)
    expect(await screen.findByText('first tweet')).toBeInTheDocument()
    expect(screen.getByText('0 / 2')).toBeInTheDocument()
  })

  it('archives a card: calls the read endpoint, advances, and notifies the feed', async () => {
    const onItemResolved = vi.fn()
    routeMock([item('1', 'first tweet'), item('2', 'second tweet')])
    render(<TriageMode {...baseProps} onItemResolved={onItemResolved} />)
    await screen.findByText('first tweet')

    fireEvent.click(screen.getByLabelText('Archive'))

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/api/bookmarks/1/read', expect.objectContaining({ method: 'POST' })),
    )
    expect(onItemResolved).toHaveBeenCalledWith('1', 'archive')
    // advances to the next card
    expect(await screen.findByText('second tweet')).toBeInTheDocument()
    // records the streak day
    expect(mockFetch).toHaveBeenCalledWith('/api/triage/streak', expect.objectContaining({ method: 'POST' }))
  })

  it('undo reverts an archive (un-reads it) and returns to the card', async () => {
    routeMock([item('1', 'first tweet'), item('2', 'second tweet')])
    render(<TriageMode {...baseProps} />)
    await screen.findByText('first tweet')

    fireEvent.click(screen.getByLabelText('Archive'))
    await screen.findByText('second tweet')

    fireEvent.click(screen.getByText('Undo'))

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/api/bookmarks/1/read', expect.objectContaining({ method: 'DELETE' })),
    )
    expect(await screen.findByText('first tweet')).toBeInTheDocument()
  })

  it('right-arrow key archives the current card', async () => {
    routeMock([item('1', 'first tweet'), item('2', 'second tweet')])
    render(<TriageMode {...baseProps} />)
    await screen.findByText('first tweet')

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith('/api/bookmarks/1/read', expect.objectContaining({ method: 'POST' })),
    )
  })

  it('shows the finish card when the queue is empty', async () => {
    routeMock([])
    render(<TriageMode {...baseProps} />)
    expect(await screen.findByText('Nothing to triage')).toBeInTheDocument()
  })
})
