/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { StageVideo } from '@/components/theater/StageVideo'
import type { TheaterItem } from '@/components/theater/types'

/**
 * shared-post-repeat: while the shared post is pinned, StageVideo is handed
 * `repeat` so the native `loop` attribute takes over — the browser restarts
 * the video in place and never fires `ended`, so the shell's auto-advance
 * (wired through `onEnded`) simply never runs. jsdom doesn't implement real
 * video playback, so these tests only assert the DOM contract (the `loop`
 * attribute/property reflects the prop) — the "loop suppresses `ended`" half
 * is native browser behavior, not something to fake here.
 */

// jsdom doesn't implement HTMLMediaElement.play()/load() — StageVideo's
// mount effect calls video.play() unconditionally, so without a stub every
// render throws "play is not a function"/rejects with an unimplemented error.
HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
HTMLMediaElement.prototype.load = vi.fn()

function makeItem(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '1',
    author: 'someone',
    url: '/someone/status/1',
    createdAt: '2026-08-20T00:00:00Z',
    ...overrides,
  } as TheaterItem
}

describe('StageVideo repeat (shared-post-repeat)', () => {
  it('sets the native loop attribute when repeat is true', () => {
    const { container } = render(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?a=1"
        poster={null}
        muted
        onRequestUnmute={vi.fn()}
        repeat
      />,
    )
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.loop).toBe(true)
  })

  it('does not set loop when repeat is false/omitted', () => {
    const { container } = render(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?a=1"
        poster={null}
        muted
        onRequestUnmute={vi.fn()}
      />,
    )
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.loop).toBe(false)
  })
})

/**
 * Owner: "I have to tap play on top of the video rather than the play button
 * in the controls at the bottom — feels like a bug." Root cause: the
 * transport's `theater-resume`/`theater-toggle-play` handlers bailed out
 * (no-op) whenever `needsGesture` was true, so only the stage's own
 * tap-to-play overlay could start a not-yet-started video. Both now route
 * through the same `handleStartTap` start path.
 */
describe('StageVideo transport start-path parity (owner: bottom play button did nothing)', () => {
  afterEach(() => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  })

  it('is muted from the very first render, not only after an effect runs (fresh-mount iOS autoplay contract)', () => {
    const { container } = render(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?a=1"
        poster={null}
        muted
        onRequestUnmute={vi.fn()}
      />,
    )
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.muted).toBe(true)
  })

  it('starts playback via the transport "theater-resume" event after autoplay was rejected (needsGesture)', async () => {
    const playMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('autoplay rejected'))
      .mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = playMock

    const { container } = render(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?a=1"
        poster={null}
        muted
        onRequestUnmute={vi.fn()}
      />,
    )

    // Let the mount effect's rejected play() settle into the "needs a
    // gesture" state — the tap-to-play overlay should be showing.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('[aria-label="Play video"]')).not.toBeNull()

    // Previously a no-op: the transport button dispatches this exact event
    // (TheaterMobileChrome/DesktopDock's pause/play control), and it used to
    // bail out on `needsGesture` instead of starting playback.
    await act(async () => {
      window.dispatchEvent(new CustomEvent('theater-resume'))
      await Promise.resolve()
    })

    expect(playMock).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[aria-label="Play video"]')).toBeNull()
  })

  it('also starts playback via "theater-toggle-play" after autoplay was rejected', async () => {
    const playMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('autoplay rejected'))
      .mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = playMock

    const { container } = render(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?a=1"
        poster={null}
        muted
        onRequestUnmute={vi.fn()}
      />,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('[aria-label="Play video"]')).not.toBeNull()

    await act(async () => {
      window.dispatchEvent(new CustomEvent('theater-toggle-play'))
      await Promise.resolve()
    })

    expect(playMock).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[aria-label="Play video"]')).toBeNull()
  })

  it('a "theater-pause" while never-started is still a harmless no-op (nothing to pause)', async () => {
    const playMock = vi.fn().mockRejectedValueOnce(new Error('autoplay rejected'))
    HTMLMediaElement.prototype.play = playMock

    const { container } = render(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?a=1"
        poster={null}
        muted
        onRequestUnmute={vi.fn()}
      />,
    )
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(() => {
      window.dispatchEvent(new CustomEvent('theater-pause'))
    }).not.toThrow()
    // Still shows the tap-to-play overlay — pause didn't fabricate a playing state.
    expect(container.querySelector('[aria-label="Play video"]')).not.toBeNull()
  })
})
