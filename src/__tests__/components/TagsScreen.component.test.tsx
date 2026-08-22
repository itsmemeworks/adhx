/**
 * @vitest-environment jsdom
 *
 * TagsScreen (`/tags`) component tests (unified-theater-triage.md §4) —
 * covers the poster-card grid render (counts + the Public/Private visibility
 * toggle), toggling to public (PATCH make-public + copy the friendly URL),
 * toggling to private, the empty state, and the card's `?tag=` link target.
 *
 * The visibility toggle is a SINGLE top-right control that is both the state
 * indicator and the action (owner review: "what's the point in having Make
 * Public in a different place from Make Private?") — public tags show a
 * "Public" pill that makes the tag private on click, private tags show a
 * "Private" pill that makes it public on click.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import { TagsClient } from '@/app/tags/TagsClient'

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)
}

describe('TagsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders each tag with its post count', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tags') {
        return jsonResponse({
          tags: [
            { tag: 'work', count: 5, isPublic: false, shareUrl: null },
            { tag: 'reading', count: 1, isPublic: false, shareUrl: null },
          ],
        })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())
    // The post count is now an icon badge showing just the number — the
    // word "posts"/"post" only lives in its title/aria-label for a11y.
    expect(screen.getByTitle('5 posts')).toBeInTheDocument()
    expect(screen.getByText('#reading')).toBeInTheDocument()
    expect(screen.getByTitle('1 post')).toBeInTheDocument()
  })

  it('shows the empty state when there are no tags', async () => {
    global.fetch = vi
      .fn()
      .mockImplementation(() => jsonResponse({ tags: [] })) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText(/no tags yet/i)).toBeInTheDocument())
  })

  it('shows a Public chip and copyable share URL for a public tag', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tags') {
        return jsonResponse({
          tags: [{ tag: 'work', count: 3, isPublic: true, shareUrl: '/t/tester/work' }],
        })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())
    expect(screen.getByText('Public')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open/i })).toHaveAttribute('href', '/t/tester/work')
  })

  it('the poster card links to /library?tag={tag} — the grid moved off `/`', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tags') {
        return jsonResponse({ tags: [{ tag: 'work', count: 2, isPublic: false, shareUrl: null }] })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'View #work' })).toHaveAttribute(
      'href',
      '/library?tag=work',
    )
  })

  it('clicking the "Private" toggle PATCHes make-public and copies the friendly URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/tags' && !init) {
        return jsonResponse({ tags: [{ tag: 'work', count: 3, isPublic: false, shareUrl: null }] })
      }
      if (url === '/api/tags' && init?.method === 'PATCH') {
        expect(JSON.parse(init.body as string)).toEqual({ tag: 'work', isPublic: true })
        return jsonResponse({ success: true, shareUrl: '/t/tester/work', isPublic: true })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Make public' }))

    await waitFor(() => expect(screen.getByText('Public')).toBeInTheDocument())
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/t/tester/work')),
    )
  })

  it('shows a visible inline error when the PATCH fails, and keeps the card private', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/tags' && !init) {
        return jsonResponse({ tags: [{ tag: 'work', count: 3, isPublic: false, shareUrl: null }] })
      }
      if (url === '/api/tags' && init?.method === 'PATCH') {
        return jsonResponse({ error: 'User not found' }, false)
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Make public' }))

    await waitFor(() => expect(screen.getByText('User not found')).toBeInTheDocument())
    expect(screen.queryByText('Public')).not.toBeInTheDocument()
  })

  it('shows a visible inline error when the PATCH request throws (network failure)', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/tags' && !init) {
        return jsonResponse({ tags: [{ tag: 'work', count: 3, isPublic: false, shareUrl: null }] })
      }
      if (url === '/api/tags' && init?.method === 'PATCH') {
        return Promise.reject(new Error('network down'))
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Make public' }))

    await waitFor(() => expect(screen.getByText(/couldn't reach the server/i)).toBeInTheDocument())
  })

  it('still flips the card public when the clipboard write rejects, and shows a copy hint', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    Object.assign(navigator, { clipboard: { writeText } })

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/tags' && !init) {
        return jsonResponse({ tags: [{ tag: 'work', count: 3, isPublic: false, shareUrl: null }] })
      }
      if (url === '/api/tags' && init?.method === 'PATCH') {
        return jsonResponse({ success: true, shareUrl: '/t/tester/work', isPublic: true })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Make public' }))

    // The card flips public regardless of the clipboard outcome.
    await waitFor(() => expect(screen.getByText('Public')).toBeInTheDocument())
    await waitFor(() =>
      expect(screen.getByText(/couldn't copy automatically/i)).toBeInTheDocument(),
    )
  })

  it('renders a content mosaic for a tag with posts', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tags') {
        return jsonResponse({
          tags: [{ tag: 'work', count: 6, isPublic: false, shareUrl: null }],
        })
      }
      if (url.startsWith('/api/feed?tag=work')) {
        return jsonResponse({
          items: [
            {
              id: '1',
              platform: 'twitter',
              author: 'alice',
              text: 'hello world',
              tweetUrl: 'https://x.com/alice/status/1',
              processedAt: '2026-01-01T00:00:00.000Z',
              isRead: false,
              media: [
                {
                  id: 'm1',
                  mediaType: 'photo',
                  url: 'https://example.com/full.jpg',
                  thumbnailUrl: 'https://example.com/thumb.jpg',
                  shareUrl: 'https://example.com/full.jpg',
                },
              ],
              links: null,
              tags: ['work'],
            },
            {
              id: '2',
              platform: 'twitter',
              author: 'bob',
              text: 'a text-only post with no media at all here',
              tweetUrl: 'https://x.com/bob/status/2',
              processedAt: '2026-01-01T00:00:00.000Z',
              isRead: false,
              media: null,
              links: null,
              tags: ['work'],
            },
            {
              id: '3',
              platform: 'twitter',
              author: 'carol',
              text: 'third post',
              tweetUrl: 'https://x.com/carol/status/3',
              processedAt: '2026-01-01T00:00:00.000Z',
              isRead: false,
              media: null,
              links: null,
              tags: ['work'],
            },
            {
              id: '4',
              platform: 'twitter',
              author: 'dave',
              text: 'fourth post',
              tweetUrl: 'https://x.com/dave/status/4',
              processedAt: '2026-01-01T00:00:00.000Z',
              isRead: false,
              media: null,
              links: null,
              tags: ['work'],
            },
          ],
        })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByAltText('')).toBeInTheDocument())
    expect(screen.getByAltText('')).toHaveAttribute('src', 'https://example.com/thumb.jpg')
    expect(screen.getByText(/a text-only post/i)).toBeInTheDocument()
    // 6 posts in the tag, all 4 (PREVIEW_LIMIT) tiles fetched → the 4th cell
    // becomes the overflow tile: N = count - 3 = 3.
    expect(screen.getByText('+3')).toBeInTheDocument()
  })

  it('filters the tag list on a "tags-search" window event (case-insensitive substring match)', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tags') {
        return jsonResponse({
          tags: [
            { tag: 'work', count: 5, isPublic: false, shareUrl: null },
            { tag: 'reading', count: 1, isPublic: false, shareUrl: null },
          ],
        })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())
    expect(screen.getByText('#reading')).toBeInTheDocument()

    fireEvent(window, new CustomEvent('tags-search', { detail: 'WOR' }))

    await waitFor(() => expect(screen.queryByText('#reading')).not.toBeInTheDocument())
    expect(screen.getByText('#work')).toBeInTheDocument()
  })

  it('shows a "No tags match" empty state when the search term matches nothing', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tags') {
        return jsonResponse({
          tags: [{ tag: 'work', count: 5, isPublic: false, shareUrl: null }],
        })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())

    fireEvent(window, new CustomEvent('tags-search', { detail: 'nonexistent' }))

    await waitFor(() => expect(screen.getByText("No tags match 'nonexistent'")).toBeInTheDocument())
    expect(screen.queryByText('#work')).not.toBeInTheDocument()
  })

  it('clicking the "Public" toggle PATCHes isPublic: false and drops the Public chip', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/tags' && !init) {
        return jsonResponse({
          tags: [{ tag: 'work', count: 3, isPublic: true, shareUrl: '/t/tester/work' }],
        })
      }
      if (url === '/api/tags' && init?.method === 'PATCH') {
        expect(JSON.parse(init.body as string)).toEqual({ tag: 'work', isPublic: false })
        return jsonResponse({ success: true, shareUrl: '/t/tester/work', isPublic: false })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('Public')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Make private' }))

    await waitFor(() => expect(screen.queryByText('Public')).not.toBeInTheDocument())
  })

  it('renders the rank medallion (top-left) instead of a footer rank chip for a charting public tag', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tags') {
        return jsonResponse({
          tags: [
            {
              tag: 'work',
              count: 3,
              isPublic: true,
              shareUrl: '/t/tester/work',
              viewCount: 42,
              cloneCount: 5,
              rank: 2,
            },
          ],
        })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    const { container } = render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())
    // The rank medallion renders top-left...
    const medallion = container.querySelector('.left-3.top-3')
    expect(medallion).toHaveTextContent('2')
    // ...and the footer badge row has no separate "#2" rank chip (it would
    // otherwise be overlapped by the copy/open action buttons).
    expect(screen.queryByTitle('#2 this week')).not.toBeInTheDocument()
  })
})
