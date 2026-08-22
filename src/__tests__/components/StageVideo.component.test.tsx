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

/**
 * Instagram catch-up unmute: every Instagram item is a genuinely fresh
 * StageVideo mount (see StageInstagram.tsx), so it carries no user-gesture
 * history — when the shell already wants sound (`muted={false}`) the
 * initial unmuted play() attempt below is routinely rejected and the mount
 * effect falls back to muted (already covered by
 * StageInstagram.component.test.tsx's "late-attach" tests). Previously
 * nothing ever asked for sound again after that fallback. These tests cover
 * the fix: once playback is CONFIRMED (a real `playing` event — never
 * before, matching the round-4 "evidence only" discipline elsewhere in this
 * file), retry sound once; an unexpected `pause` right after is the only
 * signal treated as the platform vetoing it.
 */
describe('StageVideo Instagram catch-up unmute (confirmed-playing retry, evidence-only revert)', () => {
  afterEach(() => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  })

  it('unmutes once playback is confirmed after falling back to muted, while the shell wants sound', async () => {
    // 1st call: the initial unmuted attempt (rejected — no gesture on this
    // fresh element). 2nd+: the fallback's muted retry, and anything after.
    const playMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('unmuted autoplay rejected'))
      .mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = playMock

    const { container } = render(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?a=1"
        poster={null}
        muted={false}
        onRequestUnmute={vi.fn()}
      />,
    )

    // Let the mount effect's reject -> muted-fallback chain settle.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.muted).toBe(true) // fell back to muted, exactly as before this fix

    // Confirmed playing — the only signal that triggers the catch-up retry.
    await act(async () => {
      video.dispatchEvent(new Event('playing'))
      await Promise.resolve()
    })

    expect(video.muted).toBe(false)
  })

  it('does not attempt a catch-up unmute when the shell wants muted playback', async () => {
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
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.muted).toBe(true)

    await act(async () => {
      video.dispatchEvent(new Event('playing'))
      await Promise.resolve()
    })

    expect(video.muted).toBe(true)
  })

  it('reverts to muted and resumes when an unexpected pause follows the catch-up unmute (observed rejection)', async () => {
    const playMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('unmuted autoplay rejected'))
      .mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = playMock

    const { container } = render(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?a=1"
        poster={null}
        muted={false}
        onRequestUnmute={vi.fn()}
      />,
    )
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    const video = container.querySelector('video') as HTMLVideoElement

    await act(async () => {
      video.dispatchEvent(new Event('playing'))
      await Promise.resolve()
    })
    expect(video.muted).toBe(false) // catch-up applied

    const callsBeforeRevert = playMock.mock.calls.length
    await act(async () => {
      video.dispatchEvent(new Event('pause'))
      await Promise.resolve()
    })

    expect(video.muted).toBe(true) // reverted
    // Reverting also resumes playback with a fresh play() call.
    expect(playMock.mock.calls.length).toBeGreaterThan(callsBeforeRevert)
  })

  it('does NOT treat the pause that precedes a natural `ended` as a catch-up rejection', async () => {
    const playMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('unmuted autoplay rejected'))
      .mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = playMock

    const { container } = render(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?a=1"
        poster={null}
        muted={false}
        onRequestUnmute={vi.fn()}
      />,
    )
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    const video = container.querySelector('video') as HTMLVideoElement

    await act(async () => {
      video.dispatchEvent(new Event('playing'))
      await Promise.resolve()
    })
    expect(video.muted).toBe(false) // catch-up applied

    // Real playback reaching its end: browsers fire `pause` immediately
    // before `ended`. `video.ended` is read live by the pause handler, so
    // stub it the way jsdom's own read-only getter would report it.
    Object.defineProperty(video, 'ended', { value: true, configurable: true })

    await act(async () => {
      video.dispatchEvent(new Event('pause'))
      video.dispatchEvent(new Event('ended'))
    })

    // Stayed unmuted — this was a natural end, not a rejection. (No end
    // overlay renders anymore — the legacy replay/next nudge was removed
    // once every playlist auto-advanced; ended videos replay via the
    // transport/stage-tap instead.)
    expect(video.muted).toBe(false)
    expect(container.querySelector('[aria-label="Replay"]')).toBeNull()
  })
})

/**
 * Gesture-unmute fix: the audio button's blind reliance on the `[muted]`
 * prop-reconcile effect (a passive effect, always scheduled in a task AFTER
 * the click handler returns — outside WebKit's user-gesture window) was the
 * root cause of the persistent double-tap-to-unmute bug. `theater-set-muted`
 * is the new gesture-context fast path: a plain `window.dispatchEvent` inside
 * the tap's own call stack reaches this listener SYNCHRONOUSLY (DOM event
 * listeners registered via `addEventListener` run in the dispatching call's
 * stack), so `video.muted` flips before the click handler returns — unlike
 * the React state -> prop -> `useEffect` round trip.
 */
describe('StageVideo theater-set-muted (gesture-context fast path)', () => {
  it('applies video.muted synchronously, within the dispatching call, without waiting for a re-render', async () => {
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
    })
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.muted).toBe(true)

    // No `act()`/await here on purpose — this asserts the mutation already
    // happened by the time dispatchEvent returns, i.e. synchronously, the
    // same way a real click handler's call stack would observe it.
    window.dispatchEvent(new CustomEvent('theater-set-muted', { detail: { muted: false } }))
    expect(video.muted).toBe(false)
  })

  it('re-mutes synchronously too (both directions go through the same fast path)', async () => {
    const { container } = render(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?a=1"
        poster={null}
        muted={false}
        onRequestUnmute={vi.fn()}
      />,
    )
    await act(async () => {
      await Promise.resolve()
    })
    const video = container.querySelector('video') as HTMLVideoElement

    window.dispatchEvent(new CustomEvent('theater-set-muted', { detail: { muted: true } }))
    expect(video.muted).toBe(true)
  })

  it('is idempotent with the later `[muted]` prop-reconcile effect applying the same value', async () => {
    const { container, rerender } = render(
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
    })
    const video = container.querySelector('video') as HTMLVideoElement

    // The gesture-context event fires first (synchronous tap handler)...
    window.dispatchEvent(new CustomEvent('theater-set-muted', { detail: { muted: false } }))
    expect(video.muted).toBe(false)

    // ...then the shell's state update flows back down as the same `muted`
    // prop value one render later — must not fight or revert it.
    await act(async () => {
      rerender(
        <StageVideo
          item={makeItem()}
          src="/api/media/video?a=1"
          poster={null}
          muted={false}
          onRequestUnmute={vi.fn()}
        />,
      )
    })
    expect(video.muted).toBe(false)
  })
})
