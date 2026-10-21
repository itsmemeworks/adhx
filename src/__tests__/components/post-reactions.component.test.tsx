// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import type { FeedItem } from '@/components/feed/types'

/**
 * Reactions on every post in the theater: the React button on any post, yours
 * floating at once, and what people already left replaying when a post
 * settles (newest 12, oldest first, ~350ms apart, from ~600ms, once a visit).
 */

const auth = vi.hoisted(() => ({
  me: null as null | {
    authenticated: boolean
    user: { id: string; username: string; displayName: string; avatarUrl: string | null }
  },
}))
vi.mock('@/components/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/auth')>()),
  useAuthMe: () => ({ me: auth.me, loading: false, refresh: async () => {} }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/play',
}))
vi.mock('@/components/theater/Stage', () => ({
  Stage: (props: { item: { bookmarkId: string } | null }) => (
    <div data-testid="stage">{props.item?.bookmarkId}</div>
  ),
}))
vi.mock('@/components/theater/useSendFile', () => ({
  useSendFile: () => ({
    supported: false,
    ready: false,
    sending: false,
    primed: false,
    mode: 'share',
    send: async () => false,
    download: () => false,
  }),
}))

import { TheaterV2 } from '@/components/next/theater/TheaterV2'
import {
  REPLAY_GAP_MS,
  REPLAY_START_MS,
  __resetReactionReplay,
  replayPlan,
  useReactionReplay,
  type StoredReaction,
} from '@/components/next/theater/useReactionReplay'

function stored(n: number, extra: Partial<StoredReaction> = {}): StoredReaction {
  return {
    id: `r${n}`,
    emoji: '😂',
    text: null,
    at: new Date(Date.UTC(2026, 9, 21, 9, n)).toISOString(),
    saver: { username: `p${n}`, name: `Person ${n}`, avatarUrl: null, isYou: false },
    ...extra,
  }
}

function post(id: string): FeedItem {
  return {
    id,
    platform: 'twitter',
    author: `author${id}`,
    authorName: `Author ${id}`,
    authorProfileImageUrl: null,
    text: `post ${id}`,
    tweetUrl: `https://x.com/a/status/${id}`,
    processedAt: '2026-10-16T09:00:00.000Z',
    isArchived: false,
    media: null,
    links: null,
    tags: [],
  }
}

const fetchMock = vi.fn()
beforeEach(() => {
  __resetReactionReplay()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  auth.me = null
  localStorage.clear()
  sessionStorage.clear()
})

describe('replayPlan', () => {
  it('floats the newest twelve not already on screen, oldest first', () => {
    const list = Array.from({ length: 20 }, (_, i) => stored(i))
    const plan = replayPlan(list, (id) => id === 'r19')
    expect(plan.map((r) => r.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => `r${i + 7}`).filter((id) => id !== 'r19'),
    )
    expect(plan).toHaveLength(12)
  })
})

