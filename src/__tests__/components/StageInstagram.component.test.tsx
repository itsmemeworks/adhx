/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { StageInstagram } from '@/components/theater/StageInstagram'
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
 */

vi.mock('@/lib/media/instagram-playback', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/media/instagram-playback')>()
  return { ...actual, probeInstagramVideo: vi.fn() }
})

// jsdom doesn't implement HTMLMediaElement.play()/load() — a probe resolving
// 'ready' renders StageVideo, whose mount effect calls video.play()
// unconditionally.
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
      <StageInstagram
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
      <StageInstagram
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

  it('does not throw or schedule anything without an onEnded callback (e.g. triage)', async () => {
    vi.mocked(probeInstagramVideo).mockResolvedValue(false)

    expect(() => {
      render(
        <StageInstagram
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
      <StageInstagram
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
      <StageInstagram
        item={makeItem({ bookmarkId: 'reel-ready-in-time' })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={onEnded}
      />,
    )

    // Probe resolves quickly — status flips to 'ready' and StageVideo takes
    // over `onEnded` from here.
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
      <StageInstagram
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
      <StageInstagram
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
