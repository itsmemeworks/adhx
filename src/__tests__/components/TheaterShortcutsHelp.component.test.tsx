/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { TheaterShortcutsHelp } from '@/components/theater/TheaterShortcutsHelp'

describe('TheaterShortcutsHelp', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<TheaterShortcutsHelp open={false} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the theater keymap and closes on Escape or backdrop click', () => {
    const onClose = vi.fn()
    render(<TheaterShortcutsHelp open onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(dialog).toBeInTheDocument()
    expect(dialog.className).toMatch(/lg:max-w-2xl/)
    expect(screen.getByText('Play / pause')).toBeInTheDocument()
    expect(screen.getByText('Read / Watch')).toBeInTheDocument()
    expect(screen.getByText('Paste a link')).toBeInTheDocument()
    expect(screen.getByText('Menu')).toBeInTheDocument()
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on backdrop click and on ?', () => {
    const onClose = vi.fn()
    const { container } = render(<TheaterShortcutsHelp open onClose={onClose} />)
    const backdrop = container.querySelector('[aria-hidden]')
    expect(backdrop).toBeTruthy()
    act(() => {
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
