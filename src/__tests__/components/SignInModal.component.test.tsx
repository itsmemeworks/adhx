/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { StrictMode, useCallback, useState } from 'react'
import { SignInModal } from '@/components/auth/SignInModal'

function ModalHarness({ nested = false }: { nested?: boolean }) {
  const [open, setOpen] = useState(false)
  const modal = <SignInModal open={open} onClose={() => setOpen(false)} />

  return (
    <div data-testid="app-branch">
      <button type="button" onClick={() => setOpen(true)}>
        Open sign-in
      </button>
      <div data-testid="outside-content" aria-hidden="false">
        Background content
      </div>
      {nested ? <section data-testid="nested-modal-branch">{modal}</section> : modal}
    </div>
  )
}

function TwoModalHarness() {
  const [firstOpen, setFirstOpen] = useState(false)
  const [secondOpen, setSecondOpen] = useState(false)

  return (
    <div data-testid="two-modal-app">
      <button type="button" onClick={() => setFirstOpen(true)}>
        Open first modal
      </button>
      <button type="button" onClick={() => setSecondOpen(true)}>
        Open second modal
      </button>
      <button type="button" onClick={() => setFirstOpen(false)}>
        Close first externally
      </button>
      <div data-testid="two-modal-background" aria-hidden="false">
        Background
      </div>
      <SignInModal open={firstOpen} onClose={() => setFirstOpen(false)} title="First modal" />
      <SignInModal open={secondOpen} onClose={() => setSecondOpen(false)} title="Second modal" />
    </div>
  )
}

function StrictMountHarness() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Mount sign-in
      </button>
      <div data-testid="strict-background" aria-hidden="false">
        Background
      </div>
      {open && <SignInModal open onClose={() => setOpen(false)} />}
    </div>
  )
}

function EscapeOrderHarness() {
  const [firstOpen, setFirstOpen] = useState(false)
  const [secondOpen, setSecondOpen] = useState(false)
  const [listenerVersion, setListenerVersion] = useState(0)
  const closeSecond = useCallback(() => setSecondOpen(false), [])

  return (
    <div>
      <button type="button" onClick={() => setFirstOpen(true)}>
        Open order first
      </button>
      <button type="button" onClick={() => setSecondOpen(true)}>
        Open order second
      </button>
      <button type="button" onClick={() => setListenerVersion((version) => version + 1)}>
        Reorder first listener
      </button>
      <span data-testid="listener-version">{listenerVersion}</span>
      <SignInModal
        open={firstOpen}
        onClose={() => {
          void listenerVersion
          setFirstOpen(false)
        }}
        title="Order first modal"
      />
      <SignInModal open={secondOpen} onClose={closeSecond} title="Order second modal" />
    </div>
  )
}

