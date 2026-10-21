// @vitest-environment jsdom
/**
 * A shared post's page in the new theater: the post plays first, it saves on
 * a fresh signed-in open (or on return from sign-in with ?save=1), and a post
 * that can't be found says so.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import type { TheaterItem } from '@/components/theater/types'
import type { SharedResolveResult } from '@/lib/theater/shared-resolve'

const auth = vi.hoisted(() => ({
  me: { authenticated: true } as {
    authenticated: boolean
    user?: { id: string } | null
  } | null,
}))
const open = vi.hoisted(() => ({
  ctx: {
    navigationType: 'navigate' as const,
    documentPath: '/jack/status/20',
    currentPath: '/jack/status/20',
    openIntent: null,
  },
}))

vi.mock('@/components/auth', () => ({
  useAuthMe: () => ({ me: auth.me, loading: false, refresh: vi.fn() }),
}))
vi.mock('@/lib/theater/autosave-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/theater/autosave-shared')>()),
  readSharedOpenContext: () => open.ctx,
}))
vi.mock('@/components/next/channels/ChannelParts', () => ({ NxHeader: () => <header /> }))
vi.mock('@/components/next/theater/TheaterV2', () => ({
  NX_POST_SAVED: 'nx-post-saved',
  TheaterV2: ({
    lead,
    source,
  }: {
    lead?: { post: { id: string; text: string; tags: string[] }; saved: boolean }
    source: { shared?: boolean; search: { scope: string } }
  }) => (
    <div
      data-testid="theater"
      data-shared={String(!!source.shared)}
      data-scope={source.search.scope}
      data-saved={String(!!lead?.saved)}
      data-tags={lead?.post.tags.join(',')}
    >
      {lead ? `${lead.post.id}: ${lead.post.text}` : 'loading'}
    </div>
  ),
}))

import { PreviewTheater } from '@/components/next/theater/PreviewTheater'
import { resetSharedAutoSaveAttempts } from '@/lib/theater/autosave-shared'

const jack: TheaterItem = {
  action: 'preview',
  platform: 'twitter',
  bookmarkId: '20',
  author: 'jack',
  text: 'just setting up my twttr',
  url: 'https://x.com/jack/status/20',
  createdAt: '2006-03-21T20:50:14.000Z',
  contentType: 'text',
}

function resolved(result: SharedResolveResult) {
  return Promise.resolve(result)
}

describe('PreviewTheater', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    resetSharedAutoSaveAttempts()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('{"success":true}'))
    vi.stubGlobal('fetch', fetchMock)
    auth.me = { authenticated: true }
    window.history.replaceState(null, '', '/jack/status/20')
  })

  it('plays the shared post first, then posts like it from everyone', async () => {
    await act(async () => {
      render(
        <PreviewTheater
          resolve={resolved({ ok: true, item: jack, seoEligible: false, related: null })}
        />,
      )
    })
    const theater = await screen.findByTestId('theater')
    expect(theater).toHaveTextContent('20: just setting up my twttr')
    expect(theater).toHaveAttribute('data-shared', 'true')
    expect(theater).toHaveAttribute('data-scope', 'everyone')
  })

  it('saves it on a fresh signed-in open and tells the theater', async () => {
    const saved = vi.fn()
    window.addEventListener('nx-post-saved', saved)
    await act(async () => {
      render(
        <PreviewTheater
          resolve={resolved({ ok: true, item: jack, seoEligible: false, related: null })}
        />,
      )
    })
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/bookmarks/add',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ source: 'url_prefix' })
    await waitFor(() => expect(saved).toHaveBeenCalled())
    window.removeEventListener('nx-post-saved', saved)
  })

  it('does not save on a reload', async () => {
    open.ctx = { ...open.ctx, navigationType: 'reload' as never }
    await act(async () => {
      render(
        <PreviewTheater
          resolve={resolved({ ok: true, item: jack, seoEligible: false, related: null })}
        />,
      )
    })
    await screen.findByTestId('theater')
    expect(fetchMock).not.toHaveBeenCalled()
    open.ctx = { ...open.ctx, navigationType: 'navigate' }
  })

  it('recognizes an existing save on reload and scopes its tags to the active account', async () => {
    open.ctx = { ...open.ctx, navigationType: 'reload' as never }
    auth.me = { authenticated: true, user: { id: 'owner-a' } }
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ items: [{ id: '20', platform: 'twitter', tags: ['private'] }] }),
        ),
    )
    const resolve = resolved({ ok: true, item: jack, seoEligible: false, related: null })
    const rendered = await act(async () => render(<PreviewTheater resolve={resolve} />))
    const theater = await screen.findByTestId('theater')
    await waitFor(() => expect(theater).toHaveAttribute('data-saved', 'true'))
    expect(theater).toHaveAttribute('data-tags', 'private')
    const lookup = fetchMock.mock.calls.find(([url]) => String(url).startsWith('/api/feed?'))
    const params = new URL(String(lookup?.[0]), 'http://localhost').searchParams
    expect(params.get('idPlatform')).toBe('twitter')
    expect(params.get('id')).toBe('20')
    expect(params.get('hideArchived')).toBe('false')

    auth.me = { authenticated: true, user: { id: 'owner-b' } }
    fetchMock.mockResolvedValue(new Response('{"items":[]}'))
    rendered.rerender(<PreviewTheater resolve={resolve} />)
    expect(theater).toHaveAttribute('data-saved', 'false')
    expect(theater).toHaveAttribute('data-tags', '')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
    open.ctx = { ...open.ctx, navigationType: 'navigate' }
  })

  it('saves after a sign-in round trip (?save=1) and tidies the address', async () => {
    open.ctx = { ...open.ctx, navigationType: 'reload' as never }
    window.history.replaceState(null, '', '/jack/status/20?save=1')
    await act(async () => {
      render(
        <PreviewTheater
          resolve={resolved({ ok: true, item: jack, seoEligible: false, related: null })}
        />,
      )
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(window.location.search).toBe('')
    open.ctx = { ...open.ctx, navigationType: 'navigate' }
  })

  it('says so when the post can’t be found, or was removed', async () => {
    await act(async () => {
      render(<PreviewTheater resolve={resolved({ ok: false })} />)
    })
    expect(
      await screen.findByRole('heading', { name: 'This post isn’t available' }),
    ).toBeInTheDocument()
    render(<PreviewTheater unavailable />)
    expect(screen.getByRole('heading', { name: 'This post was removed' })).toBeInTheDocument()
  })
})
