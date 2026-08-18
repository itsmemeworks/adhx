/**
 * @vitest-environment jsdom
 *
 * CollectionTheater — the theater-first replacement for TriageMode's focus
 * mode. Drives Done/keyboard against an in-memory queue snapshot, mirroring
 * `TriageMode.component.test.tsx`'s pattern for the pieces that must behave
 * identically (archive marks read + advances + notifies the feed).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CollectionTheater } from '@/components/theater/CollectionTheater'
import type { FeedItem } from '@/components/feed/types'

vi.mock('hls.js', () => ({
  default: { isSupported: () => false },
}))

const item = (id: string, text: string): FeedItem =>
  ({
    id,
    platform: 'twitter',
    author: 'alice',
    authorName: 'Alice',
    authorProfileImageUrl: null,
    text,
    tweetUrl: `https://x.com/alice/status/${id}`,
    createdAt: '2026-06-05T00:00:00Z',
    processedAt: '2026-06-05T00:00:00Z',
    isRead: false,
    media: null,
    links: null,
    tags: [],
  }) as unknown as FeedItem

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

function routeMock() {
  mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
    const u = String(url)
    if (u.startsWith('/api/triage/streak')) {
      const body =
        opts?.method === 'POST' ? { current: 1, longest: 1, grew: 1 } : { current: 0, longest: 0 }
      return Promise.resolve({ ok: true, json: async () => body })
    }
    if (u.startsWith('/api/activity')) {
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) })
    }
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) })
  })
}

const base = {
  isOpen: true as const,
  onClose: vi.fn(),
  startIndex: 0,
}

describe('CollectionTheater', () => {
  beforeEach(() => mockFetch.mockReset())

  it('renders the first item of the queue on the stage + the remaining count in the rail', async () => {
    routeMock()
    render(
      <CollectionTheater
        {...base}
        initialQueue={[item('1', 'first tweet'), item('2', 'second tweet')]}
      />,
    )
    // "first tweet" appears twice by design: once on the stage (large serif
    // text) and once in the rail's queue row.
    expect(await screen.findAllByText('first tweet')).toHaveLength(2)
    expect(screen.getByText('2 left')).toBeInTheDocument()
  })

  it('honors startIndex (gallery jumps to the clicked item)', async () => {
    routeMock()
    render(
      <CollectionTheater
        {...base}
        startIndex={1}
        initialQueue={[item('1', 'first tweet'), item('2', 'second tweet')]}
      />,
    )
    expect(await screen.findAllByText('second tweet')).toHaveLength(2)
  })

  it('Done marks read (with platform), advances, and notifies the feed', async () => {
    routeMock()
    const onItemResolved = vi.fn()
    render(
      <CollectionTheater
        {...base}
        initialQueue={[item('1', 'first tweet'), item('2', 'second tweet')]}
        onItemResolved={onItemResolved}
      />,
    )
    await screen.findAllByText('first tweet')
    fireEvent.click(screen.getByLabelText('Done'))
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/bookmarks/1/read?platform=twitter',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(onItemResolved).toHaveBeenCalledWith('1', 'archive')
    expect(await screen.findAllByText('second tweet')).toHaveLength(2)
  })

  it('ArrowRight archives via the preserved keyboard map', async () => {
    routeMock()
    const onItemResolved = vi.fn()
    render(
      <CollectionTheater
        {...base}
        initialQueue={[item('1', 'first tweet')]}
        onItemResolved={onItemResolved}
      />,
    )
    await screen.findAllByText('first tweet')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(onItemResolved).toHaveBeenCalledWith('1', 'archive'))
  })

  it('Escape closes the theater', async () => {
    routeMock()
    const onClose = vi.fn()
    render(<CollectionTheater {...base} onClose={onClose} initialQueue={[item('1', 'only')]} />)
    await screen.findAllByText('only')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the caught-up state for an empty queue', async () => {
    routeMock()
    render(<CollectionTheater {...base} initialQueue={[]} />)
    expect(await screen.findByText('Nothing to triage')).toBeInTheDocument()
  })

  it('switching to the Live tab fetches /api/activity', async () => {
    routeMock()
    render(<CollectionTheater {...base} initialQueue={[item('1', 'first tweet')]} />)
    await screen.findAllByText('first tweet')
    fireEvent.click(screen.getByRole('button', { name: 'live' }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/activity', expect.anything()))
  })
})