describe('SignInModal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders nothing when closed', () => {
    const { container } = render(<SignInModal open={false} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the default title and email sign-in only', () => {
    render(<SignInModal open onClose={vi.fn()} />)
    expect(screen.getByText('Sign in to ADHX')).toBeInTheDocument()
    expect(screen.getByText('Email me a magic link')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close sign-in' })).toBeVisible()
    expect(screen.queryByText('Continue with')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /continue with/i })).not.toBeInTheDocument()
  })

  it('renders a custom title and subtitle', () => {
    render(
      <SignInModal
        open
        onClose={vi.fn()}
        title="Save this to your collection"
        subtitle="12 posts from claude-code, curated by @weedauwl — keep them in your collection."
      />,
    )
    expect(screen.getByText('Save this to your collection')).toBeInTheDocument()
    expect(screen.getByText(/curated by @weedauwl/)).toBeInTheDocument()
  })

  it('does not offer X as a sign-in method', () => {
    render(<SignInModal open onClose={vi.fn()} returnTo="/trending" />)
    expect(document.querySelector('a[href^="/api/auth/twitter"]')).toBeNull()
  })

  it('submits the email and shows the success state', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })

    render(<SignInModal open onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.click(screen.getByText('Email me a magic link'))

    await waitFor(() => expect(screen.getByText('Check your inbox')).toBeInTheDocument())
    expect(screen.getByText(/We sent a sign-in link to user@example.com/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/email/request',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('shows a validation error for an invalid email without calling the API', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    render(<SignInModal open onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByText('Email me a magic link'))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows an inline error on a 429 response', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Slow down.' }),
    })

    render(<SignInModal open onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.click(screen.getByText('Email me a magic link'))

    expect(await screen.findByText('Slow down.')).toBeInTheDocument()
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument()
  })

  it('shows an inline error on a 503 response', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Down for maintenance.' }),
    })

    render(<SignInModal open onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.click(screen.getByText('Email me a magic link'))

    expect(await screen.findByText('Down for maintenance.')).toBeInTheDocument()
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<SignInModal open onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('focuses email first and wraps Tab and Shift+Tab inside the dialog', async () => {
    render(<SignInModal open onClose={vi.fn()} />)
    const emailInput = screen.getByLabelText('Email address')
    const closeButton = screen.getByRole('button', { name: 'Close sign-in' })
    const submitButton = screen.getByRole('button', { name: 'Email me a magic link' })

    await waitFor(() => expect(emailInput).toHaveFocus())

    submitButton.focus()
    fireEvent.keyDown(submitButton, { key: 'Tab' })
    expect(closeButton).toHaveFocus()

    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true })
    expect(submitButton).toHaveFocus()
  })

  it('contains theater shortcuts before they reach window handlers', async () => {
    const backgroundShortcut = vi.fn()
    window.addEventListener('keydown', backgroundShortcut)
    try {
      render(<SignInModal open onClose={vi.fn()} />)
      const emailInput = screen.getByLabelText('Email address')
      await waitFor(() => expect(emailInput).toHaveFocus())

      fireEvent.keyDown(emailInput, { key: 's' })
      fireEvent.keyDown(screen.getByRole('button', { name: 'Close sign-in' }), { key: ' ' })
      expect(backgroundShortcut).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', backgroundShortcut)
    }
  })

  it('calls onClose when clicking the backdrop but not the card', () => {
    const onClose = vi.fn()
    render(<SignInModal open onClose={onClose} />)
    fireEvent.mouseDown(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('isolates nested background branches and restores their prior attributes on close', async () => {
    render(<ModalHarness nested />)
    const invokingButton = screen.getByRole('button', { name: 'Open sign-in' })
    const outsideContent = screen.getByTestId('outside-content')

    invokingButton.focus()
    fireEvent.click(invokingButton)

    await waitFor(() => {
      expect(invokingButton).toHaveAttribute('inert')
      expect(invokingButton).toHaveAttribute('aria-hidden', 'true')
      expect(outsideContent).toHaveAttribute('inert')
      expect(outsideContent).toHaveAttribute('aria-hidden', 'true')
    })
    expect(screen.getByRole('dialog')).not.toHaveAttribute('inert')

    fireEvent.click(screen.getByRole('button', { name: 'Close sign-in' }))

    expect(invokingButton).toHaveFocus()
    expect(invokingButton).not.toHaveAttribute('inert')
    expect(invokingButton).not.toHaveAttribute('aria-hidden')
    expect(outsideContent).not.toHaveAttribute('inert')
    expect(outsideContent).toHaveAttribute('aria-hidden', 'false')
  })

  it('restores the exact invoking element after Escape', async () => {
    render(<ModalHarness />)
    const invokingButton = screen.getByRole('button', { name: 'Open sign-in' })
    invokingButton.focus()
    fireEvent.click(invokingButton)
    await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveFocus())

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(invokingButton).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('restores the exact invoking element after a backdrop close', async () => {
    render(<ModalHarness />)
    const invokingButton = screen.getByRole('button', { name: 'Open sign-in' })
    invokingButton.focus()
    fireEvent.click(invokingButton)
    await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveFocus())

    fireEvent.mouseDown(screen.getByRole('presentation'))

    expect(invokingButton).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('restores the exact invoking element when the open modal unmounts', async () => {
    const closedTree = (
      <>
        <button key="invoker" type="button">
          Persistent invoker
        </button>
        <SignInModal key="modal" open={false} onClose={vi.fn()} />
      </>
    )
    const { rerender } = render(closedTree)
    const invokingButton = screen.getByRole('button', { name: 'Persistent invoker' })
    invokingButton.focus()
    rerender(
      <>
        <button key="invoker" type="button">
          Persistent invoker
        </button>
        <SignInModal key="modal" open onClose={vi.fn()} />
      </>,
    )
    await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveFocus())

    rerender(
      <button key="invoker" type="button">
        Persistent invoker
      </button>,
    )

    expect(invokingButton).toHaveFocus()
  })

  it('keeps only the topmost modal active and hands focus back down the stack', async () => {
    render(<TwoModalHarness />)
    const firstTrigger = screen.getByRole('button', { name: 'Open first modal' })
    const secondTrigger = screen.getByRole('button', { name: 'Open second modal' })
    const background = screen.getByTestId('two-modal-background')

    firstTrigger.focus()
    fireEvent.click(firstTrigger)
    const firstDialog = await screen.findByRole('dialog', { name: 'First modal' })
    const firstInput = within(firstDialog).getByLabelText('Email address')
    await waitFor(() => expect(firstInput).toHaveFocus())

    // The second open can be driven by application state while the first
    // modal owns focus; jsdom does not implement inert click suppression.
    fireEvent.click(secondTrigger)
    const secondDialog = await screen.findByRole('dialog', { name: 'Second modal' })
    const secondInput = within(secondDialog).getByLabelText('Email address')
    await waitFor(() => expect(secondInput).toHaveFocus())

    const firstRoot = firstDialog.parentElement
    const secondRoot = secondDialog.parentElement
    expect(firstRoot).toHaveAttribute('inert')
    expect(firstRoot).toHaveAttribute('aria-hidden', 'true')
    expect(secondRoot).not.toHaveAttribute('inert')
    expect(secondRoot).not.toHaveAttribute('aria-hidden')
    expect(background).toHaveAttribute('inert')

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Second modal', hidden: true })).toBeNull(),
    )
    expect(firstRoot).not.toHaveAttribute('inert')
    expect(firstRoot).not.toHaveAttribute('aria-hidden')
    expect(firstInput).toHaveFocus()
    expect(background).toHaveAttribute('inert')

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'First modal' })).toBeNull())
    expect(firstTrigger).toHaveFocus()
    expect(background).not.toHaveAttribute('inert')
    expect(background).toHaveAttribute('aria-hidden', 'false')
  })

  it('does not restore a lower modal invoker while a higher modal remains open', async () => {
    render(<TwoModalHarness />)
    const firstTrigger = screen.getByRole('button', { name: 'Open first modal' })
    const secondTrigger = screen.getByRole('button', { name: 'Open second modal' })
    const closeFirst = screen.getByRole('button', { name: 'Close first externally' })

    fireEvent.click(firstTrigger)
    const firstDialog = await screen.findByRole('dialog', { name: 'First modal' })
    await waitFor(() => expect(within(firstDialog).getByLabelText('Email address')).toHaveFocus())
    fireEvent.click(secondTrigger)
    const secondDialog = await screen.findByRole('dialog', { name: 'Second modal' })
    const secondInput = within(secondDialog).getByLabelText('Email address')
    await waitFor(() => expect(secondInput).toHaveFocus())

    fireEvent.click(closeFirst)

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'First modal', hidden: true })).toBeNull(),
    )
    expect(secondInput).toHaveFocus()
    expect(secondDialog.parentElement).not.toHaveAttribute('inert')
  })

  it('closes exactly one modal when listener order differs from stack order', async () => {
    render(<EscapeOrderHarness />)
    const openFirst = screen.getByRole('button', { name: 'Open order first' })
    const openSecond = screen.getByRole('button', { name: 'Open order second' })
    const reorderListener = screen.getByRole('button', { name: 'Reorder first listener' })

    fireEvent.click(openFirst)
    await screen.findByRole('dialog', { name: 'Order first modal' })
    fireEvent.click(openSecond)
    await screen.findByRole('dialog', { name: 'Order second modal' })

    // Before Escape ownership moved into the coordinator, this rerender
    // re-registered the lower modal's capture listener after the upper one.
    // Both listeners then handled the same event as the stack changed.
    fireEvent.click(reorderListener)
    expect(screen.getByTestId('listener-version')).toHaveTextContent('1')

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Order second modal', hidden: true })).toBeNull(),
    )
    expect(screen.getByRole('dialog', { name: 'Order first modal' })).toBeInTheDocument()
  })

  it('survives Strict Mode effect replay without leaking isolation or focus state', async () => {
    render(
      <StrictMode>
        <StrictMountHarness />
      </StrictMode>,
    )
    const invokingButton = screen.getByRole('button', { name: 'Mount sign-in' })
    const outsideContent = screen.getByTestId('strict-background')

    invokingButton.focus()
    fireEvent.click(invokingButton)
    await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveFocus())
    expect(outsideContent).toHaveAttribute('inert')
    expect(screen.getByRole('dialog')).not.toHaveAttribute('inert')

    fireEvent.click(screen.getByRole('button', { name: 'Close sign-in' }))

    expect(invokingButton).toHaveFocus()
    expect(outsideContent).not.toHaveAttribute('inert')
    expect(outsideContent).toHaveAttribute('aria-hidden', 'false')
  })

  it('lets "Use a different email" return to the form', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })

    render(<SignInModal open onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.click(screen.getByText('Email me a magic link'))
    await screen.findByText('Check your inbox')

    fireEvent.click(screen.getByText('Use a different email'))
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
  })

  it('moves focus to the success action after the stage transition', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })

    render(<SignInModal open onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.click(screen.getByText('Email me a magic link'))

    const successAction = await screen.findByRole('button', { name: 'Use a different email' })
    await waitFor(() => expect(successAction).toHaveFocus())
  })
})
