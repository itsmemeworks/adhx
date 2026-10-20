/**
 * @vitest-environment jsdom
 *
 * Settings → Invite someone, and /invite/done: making, copying and revoking
 * an invite; the done page showing the phone code straight away.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InviteCard } from '@/components/next/settings/InviteCard'
import { InviteDoneClient } from '@/app/invite/done/InviteDoneClient'

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(async (text: string) => `data:image/png;base64,${btoa(text)}`) },
}))

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)

type Invite = {
  id: string
  createdAt: string
  expiresAt: string
  nameHint: string | null
  createdBy: string
  mine: boolean
}

let canInvite: boolean
let invites: Invite[]
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  canInvite = true
  invites = []
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method || 'GET'
    if (url === '/api/invites' && method === 'GET') return json({ canInvite, invites })
    if (url === '/api/invites' && method === 'POST') {
      const { nameHint } = JSON.parse(String(init?.body))
      const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
      invites = [
        {
          id: 'inv_1',
          createdAt: new Date().toISOString(),
          expiresAt,
          nameHint: nameHint ?? null,
          createdBy: 'ana',
          mine: true,
        },
      ]
      return json({ id: 'inv_1', url: 'http://localhost:3000/invite/TOKEN', expiresAt }, 201)
    }
    if (url === '/api/invites/inv_1' && method === 'DELETE') {
      invites = []
      return json({ revoked: true })
    }
    if (url === '/api/app/pairing' && method === 'POST') {
      return json(
        { code: 'ABCD2345', expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() },
        201,
      )
    }
    if (url === '/api/app/phones') return json({ phones: [] })
    return json({}, 404)
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('InviteCard', () => {
  it('makes a link, copies it and revokes it', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.assign(navigator, { clipboard: { writeText } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<InviteCard />)
    expect(await screen.findByText('None right now.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Who’s it for? (optional)'), {
      target: { value: 'Cleo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Make an invite link' }))
    expect(await screen.findByText('http://localhost:3000/invite/TOKEN')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/invites',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ nameHint: 'Cleo' }) }),
    )
    expect(await screen.findByText('7 days left')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('http://localhost:3000/invite/TOKEN'),
    )
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Revoke the invite for Cleo' }))
    expect(await screen.findByText('None right now.')).toBeInTheDocument()
    expect(screen.queryByText('http://localhost:3000/invite/TOKEN')).not.toBeInTheDocument()
  })

  it('offers the share sheet when the device has one', async () => {
    const share = vi.fn(() => Promise.resolve())
    Object.assign(navigator, { share })
    render(<InviteCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Make an invite link' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Share…' }))
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'http://localhost:3000/invite/TOKEN' }),
      ),
    )
    Reflect.deleteProperty(navigator, 'share')
  })

  it('stays hidden for someone who can’t invite', async () => {
    canInvite = false
    const { container } = render(<InviteCard />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/invites', expect.anything()))
    expect(container).toBeEmptyDOMElement()
  })
})

describe('InviteDoneClient', () => {
  it('says you’re in and shows the phone code without being asked', async () => {
    render(<InviteDoneClient username="cleo" hasEmail={false} />)
    expect(screen.getByRole('heading', { name: /^You’re in, ?Cleo\.$/ })).toBeInTheDocument()
    const qr = await screen.findByRole('img', { name: 'QR code to connect your phone' })
    expect(atob(qr.getAttribute('src')!.split(',')[1])).toBe(
      `adhx://pair?server=${encodeURIComponent(window.location.origin)}&code=ABCD2345`,
    )
    expect(screen.getAllByText('ABCD-2345').length).toBeGreaterThan(0)
    // On a phone, the app opens with the code filled in.
    expect(screen.getByRole('link', { name: 'Connect this phone' })).toHaveAttribute(
      'href',
      `adhx://pair?server=${encodeURIComponent(window.location.origin)}&code=ABCD2345`,
    )
    expect(screen.getByRole('link', { name: 'Skip, take me to the feed' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings#account',
    )
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/app/pairing')).toHaveLength(1)
  })
})
