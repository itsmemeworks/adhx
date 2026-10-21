// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import type { FeedItem } from '@/components/feed/types'

/**
 * "Getting it ready" (board j1-4) and "Kept on your ADHX" (j1-5): while the
 * post on stage is still being kept the stage waits with the real percent,
 * then plays the moment it's kept.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/play',
}))
const auth = vi.hoisted(() => ({ signedIn: true }))
vi.mock('@/components/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/auth')>()),
  useAuthMe: () => ({
    me: auth.signedIn
      ? {
          authenticated: true,
          user: { id: 'u1', username: 'pete', displayName: 'Pete', avatarUrl: null },
        }
      : { authenticated: false },
    loading: false,
    refresh: vi.fn(),
  }),
}))
const stageProps = vi.fn()
vi.mock('@/components/theater/Stage', () => ({
  Stage: (props: { item: { bookmarkId: string } | null; covered?: boolean }) => {
    stageProps(props)
    return <div data-testid="stage" data-covered={String(!!props.covered)} />
  },
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
import { sourceFromParams } from '@/components/next/theater/queue'
import { GettingReadyStage, KeptChip, SharedWithChip } from '@/components/next/theater/GettingReady'
import {
  isJustKept,
  JUST_KEPT_MS,
  onItsWay,
  useKeepStatus,
  type PostKeepStatus,
} from '@/components/next/theater/useKeepStatus'
import { POST_KEPT } from '@/lib/theater/client-events'

function videoPost(id: string, extra: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    platform: 'instagram',
    author: 'someone',
    authorName: 'Someone',
    authorProfileImageUrl: null,
    text: 'Trying dark chocolate for the first time',
    tweetUrl: `https://www.instagram.com/reel/${id}/`,
    processedAt: '2026-10-20T09:00:00.000Z',
    isArchived: false,
    media: [
      {
        id: 'm1',
        mediaType: 'video',
        width: 720,
        height: 1280,
        durationMs: 60_000,
        url: `/api/files/instagram/${id}/video-1`,
        thumbnailUrl: `/api/files/instagram/${id}/poster`,
        shareUrl: '',
      },
    ],
    links: null,
    tags: [],
    savers: [
      {
        username: 'pete',
        name: 'Pete',
        avatarUrl: null,
        savedAt: new Date().toISOString(),
        isYou: true,
      },
    ],
    isPrivate: false,
    ...extra,
  }
}

const status = (
  state: PostKeepStatus['state'],
  extra: Partial<PostKeepStatus> = {},
): PostKeepStatus => ({
  platform: 'instagram',
  id: 'choc',
  state,
  step: state === 'keeping' || state === 'waiting' ? 2 : state === 'converting' ? 3 : null,
  percent: null,
  keptAt: null,
  ...extra,
})
const people = [
  { username: 'ana', name: 'Ana', avatarUrl: null },
  { username: 'ben', name: 'Ben', avatarUrl: null },
]

describe('keep status words', () => {
  it('knows what is on its way and what was just kept', () => {
    expect(onItsWay(status('waiting'))).toBe(true)
    expect(onItsWay(status('keeping'))).toBe(true)
    expect(onItsWay(status('converting'))).toBe(true)
    expect(onItsWay(status('kept'))).toBe(false)
    expect(onItsWay(status('none'))).toBe(false)
    expect(onItsWay(null)).toBe(false)
    const now = Date.parse('2026-10-20T10:00:00Z')
    const keptAt = (ms: number) => new Date(now - ms).toISOString()
    expect(isJustKept(status('kept', { keptAt: keptAt(10 * 60_000) }), true, now)).toBe(true)
    expect(isJustKept(status('kept', { keptAt: keptAt(JUST_KEPT_MS - 1) }), false, now)).toBe(true)
    expect(isJustKept(status('kept', { keptAt: keptAt(JUST_KEPT_MS + 1) }), false, now)).toBe(false)
    expect(isJustKept(status('none'), true, now)).toBe(false)
  })
})

describe('GettingReadyStage', () => {
  it('shows the ring with the real percent, the words and the three steps', () => {
    render(
      <GettingReadyStage
        post={videoPost('choc')}
        status={status('keeping', { percent: 62 })}
        wide
      />,
    )
    const ring = screen.getByRole('progressbar', { name: 'Keeping a copy' })
    expect(ring).toHaveAttribute('aria-valuenow', '62')
    expect(screen.getByText('62%')).toBeInTheDocument()
    expect(screen.getByText('Getting it ready…')).toBeInTheDocument()
    expect(
      screen.getByText('Your ADHX is keeping a copy. It’ll be here in a moment.'),
    ).toBeInTheDocument()
    const steps = within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem')
    expect(steps.map((s) => s.textContent)).toEqual([
      'Got the link, done',
      'Keeping a copy, now',
      'Making it play everywhere, next',
    ])
    expect(steps[1]).toHaveAttribute('aria-current', 'step')
  })

  it('converting: two steps done, no percent, the ring still turns', () => {
    render(<GettingReadyStage post={videoPost('choc')} status={status('converting')} wide />)
    const ring = screen.getByRole('progressbar', { name: 'Making it play everywhere' })
    expect(ring).not.toHaveAttribute('aria-valuenow')
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
    expect(ring.querySelector('svg')).toHaveClass('animate-nx-spin')
    const steps = screen.getAllByRole('listitem')
    expect(steps[2]).toHaveAttribute('aria-current', 'step')
    expect(steps[1]).toHaveTextContent('done')
  })

  it('moves only with animate-nx classes (stilled by reduced motion) and blurs the poster', () => {
    const { container } = render(
      <GettingReadyStage
        post={videoPost('choc')}
        status={status('keeping', { percent: 5 })}
        wide
      />,
    )
    const moving = [...container.querySelectorAll('[class*="animate-"]')]
    expect(moving.length).toBeGreaterThan(0)
    for (const el of moving) {
      expect([...el.classList].filter((c) => c.startsWith('animate-'))).toEqual(
        expect.arrayContaining([expect.stringMatching(/^animate-nx-/)]),
      )
    }
    const poster = container.querySelector('img')
    expect(poster).toHaveAttribute('src', '/api/files/instagram/choc/poster')
    expect(poster?.className).toMatch(/blur/)
  })

  it('chips: shared with your people (faces) and kept on your ADHX', () => {
    render(
      <>
        <SharedWithChip people={people} />
        <KeptChip />
      </>,
    )
    expect(screen.getByText('Shared with your people')).toBeInTheDocument()
    expect(screen.getByText('Kept on your ADHX')).toBeInTheDocument()
  })
})

describe('useKeepStatus', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('asks nothing signed out or without a post', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useKeepStatus({ platform: 'instagram', id: 'choc' }, false))
    renderHook(() => useKeepStatus(null, true))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a post kept long ago plays without a chip; one kept a minute ago gets it', async () => {
    let keptAt = new Date(Date.now() - 60 * 60_000).toISOString()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ posts: [status('kept', { keptAt })], people })),
      ),
    )
    const old = renderHook(() => useKeepStatus({ platform: 'instagram', id: 'choc' }, true))
    await waitFor(() => expect(old.result.current.status?.state).toBe('kept'))
    expect(old.result.current.justKept).toBe(false)
    keptAt = new Date(Date.now() - 60_000).toISOString()
    const fresh = renderHook(() => useKeepStatus({ platform: 'instagram', id: 'choc' }, true))
    await waitFor(() => expect(fresh.result.current.justKept).toBe(true))
  })
})

describe('the theater while a post is being kept', () => {
  const fetchMock = vi.fn()
  let answers: unknown[]
  beforeEach(() => {
    auth.signedIn = true
    stageProps.mockReset()
    answers = [
      { posts: [status('keeping', { percent: 62 })], people },
      { posts: [status('keeping', { percent: 80 })], people },
      { posts: [status('kept', { keptAt: new Date().toISOString() })], people },
    ]
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/feed/blend')) {
        return new Response(
          JSON.stringify({
            items: [videoPost('choc')],
            nextCursor: null,
            caughtUp: false,
            nothingYet: false,
            total: 1,
          }),
        )
      }
      if (url.startsWith('/api/activity/processing/posts')) {
        return new Response(JSON.stringify(answers.length > 1 ? answers.shift() : answers[0]))
      }
      if (url.startsWith('/api/views')) return new Response(null, { status: 204 })
      return new Response('{}')
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    sessionStorage.clear()
  })

  const source = sourceFromParams(new URLSearchParams('feed=everyone'))

  it('waits with the real percent, then plays the moment it is kept', async () => {
    const kept = vi.fn()
    window.addEventListener(POST_KEPT, kept)
    render(<TheaterV2 source={source} />)
    expect(await screen.findByText('Getting it ready…')).toBeInTheDocument()
    expect(screen.getByText('62%')).toBeInTheDocument()
    expect(screen.getByText('Shared with your people')).toBeInTheDocument()
    expect(screen.getByTestId('stage')).toHaveAttribute('data-covered', 'true')
    expect(
      fetchMock.mock.calls.some(
        ([u]) => String(u) === '/api/activity/processing/posts?posts=instagram%3Achoc',
      ),
    ).toBe(true)
    // It polls while it's on its way…
    await waitFor(() => expect(screen.getByText('80%')).toBeInTheDocument(), { timeout: 4000 })
    // …and plays once kept, saying so.
    await waitFor(() => expect(screen.queryByText('Getting it ready…')).not.toBeInTheDocument(), {
      timeout: 4000,
    })
    expect(screen.getByText('Kept on your ADHX')).toBeInTheDocument()
    expect(screen.queryByText('Shared with your people')).not.toBeInTheDocument()
    expect(screen.getByTestId('stage')).toHaveAttribute('data-covered', 'false')
    // The kept event can land a tick after the overlay goes (slow CI runners).
    await waitFor(() => expect(kept).toHaveBeenCalledTimes(1))
    expect((kept.mock.calls[0][0] as CustomEvent).detail).toEqual({ key: 'instagram:choc' })
    // Polling stops once it's kept.
    const asked = fetchMock.mock.calls.filter(([u]) =>
      String(u).startsWith('/api/activity/processing/posts'),
    ).length
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1800))
    })
    expect(
      fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/activity/processing/posts'))
        .length,
    ).toBe(asked)
    window.removeEventListener(POST_KEPT, kept)
  }, 15_000)

  it('a private save says nothing about your people', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/feed/blend')) {
        return new Response(
          JSON.stringify({
            items: [videoPost('choc', { isPrivate: true })],
            nextCursor: null,
            caughtUp: false,
            nothingYet: false,
            total: 1,
          }),
        )
      }
      if (url.startsWith('/api/activity/processing/posts')) {
        return new Response(JSON.stringify({ posts: [status('waiting')], people }))
      }
      return new Response('{}')
    })
    render(<TheaterV2 source={source} />)
    expect(await screen.findByText('Getting it ready…')).toBeInTheDocument()
    expect(screen.queryByText('Shared with your people')).not.toBeInTheDocument()
  })

  it('signed out it never asks', async () => {
    auth.signedIn = false
    render(<TheaterV2 source={sourceFromParams(new URLSearchParams('moment=babies'))} />)
    await act(async () => {})
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).startsWith('/api/activity/processing/posts')),
    ).toBe(false)
  })
})
