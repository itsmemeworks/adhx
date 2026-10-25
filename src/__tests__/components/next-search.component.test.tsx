// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { FeedItem, MediaItem } from '@/components/feed/types'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/search',
}))

vi.mock('@/components/auth', () => ({
  useAuthMe: () => ({ me: { authenticated: true }, loading: false, refresh: vi.fn() }),
}))

import { SearchScreen } from '@/components/next/search/SearchScreen'
import { BentoView } from '@/components/next/search/ResultViews'
import {
  DEFAULT_STATE,
  countLabel,
  groupResults,
  heardOrRead,
  matchReason,
  matchShort,
  openHref,
  paramsFromState,
  orderByStrength,
  previewVideoSrc,
  splitByStrength,
  stateFromParams,
  type SearchResponse,
  type SearchResultItem,
} from '@/components/next/search/model'

function media(partial: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'm1',
    mediaType: 'video',
    width: 720,
    height: 1280,
    durationMs: 23_000,
    url: '/api/files/twitter/1001/video-1?a=JamesMelville&v=2',
    thumbnailUrl: 'https://pbs.twimg.com/thumb.jpg',
    shareUrl: '',
    ...partial,
  }
}

function post(partial: Partial<FeedItem> = {}): FeedItem {
  return {
    id: '1001',
    platform: 'twitter',
    author: 'JamesMelville',
    authorName: 'James Melville',
    authorProfileImageUrl: null,
    text: 'Squirrels in Scotland gorge themselves on caramel wafers',
    tweetUrl: 'https://x.com/JamesMelville/status/1001',
    processedAt: '2026-10-16T09:00:00.000Z',
    isArchived: false,
    media: [media()],
    links: null,
    tags: [],
    ...partial,
  }
}

const squirrel: SearchResultItem = { post: post(), saved: true, matched: ['video', 'words'] }
const community: SearchResultItem = {
  post: post({
    id: '2002',
    author: 'itsCP666',
    text: 'a synth that becomes whatever you type',
    media: null,
  }),
  saved: false,
  matched: ['words'],
}

function response(items: SearchResultItem[], extra: Partial<SearchResponse> = {}): SearchResponse {
  return {
    items,
    total: items.length,
    understood: true,
    close: true,
    refined: false,
    nextOffset: null,
    ...extra,
  }
}

describe('search model', () => {
  it('round-trips state through the URL, leaving defaults out', () => {
    const state = {
      ...DEFAULT_STATE,
      q: 'squirrels',
      scope: 'mine' as const,
      view: 'queue' as const,
    }
    const params = paramsFromState(state)
    expect(params.toString()).toBe('q=squirrels&scope=mine&view=queue')
    // Members search everyone's saves unless they ask for their own.
    expect(DEFAULT_STATE.scope).toBe('everyone')
    expect(stateFromParams(params)).toEqual(state)
    expect(stateFromParams({ scope: 'all-users', type: 'gifs' })).toEqual(DEFAULT_STATE)
  })

  it('groups by the strongest signal and explains it in plain words', () => {
    expect(groupResults([squirrel, community]).map((g) => g.name)).toEqual([
      'Shown in the video',
      'What it’s about',
    ])
    expect(matchReason(squirrel)).toBe(
      'What happens in the video matches what you described, and what it says agrees.',
    )
    expect(countLabel(1, 'videos')).toBe('1 video')
    expect(countLabel(3, 'all')).toBe('3 matches')
  })

  it('says when a match was said in the video or written on screen', () => {
    const said: SearchResultItem = { ...squirrel, matched: ['speech', 'keywords'] }
    const meme: SearchResultItem = { ...community, matched: ['screen'] }
    expect(groupResults([said, meme, community]).map((g) => g.name)).toEqual([
      'Said in the video',
      'On screen',
      'What it’s about',
    ])
    expect(matchReason({ ...said, matched: ['speech'] })).toBe('Someone says it in the video.')
    expect(matchReason({ ...meme, matched: ['screen', 'picture'] })).toBe(
      'It’s written on screen, and the picture agrees.',
    )
    expect(matchReason({ ...squirrel, matched: ['video', 'speech'] })).toBe(
      'What happens in the video matches what you described, and what’s said in it agrees.',
    )
    expect(matchShort(meme)).toBe('on screen')
    expect(matchShort(said)).toBe('said in the video')
    expect(heardOrRead(said)).toBe('Said in the video')
    expect(heardOrRead(meme)).toBe('On screen')
    expect(heardOrRead(squirrel)).toBeNull()
    render(<BentoView items={[{ ...said, strength: 'strong' }, meme]} query="cucumber" />)
    expect(
      screen.getAllByRole('img', { name: 'Strong match, said in the video' }).length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('On screen').length).toBeGreaterThan(0)
  })

  it('opens your saves in the theater and anyone else’s on its public page', () => {
    expect(openHref(squirrel)).toBe('/saved?open=1001&platform=twitter')
    expect(openHref(community)).toBe('/itsCP666/status/2002')
  })

  it('streams previews only through the app’s own kept-file route', () => {
    expect(previewVideoSrc(squirrel.post)).toBe(
      '/api/files/twitter/1001/video-1?a=JamesMelville&v=2',
    )
    // A raw CDN url on the row is never streamed directly — Instagram goes
    // through its own kept-file route, not the Twitter one.
    expect(
      previewVideoSrc(
        post({
          platform: 'instagram',
          media: [media({ url: 'https://scontent.cdninstagram.com/v/clip.mp4' })],
        }),
      ),
    ).toBe('/api/files/instagram/1001/video-1?v=2')
    expect(previewVideoSrc(post({ media: null }))).toBeNull()
  })
})

