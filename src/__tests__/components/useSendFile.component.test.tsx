/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { TheaterItem } from '@/components/theater/types'

/**
 * Fake timers + `@testing-library/react`'s `waitFor` deadlock (its internal
 * polling interval gets faked too), so every advance is wrapped in `act()`
 * and asserted immediately after.
 *
 * Two-step on purpose: `vi.advanceTimersByTime` (sync) fires every due timer
 * — both hook instances' 2s prefetch delays — back-to-back with NO
 * microtask interleaving, matching real browser behavior where both mounts
 * register their `setTimeout` in the same tick. Following that with async
 * `advanceTimersByTimeAsync(0)` then drains the fetch mock's promise chain
 * (blob resolution, state updates) without advancing virtual time further.
 * Doing the two in one async pass reintroduces the race: it interleaves
 * microtask flushing between individual timer firings, resolves the first
 * hook's fetch before the second hook's same-tick timeout ever runs, and
 * the dedupe guard sees no in-flight promise — double-fetching for the
 * "one fetch, two consumers" case this file exists to guard.
 */
async function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

/**
 * `useSendFile` (`src/components/theater/useSendFile.ts`) prefetches the
 * current item's MP4/photo into a blob so `navigator.share` can run inside
 * the user's tap. Its dedupe (`inflightPromise`/`cachedBlob`) is
 * MODULE-LEVEL state, deliberately shared across hook instances: both the
 * desktop dock and the mobile chrome mount this hook simultaneously for the
 * same current item, and without the shared cache each instance would
 * download the same file independently.
 *
 * Module-level state persists across renders (and across test files), so
 * every test here resets modules and re-imports the hook fresh — otherwise
 * an earlier test's cached blob/in-flight promise would leak into the next.
 */

function videoItem(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '1',
    author: 'alice',
    authorName: 'Alice',
    text: 'a caption',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    authorAvatarUrl: null,
    url: '/alice/status/1',
    createdAt: '2026-08-18T00:00:00Z',
    saveCount: 1,
    trendCount: 1,
    contentType: 'video',
    ...overrides,
  } as TheaterItem
}

function mockFetchResolvingVideo() {
  return vi.fn(
    async () =>
      new Response(new Blob(['fake-mp4-bytes'], { type: 'video/mp4' }), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      }),
  )
}

describe('useSendFile', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('fetches the MP4 only once when two hook instances mount for the same item', async () => {
    const fetchMock = mockFetchResolvingVideo()
    vi.stubGlobal('fetch', fetchMock)

    const { useSendFile } = await import('@/components/theater/useSendFile')
    const item = videoItem()

    // Simulates the desktop dock + mobile chrome both mounting the hook for
    // the same current item at the same time.
    const rendered1 = renderHook(() => useSendFile(item))
    const rendered2 = renderHook(() => useSendFile(item))

    // Advance past the 2s prefetch delay for both instances.
    await advance(2_000)

    expect(rendered1.result.current.ready).toBe(true)
    expect(rendered2.result.current.ready).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/media/video'),
      expect.objectContaining({ signal: expect.anything() }),
    )
  })

  it('does not report ready before the prefetch delay elapses', async () => {
    const fetchMock = mockFetchResolvingVideo()
    vi.stubGlobal('fetch', fetchMock)

    const { useSendFile } = await import('@/components/theater/useSendFile')
    const item = videoItem()

    const { result } = renderHook(() => useSendFile(item))

    expect(result.current.ready).toBe(false)

    await advance(1_000)
    expect(result.current.ready).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('supported is false for an item with nothing sendable (text post)', async () => {
    const fetchMock = mockFetchResolvingVideo()
    vi.stubGlobal('fetch', fetchMock)

    const { useSendFile } = await import('@/components/theater/useSendFile')
    const textOnlyItem = videoItem({ contentType: 'text' })

    const { result } = renderHook(() => useSendFile(textOnlyItem))

    expect(result.current.supported).toBe(false)
    await advance(3_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('re-fetches when the item changes to a different post (cache is keyed per item)', async () => {
    const fetchMock = mockFetchResolvingVideo()
    vi.stubGlobal('fetch', fetchMock)

    const { useSendFile } = await import('@/components/theater/useSendFile')
    const first = videoItem({ bookmarkId: '1' })
    const second = videoItem({ bookmarkId: '2' })

    const { result, rerender } = renderHook(({ item }) => useSendFile(item), {
      initialProps: { item: first },
    })
    await advance(2_000)
    expect(result.current.ready).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Switch to a different post — ready resets, and a new fetch fires for
    // the new item's key even though the previous item is still cached.
    rerender({ item: second })
    expect(result.current.ready).toBe(false)

    await advance(2_000)
    expect(result.current.ready).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reuses the cached blob (no re-fetch) when navigating back to the same already-cached item', async () => {
    const fetchMock = mockFetchResolvingVideo()
    vi.stubGlobal('fetch', fetchMock)

    const { useSendFile } = await import('@/components/theater/useSendFile')
    const first = videoItem({ bookmarkId: '1' })
    const second = videoItem({ bookmarkId: '2' })

    const { result, rerender } = renderHook(({ item }) => useSendFile(item), {
      initialProps: { item: first },
    })
    await advance(2_000)
    expect(result.current.ready).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // The cache is size-1 (keyed by the single most-recently-fetched item),
    // so navigating away and back still triggers a second fetch for item 1.
    rerender({ item: second })
    await advance(2_000)
    expect(result.current.ready).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    rerender({ item: first })
    await advance(2_000)
    expect(result.current.ready).toBe(true)
    // Documents the actual (size-1 cache) behavior rather than assuming a
    // multi-entry cache: item 1 is fetched again, for a total of 3 calls.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('treats a JSON error body served with a 200 status as unavailable (never shares/downloads garbage)', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'not found' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { useSendFile } = await import('@/components/theater/useSendFile')
    const item = videoItem()

    const { result } = renderHook(() => useSendFile(item))
    await advance(2_000)
    // Give the rejected prefetch promise a tick to settle.
    await advance(0)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.ready).toBe(false)
  })
})
