// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { FeedItem, MediaItem } from '@/components/feed/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
// The media stage is the current theater's, tested on its own; stub it here.
const stageProps = vi.fn()
vi.mock('@/components/theater/Stage', () => ({
  Stage: (props: { item: { bookmarkId: string } | null; onEnded?: () => void }) => {
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
  appendUnique,
  clock,
  dwellSeconds,
  insertAfter,
  nextIndex,
  playHref,
  prevIndex,
  sourceFromParams,
  upcomingSavedKeys,
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

describe('theater queue', () => {
  it('reads and writes play links, rejecting junk', () => {
    expect(
      playHref(
        { q: 'frogs', scope: 'mine', type: 'all', wordsOnly: false },
        { group: 'video', start: 'twitter:1' },
      ),
    ).toBe('/play?q=frogs&group=video&start=twitter%3A1')
    const source = sourceFromParams(
      new URLSearchParams('q=frogs&scope=everyone&group=video&start=twitter:1'),
    )
    expect(source).toEqual({
      search: { q: 'frogs', scope: 'everyone', type: 'all', wordsOnly: false },
      group: 'video',
      start: 'twitter:1',
    })
    expect(sourceFromParams({ q: 'x', group: 'nope', start: '../etc' })).toMatchObject({
      group: null,
      start: null,
    })
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
  afterEach(() => vi.unstubAllGlobals())

  const source = {
    search: { q: 'frogs', scope: 'mine' as const, type: 'all' as const, wordsOnly: false },
    group: null,
    start: null,
  }

  it('plays the search results in their refined order', async () => {
    render(<TheaterV2 source={{ ...source, start: 'twitter:3' }} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('3'))
    expect(String(fetchMock.mock.calls[0][0])).toContain('refine=1')
    expect(screen.getByText('3 of 3')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /frogs/ })).toHaveAttribute('href', '/search?q=frogs')
  })

  it('plays only the chosen group', async () => {
    render(<TheaterV2 source={{ ...source, group: 'video' }} />)
    await waitFor(() => expect(screen.getByText('1 of 2')).toBeInTheDocument())
  })

  it('skips with the keyboard and ends when nothing similar is left', async () => {
    render(<TheaterV2 source={source} />)
    await waitFor(() => expect(screen.getByTestId('stage')).toHaveTextContent('1'))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('stage')).toHaveTextContent('2')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
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
})
