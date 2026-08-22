/**
 * @vitest-environment jsdom
 *
 * Address-bar rewrite (theater-first.md §7): signed-in Live must keep the
 * path in lockstep with the staged post, same as signed-out `/`. My Collection
 * must not — `/collection` is the stable address.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, act } from '@testing-library/react'
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
vi.mock('@/components/theater/TheaterMobileChrome', () => ({
  TheaterMobileChrome: () => null,
}))
vi.mock('@/components/auth', () => ({
  SignInModal: () => null,
  useAuthMe: () => ({
    me: { authenticated: true, user: { username: 'owner' } },
    loading: false,
    refresh: vi.fn(),
  }),
}))
vi.mock('@/components/tags', () => ({ TagQuickPicker: () => null }))
vi.mock('@/components/theater/useTheaterFeed', () => ({
  useTheaterFeed: (seed: TheaterFeedSeed) => {
    const [items] = useState(seed.items)
    return { items, savedToday: 0, recentActivity: 0, freshKeys: new Set<string>() }
  },
}))

function textItem(bookmarkId: string): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId,
    author: `author${bookmarkId}`,
    url: `/author${bookmarkId}/status/${bookmarkId}`,
    createdAt: '2026-08-18T00:00:00Z',
    contentType: 'text',
    text: `post ${bookmarkId}`,
    trendCount: 0,
  } as TheaterItem
}

function feedItem(id: string): FeedItem {
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
  } as unknown as FeedItem
}

const seed = (items: TheaterItem[]): TheaterFeedSeed => ({
  items,
  savedToday: 0,
  recentActivity: 0,
})

describe('TheaterShell URL sync', () => {
  let replaceSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    window.localStorage.clear()
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })) as never
    replaceSpy = vi.spyOn(window.history, 'replaceState')
  })

  afterEach(() => {
    replaceSpy.mockRestore()
  })

  it('rewrites the address bar on the signed-in Live tab', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([textItem('99')])}
          mode="personal"
          initialPersonalTab="live"
          authed
          personalItems={[]}
        />,
      )
    })
    expect(replaceSpy).toHaveBeenCalledWith(null, '', '/author99/status/99')
  })

  it('does not rewrite on My Collection', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          authed
          personalItems={[feedItem('99')]}
        />,
      )
    })
    const paths = replaceSpy.mock.calls.map((c: unknown[]) => c[2])
    expect(paths).not.toContain('/author99/status/99')
  })
})
