// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/t/you/memes',
}))
vi.mock('@/components/auth', () => ({
  useAuthMe: () => ({ me: { authenticated: true }, loading: false, refresh: vi.fn() }),
}))

import { ChannelPage } from '@/components/next/channels/ChannelPage'

const fetchMock = vi.fn()

function channel(isPublic: boolean, count = 2) {
  return { items: [], channel: { username: 'you', tag: 'memes', count, isPublic, mine: true } }
}

describe('ChannelPage for its owner', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('switches a public channel to private, and hides its link', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/channels/by/')) return new Response(JSON.stringify(channel(true)))
      if (url === '/api/tags' && init?.method === 'PATCH') return new Response('{"success":true}')
      return new Response('{"items":[]}')
    })
    render(<ChannelPage username="you" tag="memes" count={2} mine signedIn />)
    const privateButton = (await screen.findAllByRole('button', { name: 'Private' }))[0]
    expect(screen.getAllByRole('button', { name: /Copy link|adhx\.com/ }).length).toBeGreaterThan(0)
    fireEvent.click(privateButton)
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tags',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ tag: 'memes', isPublic: false }),
        }),
      ),
    )
    expect(screen.queryAllByRole('button', { name: /Copy link|adhx\.com/ })).toHaveLength(0)
    expect(screen.getByText(/· Private/)).toBeInTheDocument()
  })

  it('shows a private channel’s real post count to its owner', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('/api/channels/by/')
        ? new Response(JSON.stringify(channel(false, 7)))
        : new Response('{"items":[]}'),
    )
    render(<ChannelPage username="you" tag="memes" count={0} mine signedIn />)
    expect(await screen.findByText(/7 posts · Private/)).toBeInTheDocument()
  })

  it('puts the switch back and says so when the change fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/channels/by/')) return new Response(JSON.stringify(channel(true)))
      if (init?.method === 'PATCH') return new Response('{}', { status: 500 })
      return new Response('{"items":[]}')
    })
    render(<ChannelPage username="you" tag="memes" count={2} mine signedIn />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Private' }))[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t change that')
    expect(screen.getAllByRole('button', { name: 'Public' })[0]).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
