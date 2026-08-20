/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WelcomeClient } from '@/app/welcome/WelcomeClient'

// The chooser debounces its availability check by 350ms (see WelcomeClient.tsx)
// — real timers + a generous waitFor timeout are simpler and less brittle
// here than mixing vi.useFakeTimers() with @testing-library's async waitFor
// polling loop.
const DEBOUNCE_WAIT = { timeout: 2000 }

type FetchResponse = { ok: boolean; status?: number; json: () => Promise<unknown> }

function jsonResponse(body: unknown, status = 200): FetchResponse {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }
}

describe('WelcomeClient', () => {
  let assignSpy: ReturnType<typeof vi.fn>
  let fetchMock: ReturnType<typeof vi.fn>
  /** Response for the GET availability check (/api/auth/username?check=). */
  let checkResponse: FetchResponse
  /** Response for the POST claim (/api/auth/username). */
  let claimResponse: FetchResponse

  beforeEach(() => {
    assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignSpy },
      writable: true,
    })
    checkResponse = jsonResponse({ available: true, sanitized: '' })
    claimResponse = jsonResponse({ ok: true, username: '' })
    fetchMock = vi.fn((_url: string, init?: { method?: string }) =>
      Promise.resolve(init?.method === 'POST' ? claimResponse : checkResponse),
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('prefills the input with the suggested username', () => {
    render(<WelcomeClient suggestedUsername="j0hndoe" returnTo="/" />)
    const input = screen.getByLabelText('Username') as HTMLInputElement
    expect(input.value).toBe('j0hndoe')
  })

  it('runs a debounced availability check and shows "Available"', async () => {
    checkResponse = jsonResponse({ available: true, sanitized: 'freshname' })
    render(<WelcomeClient suggestedUsername="j0hndoe" returnTo="/" />)
    const input = screen.getByLabelText('Username') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'freshname' } })
    expect(fetchMock).not.toHaveBeenCalled() // debounced, not immediate

    await waitFor(() => expect(screen.getByText('Available')).toBeInTheDocument(), DEBOUNCE_WAIT)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/username?check=freshname'),
    )
  })

  it('shows "Taken — try another" and disables the claim button', async () => {
    checkResponse = jsonResponse({ available: false, sanitized: 'popular' })
    render(<WelcomeClient suggestedUsername="j0hndoe" returnTo="/" />)
    const input = screen.getByLabelText('Username') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'popular' } })

    await waitFor(
      () => expect(screen.getByText('Taken — try another')).toBeInTheDocument(),
      DEBOUNCE_WAIT,
    )
    expect(screen.getByRole('button', { name: /Claim @popular/ })).toBeDisabled()
  })

  it('claims the typed username and redirects to returnTo on success', async () => {
    claimResponse = jsonResponse({ ok: true, username: 'freshname' })
    render(<WelcomeClient suggestedUsername="j0hndoe" returnTo="/feed" />)
    const input = screen.getByLabelText('Username') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'freshname' } })
    fireEvent.click(screen.getByRole('button', { name: /Claim @freshname/ }))

    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('/feed'))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/username',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'freshname' }),
      }),
    )
  })

  it('"Keep @suggestion" submits the prefilled suggestion even after editing the field', async () => {
    claimResponse = jsonResponse({ ok: true, username: 'j0hndoe' })
    render(<WelcomeClient suggestedUsername="j0hndoe" returnTo="/" />)
    const input = screen.getByLabelText('Username') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'somethingelse' } })
    fireEvent.click(screen.getByRole('button', { name: /Keep @j0hndoe/ }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/username',
        expect.objectContaining({ body: JSON.stringify({ username: 'j0hndoe' }) }),
      ),
    )
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('/'))
  })

  it('shows an error message on a 409 and does not navigate', async () => {
    claimResponse = jsonResponse({ error: 'taken' }, 409)
    render(<WelcomeClient suggestedUsername="j0hndoe" returnTo="/" />)
    const input = screen.getByLabelText('Username') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'someone' } })
    fireEvent.click(screen.getByRole('button', { name: /Claim @someone/ }))

    await waitFor(() =>
      expect(screen.getByText('That username is already taken.')).toBeInTheDocument(),
    )
    expect(assignSpy).not.toHaveBeenCalled()
  })
})
