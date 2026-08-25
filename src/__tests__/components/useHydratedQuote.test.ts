/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { seedParentPhotos, useHydratedQuote } from '@/components/theater/useHydratedQuote'
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

  it('does not treat an off-site OG thumbnail as a tweet photo', () => {
    fetchShareTweetMock.mockResolvedValue({ text: '👀' })
    const { result } = renderHook(() =>
      useHydratedQuote(
        videoItem({
          contentType: 'article',
          text: '👀\n\nhttps://deanpiper.substack.com/p/hayden',
          thumbnailUrl: 'https://substackcdn.com/image.jpg',
          linkPreview: {
            url: 'https://deanpiper.substack.com/p/hayden',
            title: 'Hayden Panettiere and James Blunt – An Internet Lynching',
            imageUrl: 'https://substackcdn.com/image.jpg',
            domain: 'deanpiper.substack.com',
          },
        }),
      ),
    )
    expect(result.current.parentPhotos).toEqual([])
    expect(result.current.parentVideo).toBeNull()
  })

  it('still seeds native tweet photos when the post is a photo', () => {
    fetchShareTweetMock.mockResolvedValue({ text: 'snap' })
    const { result } = renderHook(() =>
      useHydratedQuote(
        videoItem({
          contentType: 'photo',
          thumbnailUrl: 'https://pbs.twimg.com/media/one.jpg',
        }),
      ),
    )
    expect(result.current.parentPhotos).toEqual(['/api/media/image?author=alice&tweetId=1&index=1'])
  })

  it('re-seeds the album when photoCount arrives on the same post', () => {
    fetchShareTweetMock.mockResolvedValue({ text: 'full' })
    const stub = videoItem({
      contentType: 'photo',
      thumbnailUrl: 'https://pbs.twimg.com/media/one.jpg',
    })
    const { result, rerender } = renderHook(({ item }) => useHydratedQuote(item), {
      initialProps: { item: stub },
    })
    expect(result.current.parentPhotos).toEqual(['/api/media/image?author=alice&tweetId=1&index=1'])
    rerender({ item: { ...stub, photoCount: 3 } })
    expect(result.current.parentPhotos).toEqual([
      '/api/media/image?author=alice&tweetId=1&index=1',
      '/api/media/image?author=alice&tweetId=1&index=2',
      '/api/media/image?author=alice&tweetId=1&index=3',
    ])
  })

  it('keeps photoCount stills when the share payload has no photos', async () => {
    fetchShareTweetMock.mockResolvedValue({ text: 'full', media: { photos: [] } })
    const { result } = renderHook(() =>
      useHydratedQuote(
        videoItem({
          contentType: 'photo',
          thumbnailUrl: 'https://pbs.twimg.com/media/one.jpg',
          photoCount: 3,
        }),
      ),
    )
    await waitFor(() => expect(fetchShareTweetMock).toHaveBeenCalled())
    expect(result.current.parentPhotos).toHaveLength(3)
  })
})

describe('seedParentPhotos', () => {
  it('skips the OG image on a link-card tweet', () => {
    expect(
      seedParentPhotos(
        videoItem({
          contentType: 'article',
          thumbnailUrl: 'https://substackcdn.com/image.jpg',
          linkPreview: {
            url: 'https://deanpiper.substack.com/p/hayden',
            imageUrl: 'https://substackcdn.com/image.jpg',
          },
        }),
      ),
    ).toEqual([])
  })

  it('keeps native photos when the tweet is a photo that also has a card', () => {
    expect(
      seedParentPhotos(
        videoItem({
          contentType: 'photo',
          thumbnailUrl: 'https://pbs.twimg.com/media/one.jpg',
          linkPreview: {
            url: 'https://example.com/story',
            title: 'Story',
          },
        }),
      ),
    ).toEqual(['/api/media/image?author=alice&tweetId=1&index=1'])
  })

  it('seeds every still on a photo album without waiting on the share API', () => {
    expect(
      seedParentPhotos(
        videoItem({
          contentType: 'photo',
          thumbnailUrl: 'https://pbs.twimg.com/media/one.jpg',
          photoCount: 3,
        }),
      ),
    ).toEqual([
      '/api/media/image?author=alice&tweetId=1&index=1',
      '/api/media/image?author=alice&tweetId=1&index=2',
      '/api/media/image?author=alice&tweetId=1&index=3',
    ])
  })

  it('seeds stills on a video tweet that also carries photos', () => {
    expect(
      seedParentPhotos(
        videoItem({
          contentType: 'video',
          thumbnailUrl: 'https://example.com/poster.jpg',
          photoCount: 2,
        }),
      ),
    ).toEqual([
      '/api/media/image?author=alice&tweetId=1&index=1',
      '/api/media/image?author=alice&tweetId=1&index=2',
    ])
  })
})
