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
import { whyDetail } from '@/components/next/theater/TheaterLayout'
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

/** Render as a wide screen (the theater's columns), until the test ends. */
const realMatchMedia = window.matchMedia
function wideScreen() {
  window.matchMedia = ((query: string) => ({
    matches: query === '(min-width: 1024px)' || query === '(hover: hover)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}
afterEach(() => {
  window.matchMedia = realMatchMedia
})

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
    wideScreen()
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('a'))
    expect(screen.getByRole('button', { name: 'Why this one: Saved together' })).toBeInTheDocument()
    const column = screen.getByRole('complementary', { name: 'Up next' })
    expect(within(column).getByText('3 you haven’t seen')).toBeInTheDocument()
    // The next page arrives before it's needed.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('cursor=c1'))).toBe(true),
    )
    await act(async () => {})
    // What's next sits under the stage, with a way to skip to it.
    expect(screen.getByRole('complementary', { name: 'Next' })).toHaveTextContent('Skip to it')
    fireEvent.click(screen.getByRole('button', { name: 'Skip to it' }))
    expect(screen.getByTestId('stage')).toHaveTextContent('b')
    await act(async () => {})
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('c'))
    await act(async () => {})
    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
    })
    expect(await screen.findByText('You’re all caught up.')).toBeInTheDocument()
    expect(stageProps.mock.calls.at(-1)?.[0].covered).toBe(true)
    // The column agrees: nothing left (not the last post still counted).
    expect(within(column).getByText('0 you haven’t seen')).toBeInTheDocument()
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

  it('a short message takes the top pill’s place for 3 seconds', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const video: FeedItem = {
      ...post('v', 'Ana saved this · 1h'),
      media: [
        {
          id: 'm1',
          mediaType: 'video',
          width: 720,
          height: 1280,
          durationMs: 9_000,
          url: '/api/media/video?a=1',
          thumbnailUrl: 'https://pbs.twimg.com/t.jpg',
          shareUrl: '',
        },
      ],
    }
    pages.first = { items: [video], nextCursor: null, caughtUp: false, nothingYet: false, total: 1 }
    const base = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/activity/processing/posts')) {
        // Still on its way: "Shared with your people" sits at the top.
        return new Response(
          JSON.stringify({
            posts: [
              {
                platform: 'twitter',
                id: 'v',
                state: 'keeping',
                step: 1,
                percent: 20,
                keptAt: null,
              },
            ],
            people: [],
          }),
        )
      }
      return base(url, init)
    })
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('v'))
    // The top pills are notes; a row stepped aside for a message is hidden from them.
    const sharedPill = () =>
      screen.queryAllByRole('note').filter((n) => n.textContent === 'Shared with your people')
    await waitFor(() => expect(sharedPill()).toHaveLength(1))

    const started = Date.now()
    fireEvent.click(screen.getByRole('button', { name: 'Copy the text' }))
    expect(await screen.findByText('Words copied')).toBeInTheDocument()
    // In its place, not stacked under it.
    expect(sharedPill()).toEqual([])
    expect(screen.getByText('Shared with your people').closest('[aria-hidden="true"]')).toHaveClass(
      'invisible',
    )
    expect(
      screen.getAllByRole('status').filter((el) => el.textContent === 'Words copied'),
    ).toHaveLength(1)

    // After 3 s the message goes and the pill is back.
    await waitFor(() => expect(screen.queryByText('Words copied')).toBeNull(), { timeout: 4000 })
    expect(Date.now() - started).toBeGreaterThanOrEqual(2900)
    expect(sharedPill()).toHaveLength(1)
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

  it('switches whose saves from its column', async () => {
    wideScreen()
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('a'))
    const column = screen.getByRole('complementary', { name: 'Up next' })
    fireEvent.click(within(column).getByRole('radio', { name: 'Friends only' }))
    expect(router.push).toHaveBeenCalledWith('/play?feed=friends')
  })

  it('on phones, the header’s filter opens kinds and whose saves', async () => {
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('a'))
    // New's count is the badge on its tab.
    expect(screen.getByText('3 you haven’t seen')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'What’s in your feed: Videos and photos' }))
    const sheet = screen.getByRole('dialog', { name: 'What’s in your feed' })
    expect(within(sheet).getByRole('switch', { name: 'Videos' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Mine' }))
    expect(router.push).toHaveBeenCalledWith('/play?feed=mine')
  })

  it('on phones, pausing, moving on, Repeat and Paste are all still buttons', async () => {
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('a'))
    // The glyph at the start of the thin line.
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    // Swipe moves on; screen readers and keyboards get the buttons.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('b'))
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('a'))
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    expect(screen.getByRole('menuitem', { name: 'Repeat: Off' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Paste a link' })).toBeInTheDocument()
  })

  it('asks for the kinds you pick, remembers them, and offers the ones held back', async () => {
    wideScreen()
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

describe('Tune in', () => {
  /** A stand-in EventSource the test can push events through. */
  class FakeEventSource {
    static last: FakeEventSource | null = null
    listeners = new Map<string, ((e: MessageEvent<string>) => void)[]>()
    onopen: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(public url: string) {
      FakeEventSource.last = this
    }
    addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn])
    }
    close() {}
    emit(type: string, data: unknown) {
      for (const fn of this.listeners.get(type) ?? [])
        fn(new MessageEvent(type, { data: JSON.stringify(data) }))
    }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    FakeEventSource.last = null
  })

  it('keeps the live watching count when the moment loads after it', async () => {
    let answer: (r: Response) => void = () => {}
    vi.stubGlobal('EventSource', FakeEventSource)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).startsWith('/api/moments/frog?')
          ? new Promise<Response>((resolve) => (answer = resolve))
          : new Response('{}'),
      ),
    )
    render(<TheaterV2 source={sourceFromParams(new URLSearchParams('moment=frog'))} />)
    await waitFor(() => expect(FakeEventSource.last?.url).toContain('watch=frog'))
    const ana = {
      username: 'ana',
      name: 'Ana',
      avatarUrl: null,
      savedAt: '2026-10-19T10:00:00Z',
      isYou: false,
    }
    // This page joining is counted on the stream first…
    act(() =>
      FakeEventSource.last!.emit('watching', {
        type: 'watching',
        slug: 'frog',
        watching: 2,
        watchers: [ana],
      }),
    )
    // …then the moment, read before it joined, arrives.
    await act(async () =>
      answer(
        new Response(
          JSON.stringify({
            moment: { slug: 'frog', title: 'Frog', hue: '#7ee08a', watching: 1, people: 2 },
            items: [{ post: post('a', ''), savedAt: '2026-10-19T10:00:00Z', people: 1 }],
            bars: [],
            watchers: [],
          }),
        ),
      ),
    )
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('a'))
    expect(screen.getByText('2 watching')).toBeInTheDocument()
    expect(screen.getByText(/is watching with you/)).toBeInTheDocument()
  })
})

describe('why it’s on your feed, in full', () => {
  const saver = (username: string, isYou = false) => ({
    username,
    name: username[0].toUpperCase() + username.slice(1),
    avatarUrl: null,
    savedAt: new Date().toISOString(),
    isYou,
  })
  const together = { kind: 'together', text: 'You and 2 others saved this' }

  it('names who kept it together, you last', () => {
    expect(whyDetail(together, [saver('pete', true), saver('ben'), saver('ana')])).toBe(
      'Ben, Ana and you all kept it. Three people don’t agree on anything by accident.',
    )
    expect(whyDetail(together, [saver('ana'), saver('ben')])).toBe('Ana and Ben both kept it.')
  })

  it('keeps the feed’s words for other reasons, or without savers', () => {
    expect(whyDetail({ kind: 'close', text: 'You watch most of Ana’s saves' }, [])).toBe(
      'You watch most of Ana’s saves',
    )
    expect(whyDetail(together, undefined)).toBe('You and 2 others saved this')
  })
})
