/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { Stage } from '@/components/theater/Stage'
import { probeInstagramVideo } from '@/lib/media/instagram-playback'
import type { TheaterItem } from '@/components/theater/types'

/**
 * The live-theater playlist must never dead-end on an Instagram Reel: the
 * mirror probe can take a long time (up to ~70s across its own retry
 * budget), and a persistent miss lands on Instagram's official embed, which
 * is a bare iframe that never fires `ended`. These tests cover the two
 * auto-advance guards that keep the queue moving in that situation (spec:
 * see StageInstagram.tsx comments) — they're no-ops outside auto-advance
 * contexts (no `onEnded`, or `repeat` pinning a shared post).
 *
 * The probe + guards live in `useInstagramStage` (StageInstagram.tsx), a hook
 * `Stage` calls directly so a confirmed reel plays through Stage's own shared
 * `<video>` slot rather than one owned by `StageInstagram` — see that file's
 * doc comment. These tests exercise the guards through `Stage`, the same way
 * a real Instagram item in the theater reaches them.
 */

vi.mock('@/lib/media/instagram-playback', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/media/instagram-playback')>()
  return { ...actual, probeInstagramVideo: vi.fn() }
})

// jsdom doesn't implement HTMLMediaElement.play()/load() — a probe resolving
// 'ready' renders Stage's shared video slot, whose mount effect calls
// video.play() unconditionally.
HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
HTMLMediaElement.prototype.load = vi.fn()

function makeItem(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'instagram',
    bookmarkId: 'reel-1',
    author: 'someone',
    url: '/reels/reel-1',
    createdAt: '2026-08-20T00:00:00Z',
    contentType: 'video',
    ...overrides,
  } as TheaterItem
}

describe('StageInstagram auto-advance guards', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(probeInstagramVideo).mockReset()
  })

  it('advances ~8s after landing in the IG-embed fallback (probe fails, onEnded present, repeat false)', async () => {
    vi.mocked(probeInstagramVideo).mockResolvedValue(false)
    const onEnded = vi.fn()

    render(
      <Stage
        item={makeItem({ bookmarkId: 'reel-fallback' })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={onEnded}
      />,
    )

    // Flush the probe's microtask so status lands on 'failed'.
    await act(async () => {
      await Promise.resolve()
    })
    expect(onEnded).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000)
    })

    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('does not advance on the embed fallback when repeat is true (a pinned shared post stays put)', async () => {
    vi.mocked(probeInstagramVideo).mockResolvedValue(false)
    const onEnded = vi.fn()

    render(
      <Stage
        item={makeItem({ bookmarkId: 'reel-repeat' })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={onEnded}
        repeat
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(onEnded).not.toHaveBeenCalled()
  })

  it('does not throw or schedule anything without an onEnded callback (e.g. collection)', async () => {
    vi.mocked(probeInstagramVideo).mockResolvedValue(false)

    expect(() => {
      render(
        <Stage
          item={makeItem({ bookmarkId: 'reel-no-onended' })}
          muted
          onRequestUnmute={vi.fn()}
        />,
      )
    }).not.toThrow()

    await act(async () => {
      await Promise.resolve()
    })
    await expect(
      act(async () => {
        await vi.advanceTimersByTimeAsync(20_000)
      }),
    ).resolves.not.toThrow()
  })

  it('advances via the never-started guard (~20s) when the probe is still pending past its warm-up window', async () => {
    vi.mocked(probeInstagramVideo).mockReturnValue(new Promise<boolean>(() => {}))
    const onEnded = vi.fn()

    render(
      <Stage
        item={makeItem({ bookmarkId: 'reel-never-started' })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={onEnded}
      />,
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(19_000)
    })
    expect(onEnded).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500)
    })
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('does not fire the never-started guard once the probe resolves ready before the ceiling', async () => {
    vi.mocked(probeInstagramVideo).mockResolvedValue(true)
    const onEnded = vi.fn()

    render(
      <Stage
        item={makeItem({ bookmarkId: 'reel-ready-in-time' })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={onEnded}
      />,
    )

    // Probe resolves quickly — status flips to 'ready' and Stage's shared
    // video slot takes over `onEnded` from here.
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })

    expect(onEnded).not.toHaveBeenCalled()
  })

  it('does not fire the embed-fallback guard once the probe later succeeds (status moved past failed)', async () => {
    // Not a realistic transition in practice (failed is terminal for a
    // given id), but guards against a future regression where the 'failed'
    // timer effect keeps running after a status change away from 'failed'.
    vi.mocked(probeInstagramVideo).mockResolvedValue(false)
    const onEnded = vi.fn()

    const { rerender } = render(
      <Stage
        item={makeItem({ bookmarkId: 'reel-status-flip' })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={onEnded}
      />,
    )
    await act(async () => {
      await Promise.resolve()
    })

    // A different item (new id) mounts before the 8s fallback timer fires —
    // the effect's id-change cleanup must cancel the stale timer.
    vi.mocked(probeInstagramVideo).mockResolvedValue(true)
    rerender(
      <Stage
        item={makeItem({ bookmarkId: 'reel-status-flip-2' })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={onEnded}
      />,
    )
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000)
    })

    expect(onEnded).not.toHaveBeenCalled()
  })
})

