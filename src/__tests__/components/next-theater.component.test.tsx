// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { invalidateAuthMe } from '@/components/auth/useAuthMe'
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react'
import type { FeedItem, MediaItem } from '@/components/feed/types'

const prefs = vi.hoisted(() => ({
  current: null as null | {
    preferences: { soundOn: boolean; bionicReading: boolean; bodyFont: string }
    loading: boolean
  },
}))
vi.mock('@/lib/preferences-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/preferences-context')>()),
  usePreferencesOptional: () => prefs.current,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/play',
}))
// The media stage is the current theater's, tested on its own; stub it here.
const stageProps = vi.fn()
vi.mock('@/components/theater/Stage', () => ({
  Stage: (props: {
    item: { bookmarkId: string } | null
    muted?: boolean
    onEnded?: () => void
  }) => {
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
import { SaveSheet, UpNextSheet } from '@/components/next/theater/TheaterSheets'
import {
  addedVia,
  appendUnique,
  autoPlayHref,
  backHref,
  channelPlayHref,
  clock,
  dwellSeconds,
  insertAfter,
  nextIndex,
  playHref,
  prevIndex,
  queuePosition,
  queueUrl,
  sourceFromParams,
  upcomingSavedKeys,
  viaLabel,
} from '@/components/next/theater/queue'
import type { SearchResultItem } from '@/components/next/search/model'

function media(partial: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'm1',
    mediaType: 'video',
    width: 720,
    height: 1280,
    durationMs: 9_000,
    url: '/api/media/video?a=1',
    thumbnailUrl: 'https://pbs.twimg.com/t.jpg',
    shareUrl: '',
    ...partial,
  }
}
function result(
  id: string,
  opts: {
    video?: boolean
    text?: string
    saved?: boolean
    matched?: SearchResultItem['matched']
  } = {},
): SearchResultItem {
  const post: FeedItem = {
    id,
    platform: 'twitter',
    author: `author${id}`,
    authorName: `Author ${id}`,
    authorProfileImageUrl: null,
    text: opts.text ?? `post ${id}`,
    tweetUrl: `https://x.com/a/status/${id}`,
    processedAt: '2026-10-16T09:00:00.000Z',
    isArchived: false,
    media: opts.video ? [media()] : null,
    links: null,
    tags: [],
  }
  return { post, saved: opts.saved ?? true, matched: opts.matched ?? ['words'] }
}

const v1 = result('1', { video: true, matched: ['video'] })
const p2 = result('2')
const v3 = result('3', { video: true, matched: ['video'], saved: false })

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

describe('theater queue', () => {
  it('reads and writes play links, rejecting junk', () => {
    expect(
      playHref(
        { q: 'frogs', scope: 'everyone', type: 'all', wordsOnly: false },
        { group: 'video', start: 'twitter:1' },
      ),
    ).toBe('/play?q=frogs&group=video&start=twitter%3A1')
    const source = sourceFromParams(
      new URLSearchParams('q=frogs&scope=everyone&group=video&start=twitter:1'),
    )
    expect(source).toEqual({
      search: { q: 'frogs', scope: 'everyone', type: 'all', wordsOnly: false },
      group: 'video',
      channel: null,
      auto: null,
      groupChannel: null,
      friend: null,
      recent: false,
      moment: null,
      start: 'twitter:1',
    })
    expect(sourceFromParams({ q: 'x', group: 'nope', start: '../etc' })).toMatchObject({
      group: null,
      channel: null,
      auto: null,
      start: null,
    })
  })

  it.each([
    'soundcloud:forss~flickermood',
    'twitch:' + 'a'.repeat(128),
    'bluesky:did.example~post',
  ])('opens valid post IDs in every queue: %s', (start) => {
    expect(sourceFromParams({ reacted: '1', start }).start).toBe(start)
    expect(sourceFromParams({ feed: 'new', start }).start).toBe(start)
  })
  it.each([
    'soundcloud:a/b',
    'twitter:a?b',
    'twitter:a:b',
    'unknown:one',
    'twitterX',
    'twitter:' + 'a'.repeat(129),
    ':id',
  ])('rejects unsafe start IDs: %s', (start) => {
    expect(sourceFromParams({ reacted: '1', start }).start).toBeNull()
  })

  it('moves with repeat and videos only', () => {
    const items = [v1, p2, v3]
    expect(nextIndex(items, 0, { repeat: 'off', videosOnly: false })).toBe(1)
    expect(nextIndex(items, 0, { repeat: 'off', videosOnly: true })).toBe(2)
    expect(nextIndex(items, 2, { repeat: 'off', videosOnly: false })).toBeNull()
    expect(nextIndex(items, 2, { repeat: 'all', videosOnly: false })).toBe(0)
    expect(prevIndex(items, 2, { videosOnly: true })).toBe(0)
  })

  it('puts more like this right after the current post', () => {
    const p4 = result('4')
    expect(insertAfter([v1, p2, v3], 0, [v3, p4]).map((i) => i.post.id)).toEqual([
      '1',
      '3',
      '4',
      '2',
    ])
    expect(appendUnique([v1, p2], [p2, v3]).map((i) => i.post.id)).toEqual(['1', '2', '3'])
  })

  it('counts the source on its own and labels posts added after it', () => {
    const added = addedVia([result('7'), result('8')], v3)
    const queue = [v1, p2, v3, ...added]
    expect(viaLabel(added[0].via!)).toBe('More like @author3’s video')
    expect(queuePosition(queue, 2)).toEqual({ via: null, n: 3, of: 3 })
    expect(queuePosition(queue, 4)).toEqual({ via: added[0].via, n: 2, of: 2 })
  })

  it('keeps asked-for posts in one run, still counting ones that were in the source', () => {
    // "More like this" in your saves: p2 was already queued, 7 is new.
    const run = addedVia([p2, result('7')], v1, 'more').map((m) =>
      m.post.id === '2' ? { ...m, fromSource: true } : m,
    )
    const queue = [v1, ...run, v3]
    expect(queuePosition(queue, 1)).toEqual({ via: run[0].via, n: 1, of: 2 })
    expect(queuePosition(queue, 2)).toEqual({ via: run[0].via, n: 2, of: 2 })
    // The source still counts p2: v1, p2, v3.
    expect(queuePosition(queue, 3)).toEqual({ via: null, n: 3, of: 3 })
    render(<UpNextSheet items={queue} current={0} onPlay={() => {}} onClose={() => {}} />)
    expect(screen.getAllByText('More like @author1’s video')).toHaveLength(1)
  })

  it('times posts without a player and lists saved posts coming up', () => {
    expect(dwellSeconds(result('5', { text: 'hi' }))).toBe(5)
    expect(dwellSeconds(result('6', { text: 'word '.repeat(200) }))).toBe(15)
    expect(upcomingSavedKeys([v1, p2, v3], 0)).toEqual([{ platform: 'twitter', id: '2' }])
    expect(clock(83.4)).toBe('1:23')
  })
})

describe('TheaterV2', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/search/similar')) {
        return new Response(
          JSON.stringify({
            items: [],
            total: 0,
            understood: true,
            close: false,
            refined: false,
            nextOffset: null,
          }),
        )
      }
      if (url.startsWith('/api/search')) {
        return new Response(
          JSON.stringify({
            items: [v1, p2, v3],
            total: 3,
            understood: true,
            close: true,
            refined: true,
            nextOffset: null,
          }),
        )
      }
      return new Response('{}')
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    prefs.current = null
    localStorage.clear()
    sessionStorage.clear()
  })

  const source = {
    search: { q: 'frogs', scope: 'mine' as const, type: 'all' as const, wordsOnly: false },
    group: null,
    channel: null,
    auto: null,
    recent: false,
    moment: null,
    start: null,
  }

  it('plays the search results in their refined order', async () => {
    wideScreen()
    render(<TheaterV2 source={{ ...source, start: 'twitter:3' }} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('3'))
    const queueCall = fetchMock.mock.calls
      .map(([u]) => String(u))
      .find((u) => u.startsWith('/api/search'))
    expect(queueCall).toContain('refine=1')
    expect(screen.getByText('3 of 3')).toBeInTheDocument()
    // The back chip leads the stage's chips.
    for (const link of screen.getAllByRole('link', { name: /frogs/ })) {
      expect(link).toHaveAttribute('href', '/search?q=frogs&scope=mine')
    }
  })

  it('starts muted unless Sound on by default is on', async () => {
    const { unmount } = render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('1'))
    expect(stageProps.mock.calls.at(-1)?.[0].muted).toBe(true)
    unmount()

    prefs.current = {
      preferences: { soundOn: true, bionicReading: false, bodyFont: 'ibm-plex' },
      loading: false,
    }
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('1'))
    expect(stageProps.mock.calls.at(-1)?.[0].muted).toBe(false)
    expect(screen.getAllByRole('button', { name: 'Mute' }).length).toBeGreaterThan(0)
  })

  /** A signed-in account, with every other request answered as before. */
  const signedIn = () => {
    invalidateAuthMe()
    const answer = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      String(url).includes('/api/auth/me')
        ? new Response(
            JSON.stringify({ authenticated: true, user: { id: 'u1' }, identities: {} }),
            { status: 200 },
          )
        : answer(url, init),
    )
  }

  it('notifies the media player after a manual save succeeds', async () => {
    signedIn()
    const saved = vi.fn()
    window.addEventListener('nx-post-saved', saved)
    try {
      render(<TheaterV2 source={{ ...source, start: 'twitter:3' }} />)
      await waitFor(() =>
        expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/auth/me'))).toBe(true),
      )
      await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('3'))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(saved).toHaveBeenCalledOnce())
      expect(saved.mock.calls[0][0].detail).toEqual({ key: 'twitter:3' })
      expect(screen.getByRole('button', { name: 'Saved. Add to a channel' })).toBeInTheDocument()
    } finally {
      window.removeEventListener('nx-post-saved', saved)
    }
  })

  it('signed out, Save goes straight to sign in without trying to save', async () => {
    invalidateAuthMe()
    const answer = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      String(url).includes('/api/auth/me')
        ? new Response(JSON.stringify({ authenticated: false }), { status: 200 })
        : answer(url, init),
    )
    const assign = vi.fn()
    const realLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, assign },
    })
    try {
      render(<TheaterV2 source={{ ...source, start: 'twitter:3' }} />)
      await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('3'))
      await waitFor(() =>
        expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/auth/me'))).toBe(true),
      )
      await act(async () => {})
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(assign).toHaveBeenCalledOnce())
      expect(String(assign.mock.calls[0][0])).toMatch(/^\/start\?returnTo=.*save%3D1/)
      expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/bookmarks/add')).toBe(false)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
      invalidateAuthMe()
    }
  })

  it('names who saved it and switches Just for me from the More menu', async () => {
    const named = {
      ...v1,
      post: {
        ...v1.post,
        savers: [
          {
            username: 'ben',
            name: 'Ben',
            avatarUrl: null,
            savedAt: '2026-10-18T10:00:00.000Z',
            isYou: false,
          },
        ],
        isPrivate: false,
      },
    }
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/private') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ private: true }))
      }
      if (url.startsWith('/api/search') && !url.startsWith('/api/search/similar')) {
        return new Response(
          JSON.stringify({
            items: [named, p2],
            total: 2,
            understood: true,
            close: true,
            refined: true,
            nextOffset: null,
          }),
        )
      }
      return new Response('{}')
    })
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('1'))
    expect(screen.getByText('Ben saved this')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More options' }))
    const row = screen.getByRole('menuitemcheckbox', { name: /Just for me/ })
    expect(row).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(row)
    await waitFor(() =>
      expect(screen.getByRole('menuitemcheckbox', { name: /Just for me/ })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    )
    const patch = fetchMock.mock.calls.find(([u]) => String(u).includes('/private'))
    expect(patch?.[0]).toBe('/api/bookmarks/1/private')
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ platform: 'twitter', private: true })
    expect(screen.getAllByRole('img', { name: 'Just for me' }).length).toBeGreaterThan(0)
  })

  it('shows a friend’s note on the byline and sets yours from the Save sheet', async () => {
    const noted = {
      ...v1,
      saved: true,
      post: {
        ...v1.post,
        savers: [
          {
            username: 'ben',
            name: 'Ben',
            avatarUrl: null,
            savedAt: '2026-10-18T10:00:00.000Z',
            isYou: false,
            note: 'you’re welcome',
          },
          {
            username: 'me',
            name: 'Me',
            avatarUrl: null,
            savedAt: '2026-10-17T10:00:00.000Z',
            isYou: true,
          },
        ],
      },
    }
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/note') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ note: 'this is so you, Ben' }))
      }
      if (url.startsWith('/api/search') && !url.startsWith('/api/search/similar')) {
        return new Response(
          JSON.stringify({
            items: [noted, p2],
            total: 2,
            understood: true,
            close: true,
            refined: true,
            nextOffset: null,
          }),
        )
      }
      return new Response('{}')
    })
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('1'))
    expect(screen.getByRole('figure')).toHaveTextContent('you’re welcome')

    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    const input = await screen.findByLabelText('Add a note')
    expect(input).toHaveValue('')
    fireEvent.change(input, { target: { value: 'this is so you, Ben' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/bookmarks/1/note')).toBe(true),
    )
    // Ben's note still leads the byline; yours is in Who saved it.
    expect(screen.getByRole('figure')).toHaveTextContent('you’re welcome')
    const sheet = screen.getByRole('dialog', { name: 'Saved. Add to a channel' })
    fireEvent.click(within(sheet).getAllByRole('button', { name: 'Close' })[0])
    fireEvent.click(screen.getByRole('button', { name: /saved this/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Who saved it' })
    await waitFor(() => expect(dialog).toHaveTextContent('Your note: “this is so you, Ben”'))
  })

  it('remembers a mute choice over the account default', async () => {
    prefs.current = {
      preferences: { soundOn: true, bionicReading: false, bodyFont: 'ibm-plex' },
      loading: false,
    }
    const { unmount } = render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('1'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Mute' })[0])
    expect(stageProps.mock.calls.at(-1)?.[0].muted).toBe(true)
    unmount()

    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('1'))
    expect(stageProps.mock.calls.at(-1)?.[0].muted).toBe(true)
  })

  it('shares the page and copies the words of a text post', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<TheaterV2 source={{ ...source, start: 'twitter:2' }} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('2'))
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    const sheet = screen.getByRole('dialog', { name: 'Share' })
    expect((within(sheet).getByLabelText('Link to this post') as HTMLInputElement).value).toContain(
      '/status/2',
    )
    fireEvent.click(within(sheet).getByRole('button', { name: 'Copy link' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/status/2')),
    )
    expect(within(sheet).getByRole('button', { name: 'Link copied' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Copy the text' }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('post 2'))
    // The copy button turns into a tick, then back after 2 seconds.
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    // And says so in the player's message, as on the phones.
    expect(screen.getByRole('status')).toHaveTextContent('Words copied')
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Copy the text' })).toBeInTheDocument(),
      { timeout: 3000 },
    )
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
  })

  it('pages reactions beyond fifty, coalesces concurrent Next, and uses the full count', async () => {
    const first = Array.from({ length: 50 }, (_, i) => result(String(i + 1), { video: true }))
    let finish!: (r: Response) => void
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/posts/reacted?limit=50')
        return new Response(
          JSON.stringify({ items: first, total: 52, nextOffset: 50, name: 'Reactions' }),
        )
      if (url.includes('/api/posts/reacted?limit=50&offset=50'))
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      return new Response('{}')
    })
    render(<TheaterV2 source={sourceFromParams({ reacted: '1', start: 'twitter:50' })} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('50'))
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('offset=50'))).toHaveLength(1)
    await act(async () => {
      finish(
        new Response(
          JSON.stringify({
            items: [first[49], result('51', { video: true }), result('52', { video: true })],
            total: 52,
            nextOffset: null,
          }),
        ),
      )
    })
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('51'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('52'))
    expect(screen.getAllByText(/52/).length).toBeGreaterThan(0)
  })

  it('retries a failed reactions page before ending or adding recommendations', async () => {
    let succeeds = false
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/posts/reacted?limit=50')
        return new Response(JSON.stringify({ items: [v1], total: 2, nextOffset: 1 }))
      if (url.includes('offset=1'))
        return succeeds
          ? new Response(JSON.stringify({ items: [v3], total: 2, nextOffset: null }))
          : new Response('{}', { status: 503 })
      return new Response('{}')
    })
    render(<TheaterV2 source={sourceFromParams({ reacted: '1' })} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('1'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('More posts are still loading'),
    )
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/search/similar'))).toBe(
      false,
    )
    succeeds = true
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('3'))
  })

  it('opens a selected reactions post beyond the first page', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/posts/reacted?limit=50')
        return new Response(JSON.stringify({ items: [v1], total: 2, nextOffset: 1 }))
      if (url.includes('offset=1'))
        return new Response(JSON.stringify({ items: [v3], total: 2, nextOffset: null }))
      return new Response('{}')
    })
    render(<TheaterV2 source={sourceFromParams({ reacted: '1', start: 'twitter:3' })} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('3'))
  })

  it('ignores a late page from a previous queue even when the offsets match', async () => {
    let visit = 0
    const finish: Array<(r: Response) => void> = []
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/posts/reacted?limit=50') {
        visit++
        return new Response(
          JSON.stringify({
            items: [result(visit === 1 ? 'old' : 'new', { video: true })],
            total: 2,
            nextOffset: 1,
          }),
        )
      }
      if (url.includes('offset=1')) return new Promise<Response>((resolve) => finish.push(resolve))
      return new Response('{}')
    })
    const view = render(<TheaterV2 source={sourceFromParams({ reacted: '1' })} />)
    await waitFor(() => expect(finish).toHaveLength(1))
    view.rerender(<TheaterV2 source={sourceFromParams({ reacted: '1' })} />)
    await waitFor(() => expect(finish).toHaveLength(2))
    await act(async () => {
      finish[0](
        new Response(
          JSON.stringify({
            items: [result('stale', { video: true })],
            total: 99,
            nextOffset: null,
          }),
        ),
      )
    })
    expect(screen.getByTestId('stage')).toHaveTextContent('new')
    await act(async () => {
      finish[1](
        new Response(
          JSON.stringify({ items: [result('fresh', { video: true })], total: 2, nextOffset: null }),
        ),
      )
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('fresh'))
  })

  it.each([true, false])(
    'holds the original sheet on its video and restores only previously playing video (%s)',
    async (wasPlaying) => {
      const pause = vi.fn(),
        resume = vi.fn()
      window.addEventListener('theater-pause', pause)
      window.addEventListener('theater-resume', resume)
      try {
        render(<TheaterV2 source={source} />)
        await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('1'))
        act(() =>
          window.dispatchEvent(
            new CustomEvent('theater-playing-state', { detail: { playing: wasPlaying } }),
          ),
        )
        fireEvent.click(screen.getByRole('button', { name: 'The original post on X' }))
        const sheet = screen.getByRole('dialog', { name: 'The original post on X' })
        const end = stageProps.mock.calls.at(-1)![0].onEnded
        act(() => end()) // A queued native ended event must not advance under the reader.
        expect(screen.getByTestId('stage')).toHaveTextContent('1')
        expect(within(sheet).getByText('Author 1')).toBeInTheDocument()
        expect(pause).toHaveBeenCalledTimes(wasPlaying ? 1 : 0)
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(resume).toHaveBeenCalledTimes(wasPlaying ? 1 : 0)
      } finally {
        window.removeEventListener('theater-pause', pause)
        window.removeEventListener('theater-resume', resume)
      }
    },
  )

  it('keeps only who saved it over the media, and opens the original from the rail', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const saved = {
      ...v1,
      post: {
        ...v1.post,
        text: 'Never gonna give you up https://example.com/rick',
        createdAt: '2026-10-18T12:00:00.000Z',
        authorProfileImageUrl: 'https://pbs.twimg.com/profile_images/1/a.jpg',
        savers: [
          {
            username: 'mum',
            name: 'Mum',
            avatarUrl: null,
            savedAt: new Date(Date.now() - 3_600_000).toISOString(),
            isYou: false,
          },
        ],
      },
    }
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/search') && !url.startsWith('/api/search/similar')) {
        return new Response(
          JSON.stringify({ items: [saved, p2], total: 2, understood: true, refined: true }),
        )
      }
      return new Response('{}')
    })
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('1'))
    const playing = screen.getByRole('region', { name: 'Now playing' })
    // Who saved it, and when; no network/author line, no caption.
    expect(within(playing).getByText('Mum saved this')).toBeInTheDocument()
    expect(within(playing).getByText('· 1h')).toBeInTheDocument()
    // (Screen readers still get the post's heading.)
    expect(
      within(playing)
        .queryAllByText(/Never gonna give you up/)
        .filter((el) => !el.classList.contains('sr-only')),
    ).toEqual([])
    expect(within(playing).queryByText('@author1')).toBeNull()
    expect(within(playing).queryByRole('button', { name: 'Show the full caption' })).toBeNull()

    // The rail, in the phones' order: React, Save, Send, Download, the network, More.
    const rail = screen.getByRole('navigation', { name: 'Post actions' })
    expect(
      within(rail)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'React',
      'Saved. Add to a channel',
      'Share',
      'Copy the text',
      'The original post on X',
      'More options',
    ])

    fireEvent.click(within(rail).getByRole('button', { name: 'The original post on X' }))
    const sheet = screen.getByRole('dialog', { name: 'The original post on X' })
    expect(within(sheet).getByText('Author 1')).toBeInTheDocument()
    expect(within(sheet).getByText('@author1 · Posted 18 Oct 2026')).toBeInTheDocument()
    expect(within(sheet).getByText(/Never gonna give you up/)).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'example.com/rick' })).toHaveAttribute(
      'href',
      'https://example.com/rick',
    )
    expect(within(sheet).getByRole('link', { name: 'Open on X' })).toHaveAttribute(
      'href',
      'https://x.com/author1/status/1',
    )
    fireEvent.click(within(sheet).getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://x.com/author1/status/1'))
    expect(screen.queryByRole('dialog', { name: 'The original post on X' })).toBeNull()
    expect(await screen.findByRole('status')).toHaveTextContent('Link copied')

    // Escape closes it too.
    fireEvent.click(within(rail).getByRole('button', { name: 'The original post on X' }))
    expect(screen.getByRole('dialog', { name: 'The original post on X' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'The original post on X' })).toBeNull()
  })

  it('still shows the link to copy by hand when the browser blocks copying', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('blocked')
    })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<TheaterV2 source={{ ...source, start: 'twitter:2' }} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('2'))
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() =>
      expect(screen.getByText(/This browser blocked copying/)).toBeInTheDocument(),
    )
    expect((screen.getByLabelText('Link to this post') as HTMLInputElement).value).toContain(
      '/status/2',
    )
  })

  it('says a moment has passed when Tune in finds it gone', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 404 }))
    render(<TheaterV2 source={{ ...source, moment: 'frogs-abc12' }} />)
    expect(await screen.findByText('This moment has passed')).toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Right now' }),
    ).toHaveAttribute('href', '/now')
  })

  it('offers Try again when a queue fails to load', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 429 }))
    render(<TheaterV2 source={{ ...source, moment: 'frogs-abc12' }} />)
    expect(await screen.findByText('That didn’t load')).toBeInTheDocument()
    expect(screen.getByText(/Lots of requests from here/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  const emptySaves = (xAvailable: boolean) => {
    // useAuthMe caches the account for the whole page: start from a fresh one.
    invalidateAuthMe()
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('/api/auth/me')
        ? new Response(
            JSON.stringify({
              authenticated: true,
              user: null,
              identities: {},
              xConnected: false,
              xAvailable,
            }),
            { status: 200 },
          )
        : new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }),
    )
  }

  it('offers a way to bring saves in when My saves is empty', async () => {
    emptySaves(true)
    render(<TheaterV2 source={{ ...source, recent: true }} />)
    expect(await screen.findByText('Nothing kept yet')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Bring in X bookmarks' })).toHaveAttribute(
      'href',
      '/settings?sync=1',
    )
  })

  it('offers Paste, not X bookmarks, on a server without X', async () => {
    emptySaves(false)
    render(<TheaterV2 source={{ ...source, recent: true }} />)
    expect(await screen.findByText('Nothing kept yet')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Bring in X bookmarks' })).not.toBeInTheDocument(),
    )
    expect(screen.getAllByRole('button', { name: 'Paste' }).length).toBeGreaterThan(0)
  })

  it('plays only the chosen group', async () => {
    wideScreen()
    render(<TheaterV2 source={{ ...source, group: 'video' }} />)
    await waitFor(() => expect(screen.getByText('1 of 2')).toBeInTheDocument())
  })

  it('says when it moves on from the search to similar posts', async () => {
    wideScreen()
    const similar = [result('9', { video: true, matched: ['video'] })]
    fetchMock.mockImplementation(async (url: string) => {
      const items = url.startsWith('/api/search/similar') ? similar : [v1, p2, v3]
      return new Response(
        JSON.stringify({ items, total: items.length, understood: true, refined: true }),
      )
    })
    render(<TheaterV2 source={{ ...source, start: 'twitter:3' }} />)
    await waitFor(() => expect(screen.getByText('3 of 3')).toBeInTheDocument())
    await act(async () => {
      stageProps.mock.calls.at(-1)?.[0].onEnded?.()
    })
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('9'))
    expect(screen.getByRole('status')).toHaveTextContent(
      'That’s everything from “frogs”. Now: more like the last one',
    )
    // The message has the top row's place for 3 s; then the note says why.
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), { timeout: 4000 })
    expect(screen.getByRole('note')).toHaveTextContent('More like @author3’s video')
    expect(screen.getByRole('note')).toHaveTextContent(
      'Your search finished, so similar posts play next · 1 of 1',
    )
    expect(screen.getByRole('note')).not.toHaveTextContent('Not from')
    expect(screen.queryByText(/of 4/)).toBeNull()
  })

  it('skips with the keyboard and ends when nothing similar is left', async () => {
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('1'))
    // Let the keyboard listener re-attach with the loaded queue before pressing keys.
    await act(async () => {})
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('stage')).toHaveTextContent('2')
    await act(async () => {})
    fireEvent.keyDown(window, { key: 'j' })
    expect(screen.getByTestId('stage')).toHaveTextContent('3')
    // The last video ends: the theater asks for more like it, finds none, stops.
    await act(async () => {
      stageProps.mock.calls.at(-1)?.[0].onEnded?.()
    })
    await waitFor(() => expect(screen.getByText('That’s all 3')).toBeInTheDocument())
    expect(
      fetchMock.mock.calls.some(([u]) =>
        String(u).includes('/api/search/similar?platform=twitter&id=3'),
      ),
    ).toBe(true)
  })

  it('plays the last post again when Repeat is switched on after it ran out', async () => {
    const resume = vi.fn()
    window.addEventListener('theater-resume', resume)
    try {
      render(<TheaterV2 source={{ ...source, start: 'twitter:3' }} />)
      await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('3'))
      await act(async () => {
        stageProps.mock.calls.at(-1)?.[0].onEnded?.()
      })
      await waitFor(() => expect(screen.getByText('That’s all 3')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'More options' }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Repeat/ }))
      await waitFor(() => expect(screen.queryByText('That’s all 3')).toBeNull())
      expect(screen.getByTestId('stage')).toHaveTextContent('3')
      expect(resume).toHaveBeenCalled()
      expect(stageProps.mock.calls.at(-1)?.[0].repeat).toBe(false) // All: goes round from here
    } finally {
      window.removeEventListener('theater-resume', resume)
    }
  })
})

