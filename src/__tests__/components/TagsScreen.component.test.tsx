/**
 * @vitest-environment jsdom
 *
 * TagsScreen (`/tags`) component tests (unified-theater-triage.md §4) —
 * covers the tag grid render (counts + Public chip), "Share as theater"
 * (PATCH make-public + copy the friendly URL), "Make private", the empty
 * state, and the "View" link's `?tag=` target.
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
    expect(screen.getByText('5 posts')).toBeInTheDocument()
    expect(screen.getByText('#reading')).toBeInTheDocument()
    expect(screen.getByText('1 post')).toBeInTheDocument()
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
    expect(screen.getByText('adhx.com/t/tester/work')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open/i })).toHaveAttribute('href', '/t/tester/work')
  })

  it('"View" links to /?tag={tag}', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tags') {
        return jsonResponse({ tags: [{ tag: 'work', count: 2, isPublic: false, shareUrl: null }] })
      }
      return jsonResponse({})
    }) as unknown as typeof fetch

    render(<TagsClient />)

    await waitFor(() => expect(screen.getByText('#work')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute('href', '/?tag=work')
  })

  it('"Share as theater" PATCHes make-public and copies the friendly URL', async () => {
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
    fireEvent.click(screen.getByText('Share as theater'))

    await waitFor(() => expect(screen.getByText('Public')).toBeInTheDocument())
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/t/tester/work')),
    )
  })

  it('"Make private" PATCHes isPublic: false and drops the Public chip', async () => {
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
    fireEvent.click(screen.getByText('Make private'))

    await waitFor(() => expect(screen.queryByText('Public')).not.toBeInTheDocument())
  })
})
