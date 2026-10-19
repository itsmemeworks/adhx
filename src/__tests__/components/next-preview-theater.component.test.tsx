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
  me: { authenticated: true } as { authenticated: boolean } | null,
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
    lead?: { post: { id: string; text: string } }
    source: { shared?: boolean; search: { scope: string } }
  }) => (
    <div
      data-testid="theater"
      data-shared={String(!!source.shared)}
      data-scope={source.search.scope}
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
