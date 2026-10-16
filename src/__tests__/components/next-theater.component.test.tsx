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
import { SaveSheet } from '@/components/next/theater/TheaterSheets'
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
      channel: null,
      auto: null,
      recent: false,
      start: 'twitter:1',
    })
    expect(sourceFromParams({ q: 'x', group: 'nope', start: '../etc' })).toMatchObject({
      group: null,
      channel: null,
      auto: null,
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

  it('counts the source on its own and labels posts added after it', () => {
    const added = addedVia([result('7'), result('8')], v3)
    const queue = [v1, p2, v3, ...added]
    expect(viaLabel(added[0].via!)).toBe('More like @author3’s video')
    expect(queuePosition(queue, 2)).toEqual({ via: null, n: 3, of: 3 })
    expect(queuePosition(queue, 4)).toEqual({ via: added[0].via, n: 2, of: 2 })
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
    channel: null,
    auto: null,
    recent: false,
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

  it('says when it moves on from the search to similar posts', async () => {
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
    expect(screen.getByRole('note')).toHaveTextContent('More like @author3’s video')
    expect(screen.getByRole('note')).toHaveTextContent('Not from “frogs” · 1 of 1')
    expect(screen.queryByText(/of 4/)).toBeNull()
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
