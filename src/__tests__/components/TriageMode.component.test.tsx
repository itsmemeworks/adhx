/**
 * @vitest-environment jsdom
 *
 * TriageMode — drives archive/keep/undo/keyboard against an in-memory queue
 * snapshot (it no longer fetches; the page passes the queue + start index).
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

function routeMock() {
  mockFetch.mockImplementation((url: string, opts?: { method?: string }) => {
    const u = String(url)
    if (u.startsWith('/api/triage/streak')) {
      const body =
        opts?.method === 'POST' ? { current: 1, longest: 1, grew: 1 } : { current: 0, longest: 0 }
      return Promise.resolve({ ok: true, json: async () => body })
    }
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) })
  })
}

const base = {
  isOpen: true as const,
  onClose: vi.fn(),
  startIndex: 0,
  availableTags: [],
}

describe('TriageMode', () => {
  beforeEach(() => mockFetch.mockReset())

  it('renders the first card of the queue + progress', async () => {
    routeMock()
    render(
      <TriageMode {...base} initialQueue={[item('1', 'first tweet'), item('2', 'second tweet')]} />,
    )
    expect(await screen.findByText('first tweet')).toBeInTheDocument()
    // Counter shows the backlog remaining to clear (Done/Delete shrink it).
    expect(screen.getByText('2 left')).toBeInTheDocument()
  })

  it('honors startIndex (gallery jumps to the clicked item)', async () => {
    routeMock()
    render(
      <TriageMode
        {...base}
        startIndex={1}
        initialQueue={[item('1', 'first tweet'), item('2', 'second tweet')]}
      />,
    )
    expect(await screen.findByText('second tweet')).toBeInTheDocument()
    // Nothing cleared yet, so the full backlog still shows as remaining.
    expect(screen.getByText('2 left')).toBeInTheDocument()
  })

  it('archive marks read, advances, records the streak, and notifies the feed', async () => {
    routeMock()
    const onItemResolved = vi.fn()
    render(
      <TriageMode
        {...base}
        initialQueue={[item('1', 'first tweet'), item('2', 'second tweet')]}
        onItemResolved={onItemResolved}
      />,
    )
    await screen.findByText('first tweet')
    fireEvent.click(screen.getByLabelText('Done'))
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/bookmarks/1/read',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(onItemResolved).toHaveBeenCalledWith('1', 'archive')
    expect(await screen.findByText('second tweet')).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/triage/streak',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('undo reverts an archive and notifies the feed to restore it', async () => {
    routeMock()
    const onItemResolved = vi.fn()
    const onItemRestored = vi.fn()
    render(
      <TriageMode
        {...base}
        initialQueue={[item('1', 'first tweet'), item('2', 'second tweet')]}
        onItemResolved={onItemResolved}
        onItemRestored={onItemRestored}
      />,
    )
    await screen.findByText('first tweet')
    fireEvent.click(screen.getByLabelText('Done'))
    await screen.findByText('second tweet')
    expect(onItemResolved).toHaveBeenCalledWith('1', 'archive')

    fireEvent.click(screen.getByText('Undo'))
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/bookmarks/1/read',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )
    // The feed must be told to restore the item (re-increment unread + un-read it).
    expect(onItemRestored).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
    expect(await screen.findByText('first tweet')).toBeInTheDocument()
  })

  it('ArrowRight archives via keyboard', async () => {
    routeMock()
    render(
      <TriageMode {...base} initialQueue={[item('1', 'first tweet'), item('2', 'second tweet')]} />,
    )
    await screen.findByText('first tweet')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/bookmarks/1/read',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('shows the finish card for an empty queue', async () => {
    routeMock()
    render(<TriageMode {...base} initialQueue={[]} />)
    expect(await screen.findByText('Nothing to triage')).toBeInTheDocument()
  })

  // Regression: deferred delete used to be a single 5s timer that the NEXT
  // action cleared via clearUndoTimer() — cancelling the timer without ever
  // firing the DELETE, silently dropping the previous delete (it flew off
  // screen but was never removed server-side). The fix (commitPendingDelete)
  // makes acting on the next card commit any still-pending prior delete
  // immediately, instead of just cancelling it.
  it('acting on the next card within the undo window commits a pending delete instead of dropping it', async () => {
    routeMock()
    const onItemResolved = vi.fn()
    render(
      <TriageMode
        {...base}
        initialQueue={[
          item('1', 'first tweet'),
          item('2', 'second tweet'),
          item('3', 'third tweet'),
        ]}
        onItemResolved={onItemResolved}
      />,
    )

    await screen.findByText('first tweet')
    fireEvent.click(screen.getByLabelText('Delete'))

    // The card advances to item 2 well before the 5s undo window elapses.
    await screen.findByText('second tweet')

    // Deferred: the DELETE for item 1 must not have fired yet, and undo is
    // still offered — pre-fix and post-fix agree on this part.
    expect(mockFetch).not.toHaveBeenCalledWith(
      '/api/bookmarks/1',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(onItemResolved).not.toHaveBeenCalledWith('1', 'delete')
    expect(screen.getByText('Undo')).toBeInTheDocument()

    // Act on item 2 (Done) within item 1's undo window — this is the moment
    // the bug lost data: the old code just cleared item 1's timer here.
    fireEvent.click(screen.getByLabelText('Done'))

    // Item 1's delete must have been committed: DELETE fired and the feed notified.
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/bookmarks/1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )
    expect(onItemResolved).toHaveBeenCalledWith('1', 'delete')
    // Item 2's own action proceeded normally alongside the committed delete.
    expect(onItemResolved).toHaveBeenCalledWith('2', 'archive')
  })

  it('acting again (Delete) on the next card also commits the prior pending delete', async () => {
    routeMock()
    const onItemResolved = vi.fn()
    render(
      <TriageMode
        {...base}
        initialQueue={[
          item('1', 'first tweet'),
          item('2', 'second tweet'),
          item('3', 'third tweet'),
        ]}
        onItemResolved={onItemResolved}
      />,
    )

    await screen.findByText('first tweet')
    fireEvent.click(screen.getByLabelText('Delete'))
    await screen.findByText('second tweet')

    // Delete item 2 too, within item 1's undo window.
    fireEvent.click(screen.getByLabelText('Delete'))

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/bookmarks/1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )
    expect(onItemResolved).toHaveBeenCalledWith('1', 'delete')
  })
})