/**
 * Owner: Instagram doesn't autoplay on mobile (works on desktop). Unlike
 * Twitter/TikTok — whose `StageVideo` instance is usually already mounted
 * and persists across navigation — every Instagram item is a genuinely
 * FRESH `StageVideo` mount, created only once `probeInstagramVideo` resolves
 * (real-world: seconds after the item became current, well outside any
 * user-gesture window). These tests exercise that "late attach" path
 * through `Stage` (which mounts the shared video slot the moment the probe
 * confirms the mirror) rather than `StageVideo` in isolation, since that's
 * the actual shape of the bug.
 */
describe('StageInstagram late-attach playback (mount happens after the probe resolves)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(probeInstagramVideo).mockReset()
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  })

  it('autoplays muted immediately on the late-attach mount (default muted state) — no stuck tap-to-play overlay', async () => {
    vi.mocked(probeInstagramVideo).mockResolvedValue(true)
    const playMock = vi.fn().mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = playMock

    const { container } = render(
      <Stage
        item={makeItem({ bookmarkId: 'reel-late-attach-muted' })}
        muted
        onRequestUnmute={vi.fn()}
      />,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const videos = container.querySelectorAll('video')
    expect(videos.length).toBe(1)
    const video = videos[0]
    expect(video.muted).toBe(true)
    expect(container.querySelector('[aria-label="Play video"]')).toBeNull()
    expect(playMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to muted playback when the shell is unmuted and the late-mounted video rejects unmuted autoplay — never sits paused', async () => {
    vi.mocked(probeInstagramVideo).mockResolvedValue(true)
    const playMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('unmuted autoplay rejected'))
      .mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = playMock

    const { container } = render(
      <Stage
        item={makeItem({ bookmarkId: 'reel-late-attach-unmuted' })}
        muted={false}
        onRequestUnmute={vi.fn()}
      />,
    )

    // Flush the probe resolving 'ready' (mounts Stage's shared video slot)
    // and the resulting rejected-unmuted → muted-retry play() chain.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    const videos = container.querySelectorAll('video')
    expect(videos.length).toBe(1)
    const video = videos[0]
    expect(video.muted).toBe(true)
    expect(container.querySelector('[aria-label="Play video"]')).toBeNull()
    expect(playMock).toHaveBeenCalledTimes(2)
  })
})

describe('Instagram image stage', () => {
  it('renders an ordered carousel without probing the Reel mirror', () => {
    vi.mocked(probeInstagramVideo).mockClear()

    const { container } = render(
      <Stage
        item={makeItem({
          bookmarkId: 'carousel-1',
          url: '/p/carousel-1',
          contentType: 'photo',
          photoCount: 3,
          thumbnailUrl: '/api/media/instagram/thumbnail?id=carousel-1',
        })}
        muted
        onRequestUnmute={vi.fn()}
      />,
    )

    expect(probeInstagramVideo).not.toHaveBeenCalled()
    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
    expect(
      Array.from(container.querySelectorAll('img'))
        .map((img) => img.getAttribute('src'))
        .filter((src) => src?.startsWith('/api/media/instagram/thumbnail')),
    ).toEqual([
      '/api/media/instagram/thumbnail?id=carousel-1&index=1',
      '/api/media/instagram/thumbnail?id=carousel-1&index=2',
      '/api/media/instagram/thumbnail?id=carousel-1&index=3',
    ])
  })
})
