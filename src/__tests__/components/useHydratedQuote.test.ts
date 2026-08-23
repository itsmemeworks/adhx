/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useHydratedQuote } from '@/components/theater/useHydratedQuote'
import { fetchShareTweet, resetShareTweetCache } from '@/lib/theater/share-tweet'
import type { TheaterItem } from '@/components/theater/types'

vi.mock('@/lib/theater/share-tweet', async () => {
  const actual = await vi.importActual<typeof import('@/lib/theater/share-tweet')>(
    '@/lib/theater/share-tweet',
  )
  return {
    ...actual,
    fetchShareTweet: vi.fn(),
  }
})

const fetchShareTweetMock = vi.mocked(fetchShareTweet)

function videoItem(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '1',
    author: 'alice',
    url: '/alice/status/1',
    text: 'parent',
    contentType: 'video',
    thumbnailUrl: 'https://example.com/poster.jpg',
    createdAt: '2026-08-23T00:00:00Z',
    ...overrides,
  } as TheaterItem
}

describe('useHydratedQuote', () => {
  beforeEach(() => {
    resetShareTweetCache()
    fetchShareTweetMock.mockReset()
  })

  afterEach(() => {
    resetShareTweetCache()
  })

  it('merges the share-API quote onto a seed that only had a stub', async () => {
    fetchShareTweetMock.mockResolvedValue({
      text: 'parent full',
      media: { videos: [{ thumbnailUrl: 'https://example.com/v.jpg' }] },
      quoteTweet: {
        id: '99',
        text: 'quoted full',
        author: { username: 'bob', name: 'Bob' },
        media: { photos: [{ url: 'https://pbs.twimg.com/one.jpg' }] },
      },
    })

    const { result } = renderHook(() =>
      useHydratedQuote(videoItem({ quote: { author: 'bob', text: 'stub' } })),
    )

    await waitFor(() => {
      expect(result.current.quote?.text).toBe('quoted full')
    })
    expect(result.current.quote?.bookmarkId).toBe('99')
    expect(result.current.quote?.photoUrls).toEqual([
      '/api/media/image?author=bob&tweetId=99&index=1',
    ])
    expect(result.current.parentVideo?.bookmarkId).toBe('1')
  })

  it('does not apply a late response after unmount', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof fetchShareTweet>>) => void
    fetchShareTweetMock.mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )

    const { result, unmount } = renderHook(() => useHydratedQuote(videoItem()))
    unmount()
    resolve({
      quoteTweet: { id: '99', text: 'too late', author: { username: 'bob' } },
    })
    await Promise.resolve()
    expect(result.current.quote).toBeUndefined()
  })
})
