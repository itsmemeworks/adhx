// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { FeedItem } from '@/components/feed/types'
import type { WhyReason } from '@/lib/feed/blend'

/**
 * New and the blended feed in the theater: the caught-up stage, the
 * Everyone · Friends only · Mine switch, why a post is here, and the seen list.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/play',
}))
vi.mock('@/components/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/auth')>()),
  useAuthMe: () => ({
    me: {
      authenticated: true,
      user: { id: 'u1', username: 'pete', displayName: 'Pete', avatarUrl: null },
    },
    loading: false,
    refresh: vi.fn(),
  }),
}))
const stageProps = vi.fn()
vi.mock('@/components/theater/Stage', () => ({
  Stage: (props: { item: { bookmarkId: string } | null; covered?: boolean }) => {
    stageProps(props)
    return <div data-testid="stage">{props.item?.bookmarkId}</div>
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
import {
  CaughtUpStage,
  FeedSwitch,
  FeedTypesControl,
  WhyChip,
} from '@/components/next/theater/FeedParts'
import { UpNextSheet, WhySheet } from '@/components/next/theater/TheaterSheets'
import { feedPlayHref, queueUrl, sourceFromParams } from '@/components/next/theater/queue'

const together: WhyReason[] = [
  { kind: 'together', text: 'Ana and Ben saved this', username: 'ana' },
  { kind: 'close', text: 'You watch most of Ben’s saves', username: 'ben' },
]

function post(
  id: string,
  why: string,
  reasons: WhyReason[] = [{ kind: 'fresh', text: why }],
): FeedItem {
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
    savers: [
      {
        username: 'ana',
        name: 'Ana',
        avatarUrl: null,
        savedAt: '2026-10-19T10:00:00Z',
        isYou: false,
      },
      {
        username: 'ben',
        name: 'Ben',
        avatarUrl: null,
        savedAt: '2026-10-19T09:00:00Z',
        isYou: false,
      },
    ],
    isPrivate: false,
    why,
    whyReasons: reasons,
  }
}

describe('feed play links', () => {
  it('reads feed=new|everyone|friends|mine and pages through the blend', () => {
    expect(feedPlayHref()).toBe('/play?feed=new')
    const source = sourceFromParams(new URLSearchParams('feed=friends'))
    expect(source.feed).toBe('friends')
    expect(queueUrl(source, () => '/api/search')).toBe('/api/feed/blend?mode=friends&limit=20')
    expect(sourceFromParams(new URLSearchParams('feed=trending')).feed).toBeUndefined()
  })
})

describe('caught up', () => {
  it('says so, with somewhere to go and a way to watch it all again', () => {
    const again = vi.fn()
    render(<CaughtUpStage onWatchAgain={again} />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('You’re all caught up.Go touch grass.')
    expect(within(heading).getByText('Go touch grass.')).toHaveClass('text-nx-accent')
    expect(
      screen.getByText('That’s everything your people saved since you last looked.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse channels' })).toHaveAttribute(
      'href',
      '/channels',
    )
    expect(screen.getByRole('link', { name: 'See what’s live' })).toHaveAttribute('href', '/now')
    fireEvent.click(screen.getByRole('button', { name: 'Watch it all again' }))
    expect(again).toHaveBeenCalledOnce()
  })
})

describe("what's in your feed", () => {
  it('sums up the choice and toggles kinds, keeping at least one', () => {
    const change = vi.fn()
    const { rerender } = render(<FeedTypesControl types={['video', 'photo']} onChange={change} />)
    const button = screen.getByRole('button', { name: 'What’s in your feed: Videos and photos' })
    expect(button).toHaveTextContent('Videos and photos')
    fireEvent.click(button)
    const group = screen.getByRole('group', { name: 'What’s in your feed' })
    const chips = within(group).getAllByRole('button')
    expect(chips.map((c) => [c.textContent, c.getAttribute('aria-pressed')])).toEqual([
      ['Videos', 'true'],
      ['Photos', 'true'],
      ['Text posts', 'false'],
      ['Articles', 'false'],
    ])
    fireEvent.click(within(group).getByRole('button', { name: 'Articles' }))
    expect(change).toHaveBeenLastCalledWith(['video', 'photo', 'article'])
    fireEvent.click(within(group).getByRole('button', { name: 'Videos' }))
    expect(change).toHaveBeenLastCalledWith(['photo'])

    rerender(<FeedTypesControl types={['photo']} onChange={change} />)
    expect(screen.getByRole('button', { name: 'What’s in your feed: Photos only' })).toBeVisible()
    const last = screen.getByRole('button', { name: 'Photos' })
    expect(last).toBeDisabled()
    // Escape closes it.
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'What’s in your feed' })).not.toBeInTheDocument()
  })

  it('the caught-up card says what the filter is holding back', () => {
    const show = vi.fn()
    const { rerender } = render(
      <CaughtUpStage onWatchAgain={vi.fn()} waiting={{ text: 4 }} onShowWaiting={show} />,
    )
    expect(screen.getByText(/4 text posts waiting ·/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }))
    expect(show).toHaveBeenCalledOnce()
    rerender(<CaughtUpStage onWatchAgain={vi.fn()} waiting={{}} onShowWaiting={show} />)
    expect(screen.queryByRole('button', { name: 'Show them' })).not.toBeInTheDocument()
  })
})

describe('whose saves', () => {
  it('New lights Everyone; the others switch mode', () => {
    const change = vi.fn()
    const { rerender } = render(<FeedSwitch mode="new" onChange={change} />)
    const group = screen.getByRole('radiogroup', { name: 'Whose saves' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((r) => [r.textContent, r.getAttribute('aria-checked')])).toEqual([
      ['Everyone', 'true'],
      ['Friends only', 'false'],
      ['Mine', 'false'],
    ])
    fireEvent.click(radios[0])
    expect(change).not.toHaveBeenCalled()
    fireEvent.click(radios[1])
    expect(change).toHaveBeenCalledWith('friends')
    rerender(<FeedSwitch mode="mine" onChange={change} />)
    expect(screen.getByRole('radio', { name: 'Mine' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Everyone' }))
    expect(change).toHaveBeenLastCalledWith('everyone')
  })
})

describe('why this one', () => {
  it('the chip says saved together, or the why itself', () => {
    const open = vi.fn()
    const { rerender } = render(
      <WhyChip post={{ why: 'Ana and Ben saved this', whyReasons: together }} onOpen={open} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Why this one: Saved together' }))
    expect(open).toHaveBeenCalledOnce()
    rerender(<WhyChip post={{ why: 'Mum saved this · 1h' }} onOpen={open} />)
    expect(screen.getByRole('button', { name: 'Why this one: Mum saved this · 1h' })).toBeVisible()
  })

  it('lists the reasons and shows more or less of a friend', () => {
    const weigh = vi.fn()
    const item = { post: post('1', 'Ana and Ben saved this', together), saved: false, matched: [] }
    const friends = [
      { username: 'ana', name: 'Ana' },
      { username: 'ben', name: 'Ben' },
    ]
    const { rerender } = render(
      <WhySheet
        item={item}
        friends={friends}
        weights={{}}
        busy={null}
        onWeight={weigh}
        onClose={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Why this one' })
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Ana and Ben saved this', 'You watch most of Ben’s saves'])
    expect(
      within(dialog).getByText('No engagement bait. These are the only reasons.'),
    ).toBeVisible()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show more from Ana' }))
    expect(weigh).toHaveBeenLastCalledWith('ana', 1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show less from Ben' }))
    expect(weigh).toHaveBeenLastCalledWith('ben', -1)

    rerender(
      <WhySheet
        item={item}
        friends={friends}
        weights={{ ana: 1 }}
        busy={null}
        onWeight={weigh}
        onClose={vi.fn()}
      />,
    )
    const more = screen.getByRole('button', { name: 'Show more from Ana' })
    expect(more).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(more)
    expect(weigh).toHaveBeenLastCalledWith('ana', 0)
  })

  it('Up next says why each one is coming', () => {
    const items = [
      { post: post('1', 'Mum saved this · 1h'), saved: false, matched: [] },
      { post: post('2', 'Ana and Ben saved this', together), saved: false, matched: [] },
      {
        post: post('3', 'Like the frog videos you kept', [
          { kind: 'like', text: 'Like the frog videos you kept' },
        ]),
        saved: false,
        matched: [],
      },
    ]
    render(<UpNextSheet items={items} current={0} onPlay={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Saved together')).toBeInTheDocument()
    expect(screen.getByText('Like the frog videos you kept')).toBeInTheDocument()
    expect(screen.queryByText('Mum saved this · 1h')).not.toBeInTheDocument() // now playing
  })
})

describe('New in the theater', () => {
  const fetchMock = vi.fn()
  let pages: Record<string, unknown>
  beforeEach(() => {
    router.push.mockReset()
    stageProps.mockReset()
    pages = {
      first: {
        items: [post('a', 'Ana and Ben saved this', together), post('b', 'Mum saved this · 1h')],
        nextCursor: 'c1',
        caughtUp: false,
        nothingYet: false,
        total: 3,
      },
      c1: {
        items: [post('c', 'Ana saved this · 2h')],
        nextCursor: null,
        caughtUp: true,
        nothingYet: false,
        total: 3,
      },
    }
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/feed/blend')) {
        const cursor = new URL(url, 'http://x').searchParams.get('cursor')
        return new Response(JSON.stringify(pages[cursor ?? 'first']))
      }
      if (url.startsWith('/api/feed/weights')) {
        return new Response(JSON.stringify({ weights: {} }))
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

  const source = sourceFromParams(new URLSearchParams('feed=new'))
  const seenPosts = () =>
    fetchMock.mock.calls
      .filter(([u]) => String(u) === '/api/views')
      .flatMap(
        ([, init]) =>
          (JSON.parse(String((init as RequestInit).body)) as { posts: { id: string }[] }).posts,
      )
      .map((p) => p.id)

  it('plays what you haven’t seen, says why, then ends caught up', async () => {
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('a'))
    expect(screen.getByRole('button', { name: 'Why this one: Saved together' })).toBeInTheDocument()
    expect(screen.getByText('3 you haven’t seen')).toBeInTheDocument()
    // The next page arrives before it's needed.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('cursor=c1'))).toBe(true),
    )
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByTestId('stage')).toHaveTextContent('b')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('c'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    })
    expect(await screen.findByText('You’re all caught up.')).toBeInTheDocument()
    expect(stageProps.mock.calls.at(-1)?.[0].covered).toBe(true)
    // The header agrees: nothing left (not the last post still counted).
    expect(screen.getByText('0 you haven’t seen')).toBeInTheDocument()
    // Skipped posts count as seen; the batch goes out when the page is hidden.
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(seenPosts().sort()).toEqual(['a', 'b', 'c'])

    fireEvent.click(screen.getByRole('button', { name: 'Watch it all again' }))
    expect(router.push).toHaveBeenCalledWith('/play?feed=everyone')
  })

  it('marks a post seen after 2 seconds on stage', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(<TheaterV2 source={source} />)
      await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('a'))
      // Let the stage settle (effects run on the faked scheduler), then time it.
      await act(async () => {
        vi.advanceTimersByTime(50)
      })
      act(() => {
        vi.advanceTimersByTime(1900)
        window.dispatchEvent(new Event('pagehide'))
      })
      expect(seenPosts()).toEqual([])
      act(() => {
        vi.advanceTimersByTime(200)
        window.dispatchEvent(new Event('pagehide'))
      })
      expect(seenPosts()).toEqual(['a'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens Why this one from the More menu', async () => {
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('a'))
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Why this one' }))
    const dialog = await screen.findByRole('dialog', { name: 'Why this one' })
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Show more from Ana' })).toBeEnabled(),
    )
  })

  it('switches whose saves from the header', async () => {
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('a'))
    fireEvent.click(screen.getAllByRole('radio', { name: 'Friends only' })[0])
    expect(router.push).toHaveBeenCalledWith('/play?feed=friends')
  })

  it('asks for the kinds you pick, remembers them, and offers the ones held back', async () => {
    pages.first = {
      ...(pages.first as object),
      types: ['video', 'photo'],
    }
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('a'))
    const blendCalls = () =>
      fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith('/api/feed/blend'))
    expect(blendCalls()[0]).not.toContain('types=') // the stored choice
    fireEvent.click(
      screen.getAllByRole('button', { name: 'What’s in your feed: Videos and photos' })[0],
    )
    fireEvent.click(screen.getByRole('button', { name: 'Text posts' }))
    await waitFor(() =>
      expect(blendCalls().some((u) => u.includes('types=video%2Cphoto%2Ctext'))).toBe(true),
    )
    const put = fetchMock.mock.calls.find(
      ([u, init]) => String(u) === '/api/feed/types' && (init as RequestInit)?.method === 'PUT',
    )
    expect(JSON.parse(String((put![1] as RequestInit).body))).toEqual({
      types: ['video', 'photo', 'text'],
    })
  })

  it('caught up with text posts held back: Show them plays just those', async () => {
    pages.first = {
      items: [],
      nextCursor: null,
      caughtUp: true,
      nothingYet: false,
      total: 0,
      types: ['video', 'photo'],
      waiting: { text: 4 },
    }
    render(<TheaterV2 source={source} />)
    expect(await screen.findByText(/4 text posts waiting/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }))
    expect(router.push).toHaveBeenCalledWith('/play?feed=new&types=text')
  })

  it('a link with types plays those kinds this once', async () => {
    render(<TheaterV2 source={sourceFromParams(new URLSearchParams('feed=new&types=text'))} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('a'))
    expect(
      fetchMock.mock.calls.some(([u]) =>
        String(u).startsWith('/api/feed/blend?mode=new&limit=20&types=text'),
      ),
    ).toBe(true)
  })

  it('goes straight to caught up when nothing is left', async () => {
    pages.first = { items: [], nextCursor: null, caughtUp: true, nothingYet: false, total: 0 }
    render(<TheaterV2 source={source} />)
    expect(await screen.findByText('You’re all caught up.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'New' })[0]).toHaveAttribute('aria-current', 'page')
  })

  it('on a brand-new server, asks for the first save', async () => {
    pages.first = { items: [], nextCursor: null, caughtUp: true, nothingYet: true, total: 0 }
    render(<TheaterV2 source={source} />)
    expect(await screen.findByText('Nothing new yet.')).toBeInTheDocument()
    expect(screen.getByText('Save something for your people to find.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Paste' }).length).toBeGreaterThan(0)
    expect(screen.queryByText('You’re all caught up.')).not.toBeInTheDocument()
  })
})