describe('channels in the theater', () => {
  it('reads channel and made-for-you play links', () => {
    const channel = sourceFromParams(
      new URLSearchParams('channel=alice/synth-gear&start=twitter:1'),
    )
    expect(channel.channel).toEqual({ username: 'alice', tag: 'synth-gear' })
    expect(channel.search.scope).toBe('everyone')
    expect(queueUrl(channel, () => '/api/search')).toBe('/api/channels/by/alice/synth-gear')
    expect(backHref(channel)).toBe('/t/alice/synth-gear')
    expect(channelPlayHref('alice', 'synth-gear', 'twitter:1')).toBe(
      '/play?channel=alice%2Fsynth-gear&start=twitter%3A1',
    )
    const auto = sourceFromParams({ auto: 'cute-animals' })
    expect(queueUrl(auto, () => '/api/search')).toBe('/api/channels/auto/cute-animals')
    expect(backHref(auto)).toBe('/channels')
    expect(autoPlayHref('cute-animals')).toBe('/play?auto=cute-animals')
    expect(sourceFromParams({ channel: '../etc', auto: 'Bad Slug' })).toMatchObject({
      channel: null,
      auto: null,
    })
  })

  it('ticks channels and creates one from the save sheet', () => {
    const onToggle = vi.fn()
    const onCreate = vi.fn()
    render(
      <SaveSheet
        channels={[
          { tag: 'synth-gear', count: 3, isPublic: true },
          { tag: 'cats', count: 1, isPublic: false },
        ]}
        selected={new Set(['cats'])}
        busy={null}
        created={null}
        onToggle={onToggle}
        onCreate={onCreate}
        onCopy={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('checkbox', { name: /Cats/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('checkbox', { name: /Synth gear/ }))
    expect(onToggle).toHaveBeenCalledWith('synth-gear', true)
    const input = screen.getByLabelText('Find or create a channel')
    fireEvent.change(input, { target: { value: 'Phone farms' } })
    expect(screen.queryByRole('checkbox', { name: /Cats/ })).toBeNull()
    fireEvent.submit(input.closest('form')!)
    expect(onCreate).toHaveBeenCalledWith('Phone farms')
  })
})
