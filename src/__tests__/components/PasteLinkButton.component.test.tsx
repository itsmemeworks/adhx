/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

  it('reads the clipboard on tap and navigates immediately, with no overlay', async () => {
    const readText = vi.fn().mockResolvedValue('https://x.com/naval/status/2064012969239859490')
    Object.assign(navigator, { clipboard: { readText } })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    expect(readText).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/naval/status/2064012969239859490'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the helper overlay, with NO error text, when the clipboard holds non-link text', async () => {
    const readText = vi.fn().mockResolvedValue('just some ordinary text')
    Object.assign(navigator, { clipboard: { readText } })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(pushSpy).not.toHaveBeenCalled()
    expect(screen.queryByText(/not a supported link/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/not a link we recognize/i)).not.toBeInTheDocument()
  })

  it('opens the helper overlay when the Clipboard API is unavailable', async () => {
    Object.assign(navigator, { clipboard: undefined })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('opens the helper overlay when the clipboard read is denied', async () => {
    const readText = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    Object.assign(navigator, { clipboard: { readText } })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('opens the helper overlay when the clipboard is empty', async () => {
    const readText = vi.fn().mockResolvedValue('')
    Object.assign(navigator, { clipboard: { readText } })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })

  it('never autofocuses the manual input inside the overlay', async () => {
    Object.assign(navigator, { clipboard: undefined })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    const input = await screen.findByPlaceholderText('Paste a link…')
    expect(input).not.toHaveFocus()
  })

  it('the overlay Paste retry button re-reads the clipboard and navigates on success', async () => {
    const readText = vi
      .fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('https://youtu.be/Y9aytLYBajw')
    Object.assign(navigator, { clipboard: { readText } })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Paste' }))

    expect(readText).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/shorts/Y9aytLYBajw'))
  })

  it('the overlay Paste retry button shows an error only when the retry itself finds non-link text', async () => {
    const readText = vi.fn().mockResolvedValueOnce('').mockResolvedValueOnce('still not a link')
    Object.assign(navigator, { clipboard: { readText } })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.queryByText(/not a supported link/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Paste' }))
    await waitFor(() =>
      expect(screen.getByText("That's not a supported link.")).toBeInTheDocument(),
    )
  })

  it('navigates from the manual input once a recognized link is typed', async () => {
    Object.assign(navigator, { clipboard: undefined })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    const input = await screen.findByPlaceholderText('Paste a link…')
    fireEvent.change(input, { target: { value: 'https://youtu.be/Y9aytLYBajw' } })

    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/shorts/Y9aytLYBajw'))
  })

  it('manual submit of unsupported text shows an error', async () => {
    Object.assign(navigator, { clipboard: undefined })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    const input = await screen.findByPlaceholderText('Paste a link…')
    fireEvent.change(input, { target: { value: 'not a link' } })
    fireEvent.submit(input.closest('form')!)

    expect(await screen.findByText("That's not a link we recognize.")).toBeInTheDocument()
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('closes the overlay on outside click', async () => {
    Object.assign(navigator, { clipboard: undefined })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the overlay on Escape', async () => {
    Object.assign(navigator, { clipboard: undefined })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the overlay on the explicit close button', async () => {
    Object.assign(navigator, { clipboard: undefined })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('icon-only variant renders no label and still opens the overlay on a failed read', async () => {
    Object.assign(navigator, { clipboard: undefined })

    render(<PasteLinkButton iconOnly />)
    const button = screen.getByRole('button', { name: 'Paste a link' })
    expect(button).not.toHaveTextContent('Paste link')

    fireEvent.click(button)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })
})