describe('match strength in results', () => {
  const frog = { ...squirrel, strength: 'strong' as const }
  const chameleon: SearchResultItem = { ...community, post: post({ id: '3003' }), strength: 'good' }
  const robocop: SearchResultItem = {
    ...community,
    post: post({ id: '4004', text: 'RoboCop' }),
    strength: 'related',
  }

  it('puts close matches first and keeps the rest as related', () => {
    expect(orderByStrength([robocop, frog, chameleon]).map((i) => i.post.id)).toEqual([
      '1001',
      '3003',
      '4004',
    ])
    expect(splitByStrength([robocop]).matches.map((i) => i.post.id)).toEqual(['4004'])
  })

  it('explains related results under their own heading, with a meter on each tile', () => {
    render(<BentoView items={[frog, chameleon, robocop]} query="frog" />)
    expect(screen.getByRole('heading', { name: /Related to “frog”/ })).toBeInTheDocument()
    expect(
      screen.getByText('This one is close in meaning, but not exactly what you described.'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Strong match' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /related/ })).toBeInTheDocument()
  })
})

describe('SearchScreen', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fetchMock.mockReset()
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/understanding/status')) {
        return new Response(
          JSON.stringify({ enabled: true, groups: [{ id: 'videos', done: 2, total: 5 }] }),
        )
      }
      const params = new URL(url, 'http://localhost').searchParams
      const items = params.get('scope') === 'everyone' ? [squirrel, community] : [squirrel]
      return new Response(
        JSON.stringify(response(items, { refined: params.get('refine') === '1' })),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    window.localStorage.clear()
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as never
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows the empty state until something is typed', () => {
    render(<SearchScreen initial={DEFAULT_STATE} />)
    expect(
      screen.getByRole('heading', { name: 'Find it by what you remember.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'that video with the squirrel' })).toBeInTheDocument()
  })

  it('searches as you type, then swaps in the refined order', async () => {
    render(<SearchScreen initial={{ ...DEFAULT_STATE, scope: 'mine' }} />)
    fireEvent.change(screen.getByLabelText('Describe what you’re looking for'), {
      target: { value: 'squirrels eating biscuits' },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '1 match' })).toBeInTheDocument(),
    )
    const searches = fetchMock.mock.calls
      .map(([u]) => String(u))
      .filter((u) => u.startsWith('/api/search'))
    expect(searches.some((u) => !u.includes('refine=1'))).toBe(true)
    expect(searches.some((u) => u.includes('refine=1'))).toBe(true)
    expect(
      screen.getByText(/^Still learning 3 of your saves\. “Words only” results/),
    ).toBeInTheDocument()
    // Every result opens the theater with this search as its queue.
    expect(screen.getByRole('link', { name: /Best match: James Melville/ })).toHaveAttribute(
      'href',
      '/play?q=squirrels+eating+biscuits&scope=mine&start=twitter%3A1001',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Play all 1' }))
    expect(push).toHaveBeenCalledWith('/play?q=squirrels+eating+biscuits&scope=mine')
  })

  it('marks posts from other people’s saves when searching everyone', async () => {
    render(<SearchScreen initial={{ ...DEFAULT_STATE, scope: 'mine', q: 'synth' }} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Everyone’s saves' })[0])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '2 matches' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('link', { name: /saved by someone else/ })).toHaveAttribute(
      'href',
      '/play?q=synth&start=twitter%3A2002',
    )
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('scope=everyone'))).toBe(true)
  })

  it('says when nothing is close and offers ways out', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('/api/understanding/status')
        ? new Response(JSON.stringify({ enabled: false, groups: [] }))
        : new Response(JSON.stringify(response([]))),
    )
    render(
      <SearchScreen initial={{ ...DEFAULT_STATE, scope: 'mine', q: 'nothing', type: 'videos' }} />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    await waitFor(() => expect(screen.getByText('No videos match this')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Search everyone’s saves' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('scope=everyone'))).toBe(true)
  })
})

describe('result tiles', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as never
  })

  it('keeps a video tile still when reduced motion is on', async () => {
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as never
    const { ResultTile } = await import('@/components/next/search/ResultTile')
    const { container } = render(<ResultTile item={squirrel} />)
    fireEvent.focusIn(container.querySelector('a') as HTMLAnchorElement)
    expect(container.querySelector('video')).toBeNull()
  })

  it('plays a video tile while it is hovered or focused, and stops after', async () => {
    const { ResultTile } = await import('@/components/next/search/ResultTile')
    const { container } = render(<ResultTile item={squirrel} />)
    const tile = container.querySelector('a') as HTMLAnchorElement
    expect(container.querySelector('video')).toBeNull()
    fireEvent.focusIn(tile)
    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    expect(video).toHaveAttribute('src', previewVideoSrc(squirrel.post) as string)
    expect((video as HTMLVideoElement).muted).toBe(true)
    fireEvent.focusOut(tile)
    expect(container.querySelector('video')).toBeNull()
  })

  it('names the views after how they arrange results', () => {
    render(<SearchScreen initial={{ ...DEFAULT_STATE, q: 'squirrels' }} />)
    for (const name of ['Best first', 'By match', 'Play order']) {
      expect(screen.getAllByRole('button', { name: new RegExp(name) }).length).toBeGreaterThan(0)
    }
  })
})