describe('useReactionReplay', () => {
  function answer(reactions: StoredReaction[]) {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ reactions })))
  }

  it('starts after the post settles and spaces them out', async () => {
    vi.useFakeTimers()
    answer([stored(1), stored(2, { emoji: null, text: 'so good' }), stored(3)])
    const floated: string[] = []
    renderHook(() =>
      useReactionReplay({
        enabled: true,
        platform: 'twitter',
        id: '9',
        isShown: () => false,
        onFloat: (f) => floated.push(f.text ?? f.emoji ?? ''),
        onCancel: () => {},
      }),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/posts/reactions?platform=twitter&id=9',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REPLAY_START_MS - 1)
    })
    expect(floated).toEqual([])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(floated).toEqual(['😂'])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REPLAY_GAP_MS)
    })
    expect(floated).toEqual(['😂', 'so good'])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REPLAY_GAP_MS)
    })
    expect(floated).toEqual(['😂', 'so good', '😂'])
  })

  it('replays a post once a visit, and stops when the post moves on', async () => {
    vi.useFakeTimers()
    answer([stored(1), stored(2), stored(3)])
    const floated: string[] = []
    const cancelled: string[][] = []
    const { rerender, unmount } = renderHook(
      ({ id }: { id: string }) =>
        useReactionReplay({
          enabled: true,
          platform: 'twitter',
          id,
          isShown: () => false,
          onFloat: (f) => floated.push(f.id),
          onCancel: (ids) => cancelled.push(ids),
        }),
      { initialProps: { id: 'a' } },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REPLAY_START_MS)
    })
    expect(floated).toEqual(['r1'])
    // Skipped on: the rest never float, and the one on screen goes.
    rerender({ id: 'b' })
    expect(cancelled).toEqual([['r1']])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REPLAY_START_MS + 3 * REPLAY_GAP_MS)
    })
    expect(floated).toEqual(['r1', 'r1', 'r2', 'r3'])
    // Back to both: neither replays again, and nothing is fetched again.
    const calls = fetchMock.mock.calls.length
    rerender({ id: 'a' })
    rerender({ id: 'b' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(floated).toHaveLength(4)
    expect(fetchMock.mock.calls.length).toBe(calls)
    unmount()
  })

  it('does nothing for a stranger', async () => {
    renderHook(() =>
      useReactionReplay({
        enabled: false,
        platform: 'twitter',
        id: '9',
        isShown: () => false,
        onFloat: () => {},
        onCancel: () => {},
      }),
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('reactions in the theater', () => {
  const source = {
    search: { q: 'frogs', scope: 'mine' as const, type: 'all' as const, wordsOnly: false },
    group: null,
    channel: null,
    auto: null,
    recent: false,
    moment: null,
    start: null,
  }
  const sent: { url: string; body: unknown }[] = []

  function serve(opts: { reactions?: StoredReaction[]; reactStatus?: number } = {}) {
    sent.length = 0
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/search/similar')) {
        return new Response(JSON.stringify({ items: [], total: 0, nextOffset: null }))
      }
      if (url.startsWith('/api/search')) {
        return new Response(
          JSON.stringify({
            items: [{ post: post('2'), saved: true, matched: ['words'] }],
            total: 1,
            understood: true,
            close: true,
            refined: true,
            nextOffset: null,
          }),
        )
      }
      if (url.startsWith('/api/posts/reactions') && init?.method === 'POST') {
        sent.push({ url, body: JSON.parse(String(init.body)) })
        const status = opts.reactStatus ?? 200
        return new Response(
          JSON.stringify(status === 200 ? { id: 'rnew', at: '2026-10-21T10:00:00.000Z' } : {}),
          { status },
        )
      }
      if (url.startsWith('/api/posts/reactions')) {
        return new Response(JSON.stringify({ reactions: opts.reactions ?? [] }))
      }
      return new Response('{}')
    })
  }

  const member = {
    authenticated: true,
    user: { id: 'u_pete', username: 'pete', displayName: 'Pete', avatarUrl: null },
  }

  it('replays what people left on the post, with their names', async () => {
    auth.me = member
    serve({ reactions: [stored(1), stored(2, { emoji: null, text: 'so good' })] })
    render(<TheaterV2 source={source} />)
    const floats = await screen.findByRole('list', { name: 'Reactions from people watching' })
    await waitFor(() => expect(within(floats).getByText('Person 1: Laughing')).toBeInTheDocument())
    await waitFor(() => expect(within(floats).getByText('so good')).toBeInTheDocument())
    expect(within(floats).getByText('Person 2 said:')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/posts/reactions?platform=twitter&id=2',
      expect.anything(),
    )
  })

  it('reacts on any post: yours floats at once and is kept', async () => {
    auth.me = member
    serve()
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('2'))
    fireEvent.click(screen.getByRole('button', { name: 'React' }))
    const picker = screen.getByRole('dialog', { name: 'React' })
    expect(within(picker).getByRole('textbox', { name: 'Say something' })).toHaveAttribute(
      'placeholder',
      'Say something',
    )
    fireEvent.click(within(picker).getByRole('button', { name: 'Fire' }))
    expect(await screen.findByText('You: Fire')).toBeInTheDocument()
    await waitFor(() =>
      expect(sent).toEqual([
        { url: '/api/posts/reactions', body: { emoji: '🔥', platform: 'twitter', id: '2' } },
      ]),
    )
    expect(screen.queryByRole('dialog', { name: 'React' })).not.toBeInTheDocument()
  })

  it('says so quietly when it couldn’t send, and drops yours', async () => {
    auth.me = member
    serve({ reactStatus: 500 })
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('2'))
    fireEvent.click(screen.getByRole('button', { name: 'React' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skull' }))
    expect(await screen.findByText('Couldn’t send that. Try again.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('You: Skull')).not.toBeInTheDocument())
  })

  it('sends a stranger to sign in, and shows them nothing', async () => {
    auth.me = null
    serve({ reactions: [stored(1)] })
    const assign = vi.fn()
    const realLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, assign },
    })
    try {
      render(<TheaterV2 source={source} />)
      await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('2'))
      fireEvent.click(screen.getByRole('button', { name: 'React' }))
      expect(assign).toHaveBeenCalledWith(
        `/start?${new URLSearchParams({ returnTo: '/author2/status/2' })}`,
      )
      expect(screen.queryByRole('dialog', { name: 'React' })).not.toBeInTheDocument()
      await new Promise((r) => setTimeout(r, REPLAY_START_MS + 50))
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/posts/reactions')),
      ).toBe(false)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
    }
  })
})

