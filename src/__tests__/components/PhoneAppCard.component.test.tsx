/**
 * @vitest-environment jsdom
 *
 * Settings → Phone app: showing a one-time QR code, noticing the phone
 * connect, and removing a phone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { PhoneAppCard } from '@/components/next/settings/PhoneAppCard'

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async (text: string) => `data:image/png;base64,${btoa(text)}`) },
}))

type Phone = { id: string; name: string; createdAt: string; lastUsedAt: string | null }

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)

let phones: Phone[]
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  phones = []
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || 'GET'
    if (url === '/api/app/phones') return json({ phones, max: 10 })
    if (url === '/api/app/pairing' && method === 'POST') {
      return json(
        { code: 'ABCD2345', expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() },
        201,
      )
    }
    if (url.startsWith('/api/app/phones/') && method === 'DELETE') {
      phones = phones.filter((p) => !url.endsWith(p.id))
      return json({ success: true })
    }
    return json({}, 404)
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PhoneAppCard', () => {
  it('shows a code only when asked, as a QR code holding this address', async () => {
    render(<PhoneAppCard />)
    expect(await screen.findByText('None yet.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/app/pairing', expect.anything())

    fireEvent.click(screen.getByRole('button', { name: 'Show the code' }))
    const qr = await screen.findByRole('img', { name: 'QR code to connect the phone app' })
    const held = atob(qr.getAttribute('src')!.split(',')[1])
    expect(held).toBe(
      `adhx://pair?server=${encodeURIComponent(window.location.origin)}&code=ABCD2345`,
    )
    expect(screen.getByText('ABCD-2345')).toBeInTheDocument()
    expect(screen.getByText('10 minutes left')).toBeInTheDocument()
  })

  it('notices the phone connecting and puts the code away', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<PhoneAppCard />)
    await screen.findByText('None yet.')
    fireEvent.click(screen.getByRole('button', { name: 'Show the code' }))
    await screen.findByText('ABCD-2345')

    phones = [{ id: 'p1', name: 'Pixel 8', createdAt: new Date().toISOString(), lastUsedAt: null }]
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100)
    })
    expect(await screen.findByText('Pixel 8 is connected. Share a post to try it.')).toBeVisible()
    expect(screen.queryByText('ABCD-2345')).not.toBeInTheDocument()
    expect(screen.getByText('Pixel 8')).toBeInTheDocument()
  })

  it('removes a phone after asking', async () => {
    phones = [{ id: 'p1', name: 'iPhone', createdAt: new Date().toISOString(), lastUsedAt: null }]
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PhoneAppCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove iPhone' }))
    await waitFor(() => expect(screen.getByText('None yet.')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/app/phones/p1', { method: 'DELETE' })
  })
})
