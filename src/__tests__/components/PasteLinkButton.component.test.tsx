/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PasteLinkButton } from '@/components/PasteLinkButton'

const pushSpy = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))

describe('PasteLinkButton', () => {
  beforeEach(() => {
    pushSpy.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the clipboard on tap and navigates to the matching preview path', async () => {
    const readText = vi.fn().mockResolvedValue('https://x.com/naval/status/2064012969239859490')
    Object.assign(navigator, { clipboard: { readText } })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    expect(readText).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/naval/status/2064012969239859490'))
  })

  it('shows a brief self-clearing error for clipboard text that is not a supported link', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const readText = vi.fn().mockResolvedValue('just some ordinary text')
    Object.assign(navigator, { clipboard: { readText } })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    await waitFor(() => expect(screen.getByText("That's not a supported link")).toBeInTheDocument())
    expect(pushSpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(3000)
    await waitFor(() => expect(screen.getByText('Paste link')).toBeInTheDocument())
  })

  it('opens the inline input fallback when the Clipboard API is unavailable', () => {
    Object.assign(navigator, { clipboard: undefined })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    expect(screen.getByTestId('paste-link-input-fallback')).toBeInTheDocument()
  })

  it('opens the inline input fallback when the clipboard read is denied', async () => {
    const readText = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    Object.assign(navigator, { clipboard: { readText } })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    await waitFor(() => expect(screen.getByTestId('paste-link-input-fallback')).toBeInTheDocument())
  })

  it('opens the inline input fallback when the clipboard is empty', async () => {
    const readText = vi.fn().mockResolvedValue('')
    Object.assign(navigator, { clipboard: { readText } })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    await waitFor(() => expect(screen.getByTestId('paste-link-input-fallback')).toBeInTheDocument())
  })

  it('navigates from the fallback input once a recognized link is typed', async () => {
    Object.assign(navigator, { clipboard: undefined })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    const input = screen.getByPlaceholderText('Paste a link…')
    fireEvent.change(input, { target: { value: 'https://youtu.be/Y9aytLYBajw' } })

    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/shorts/Y9aytLYBajw'))
  })

  it('icon-only variant renders no label', () => {
    render(<PasteLinkButton iconOnly />)
    const button = screen.getByRole('button', { name: 'Paste a link' })
    expect(button).not.toHaveTextContent('Paste link')
  })
})
