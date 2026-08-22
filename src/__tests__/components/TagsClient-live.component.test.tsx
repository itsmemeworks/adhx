/**
 * @vitest-environment jsdom
 *
 * `/tags` used to fetch `/api/tags` once on mount and subscribe to nothing
 * (state review, 2026-08-22) — tagging a post elsewhere in the app, or
 * cloning a whole playlist (which adds a tag as a side effect of adding
 * posts), left this page's counts, and even the presence of a brand-new
 * tag, stale until a manual reload. `TagsClient` now listens for the two
 * events documented in `src/lib/client-events.ts` (`bookmark-tags-changed`,
 * `tweet-added`) and refetches. These tests exist to catch a regression back
 * to fetch-once-and-forget, not to describe what a `useEffect` does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import { TagsClient } from '@/app/tags/TagsClient'
import { CLIENT_EVENTS } from '@/lib/client-events'

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)
}

describe('TagsClient stays live', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches /api/tags on mount and renders the returned tags', async () => {
    let tagsCallCount = 0
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tags') {
        tagsCallCount++
        return jsonResponse({ tags: [{ tag: 'work', count: 5, isPublic: false, shareUrl: null }] })
      }
      // Per-tag content-mosaic preview fetches — irrelevant to this test,
      // just don't let them reject and pollute the console.
      return jsonResponse({ items: [] })
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())
    expect(tagsCallCount).toBe(1)
  })

  it('re-fetches /api/tags when it hears bookmark-tags-changed — this is the bug: tagging a post in the theater used to leave this page stale until reload', async () => {
    let tagsCallCount = 0
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tags') {
        tagsCallCount++
        // First call: just "work". Second call (after the event): a brand
        // new tag has appeared, proving a real refetch happened and its
        // data was rendered, not just a re-render of stale state.
        const tags =
          tagsCallCount === 1
            ? [{ tag: 'work', count: 5, isPublic: false, shareUrl: null }]
            : [
                { tag: 'work', count: 5, isPublic: false, shareUrl: null },
                { tag: 'reading', count: 1, isPublic: false, shareUrl: null },
              ]
        return jsonResponse({ tags })
      }
      return jsonResponse({ items: [] })
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())
    expect(screen.queryByText('#reading')).not.toBeInTheDocument()
    expect(tagsCallCount).toBe(1)

    fireEvent(window, new Event(CLIENT_EVENTS.tagsChanged))

    await waitFor(() => expect(screen.getByText('#reading')).toBeInTheDocument())
    expect(tagsCallCount).toBe(2)
  })

  it('re-fetches /api/tags when it hears tweet-added — cloning a playlist adds posts AND a tag, so the library-grid-refresh event must reach this page too', async () => {
    let tagsCallCount = 0
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tags') {
        tagsCallCount++
        const tags =
          tagsCallCount === 1
            ? [{ tag: 'work', count: 3, isPublic: false, shareUrl: null }]
            : [{ tag: 'work', count: 9, isPublic: false, shareUrl: null }]
        return jsonResponse({ tags })
      }
      return jsonResponse({ items: [] })
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByTitle('3 posts')).toBeInTheDocument())
    expect(tagsCallCount).toBe(1)

    fireEvent(window, new Event(CLIENT_EVENTS.feedChanged))

    await waitFor(() => expect(screen.getByTitle('9 posts')).toBeInTheDocument())
    expect(tagsCallCount).toBe(2)
  })

  it('does NOT re-fetch on an unrelated event — the listener is scoped to the two documented events, not "anything happened on window"', async () => {
    let tagsCallCount = 0
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tags') {
        tagsCallCount++
        return jsonResponse({ tags: [{ tag: 'work', count: 5, isPublic: false, shareUrl: null }] })
      }
      return jsonResponse({ items: [] })
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())
    expect(tagsCallCount).toBe(1)

    fireEvent(window, new Event('stats-updated'))
    fireEvent(window, new CustomEvent('some-other-event'))

    // Give any (incorrect) async refetch a chance to land before asserting
    // the call count never moved.
    await new Promise((r) => setTimeout(r, 20))
    expect(tagsCallCount).toBe(1)
  })
})
