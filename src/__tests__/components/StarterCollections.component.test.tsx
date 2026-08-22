/**
 * @vitest-environment jsdom
 *
 * `StarterCollections` — the "start with a full playlist" onboarding
 * offer. Reuses `/api/collections/trending` (Discovery leaderboard) and the
 * tag clone endpoint, so this only tests the component's own logic: it
 * renders the top 3 entries, excludes the viewer's own playlists, fires a
 * clone POST per card with a success/error state, and collapses to nothing
 * when there's nothing to offer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { StarterCollections } from '@/components/onboarding/StarterCollections'
import { invalidateAuthMe } from '@/components/auth'

const ME = {
  authenticated: true,
  user: { id: 'u1', username: 'newbie', displayName: 'Newbie', avatarUrl: null },
  identities: { x: null, email: { email: 'newbie@example.com' } },
  xConnected: false,
}

function entry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    username: 'curator',
    tag: 'cool-stuff',
    rank: 1,
    viewCount: 10,
    cloneCount: 2,
    itemCount: 5,
    tiles: [{ thumbnailUrl: 'https://example.com/a.jpg' }],
    ...overrides,
  }
}

function mockFetch(items: unknown[], cloneImpl?: (url: string) => Promise<unknown>) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/auth/me') {
      return Promise.resolve({ ok: true, json: async () => ME })
    }
    if (url.startsWith('/api/collections/trending')) {
      return Promise.resolve({ ok: true, json: async () => ({ items, window: 'all-time' }) })
    }
    if (url.includes('/clone')) {
      if (cloneImpl) return cloneImpl(url) as Promise<unknown>
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, clonedCount: 5, taggedCount: 5 }),
      })
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('StarterCollections', () => {
  beforeEach(() => {
    invalidateAuthMe()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    invalidateAuthMe()
    document.body.innerHTML = ''
  })

  it('renders up to the top 3 collections from the leaderboard', async () => {
    mockFetch([
      entry({ username: 'a', tag: 'one', rank: 1 }),
      entry({ username: 'b', tag: 'two', rank: 2 }),
      entry({ username: 'c', tag: 'three', rank: 3 }),
      entry({ username: 'd', tag: 'four', rank: 4 }),
    ])

    render(<StarterCollections />)

    expect(await screen.findByText('#one')).toBeInTheDocument()
    expect(screen.getByText('#two')).toBeInTheDocument()
    expect(screen.getByText('#three')).toBeInTheDocument()
    expect(screen.queryByText('#four')).not.toBeInTheDocument()
  })

  it('excludes the viewer’s own collections', async () => {
    mockFetch([
      entry({ username: 'newbie', tag: 'mine', rank: 1 }),
      entry({ username: 'someone-else', tag: 'theirs', rank: 2 }),
    ])

    render(<StarterCollections />)

    expect(await screen.findByText('#theirs')).toBeInTheDocument()
    expect(screen.queryByText('#mine')).not.toBeInTheDocument()
  })

  it('clones per-card on click and shows a success state', async () => {
    mockFetch([entry({ username: 'curator', tag: 'cool-stuff' })])
    const fetchMock = vi.mocked(fetch)

    render(<StarterCollections />)

    const addButton = await screen.findByRole('button', { name: 'Add to my collection' })
    fireEvent.click(addButton)

    await waitFor(() => expect(screen.getByText('Added · 5 posts')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/share/tag/by-name/curator/cool-stuff/clone',
      expect.objectContaining({ method: 'POST' }),
    )
    // Success state is a link to view the collection, not a button anymore.
    expect(screen.getByRole('link', { name: 'Added · 5 posts' })).toHaveAttribute(
      'href',
      '/t/curator/cool-stuff',
    )
  })

  it('shows an inline error and re-enables the button on clone failure', async () => {
    mockFetch([entry()], () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }))

    render(<StarterCollections />)

    const addButton = await screen.findByRole('button', { name: 'Add to my collection' })
    fireEvent.click(addButton)

    await waitFor(() => expect(screen.getByText("Couldn't add — try again")).toBeInTheDocument())
    const retryButton = screen.getByRole('button', { name: 'Add to my collection' })
    expect(retryButton).not.toBeDisabled()
  })

  it('renders nothing when the leaderboard is empty', async () => {
    mockFetch([])
    const { container } = render(<StarterCollections />)

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('renders nothing when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/auth/me') return Promise.resolve({ ok: true, json: async () => ME })
        return Promise.reject(new Error('network error'))
      }),
    )
    const { container } = render(<StarterCollections />)

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('renders nothing when every top collection belongs to the viewer', async () => {
    mockFetch([entry({ username: 'newbie', tag: 'mine' })])
    const { container } = render(<StarterCollections />)

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
