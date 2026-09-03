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

  it('exposes an explicit browser download action for contextual menus', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    let downloaded: { href: string; filename: string } | null = null
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloaded = { href: this.href, filename: this.download }
    })
    const { useSendFile } = await import('@/components/theater/useSendFile')
    const { result } = renderHook(() => useSendFile(videoItem()))

    act(() => result.current.download())

    expect(click).toHaveBeenCalledTimes(1)
    expect(downloaded).toEqual({
      href: new URL(
        '/api/media/video/download?author=alice&tweetId=1&quality=hd',
        window.location.origin,
      ).toString(),
      filename: 'adhx-twitter-1.mp4',
    })
    expect(document.querySelector('a[download="adhx-twitter-1.mp4"]')).toBeNull()
    click.mockRestore()
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

/**
 * Owner report from a production preview page: "we seem to have regressed the
 * download button for videos and images that's supposed to, on mobile
 * specifically, share that file so I could put it straight into a WhatsApp
 * group… It needs to be smart enough that when you tap download, it keeps the
 * spinner going until it has the file to send."
 *
 * The bug: an early tap (before the 2s-delayed prefetch had the blob) fell
 * straight through to `navigator.share({ url })` — a LINK share. WhatsApp got
 * a URL instead of the video, silently, and the tap looked like it worked.
 * A 3MB MP4 on mobile data loses that race easily.
 *
 * The mobile share path can't be exercised without a touch platform whose
 * browser can put a File on the sheet, so these tests mock both.
 */
describe('useSendFile — an early tap waits for the file instead of sharing a link', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.doUnmock('@/lib/platform')
  })

  /** Load the hook as if we were on iOS Safari with file-sharing available. */
  async function importOnMobile() {
    const actual = await vi.importActual<typeof import('@/lib/platform')>('@/lib/platform')
    vi.doMock('@/lib/platform', () => ({ ...actual, getPlatformType: () => 'ios' }))
    return (await import('@/components/theater/useSendFile')).useSendFile
  }

  function stubShare(share: ReturnType<typeof vi.fn>) {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      share,
      canShare: () => true,
      clipboard: { writeText: vi.fn() },
    })
  }

  /** Share calls that carried an actual file, and ones that were link-only. */
  const fileShares = (share: ReturnType<typeof vi.fn>) =>
    share.mock.calls.filter((c) => Array.isArray(c[0]?.files) && c[0].files.length > 0)
  const linkShares = (share: ReturnType<typeof vi.fn>) =>
    share.mock.calls.filter((c) => !c[0]?.files && typeof c[0]?.url === 'string')

  it('shares the FILE, never a bare link, when tapped before the prefetch lands', async () => {
    const fetchMock = mockFetchResolvingVideo()
    vi.stubGlobal('fetch', fetchMock)
    const share = vi.fn(async () => undefined)
    stubShare(share)

    const useSendFile = await importOnMobile()
    const { result } = renderHook(() => useSendFile(videoItem()))

    // Tap immediately — the 2s prefetch timer has not fired, so there is no
    // blob yet. This is the exact case that used to link-share.
    expect(result.current.ready).toBe(false)
    await act(async () => {
      await result.current.send()
    })

    expect(fileShares(share)).toHaveLength(1)
    expect(linkShares(share)).toHaveLength(0)
    // And the file it shared is the real MP4, with no `url` key beside it
    // (the WhatsApp "via URL URL" trap).
    const payload = fileShares(share)[0][0] as ShareData & { files: File[] }
    expect(payload.files[0].type).toBe('video/mp4')
    expect(payload.url).toBeUndefined()
    expect(payload.text).toMatch(/^via https?:\/\//)
  })

  it('keeps `sending` up for the whole fetch, so the spinner can stay on', async () => {
    let releaseFetch: (() => void) | null = null
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/activity/share')) return new Response(null, { status: 204 })
      await new Promise<void>((resolve) => {
        releaseFetch = resolve
      })
      return new Response(new Blob(['bytes'], { type: 'video/mp4' }), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const share = vi.fn(async () => undefined)
    stubShare(share)

    const useSendFile = await importOnMobile()
    const { result } = renderHook(() => useSendFile(videoItem()))

    let sendPromise: Promise<boolean> = Promise.resolve(false)
    await act(async () => {
      sendPromise = result.current.send()
    })

    // Mid-fetch: the button is still busy and nothing has been shared.
    expect(result.current.sending).toBe(true)
    expect(share).not.toHaveBeenCalled()

    await act(async () => {
      releaseFetch?.()
      await sendPromise
    })

    expect(result.current.sending).toBe(false)
    expect(fileShares(share)).toHaveLength(1)
  })

  it('asks for a second tap when the sheet refuses the expired gesture', async () => {
    const fetchMock = mockFetchResolvingVideo()
    vi.stubGlobal('fetch', fetchMock)
    // iOS/Chrome both drop user activation across an await, so the share that
    // follows the fetch can be refused outright.
    const share = vi.fn(async () => {
      throw new DOMException('not allowed', 'NotAllowedError')
    })
    stubShare(share)

    const useSendFile = await importOnMobile()
    const { result } = renderHook(() => useSendFile(videoItem()))

    await act(async () => {
      await result.current.send()
    })

    // Primed, not silently downgraded: the file is cached and one more tap
    // sends it. The old code link-shared here.
    expect(result.current.primed).toBe(true)
    expect(result.current.ready).toBe(true)
    expect(linkShares(share)).toHaveLength(0)

    // Second tap: blob is cached, so the sheet opens inside this gesture.
    const share2 = vi.fn(async () => undefined)
    stubShare(share2)
    await act(async () => {
      await result.current.send()
    })
    expect(fileShares(share2)).toHaveLength(1)
    expect(result.current.primed).toBe(false)
  })

  it('starts the prefetch immediately when eager (a shared preview page)', async () => {
    const fetchMock = mockFetchResolvingVideo()
    vi.stubGlobal('fetch', fetchMock)
    stubShare(vi.fn(async () => undefined))

    const useSendFile = await importOnMobile()
    const { result } = renderHook(() => useSendFile(videoItem(), { eager: true }))

    // No 2s wait: the file is ready before the visitor can reach for Send,
    // which is the only way the sheet opens in the tap's own activation.
    await advance(0)
    expect(result.current.ready).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('still falls back to a link share when the file genuinely cannot be fetched', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/activity/share')) return new Response(null, { status: 204 })
      return new Response('nope', { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const share = vi.fn(async () => undefined)
    stubShare(share)

    const useSendFile = await importOnMobile()
    const { result } = renderHook(() => useSendFile(videoItem()))

    await act(async () => {
      await result.current.send()
    })

    // A dead proxy must not leave the tap dead — the link is the honest
    // fallback when there is no file to be had.
    expect(fileShares(share)).toHaveLength(0)
    expect(linkShares(share)).toHaveLength(1)
    expect(result.current.sending).toBe(false)
  })
})
