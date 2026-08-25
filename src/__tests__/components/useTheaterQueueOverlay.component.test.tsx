/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCallback, useRef, useState } from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { useTheaterQueueOverlay } from '@/components/theater/useTheaterQueueOverlay'
import { useTheaterKeyboard } from '@/components/theater/useTheaterKeyboard'

Element.prototype.scrollIntoView = vi.fn()

function press(key: string, opts: KeyboardEventInit = {}) {
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : window
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }),
  )
}

function Probe({
  items,
  onPlay,
  withFilter,
}: {
  items: { id: string; current?: boolean }[]
  onPlay?: (id: string) => void
  withFilter?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useTheaterQueueOverlay({ open, onClose: close, containerRef: ref })
  return (
    <div ref={ref} data-testid="queue">
      <button type="button" data-theater-action="show-all" onClick={() => setOpen((v) => !v)}>
        Show all
      </button>
      {open && withFilter ? (
        <div data-theater-queue-filter="" role="group" aria-label="Playlist filter">
          <button type="button">Videos</button>
        </div>
      ) : null}
      {open &&
        items.map((it) => (
          <button
            key={it.id}
            type="button"
            data-theater-queue-item=""
            aria-current={it.current ? 'true' : undefined}
            onClick={() => onPlay?.(it.id)}
          >
            {it.id}
          </button>
        ))}
    </div>
  )
}

const ITEMS = [{ id: 'first', current: true }, { id: 'second' }, { id: 'third' }]

describe('useTheaterQueueOverlay', () => {
  beforeEach(() => {
    vi.mocked(Element.prototype.scrollIntoView).mockClear()
  })

  it('focuses the current row when the playlist opens', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    render(<Probe items={ITEMS} />)
    fireEvent.click(screen.getByText('Show all'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveFocus())
    expect(focus.mock.calls.some((call) => call[0]?.preventScroll === true)).toBe(true)
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    focus.mockRestore()
  })

  it('can skip auto-focus so a bottom sheet does not pan the viewport', () => {
    function NoFocusProbe() {
      const [open, setOpen] = useState(false)
      const ref = useRef<HTMLDivElement>(null)
      const close = useCallback(() => setOpen(false), [])
      useTheaterQueueOverlay({ open, onClose: close, containerRef: ref, autoFocus: false })
      return (
        <div ref={ref}>
          <button type="button" data-theater-action="show-all" onClick={() => setOpen(true)}>
            Show all
          </button>
          {open ? (
            <button type="button" data-theater-queue-item="" aria-current="true">
              first
            </button>
          ) : null}
        </div>
      )
    }
    render(<NoFocusProbe />)
    fireEvent.click(screen.getByText('Show all'))
    expect(screen.getByRole('button', { name: 'first' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'first' })).not.toHaveFocus()
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })

  it('restores focus to Show all when the playlist closes', async () => {
    render(<Probe items={ITEMS} />)
    const toggle = screen.getByText('Show all')
    fireEvent.click(toggle)
    await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveFocus())
    act(() => press('Escape'))
    expect(toggle).toHaveFocus()
  })

  it('ArrowDown / ArrowUp move through the playlist and wrap', async () => {
    render(<Probe items={ITEMS} />)
    fireEvent.click(screen.getByText('Show all'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveFocus())

    act(() => press('ArrowDown'))
    expect(screen.getByRole('button', { name: 'second' })).toHaveFocus()
    act(() => press('ArrowDown'))
    expect(screen.getByRole('button', { name: 'third' })).toHaveFocus()
    act(() => press('ArrowDown'))
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus()
    act(() => press('ArrowUp'))
    expect(screen.getByRole('button', { name: 'third' })).toHaveFocus()
  })

  it('Escape and a click outside close; a click inside does not', async () => {
    render(<Probe items={ITEMS} />)
    fireEvent.click(screen.getByText('Show all'))
    expect(screen.getByTestId('queue').querySelectorAll('[data-theater-queue-item]')).toHaveLength(
      3,
    )

    fireEvent.mouseDown(screen.getByTestId('queue'))
    expect(screen.getByRole('button', { name: 'first' })).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('button', { name: 'first' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Show all'))
    expect(screen.getByRole('button', { name: 'first' })).toBeInTheDocument()
    act(() => press('Escape'))
    expect(screen.queryByRole('button', { name: 'first' })).not.toBeInTheDocument()
  })

  it('Enter plays the focused row', async () => {
    const onPlay = vi.fn()
    render(<Probe items={ITEMS} onPlay={onPlay} />)
    fireEvent.click(screen.getByText('Show all'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveFocus())
    act(() => press('ArrowDown'))
    act(() => press('Enter'))
    expect(onPlay).toHaveBeenCalledWith('second')
  })

  it('Q does not close on its own (the theater toggle owns that)', async () => {
    render(<Probe items={ITEMS} />)
    fireEvent.click(screen.getByText('Show all'))
    expect(screen.getByRole('button', { name: 'first' })).toBeInTheDocument()
    act(() => press('q'))
    expect(screen.getByRole('button', { name: 'first' })).toBeInTheDocument()
  })

  it('? and . close the playlist so help / menu are not stacked under it', async () => {
    render(<Probe items={ITEMS} />)
    fireEvent.click(screen.getByText('Show all'))
    expect(screen.getByRole('button', { name: 'first' })).toBeInTheDocument()
    act(() => press('?'))
    expect(screen.queryByRole('button', { name: 'first' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Show all'))
    act(() => press('.'))
    expect(screen.queryByRole('button', { name: 'first' })).not.toBeInTheDocument()
  })

  it('J / K / Space do not bubble to the stage while the playlist is open', async () => {
    const heard = vi.fn()
    window.addEventListener('keydown', heard)
    try {
      render(<Probe items={ITEMS} />)
      fireEvent.click(screen.getByText('Show all'))
      await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveFocus())
      heard.mockClear()
      act(() => press('j'))
      act(() => press('k'))
      act(() => press(' '))
      expect(heard).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', heard)
    }
  })

  it('Escape does not close the personal theater', async () => {
    const onClose = vi.fn()
    function Both() {
      useTheaterKeyboard({
        isPersonal: true,
        personalTab: 'collection',
        goNext: vi.fn(),
        goPrev: vi.fn(),
        setMuted: vi.fn(),
        undoLastAction: vi.fn(),
        onClose,
      })
      return <Probe items={ITEMS} />
    }
    render(<Both />)
    fireEvent.click(screen.getByText('Show all'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveFocus())
    act(() => press('Escape'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'first' })).not.toBeInTheDocument()
  })

  it('arrows from a filter pill do not move the list', async () => {
    render(<Probe items={ITEMS} withFilter />)
    fireEvent.click(screen.getByText('Show all'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'first' })).toHaveFocus())
    screen.getByRole('button', { name: 'Videos' }).focus()
    act(() => press('ArrowDown'))
    expect(screen.getByRole('button', { name: 'Videos' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'first' })).not.toHaveFocus()
  })
})
