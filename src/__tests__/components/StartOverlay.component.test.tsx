/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StartOverlay } from '@/components/theater/StartOverlay'
import { shouldShowStartOverlay } from '@/components/theater/TheaterShell'

describe('shouldShowStartOverlay', () => {
  const base = {
    mode: 'home' as const,
    startRequested: true,
    dismissed: false,
    authLoading: false,
    authenticated: false,
  }

  it('shows for ?start=1 while signed out on the live theater', () => {
    expect(shouldShowStartOverlay(base)).toBe(true)
  })

  it('stays hidden while auth state is still loading (no flash for authed visitors)', () => {
    expect(shouldShowStartOverlay({ ...base, authLoading: true })).toBe(false)
  })

  it('hides once the visitor is authenticated', () => {
    expect(shouldShowStartOverlay({ ...base, authenticated: true })).toBe(false)
  })

  it('hides without the start param', () => {
    expect(shouldShowStartOverlay({ ...base, startRequested: false })).toBe(false)
  })

  it('hides once dismissed', () => {
    expect(shouldShowStartOverlay({ ...base, dismissed: true })).toBe(false)
  })

  it('never shows outside the signed-out live theater (shared/collection/triage)', () => {
    expect(shouldShowStartOverlay({ ...base, mode: 'shared' })).toBe(false)
    expect(shouldShowStartOverlay({ ...base, mode: 'collection' })).toBe(false)
    expect(shouldShowStartOverlay({ ...base, mode: 'triage' })).toBe(false)
  })
})

describe('StartOverlay', () => {
  let assignSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignSpy },
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('renders nothing when closed', () => {
    const { container } = render(<StartOverlay open={false} onDismiss={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the teaching copy when open', () => {
    render(<StartOverlay open onDismiss={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Start your collection' })).toBeInTheDocument()
    expect(screen.getByText('Save anything you like')).toBeInTheDocument()
    expect(screen.getByText('Or paste a link')).toBeInTheDocument()
  })

  it('dismisses via the "Show me what\'s trending" action', () => {
    const onDismiss = vi.fn()
    render(<StartOverlay open onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText("Show me what's trending"))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses via the close button', () => {
    const onDismiss = vi.fn()
    render(<StartOverlay open onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses on backdrop click', () => {
    const onDismiss = vi.fn()
    const { container } = render(<StartOverlay open onDismiss={onDismiss} />)
    fireEvent.mouseDown(container.firstChild as Element)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not dismiss on a click inside the dialog panel', () => {
    const onDismiss = vi.fn()
    render(<StartOverlay open onDismiss={onDismiss} />)
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('dismisses on Escape', () => {
    const onDismiss = vi.fn()
    render(<StartOverlay open onDismiss={onDismiss} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('routes a valid X status URL pasted into the link input', () => {
    render(<StartOverlay open onDismiss={vi.fn()} />)
    const input = screen.getByLabelText('Paste a link to preview')
    fireEvent.change(input, { target: { value: 'https://x.com/alice/status/123456' } })
    fireEvent.click(screen.getByLabelText('Preview link'))
    expect(assignSpy).toHaveBeenCalledWith(expect.stringContaining('/alice/status/123456'))
  })

  it('shows an inline error for an unsupported link and does not navigate', () => {
    render(<StartOverlay open onDismiss={vi.fn()} />)
    const input = screen.getByLabelText('Paste a link to preview')
    fireEvent.change(input, { target: { value: 'not a link' } })
    fireEvent.click(screen.getByLabelText('Preview link'))
    expect(assignSpy).not.toHaveBeenCalled()
    expect(
      screen.getByText("That doesn't look like an X, Instagram, TikTok, or YouTube link."),
    ).toBeInTheDocument()
  })
})
