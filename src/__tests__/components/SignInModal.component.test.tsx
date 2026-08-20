/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SignInModal } from '@/components/auth/SignInModal'

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

  it('renders the default title and both sign-in options', () => {
    render(<SignInModal open onClose={vi.fn()} />)
    expect(screen.getByText('Sign in to ADHX')).toBeInTheDocument()
    expect(screen.getByText('Continue with')).toBeInTheDocument()
    expect(screen.getByText('Email me a magic link')).toBeInTheDocument()
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

  it('the "Continue with X" control links to the OAuth start route with returnTo', () => {
    render(<SignInModal open onClose={vi.fn()} returnTo="/trending" />)
    const link = screen.getByText('Continue with').closest('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('/api/auth/twitter?returnUrl=%2Ftrending')
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

  it('calls onClose when clicking the backdrop but not the card', () => {
    const onClose = vi.fn()
    render(<SignInModal open onClose={onClose} />)
    fireEvent.mouseDown(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
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
})
