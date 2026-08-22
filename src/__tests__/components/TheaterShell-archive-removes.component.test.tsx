/**
 * @vitest-environment jsdom
 *
 * Owner: "when I click Archive on a post from my collection view of the theater
 * it should just remove it from the list, but it's not — it's moving to the
 * next item but it should completely remove it from the playlist and update the
 * playlist."
 *
 * The queue was a fixed snapshot and only the INDEX moved, so a resolved post
 * stayed in the list behind the cursor and the count never dropped. Archive and
 * Delete both resolve a post's fate and now splice it out; Later deliberately
 * does not, because "show me this again" means keep it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, act, screen, fireEvent } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import type { FeedItem } from '@/components/feed/types'

vi.mock('@/components/theater/Stage', () => ({ Stage: () => <div data-testid="stage" /> }))
vi.mock('@/components/theater/CollectionStage', () => ({
  CollectionStage: () => <div data-testid="collection-stage" />,
  useInstagramStage: () => ({ status: 'idle', slow: false, src: null, poster: null }),
}))
vi.mock('@/components/theater/TheaterDesktopChrome', () => ({
  DesktopStageChrome: () => null,
  DesktopDock: () => null,
}))
vi.mock('@/components/auth', () => ({
  SignInModal: () => null,
  useAuthMe: () => ({ me: null, loading: false, refresh: vi.fn() }),
}))
vi.mock('@/components/tags', () => ({ TagQuickPicker: () => null }))
vi.mock('@/components/theater/useTheaterFeed', () => ({
  useTheaterFeed: (seed: TheaterFeedSeed) => {
    const [items] = useState(seed.items)
    return { items, savedToday: 0, recentActivity: 0, freshKeys: new Set<string>() }
  },
}))

/** The mobile chrome is a capturing stub: the queue it renders IS the assertion. */
const mockMobileChrome = vi.fn((_props: Record<string, unknown>) => null)
vi.mock('@/components/theater/TheaterMobileChrome', () => ({
  TheaterMobileChrome: (props: Record<string, unknown>) => {
    mockMobileChrome(props)
    return null
  },
}))

function feedItem(id: string): FeedItem {
  return {
    id,
    platform: 'twitter',
    author: 'alice',
    authorName: 'Alice',
    text: `post ${id}`,
    tweetUrl: `https://x.com/alice/status/${id}`,
    createdAt: '2026-08-18T00:00:00Z',
    processedAt: '2026-08-18T00:00:00Z',
    isArchived: false,
    tags: [],
    media: [],
    links: [],
  } as unknown as FeedItem
}

const emptySeed: TheaterFeedSeed = { items: [] as TheaterItem[], savedToday: 0, recentActivity: 0 }

/** Latest collection props handed to the chrome. */
function collectionProps() {
  const call = mockMobileChrome.mock.calls.at(-1)
  if (!call) throw new Error('chrome never rendered')
  return call[0]
}

/**
 * The queue as the chrome sees it, plus which item is current. The chrome is
 * handed THEATER items (converted from the feed rows), so the id lives on
 * `bookmarkId`.
 */
function queueState() {
  const props = collectionProps()
  const items = (props.items ?? []) as { bookmarkId?: string | null; id?: string }[]
  return {
    ids: items.map((i) => i.bookmarkId ?? i.id),
    currentKey: props.currentKey as string | null,
  }
}

function renderCollection(ids: string[]) {
  return render(
    <TheaterShell
      seed={emptySeed}
      mode="personal"
      initialPersonalTab="collection"
      personalItems={ids.map(feedItem)}
      onClose={vi.fn()}
    />,
  )
}

async function act_(fn: () => void) {
  await act(async () => fn())
}

describe('TheaterShell: Archive removes the post from the collection queue', () => {
  beforeEach(() => {
    mockMobileChrome.mockClear()
    window.localStorage.clear()
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never
  })

  it('drops the archived post out of the list instead of leaving it behind the cursor', async () => {
    await act_(() => {
      renderCollection(['1', '2', '3'])
    })
    expect(queueState().ids).toEqual(['1', '2', '3'])

    const onDone = collectionProps().collection as { onDone: () => void }
    await act_(() => onDone.onDone())

    // Gone from the list — and the count the viewer sees drops with it.
    expect(queueState().ids).toEqual(['2', '3'])
  })

  it('lands on the NEXT post, not two ahead', async () => {
    await act_(() => {
      renderCollection(['1', '2', '3'])
    })
    const onDone = collectionProps().collection as { onDone: () => void }
    await act_(() => onDone.onDone())

    // Removing index 0 shifts '2' into index 0, so staying put IS advancing —
    // double-advancing here would silently skip a post.
    expect(queueState().ids[0]).toBe('2')
    expect(queueState().currentKey).toBe('twitter:2')
  })

  it('empties the queue when the last post is archived', async () => {
    await act_(() => {
      renderCollection(['only'])
    })
    const onDone = collectionProps().collection as { onDone: () => void }
    await act_(() => onDone.onDone())
    expect(queueState().ids).toEqual([])
  })

  it('puts the post back, in its old position, on undo', async () => {
    await act_(() => {
      renderCollection(['1', '2', '3'])
    })
    const t = collectionProps().collection as { onDone: () => void }
    await act_(() => t.onDone())
    expect(queueState().ids).toEqual(['2', '3'])

    // Undo is a button the shell renders itself (the action toast), not a
    // chrome prop — click the real thing.
    const undoBtn = screen.getByRole('button', { name: /undo/i })
    await act_(() => fireEvent.click(undoBtn))

    // Restoring read state server-side while leaving the post missing from the
    // list would be a half-undo.
    expect(queueState().ids).toEqual(['1', '2', '3'])
    expect(queueState().currentKey).toBe('twitter:1')
  })

  it('notifies Header + library counts when a post is archived', async () => {
    const stats = vi.fn()
    const feed = vi.fn()
    window.addEventListener('stats-updated', stats)
    window.addEventListener('tweet-added', feed)
    try {
      await act_(() => {
        renderCollection(['1', '2'])
      })
      const onDone = collectionProps().collection as { onDone: () => void }
      await act_(() => onDone.onDone())
      expect(stats).toHaveBeenCalled()
      expect(feed).toHaveBeenCalled()
    } finally {
      window.removeEventListener('stats-updated', stats)
      window.removeEventListener('tweet-added', feed)
    }
  })

  it('skip (next) keeps the post and does not notify', async () => {
    const stats = vi.fn()
    window.addEventListener('stats-updated', stats)
    try {
      await act_(() => {
        renderCollection(['1', '2', '3'])
      })
      const onNext = collectionProps().onNext as () => void
      await act_(() => onNext())
      expect(stats).not.toHaveBeenCalled()
      expect(queueState().ids).toEqual(['1', '2', '3'])
      expect(queueState().currentKey).toBe('twitter:2')
    } finally {
      window.removeEventListener('stats-updated', stats)
    }
  })
})
