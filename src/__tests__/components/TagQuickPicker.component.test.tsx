/**
 * @vitest-environment jsdom
 *
 * TagQuickPicker Component Tests (unified-theater-triage §4 — tags: create + fill)
 *
 * Covers: loading the tag list + current post tags on open, toggling
 * membership via POST/DELETE with optimistic checkbox state, inline
 * "+ New tag" create, and close behavior (Escape + outside click).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import { TagQuickPicker } from '@/components/tags/TagQuickPicker'

function mockFetchSequence(): void {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/tags') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          tags: [
            { tag: 'work', count: 5 },
            { tag: 'reading', count: 2 },
          ],
        }),
      })
    }
    if (url.startsWith('/api/feed')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ items: [{ id: 'tw1', tags: ['work'] }] }),
      })
    }
    // POST/DELETE /api/bookmarks/[id]/tags
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) })
  }) as unknown as typeof fetch
}

describe('TagQuickPicker Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchSequence()
  })

  it('renders nothing when closed', () => {
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it("fetches /api/tags and the post's current tags on open", async () => {
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('#work')).toBeTruthy())
    expect(screen.getByText('#reading')).toBeTruthy()
    expect(global.fetch).toHaveBeenCalledWith('/api/tags')
    expect(global.fetch).toHaveBeenCalledWith('/api/feed?id=tw1&platform=twitter')
  })

  it('checks the tag the post already carries', async () => {
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('#work')).toBeTruthy())
    const workRow = screen.getByText('#work').closest('button')!
    const readingRow = screen.getByText('#reading').closest('button')!
    // Checked rows render a Check svg inside the checkbox span; unchecked don't.
    expect(workRow.querySelector('svg')).toBeTruthy()
    expect(readingRow.querySelector('svg')).toBeFalsy()
  })

  it('POSTs to add an unchecked tag and flips it to checked', async () => {
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('#reading')).toBeTruthy())
    fireEvent.click(screen.getByText('#reading'))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/bookmarks/tw1/tags?platform=twitter',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ tag: 'reading' }) }),
      ),
    )
    await waitFor(() =>
      expect(screen.getByText('#reading').closest('button')!.querySelector('svg')).toBeTruthy(),
    )
  })

  it('DELETEs to remove a checked tag and flips it to unchecked', async () => {
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('#work')).toBeTruthy())
    fireEvent.click(screen.getByText('#work'))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/bookmarks/tw1/tags?platform=twitter',
        expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ tag: 'work' }) }),
      ),
    )
    await waitFor(() =>
      expect(screen.getByText('#work').closest('button')!.querySelector('svg')).toBeFalsy(),
    )
  })

  it('creates a new tag inline and POSTs it against the current post', async () => {
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('#work')).toBeTruthy())
    const input = screen.getByPlaceholderText('New tag')
    fireEvent.change(input, { target: { value: 'Claude Code!' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/bookmarks/tw1/tags?platform=twitter',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ tag: 'claude-cod' }),
        }),
      ),
    )
    await waitFor(() => expect(screen.getByText('#claude-cod')).toBeTruthy())
  })

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn()
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('#work')).toBeTruthy())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on outside (backdrop) click', async () => {
    const onClose = vi.fn()
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    fireEvent.mouseDown(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not call onClose when clicking inside the dialog', async () => {
    const onClose = vi.fn()
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
