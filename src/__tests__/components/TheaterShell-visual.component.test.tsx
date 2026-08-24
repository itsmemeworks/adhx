/**
 * @vitest-environment jsdom
 *
 * Live visual lens: videos and photos only. Saved / playlists never offer
 * the control. The shared-preview lead stays even when it's text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, act, screen } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'

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

function chromeProps() {
  const call = mockMobileChrome.mock.calls.at(-1)
  if (!call) throw new Error('mobile chrome never rendered')
  return call[0]
}

async function toggleVisual() {
  const toggle = chromeProps().onToggleVisual as (() => void) | undefined
  if (!toggle) throw new Error('visual control not offered')
  await act(async () => toggle())
}

const STORAGE_KEY = 'adhx-theater-visual'

describe('TheaterShell: live visual lens', () => {
  beforeEach(() => {
    mockMobileChrome.mockClear()
    window.localStorage.clear()
  })

  it('drops text and articles from the live queue when Visual is on', async () => {
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
    await toggleVisual()
    const items = chromeProps().items as TheaterItem[]
    expect(items.map((it) => it.bookmarkId)).toEqual(['2', '4'])
    expect(chromeProps().visualOnly).toBe(true)
  })

  it('remembers Visual across visits', async () => {
    const { unmount } = render(
      <TheaterShell
        seed={seed([item('1', { contentType: 'text' }), item('2', { contentType: 'video' })])}
      />,
    )
    await toggleVisual()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1')

    unmount()
    mockMobileChrome.mockClear()
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([item('1', { contentType: 'text' }), item('2', { contentType: 'video' })])}
        />,
      )
    })
    const items = chromeProps().items as TheaterItem[]
    expect(items.map((it) => it.bookmarkId)).toEqual(['2'])
    expect(chromeProps().visualOnly).toBe(true)
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
    await toggleVisual()
    const items = chromeProps().items as TheaterItem[]
    expect(items.map((it) => it.bookmarkId)).toEqual(['lead', '2'])
  })

  it('does not offer Visual on a playlist', () => {
    render(
      <TheaterShell
        mode="playlist"
        seed={seed([item('1', { contentType: 'video' })])}
        playlist={{ tag: 'cats', curator: 'alice', count: 1 }}
      />,
    )
    expect(chromeProps().onToggleVisual).toBeUndefined()
  })

  it('does not offer Visual on Saved', () => {
    render(
      <TheaterShell
        mode="personal"
        initialPersonalTab="collection"
        personalItems={[]}
        seed={seed([item('1', { contentType: 'video' })])}
      />,
    )
    expect(chromeProps().onToggleVisual).toBeUndefined()
  })

  it('1 and 2 flip Live ⇄ Saved on the personal theater', async () => {
    const onPersonalTabChange = vi.fn()
    render(
      <TheaterShell
        mode="personal"
        initialPersonalTab="live"
        personalItems={[]}
        seed={seed([item('1', { contentType: 'video' })])}
        onPersonalTabChange={onPersonalTabChange}
      />,
    )
    expect(chromeProps().onToggleVisual).toBeDefined()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }))
    })
    expect(onPersonalTabChange).toHaveBeenCalledWith('collection')
    expect(chromeProps().onToggleVisual).toBeUndefined()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))
    })
    expect(onPersonalTabChange).toHaveBeenCalledWith('live')
    expect(chromeProps().onToggleVisual).toBeDefined()
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
    expect(chromeProps().onToggleVisual).toBeUndefined()
  })

  it('shows the empty overlay when Live has no visuals', async () => {
    render(<TheaterShell seed={seed([item('1', { contentType: 'text' })])} />)
    await toggleVisual()
    expect(screen.getByText('No videos or photos in Live right now')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show every post' })).toBeInTheDocument()
    await act(async () => {
      screen.getByRole('button', { name: 'Show every post' }).click()
    })
    expect(chromeProps().visualOnly).toBe(false)
    expect(screen.queryByText('No videos or photos in Live right now')).not.toBeInTheDocument()
  })

  it('jumps off a text post onto the next visual when the lens turns on', async () => {
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
    await toggleVisual()
    expect(chromeProps().currentKey).toBe(theaterItemKey(item('2', { contentType: 'video' })))
  })
})
