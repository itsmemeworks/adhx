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

// Defaults to non-iOS (matches jsdom's default UA) — the iOS describe block
// below flips this in its own beforeEach.
let mockIos = false
vi.mock('@/lib/platform', () => ({
  isIOSDevice: () => mockIos,
}))

describe('PasteLinkButton — non-iOS (readText flow, unchanged)', () => {
  beforeEach(() => {
    mockIos = false
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

  it('shows the "Paste" retry button and the "come back and tap Paste" copy', async () => {
    Object.assign(navigator, { clipboard: undefined })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Paste' })).toBeInTheDocument())
    expect(screen.getByText(/then come back and tap paste/i)).toBeInTheDocument()
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

    // The outside-click listener attaches in an effect after the overlay
    // opens — poll rather than asserting synchronously, or a slow CI runner
    // can fire the mousedown before the listener exists (real flake, seen on
    // the PR #385 run; the behavior itself is live-browser verified).
    await waitFor(() => {
      fireEvent.mouseDown(document.body)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('closes the overlay on Escape', async () => {
    Object.assign(navigator, { clipboard: undefined })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'Escape' })
    // Poll: the dialog is portalled to <body>, so its unmount lands in a
    // later commit than the keydown — a synchronous assertion passes locally
    // and flakes on a slower CI runner (same failure mode as the
    // outside-click test above).
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes the overlay on the explicit close button', async () => {
    Object.assign(navigator, { clipboard: undefined })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
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

describe('PasteLinkButton — iOS (input-paste flow)', () => {
  beforeEach(() => {
    mockIos = true
    pushSpy.mockClear()
  })

  it('tapping the button never touches the clipboard — it just opens the overlay', async () => {
    const readText = vi.fn().mockResolvedValue('https://x.com/naval/status/1')
    Object.assign(navigator, { clipboard: { readText } })

    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(readText).not.toHaveBeenCalled()
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('autofocuses the manual input so iOS pops its native Paste callout on it', async () => {
    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    const input = await screen.findByPlaceholderText('Paste a link…')
    await waitFor(() => expect(input).toHaveFocus())
  })

  it('never renders the "Paste" retry button — the input is the only paste surface', async () => {
    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Paste' })).not.toBeInTheDocument()
  })

  it('ends the explainer with "then tap Paste above the box"', async () => {
    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    expect(await screen.findByText(/then tap paste above the box/i)).toBeInTheDocument()
  })

  it('the input font-size stays at 16px on mobile to avoid iOS auto-zoom on focus', async () => {
    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))

    const input = await screen.findByPlaceholderText('Paste a link…')
    expect(input.className).toMatch(/text-base/)
    expect(input.className).toMatch(/sm:text-\[13px\]/)
  })

  it('resolves and navigates synchronously off the paste event itself, no error shown', async () => {
    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))
    const input = await screen.findByPlaceholderText('Paste a link…')

    fireEvent.paste(input, {
      clipboardData: { getData: () => 'https://youtu.be/Y9aytLYBajw' },
    })

    expect(pushSpy).toHaveBeenCalledWith('/shorts/Y9aytLYBajw')
    expect(screen.queryByText(/not a supported link/i)).not.toBeInTheDocument()
  })

  it('a paste of unsupported text does not navigate or error until an explicit Go submit', async () => {
    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))
    const input = await screen.findByPlaceholderText('Paste a link…')

    fireEvent.paste(input, { clipboardData: { getData: () => 'not a link' } })
    expect(pushSpy).not.toHaveBeenCalled()
    expect(screen.queryByText(/not a link we recognize/i)).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'not a link' } })
    fireEvent.submit(input.closest('form')!)
    expect(await screen.findByText("That's not a link we recognize.")).toBeInTheDocument()
  })

  it('still closes on Escape', async () => {
    render(<PasteLinkButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste link' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('icon-only variant still autofocuses the input with no retry button', async () => {
    render(<PasteLinkButton iconOnly />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }))

    const input = await screen.findByPlaceholderText('Paste a link…')
    await waitFor(() => expect(input).toHaveFocus())
    expect(screen.queryByRole('button', { name: 'Paste' })).not.toBeInTheDocument()
  })
})

/**
 * Owner report with a screenshot: tapping the icon-only Paste button in the
 * theater's mobile top bar opened the helper anchored under the button, then
 * iOS's keyboard appeared and Safari's focus-scroll dragged the panel off the
 * top of the screen — "not intuitive at all. Maybe we just need to use a
 * better model for capturing the paste that will automatically center?"
 *
 * The panel is now a portalled dialog centred in the VISIBLE viewport, so the
 * keyboard shrinks the box it centres in instead of pushing it away.
 */
describe('PasteLinkButton — the helper is a centred dialog, not an anchored popover', () => {
  beforeEach(() => {
    mockIos = true
    pushSpy.mockClear()
    Object.assign(navigator, { clipboard: undefined })
  })

  // These tests replace `navigator` and define `window.visualViewport`; both
  // must be put back or they leak into every test that runs after them.
  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(window, 'visualViewport')
  })

  /** Pretend a keyboard is open: a short visual viewport, offset down the page. */
  function stubVisualViewport(height: number, offsetTop = 0) {
    const listeners: Record<string, (() => void)[]> = {}
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        height,
        offsetTop,
        addEventListener: (t: string, fn: () => void) => {
          ;(listeners[t] ??= []).push(fn)
        },
        removeEventListener: () => {},
      },
    })
  }

  it('renders outside the button subtree, so no transformed ancestor can trap it', async () => {
    stubVisualViewport(844)
    const { container } = render(<PasteLinkButton iconOnly />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    // Portalled to <body>: `position: fixed` resolves against the viewport
    // rather than the theater's transformed scrims.
    expect(container.contains(dialog)).toBe(false)
  })

  it('centres itself in the space the keyboard leaves', async () => {
    // 844-tall screen with a ~420px keyboard open.
    stubVisualViewport(424, 0)
    render(<PasteLinkButton iconOnly />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }))

    const dialog = await screen.findByRole('dialog')
    const box = dialog.parentElement!
    expect(box).toHaveStyle({ height: '424px' })
    // Flex-centred inside that box, so the panel sits above the keyboard.
    expect(box.className).toContain('items-center')
    expect(box.className).toContain('fixed')
  })

  it('follows the viewport when Safari scrolls the page under the keyboard', async () => {
    stubVisualViewport(424, 130)
    render(<PasteLinkButton iconOnly />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }))

    const box = (await screen.findByRole('dialog')).parentElement!
    // Offset, not pinned to 0 — this is what kept the panel on screen.
    expect(box).toHaveStyle({ top: '130px' })
  })

  it('falls back to the full screen where visualViewport is unavailable', async () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
    render(<PasteLinkButton iconOnly />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }))

    const box = (await screen.findByRole('dialog')).parentElement!
    expect(box).toHaveStyle({ top: '0px' })
  })

  it('keeps a tap inside the dialog from dismissing it', async () => {
    stubVisualViewport(424)
    render(<PasteLinkButton iconOnly />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste a link' }))

    const dialog = await screen.findByRole('dialog')
    // The panel lives outside containerRef now, so the outside-click handler
    // has to know about it explicitly or every tap in the field closes it.
    fireEvent.mouseDown(screen.getByPlaceholderText(/paste a link/i))
    expect(screen.queryByRole('dialog')).toBe(dialog)
  })
})