describe('reaction refresh boundaries', () => {
  it('refreshes an empty ordinary-player answer in the Reactions feed', async () => {
    vi.useFakeTimers()
    let list: StoredReaction[] = []
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ reactions: list })))
    const floated: string[] = []
    const base = {
      enabled: true,
      platform: 'twitter',
      id: '1',
      scope: 'account-a',
      isShown: () => false,
      onFloat: (f: { id: string }) => floated.push(f.id),
      onCancel: () => {},
    }
    const first = renderHook(() => useReactionReplay(base))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REPLAY_START_MS)
    })
    first.unmount()
    list = [stored(9)]
    renderHook(() => useReactionReplay({ ...base, fresh: true }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REPLAY_START_MS)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(floated).toEqual(['r9'])
  })
  it('never falls back to old reactions on a failed fresh request', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ reactions: [stored(1)] })))
    const floated: string[] = []
    const base = {
      enabled: true,
      platform: 'twitter',
      id: '1',
      isShown: () => false,
      onFloat: (f: { id: string }) => floated.push(f.id),
      onCancel: () => {},
    }
    const first = renderHook(() => useReactionReplay(base))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REPLAY_START_MS)
    })
    first.unmount()
    floated.length = 0
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    renderHook(() => useReactionReplay({ ...base, fresh: true }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REPLAY_START_MS)
    })
    expect(floated).toEqual([])
  })
  it('ignores a late response after switching accounts even when fetch ignores cancellation', async () => {
    vi.useFakeTimers()
    let finish!: (r: Response) => void
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ reactions: [stored(2)] })))
    const floated: string[] = []
    const { rerender } = renderHook(
      ({ scope }) =>
        useReactionReplay({
          enabled: true,
          platform: 'twitter',
          id: '1',
          scope,
          isShown: () => false,
          onFloat: (f) => floated.push(f.id),
          onCancel: () => {},
        }),
      { initialProps: { scope: 'a' } },
    )
    rerender({ scope: 'b' })
    await act(async () => {
      finish(new Response(JSON.stringify({ reactions: [stored(1)] })))
      await vi.advanceTimersByTimeAsync(REPLAY_START_MS)
    })
    expect(floated).toEqual(['r2'])
  })
})
