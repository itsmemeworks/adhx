/**
 * @vitest-environment jsdom
 *
 * Cross-window / tweet-added adds vs Live + Saved queues, type filters,
 * and repeat. A second screen's save must: stay on the playing post,
 * land as Next on Live (or play immediately if caught up), reset a
 * hiding filter, and never leave the stage on "Nothing playing".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, act, screen, waitFor } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import type { FeedItem } from '@/components/feed/types'
import type { ContentType } from '@/components/matter'

vi.mock('@/components/theater/Stage', () => ({
  Stage: (props: { item: TheaterItem | null }) => (
    <div data-testid="stage" data-item-key={props.item ? theaterItemKey(props.item) : ''}>
      {props.item ? null : <p>Nothing playing</p>}
    </div>
  ),
}))

const mockMobileChrome = vi.fn((_props: Record<string, unknown>) => null)
vi.mock('@/components/theater/TheaterDesktopChrome', () => ({
  DesktopStageChrome: () => null,
  DesktopDock: () => null,
}))
vi.mock('@/components/theater/TheaterMobileChrome', () => ({
  TheaterMobileChrome: (props: Record<string, unknown>) => {
    mockMobileChrome(props)
    return null
  },
}))
vi.mock('@/components/tags', () => ({ TagQuickPicker: () => null }))
vi.mock('@/components/theater/useTheaterFeed', () => ({
  useTheaterFeed: (seed: TheaterFeedSeed) => {
    const [items, setItems] = useState(seed.items)
    const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set())
    return {
      items,
      savedToday: 0,
      recentActivity: 0,
      freshKeys,
      prependItem: (item: TheaterItem) => {
        setItems((prev) => [
          item,
          ...prev.filter((it) => theaterItemKey(it) !== theaterItemKey(item)),
        ])
        setFreshKeys((prev) => new Set(prev).add(theaterItemKey(item)))
      },
    }
  },
}))
vi.mock('@/components/auth', () => ({
  SignInModal: () => null,
  useAuthMe: () => ({
    me: { authenticated: true, user: { username: 'owner' } },
    loading: false,
    refresh: vi.fn(),
  }),
}))

function textItem(bookmarkId: string, extra: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'preview',
    platform: 'twitter',
    bookmarkId,
    author: `author${bookmarkId}`,
    url: `/author${bookmarkId}/status/${bookmarkId}`,
    createdAt: '2026-08-18T00:00:00Z',
    addedAt: '2026-08-18T00:00:00Z',
    contentType: 'text',
    text: `post ${bookmarkId}`,
    trendCount: 0,
    ...extra,
  } as TheaterItem
}

function videoItem(bookmarkId: string): TheaterItem {
  return textItem(bookmarkId, { contentType: 'video' })
}

function feedItem(id: string, extra: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    platform: 'twitter',
    author: `author${id}`,
    authorName: 'Alice',
    text: `post ${id}`,
    tweetUrl: `https://x.com/author${id}/status/${id}`,
    createdAt: '2026-08-18T00:00:00Z',
    processedAt: '2026-08-18T00:00:00Z',
    isArchived: false,
    tags: [],
    media: [],
    links: [],
    ...extra,
  } as unknown as FeedItem
}

function videoFeedItem(id: string): FeedItem {
  return feedItem(id, {
    media: [{ id: `m${id}`, mediaType: 'video', url: 'x', thumbnailUrl: 'x', shareUrl: 'x' }],
  } as Partial<FeedItem>)
}

function seed(items: TheaterItem[]): TheaterFeedSeed {
  return { items, savedToday: 0, recentActivity: 0 }
}

type ChromeProps = {
  items: TheaterItem[]
  currentKey: string | null
  queueTypes: ContentType[]
  repeatMode: string
  freshKeys: Set<string>
  isSeen: (key: string) => boolean
  onNext: () => void
  onSelect: (key: string) => void
  onToggleQueueType?: (type: ContentType) => void
  onCycleRepeat?: () => void
  queuePlayed?: number
  queueToPlay?: number
  queueLooping?: boolean
  collection?: { tab: string; onTabChange: (tab: string) => void }
}

function chromeProps(): ChromeProps {
  const call = mockMobileChrome.mock.calls.at(-1)
  if (!call) throw new Error('chrome never rendered')
  return call[0] as ChromeProps
}

function queueIds(): string[] {
  return chromeProps()
    .items.map((it) => it.bookmarkId)
    .filter((id): id is string => typeof id === 'string')
}

async function tapType(type: ContentType) {
  const toggle = chromeProps().onToggleQueueType
  if (!toggle) throw new Error('queue filter not offered')
  await act(async () => toggle(type))
}

function fireAdded(item: FeedItem) {
  window.dispatchEvent(new CustomEvent('tweet-added', { detail: { added: item } }))
}

describe('TheaterShell: cross-tab add + filters', () => {
  beforeEach(() => {
    mockMobileChrome.mockClear()
    window.localStorage.clear()
    window.sessionStorage.clear()
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/bookmarks/add')) {
        return { ok: true, json: async () => ({ platform: 'twitter', bookmark: { id: '99' } }) }
      }
      if (url.includes('/api/feed')) {
        return { ok: true, json: async () => ({ items: [feedItem('99')] }) }
      }
      return { ok: true, json: async () => ({ items: [] }) }
    }) as never
  })

  it('Live: a mid-play add grows the queue without moving the current post', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([textItem('1'), textItem('2')])}
          mode="personal"
          initialPersonalTab="live"
          personalItems={[feedItem('1')]}
          onClose={vi.fn()}
        />,
      )
    })
    expect(chromeProps().queuePlayed).toBe(0)
    expect(chromeProps().queueToPlay).toBe(2)
    expect(chromeProps().currentKey).toBe('twitter:1')

    await act(async () => fireAdded(feedItem('99')))

    expect(chromeProps().currentKey).toBe('twitter:1')
    expect(chromeProps().queuePlayed).toBe(0)
    expect(chromeProps().queueToPlay).toBe(3)
    expect(chromeProps().queueLooping).toBe(false)
  })

  it('Live: a mid-play add of a previously watched id is Next, not Seen', async () => {
    window.localStorage.setItem('adhx-seen-v1', JSON.stringify(['twitter:99']))
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([textItem('1'), textItem('2')])}
          mode="personal"
          initialPersonalTab="live"
          personalItems={[feedItem('1')]}
          onClose={vi.fn()}
        />,
      )
    })
    expect(chromeProps().currentKey).toBe('twitter:1')

    await act(async () => fireAdded(feedItem('99')))

    expect(chromeProps().currentKey).toBe('twitter:1')
    expect(chromeProps().items.map((i) => i.bookmarkId)).toEqual(['1', '99', '2'])
    expect(chromeProps().isSeen('twitter:99')).toBe(false)
  })

  it('Live: Videos while a text post is current snaps to a video, not Nothing playing', async () => {
    const video = videoItem('v1')
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([textItem('t1'), video, videoItem('v2')])}
          mode="personal"
          initialPersonalTab="live"
          personalItems={[feedItem('t1')]}
          onClose={vi.fn()}
        />,
      )
    })
    expect(chromeProps().currentKey).toBe(theaterItemKey(textItem('t1')))

    await tapType('video')

    expect(queueIds()).toEqual(['v1', 'v2'])
    expect(chromeProps().currentKey).toBe(theaterItemKey(video))
    expect(screen.queryByText('Nothing playing')).not.toBeInTheDocument()
    expect(screen.getByTestId('stage')).toHaveAttribute('data-item-key', theaterItemKey(video))
  })

  it('Live: All → Text with no text keeps the current post, and All restores it', async () => {
    const video = videoItem('v1')
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([video, videoItem('v2')])}
          mode="personal"
          initialPersonalTab="live"
          personalItems={[videoFeedItem('v1')]}
          onClose={vi.fn()}
        />,
      )
    })
    expect(chromeProps().currentKey).toBe(theaterItemKey(video))

    await tapType('text')
    expect(chromeProps().queueTypes).toEqual(['text'])
    expect(chromeProps().currentKey).toBe(theaterItemKey(video))
    expect(screen.queryByText('Nothing playing')).not.toBeInTheDocument()
    expect(screen.getByText('No text in Live right now')).toBeInTheDocument()

    await tapType('text')
    expect(chromeProps().queueTypes).toEqual([])
    expect(chromeProps().currentKey).toBe(theaterItemKey(video))
    expect(screen.queryByText('Nothing playing')).not.toBeInTheDocument()
    expect(screen.queryByText('No text in Live right now')).not.toBeInTheDocument()
    expect(screen.getByTestId('stage')).toHaveAttribute('data-item-key', theaterItemKey(video))
  })

  it('Live: Videos while every video is watched goes to caught-up, not a blank stage', async () => {
    const videos = [videoItem('v1'), videoItem('v2')]
    window.localStorage.setItem('adhx-seen-v1', JSON.stringify(videos.map(theaterItemKey)))
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([textItem('t1'), ...videos])}
          mode="personal"
          initialPersonalTab="live"
          personalItems={[feedItem('t1')]}
          onClose={vi.fn()}
        />,
      )
    })
    await tapType('video')
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()
    expect(chromeProps().currentKey).toBe(theaterItemKey(videos[0]))
    expect(screen.queryByText('Nothing playing')).not.toBeInTheDocument()
  })

  it('Live: tweet-added text while Videos is on resets to All and keeps the current post', async () => {
    const video = videoItem('v1')
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([video, videoItem('v2')])}
          mode="personal"
          initialPersonalTab="live"
          personalItems={[videoFeedItem('v1')]}
          onClose={vi.fn()}
        />,
      )
    })
    await tapType('video')
    expect(chromeProps().queueTypes).toEqual(['video'])
    const current = chromeProps().currentKey

    await act(async () => fireAdded(feedItem('99')))

    expect(chromeProps().queueTypes).toEqual([])
    expect(chromeProps().currentKey).toBe(current)
    expect(queueIds()[0]).toBe('v1')
    expect(queueIds()[1]).toBe('99')
    expect(chromeProps().freshKeys.has('twitter:99')).toBe(true)
  })

  it('Live: tweet-added video while Videos is on keeps the filter and the current post', async () => {
    const video = videoItem('v1')
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([video, videoItem('v2')])}
          mode="personal"
          initialPersonalTab="live"
          personalItems={[videoFeedItem('v1')]}
          onClose={vi.fn()}
        />,
      )
    })
    await tapType('video')

    await act(async () => fireAdded(videoFeedItem('77')))

    expect(chromeProps().queueTypes).toEqual(['video'])
    expect(chromeProps().currentKey).toBe(theaterItemKey(video))
    expect(queueIds()[0]).toBe('v1')
    expect(queueIds()[1]).toBe('77')
  })

  it('Live: tweet-added matching video leaves caught-up and stages the arrival', async () => {
    const videos = [videoItem('v1'), videoItem('v2')]
    window.localStorage.setItem('adhx-theater-types', '["video"]')
    window.localStorage.setItem('adhx-seen-v1', JSON.stringify(videos.map(theaterItemKey)))
    await act(async () => {
      render(
        <TheaterShell
          seed={seed(videos)}
          mode="personal"
          initialPersonalTab="live"
          personalItems={videos.map((it) => videoFeedItem(it.bookmarkId!))}
          onClose={vi.fn()}
        />,
      )
    })
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()

    await act(async () => fireAdded(videoFeedItem('88')))

    expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument()
    expect(chromeProps().currentKey).toBe('twitter:88')
    expect(chromeProps().queueTypes).toEqual(['video'])
  })

  it('Live: tweet-added text while Videos + caught-up resets the filter and plays it', async () => {
    const videos = [videoItem('v1'), videoItem('v2')]
    window.localStorage.setItem('adhx-theater-types', '["video"]')
    window.localStorage.setItem('adhx-seen-v1', JSON.stringify(videos.map(theaterItemKey)))
    await act(async () => {
      render(
        <TheaterShell
          seed={seed(videos)}
          mode="personal"
          initialPersonalTab="live"
          personalItems={videos.map((it) => videoFeedItem(it.bookmarkId!))}
          onClose={vi.fn()}
        />,
      )
    })
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()

    await act(async () => fireAdded(feedItem('55')))

    expect(chromeProps().queueTypes).toEqual([])
    expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument()
    expect(chromeProps().currentKey).toBe('twitter:55')
  })

  it('Saved: tweet-added prepends without leaving the current post', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[feedItem('1'), feedItem('2'), feedItem('3')]}
          onClose={vi.fn()}
        />,
      )
    })
    await act(async () => chromeProps().onNext())
    expect(chromeProps().currentKey).toBe('twitter:2')

    await act(async () => fireAdded(feedItem('99')))

    expect(queueIds()).toEqual(['99', '1', '2', '3'])
    expect(chromeProps().currentKey).toBe('twitter:2')
    expect(chromeProps().repeatMode).toBe('all')
    expect(chromeProps().isSeen('twitter:99')).toBe(false)
    expect(chromeProps().isSeen('twitter:1')).toBe(true)
    expect(chromeProps().freshKeys.has('twitter:99')).toBe(true)
  })

  it('Saved: landing on a prepended add then leaving it marks it watched', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[feedItem('1'), feedItem('2')]}
          onClose={vi.fn()}
        />,
      )
    })
    await act(async () => chromeProps().onNext())
    await act(async () => fireAdded(feedItem('99')))
    expect(chromeProps().isSeen('twitter:99')).toBe(false)

    await act(async () => (chromeProps().onSelect as (key: string) => void)('twitter:99'))
    expect(chromeProps().currentKey).toBe('twitter:99')
    expect(chromeProps().isSeen('twitter:99')).toBe(false)
    expect(chromeProps().freshKeys.has('twitter:99')).toBe(false)

    await act(async () => chromeProps().onNext())
    expect(chromeProps().currentKey).toBe('twitter:1')
    expect(chromeProps().isSeen('twitter:99')).toBe(true)
  })

  it('Saved: tweet-added text while Videos is on resets to All so the row is visible', async () => {
    window.localStorage.setItem('adhx-theater-types', JSON.stringify(['video']))
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[videoFeedItem('1'), videoFeedItem('2')]}
          onClose={vi.fn()}
        />,
      )
    })
    expect(chromeProps().queueTypes).toEqual(['video'])

    await act(async () => fireAdded(feedItem('99')))

    expect(chromeProps().queueTypes).toEqual([])
    expect(queueIds()[0]).toBe('99')
    expect(queueIds()[1]).toBe('1')
    expect(chromeProps().currentKey).toBe('twitter:1')
  })

  it('Saved: Videos with no matching rows + a video add lands on the new save', async () => {
    window.localStorage.setItem('adhx-theater-types', JSON.stringify(['video']))
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[feedItem('1'), feedItem('2')]}
          onClose={vi.fn()}
        />,
      )
    })
    expect(chromeProps().queueTypes).toEqual(['video'])

    await act(async () => fireAdded(videoFeedItem('77')))

    expect(chromeProps().queueTypes).toEqual(['video'])
    expect(queueIds()).toEqual(['77'])
    expect(chromeProps().currentKey).toBe('twitter:77')
  })

  it('Saved: items skipped by Videos are not Watched after the filter resets', async () => {
    window.localStorage.setItem('adhx-theater-types', JSON.stringify(['video']))
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[videoFeedItem('1'), feedItem('t'), videoFeedItem('2')]}
          onClose={vi.fn()}
        />,
      )
    })
    expect(chromeProps().currentKey).toBe('twitter:1')
    await act(async () => chromeProps().onNext())
    expect(chromeProps().currentKey).toBe('twitter:2')
    expect(chromeProps().isSeen('twitter:1')).toBe(true)
    expect(chromeProps().isSeen('twitter:t')).toBe(false)

    await act(async () => fireAdded(feedItem('99')))

    expect(chromeProps().queueTypes).toEqual([])
    expect(chromeProps().currentKey).toBe('twitter:2')
    expect(chromeProps().isSeen('twitter:t')).toBe(false)
    expect(chromeProps().isSeen('twitter:99')).toBe(false)
    expect(chromeProps().freshKeys.has('twitter:99')).toBe(true)
  })

  it('Saved: tweet-added video while Videos is on keeps the filter', async () => {
    window.localStorage.setItem('adhx-theater-types', JSON.stringify(['video']))
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[videoFeedItem('1')]}
          onClose={vi.fn()}
        />,
      )
    })

    await act(async () => fireAdded(videoFeedItem('77')))

    expect(chromeProps().queueTypes).toEqual(['video'])
    expect(queueIds()).toEqual(['77', '1'])
    expect(chromeProps().currentKey).toBe('twitter:1')
  })

  it('Saved Play once: a remote add does not turn repeat back on', async () => {
    window.localStorage.setItem('adhx-theater-repeat-saved', 'off')
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[feedItem('1'), feedItem('2')]}
          onClose={vi.fn()}
        />,
      )
    })
    await waitFor(() => expect(chromeProps().repeatMode).toBe('off'))

    await act(async () => fireAdded(feedItem('99')))

    expect(chromeProps().repeatMode).toBe('off')
    expect(chromeProps().currentKey).toBe('twitter:1')
    expect(queueIds()[0]).toBe('1')
    expect(queueIds()[1]).toBe('99')
    expect(chromeProps().queuePlayed).toBe(0)
    expect(chromeProps().queueToPlay).toBe(3)
    expect(chromeProps().queueLooping).toBe(false)
  })

  it('Saved remount does not start past leftover videos in this run', async () => {
    window.localStorage.setItem('adhx-theater-types', JSON.stringify(['video']))
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          initialPersonalIndex={3}
          personalItems={[
            videoFeedItem('1'),
            videoFeedItem('2'),
            videoFeedItem('3'),
            videoFeedItem('4'),
            videoFeedItem('5'),
          ]}
          onClose={vi.fn()}
        />,
      )
    })
    expect(chromeProps().currentKey).toBe('twitter:1')
    expect(chromeProps().isSeen('twitter:1')).toBe(false)
    expect(chromeProps().isSeen('twitter:2')).toBe(false)
    expect(chromeProps().isSeen('twitter:3')).toBe(false)
  })

  it('Saved ?open= keeps the mid-queue start when prefs hydrate', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          initialPersonalIndex={3}
          preserveSavedStart
          personalItems={[
            videoFeedItem('1'),
            videoFeedItem('2'),
            videoFeedItem('3'),
            videoFeedItem('4'),
            videoFeedItem('5'),
          ]}
          onClose={vi.fn()}
        />,
      )
    })
    await waitFor(() => expect(chromeProps().currentKey).toBe('twitter:4'))
    expect(chromeProps().isSeen('twitter:1')).toBe(false)
  })

  it('Saved Queue type change still snaps to the first leftover match', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          initialPersonalIndex={3}
          preserveSavedStart
          personalItems={[
            videoFeedItem('1'),
            videoFeedItem('2'),
            feedItem('t'),
            videoFeedItem('4'),
            videoFeedItem('5'),
          ]}
          onClose={vi.fn()}
        />,
      )
    })
    await waitFor(() => expect(chromeProps().currentKey).toBe('twitter:4'))
    await tapType('video')
    expect(chromeProps().currentKey).toBe('twitter:1')
    expect(chromeProps().isSeen('twitter:1')).toBe(false)
  })

  it('Live adds then Saved starts on the newest post', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([textItem('1')])}
          mode="personal"
          initialPersonalTab="live"
          initialPersonalIndex={1}
          personalItems={[feedItem('1'), feedItem('2'), feedItem('3')]}
          onClose={vi.fn()}
        />,
      )
    })
    const collection = chromeProps().collection
    if (!collection) throw new Error('collection chrome missing')
    expect(collection.tab).toBe('live')

    await act(async () => fireAdded(feedItem('a')))
    await act(async () => fireAdded(feedItem('b')))
    await act(async () => fireAdded(feedItem('c')))
    await act(async () => fireAdded(feedItem('d')))

    await act(async () => collection.onTabChange('collection'))
    expect(chromeProps().currentKey).toBe('twitter:d')
    expect(queueIds()).toEqual(['d', 'c', 'b', 'a', '1', '2', '3'])
  })

  it('Saved: tweet-added after All Clear plays the new save', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[feedItem('1')]}
          onClose={vi.fn()}
        />,
      )
    })
    await act(async () => chromeProps().collection?.onTabChange?.('collection'))
    const cycle = chromeProps().onCycleRepeat
    if (!cycle) throw new Error('repeat control missing')
    await act(async () => cycle())
    await act(async () => cycle())
    await act(async () => chromeProps().onNext())
    expect(screen.getByText('All caught up')).toBeInTheDocument()

    await act(async () => fireAdded(feedItem('99')))

    expect(screen.queryByText('All caught up')).not.toBeInTheDocument()
    expect(chromeProps().currentKey).toBe('twitter:99')
    expect(queueIds()[0]).toBe('99')
    expect(chromeProps().repeatMode).toBe('off')
    expect(chromeProps().queuePlayed).toBe(0)
    expect(chromeProps().queueToPlay).toBe(1)
  })
})
