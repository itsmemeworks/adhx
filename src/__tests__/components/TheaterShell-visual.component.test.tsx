/**
 * @vitest-environment jsdom
 *
 * Live / Saved queue type multi-select. Playlists never offer the control.
 * The shared-preview lead stays even when its type is filtered out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, act, screen } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import type { ContentType } from '@/components/matter'
import type { FeedItem } from '@/components/feed/types'

vi.mock('@/components/theater/Stage', () => ({
  Stage: () => <div data-testid="stage" />,
}))

const mockMobileChrome = vi.fn((_props: Record<string, unknown>) => null)
vi.mock('@/components/theater/TheaterMobileChrome', () => ({
  TheaterMobileChrome: (props: Record<string, unknown>) => {
    mockMobileChrome(props)
    return null
  },
}))

vi.mock('@/components/theater/TheaterDesktopChrome', () => ({
  DesktopStageChrome: () => null,
  DesktopDock: () => null,
}))

vi.mock('@/components/auth', () => ({
  SignInModal: () => null,
  useAuthMe: () => ({ me: null, loading: false, refresh: vi.fn() }),
}))

vi.mock('@/components/tags', () => ({
  TagQuickPicker: () => null,
}))

vi.mock('@/components/theater/useTheaterFeed', () => ({
  useTheaterFeed: (seed: TheaterFeedSeed) => {
    const [items] = useState(seed.items)
    return {
      items,
      savedToday: seed.savedToday,
      recentActivity: seed.recentActivity,
      freshKeys: new Set<string>(),
    }
  },
}))

function item(bookmarkId: string, extra: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId,
    author: `author${bookmarkId}`,
    url: `/author${bookmarkId}/status/${bookmarkId}`,
    createdAt: '2026-08-18T00:00:00Z',
    addedAt: '2026-08-18T00:00:00Z',
    text: `post ${bookmarkId}`,
    trendCount: 0,
    ...extra,
  } as TheaterItem
}

function seed(items: TheaterItem[]): TheaterFeedSeed {
  return { items, savedToday: 0, recentActivity: 0 }
}

function savedPost(id: string, extra: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    platform: 'twitter',
    author: `author${id}`,
    authorName: `Author ${id}`,
    text: `post ${id}`,
    tweetUrl: `https://x.com/author${id}/status/${id}`,
    createdAt: '2026-08-18T00:00:00Z',
    processedAt: '2026-08-18T00:00:00Z',
    isArchived: false,
    tags: [],
    media: [],
    links: [],
    ...extra,
  } as FeedItem
}

function savedVideo(id: string): FeedItem {
  return savedPost(id, {
    media: [{ id: `m${id}`, mediaType: 'video', url: 'x', thumbnailUrl: 'x', shareUrl: 'x' }],
  })
}

function chromeProps() {
  const call = mockMobileChrome.mock.calls.at(-1)
  if (!call) throw new Error('mobile chrome never rendered')
  return call[0]
}

async function tapType(type: ContentType) {
  const toggle = chromeProps().onToggleQueueType as ((t: ContentType) => void) | undefined
  if (!toggle) throw new Error('queue filter not offered')
  await act(async () => toggle(type))
}

const STORAGE_KEY = 'adhx-theater-types'

describe('TheaterShell: live queue type filter', () => {
  beforeEach(() => {
    mockMobileChrome.mockClear()
    window.localStorage.clear()
  })

  it('lets the viewer pick videos and photos independently', async () => {
    render(
      <TheaterShell
        seed={seed([
          item('1', { contentType: 'text' }),
          item('2', { contentType: 'video' }),
          item('3', { contentType: 'article' }),
          item('4', { contentType: 'photo' }),
        ])}
      />,
    )
    await tapType('video')
    expect((chromeProps().items as TheaterItem[]).map((it) => it.bookmarkId)).toEqual(['2'])
    await tapType('photo')
    expect((chromeProps().items as TheaterItem[]).map((it) => it.bookmarkId)).toEqual(['2', '4'])
    expect(chromeProps().queueTypes).toEqual(['video', 'photo'])
  })

  it('filters to articles only', async () => {
    render(
      <TheaterShell
        seed={seed([
          item('1', { contentType: 'text' }),
          item('2', { contentType: 'video' }),
          item('3', { contentType: 'article' }),
        ])}
      />,
    )
    await tapType('article')
    expect((chromeProps().items as TheaterItem[]).map((it) => it.bookmarkId)).toEqual(['3'])
  })

  it('remembers the selection across visits', async () => {
    const { unmount } = render(
      <TheaterShell
        seed={seed([item('1', { contentType: 'text' }), item('2', { contentType: 'video' })])}
      />,
    )
    await tapType('video')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('["video"]')

    unmount()
    mockMobileChrome.mockClear()
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([item('1', { contentType: 'text' }), item('2', { contentType: 'video' })])}
        />,
      )
    })
    expect((chromeProps().items as TheaterItem[]).map((it) => it.bookmarkId)).toEqual(['2'])
    expect(chromeProps().queueTypes).toEqual(['video'])
  })

  it('migrates the old visual-only flag to videos and photos', async () => {
    window.localStorage.setItem('adhx-theater-visual', '1')
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([
            item('1', { contentType: 'text' }),
            item('2', { contentType: 'video' }),
            item('3', { contentType: 'photo' }),
          ])}
        />,
      )
    })
    expect((chromeProps().items as TheaterItem[]).map((it) => it.bookmarkId)).toEqual(['2', '3'])
    expect(chromeProps().queueTypes).toEqual(['video', 'photo'])
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('["video","photo"]')
    expect(window.localStorage.getItem('adhx-theater-visual')).toBeNull()
  })

  it('keeps a text shared lead and filters the rest', async () => {
    const lead = item('lead', { contentType: 'text' })
    render(
      <TheaterShell
        mode="shared"
        sharedItem={lead}
        seed={seed([lead, item('2', { contentType: 'video' }), item('3', { contentType: 'text' })])}
      />,
    )
    await tapType('video')
    expect((chromeProps().items as TheaterItem[]).map((it) => it.bookmarkId)).toEqual(['lead', '2'])
  })

  it('does not offer the type filter on a playlist', () => {
    render(
      <TheaterShell
        mode="playlist"
        seed={seed([item('1', { contentType: 'video' })])}
        playlist={{ tag: 'cats', curator: 'alice', count: 1 }}
      />,
    )
    expect(chromeProps().onToggleQueueType).toBeUndefined()
  })

  it('offers the type filter on Saved and filters the personal queue', async () => {
    render(
      <TheaterShell
        mode="personal"
        initialPersonalTab="collection"
        personalItems={[savedPost('1'), savedVideo('2'), savedPost('3')]}
        seed={seed([item('1', { contentType: 'video' })])}
      />,
    )
    expect(chromeProps().onToggleQueueType).toBeDefined()
    expect((chromeProps().items as TheaterItem[]).map((it) => it.bookmarkId)).toEqual([
      '1',
      '2',
      '3',
    ])
    await tapType('video')
    expect((chromeProps().items as TheaterItem[]).map((it) => it.bookmarkId)).toEqual(['2'])
    expect(chromeProps().currentKey).toBe('twitter:2')
  })

  it('1 and 2 flip Live ⇄ Saved on the personal theater', async () => {
    const onPersonalTabChange = vi.fn()
    render(
      <TheaterShell
        mode="personal"
        initialPersonalTab="live"
        personalItems={[savedVideo('1')]}
        seed={seed([item('1', { contentType: 'video' })])}
        onPersonalTabChange={onPersonalTabChange}
      />,
    )
    expect(chromeProps().onToggleQueueType).toBeDefined()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }))
    })
    expect(onPersonalTabChange).toHaveBeenCalledWith('collection')
    expect(chromeProps().onToggleQueueType).toBeDefined()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))
    })
    expect(onPersonalTabChange).toHaveBeenCalledWith('live')
    expect(chromeProps().onToggleQueueType).toBeDefined()
  })

  it('1 and 2 no-op on a playlist', async () => {
    render(
      <TheaterShell
        mode="playlist"
        seed={seed([item('1', { contentType: 'video' })])}
        playlist={{ tag: 'cats', curator: 'alice', count: 1 }}
      />,
    )
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }))
    })
    expect(chromeProps().onToggleQueueType).toBeUndefined()
  })

  it('shows the empty overlay when Live has none of the selected types', async () => {
    render(<TheaterShell seed={seed([item('1', { contentType: 'text' })])} />)
    await tapType('video')
    expect(screen.getByText('No videos in Live right now')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show every post' })).toBeInTheDocument()
    await act(async () => {
      screen.getByRole('button', { name: 'Show every post' }).click()
    })
    expect(chromeProps().queueTypes).toEqual([])
    expect(screen.queryByText('No videos in Live right now')).not.toBeInTheDocument()
  })

  it('shows the empty overlay when Saved has none of the selected types', async () => {
    render(
      <TheaterShell
        mode="personal"
        initialPersonalTab="collection"
        personalItems={[savedPost('1')]}
        seed={seed([])}
      />,
    )
    await tapType('video')
    expect(screen.getByText('No videos in Saved right now')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show every post' })).toBeInTheDocument()
  })

  it('jumps off a text post onto the next matching type', async () => {
    render(
      <TheaterShell
        seed={seed([
          item('1', { contentType: 'text' }),
          item('2', { contentType: 'video' }),
          item('3', { contentType: 'photo' }),
        ])}
      />,
    )
    expect(chromeProps().currentKey).toBe(theaterItemKey(item('1', { contentType: 'text' })))
    await tapType('video')
    expect(chromeProps().currentKey).toBe(theaterItemKey(item('2', { contentType: 'video' })))
  })
})
