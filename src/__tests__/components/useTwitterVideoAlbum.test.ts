/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useTwitterVideoAlbum } from '@/components/theater/useTwitterVideoAlbum'
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
    text: 'clip',
    contentType: 'video',
    thumbnailUrl: 'https://example.com/poster.jpg',
    createdAt: '2026-08-23T00:00:00Z',
    ...overrides,
  } as TheaterItem
}

describe('useTwitterVideoAlbum', () => {
  beforeEach(() => {
    resetShareTweetCache()
    fetchShareTweetMock.mockReset()
  })

  afterEach(() => {
    resetShareTweetCache()
  })

  it('does not fetch when the item already has a video album', () => {
    const { result } = renderHook(() => useTwitterVideoAlbum(videoItem({ videoCount: 2 })))
    expect(fetchShareTweetMock).not.toHaveBeenCalled()
    expect(result.current.count).toBe(2)
  })

  it('hydrates a pulse row from the share API', async () => {
    fetchShareTweetMock.mockResolvedValue({
      media: {
        videos: [
          { thumbnailUrl: 'https://example.com/a.jpg' },
          { thumbnailUrl: 'https://example.com/b.jpg' },
        ],
      },
    })
    const { result } = renderHook(() => useTwitterVideoAlbum(videoItem({ videoCount: 1 })))
    await waitFor(() => expect(result.current.count).toBe(2))
    expect(result.current.posters).toEqual([
      'https://example.com/a.jpg',
      'https://example.com/b.jpg',
    ])
  })

  it('resets the index when the post changes', () => {
    const { result, rerender } = renderHook(({ item }) => useTwitterVideoAlbum(item), {
      initialProps: { item: videoItem({ bookmarkId: '1', videoCount: 2 }) },
    })
    act(() => result.current.setIndex(1))
    expect(result.current.index).toBe(1)
    rerender({ item: videoItem({ bookmarkId: '2', videoCount: 2 }) })
    expect(result.current.index).toBe(0)
  })

  it('does not apply a late response after unmount', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof fetchShareTweet>>) => void
    fetchShareTweetMock.mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    const { result, unmount } = renderHook(() => useTwitterVideoAlbum(videoItem({ videoCount: 1 })))
    unmount()
    resolve({
      media: {
        videos: [
          { thumbnailUrl: 'https://example.com/a.jpg' },
          { thumbnailUrl: 'https://example.com/b.jpg' },
        ],
      },
    })
    await Promise.resolve()
    expect(result.current.count).toBe(1)
  })
})
