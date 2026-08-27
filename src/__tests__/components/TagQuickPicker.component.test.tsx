/**
 * @vitest-environment jsdom
 *
 * TagQuickPicker Component Tests (unified-theater-collection §4 — tags: create + fill)
 *
 * Covers: loading the tag list + current post tags on open, toggling
 * membership via POST/DELETE with optimistic checkbox state, inline
 * "+ New tag" create, and close behavior (Escape + outside click).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import { TagQuickPicker } from '@/components/tags/TagQuickPicker'
import { resetClientEventBridgeForTests, setClientEventAccount } from '@/lib/client-events'

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

function pressPickerKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('TagQuickPicker Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetClientEventBridgeForTests()
    setClientEventAccount('account-a')
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

  it('creates a new tag inline, POSTs it, and closes', async () => {
    const onClose = vi.fn()
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={onClose} />)

    await waitFor(() => expect(screen.getByText('#work')).toBeTruthy())
    const input = screen.getByPlaceholderText('New tag')
    fireEvent.change(input, { target: { value: 'Claude Code!' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/bookmarks/tw1/tags?platform=twitter',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ tag: 'claude-code' }),
        }),
      ),
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('dispatches bookmark-tags-changed with the full updated tag list on toggle', async () => {
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('#reading')).toBeTruthy())
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    fireEvent.click(screen.getByText('#reading'))

    await waitFor(() => {
      const changeEvent = dispatchSpy.mock.calls
        .map((call) => call[0] as CustomEvent)
        .find((e) => e.type === 'bookmark-tags-changed')
      expect(changeEvent).toBeDefined()
      expect(changeEvent?.detail).toEqual({
        platform: 'twitter',
        bookmarkId: 'tw1',
        tags: ['work', 'reading'],
      })
    })
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

  it('autofocuses the new-tag input on open', async () => {
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText('New tag name')).toHaveFocus())
  })

  it('ArrowDown moves from the input onto the first tag; Space toggles it', async () => {
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('#work')).toBeTruthy())
    expect(screen.getByLabelText('New tag name')).toHaveFocus()

    pressPickerKey('ArrowDown')
    const workRow = screen.getByText('#work').closest('button')!
    expect(workRow).toHaveFocus()

    pressPickerKey(' ')
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/bookmarks/tw1/tags?platform=twitter',
        expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ tag: 'work' }) }),
      ),
    )
  })

  it('ArrowDown then ArrowDown reaches the next tag; Enter toggles it', async () => {
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('#reading')).toBeTruthy())

    pressPickerKey('ArrowDown')
    pressPickerKey('ArrowDown')
    expect(screen.getByText('#reading').closest('button')).toHaveFocus()

    pressPickerKey('Enter')
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/bookmarks/tw1/tags?platform=twitter',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ tag: 'reading' }) }),
      ),
    )
  })

  it("lists the post's active tags first", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tags') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            tags: [
              { tag: 'reading', count: 2 },
              { tag: 'work', count: 5 },
              { tag: 'later', count: 1 },
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
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) })
    }) as unknown as typeof fetch

    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('#work')).toBeTruthy())
    const rows = screen.getAllByRole('button').filter((el) => el.hasAttribute('data-tag-option'))
    expect(rows[0]).toHaveTextContent('#work')
    expect(rows[1]).toHaveTextContent('#reading')
    expect(rows[2]).toHaveTextContent('#later')
  })

  it('does not add a sixth tag', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/tags') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            tags: [
              { tag: 'one', count: 1 },
              { tag: 'two', count: 1 },
              { tag: 'three', count: 1 },
              { tag: 'four', count: 1 },
              { tag: 'five', count: 1 },
              { tag: 'six', count: 1 },
            ],
          }),
        })
      }
      if (url.startsWith('/api/feed')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [{ id: 'tw1', tags: ['one', 'two', 'three', 'four', 'five'] }],
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) })
    }) as unknown as typeof fetch

    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('#six')).toBeTruthy())
    expect(screen.getByText('#six').closest('button')).toBeDisabled()
    expect(screen.getByText('Maximum 5 tags')).toBeTruthy()
    fireEvent.click(screen.getByText('#six'))
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/bookmarks/tw1/tags?platform=twitter',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('ArrowUp from the first tag returns focus to the input', async () => {
    render(<TagQuickPicker platform="twitter" bookmarkId="tw1" open={true} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('#work')).toBeTruthy())

    pressPickerKey('ArrowDown')
    expect(screen.getByText('#work').closest('button')).toHaveFocus()
    pressPickerKey('ArrowUp')
    expect(screen.getByLabelText('New tag name')).toHaveFocus()
  })
})
