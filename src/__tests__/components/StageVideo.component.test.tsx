/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { StageVideo } from '@/components/theater/StageVideo'
import {
  THEATER_SEEK,
  useTheaterStageTapDeclutter,
} from '@/components/theater/useTheaterStageEvents'
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setCurrentSrc(video: HTMLVideoElement, src: string) {
  Object.defineProperty(video, 'currentSrc', {
    configurable: true,
    value: new URL(src, document.baseURI).href,
  })
}

function activateVideo(video: HTMLVideoElement, src?: string) {
  if (src) setCurrentSrc(video, src)
  fireEvent.loadStart(video)
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

describe('StageVideo progress scrubbing', () => {
  it('seeks the active persistent video without remounting it', () => {
    const src = '/api/media/video?clip=scrub'
    const { container } = render(
      <StageVideo item={makeItem()} src={src} poster={null} muted onRequestUnmute={vi.fn()} />,
    )
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'duration', { configurable: true, value: 200 })
    activateVideo(video, src)

    act(() => {
      window.dispatchEvent(new CustomEvent(THEATER_SEEK, { detail: { progress: 0.25 } }))
    })

    expect(video.currentTime).toBe(50)
    expect(container.querySelector('video')).toBe(video)
  })

  it('publishes duration with progress so the scrub badge can show target time', () => {
    const src = '/api/media/video?tweetId=progress'
    const progress = vi.fn()
    window.addEventListener('theater-video-progress', progress)
    const { container } = render(
      <StageVideo item={makeItem()} src={src} poster={null} muted onRequestUnmute={vi.fn()} />,
    )
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'duration', { configurable: true, value: 200 })
    video.currentTime = 50
    activateVideo(video, src)

    try {
      fireEvent.loadedMetadata(video)
      expect((progress.mock.calls.at(-1)?.[0] as CustomEvent).detail).toEqual({
        progress: 0.25,
        duration: 200,
      })
    } finally {
      window.removeEventListener('theater-video-progress', progress)
    }
  })

  it('does not seek a video retained underneath a non-video stage', () => {
    const src = '/api/media/video?clip=covered'
    const { container } = render(
      <StageVideo
        item={makeItem()}
        src={src}
        poster={null}
        muted
        onRequestUnmute={vi.fn()}
        covered
      />,
    )
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'duration', { configurable: true, value: 200 })
    activateVideo(video, src)

    act(() => {
      window.dispatchEvent(new CustomEvent(THEATER_SEEK, { detail: { progress: 0.25 } }))
    })

    expect(video.currentTime).toBe(0)
  })

  it('defers an ended signal while covered and advances after the cover leaves', () => {
    const onEnded = vi.fn()
    const props = {
      item: makeItem(),
      src: '/api/media/video?clip=covered-ended',
      poster: null,
      muted: true,
      onRequestUnmute: vi.fn(),
      onEnded,
    }
    const { container, rerender } = render(<StageVideo {...props} covered />)
    const video = container.querySelector('video') as HTMLVideoElement
    activateVideo(video, props.src)

    fireEvent.ended(video)
    expect(onEnded).not.toHaveBeenCalled()

    rerender(<StageVideo {...props} />)
    expect(onEnded).toHaveBeenCalledTimes(1)
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

  it('ignores theater-resume while covered so a Saved flip does not play the Live MP4', async () => {
    const playMock = vi.fn().mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = playMock
    HTMLMediaElement.prototype.pause = vi.fn()

    render(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?a=1"
        poster={null}
        muted
        onRequestUnmute={vi.fn()}
        covered
      />,
    )
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    playMock.mockClear()

    await act(async () => {
      window.dispatchEvent(new CustomEvent('theater-resume'))
      await Promise.resolve()
    })
    expect(playMock).not.toHaveBeenCalled()
  })
})

describe('StageVideo source supersession', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    vi.unstubAllGlobals()
  })

  it('ignores a stale AbortError without showing a gesture overlay or re-muting the new source', async () => {
    const sourceAPlay = deferred<void>()
    const playMock = vi
      .fn()
      .mockImplementationOnce(() => sourceAPlay.promise)
      .mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = playMock

    const props = {
      item: makeItem(),
      poster: null,
      muted: false,
      onRequestUnmute: vi.fn(),
    }
    const { container, rerender } = render(<StageVideo {...props} src="/api/media/video?clip=a" />)
    const video = container.querySelector('video') as HTMLVideoElement

    await act(async () => {
      rerender(<StageVideo {...props} src="/api/media/video?clip=b" />)
      await Promise.resolve()
    })
    expect(playMock).toHaveBeenCalledTimes(2)
    expect(video.muted).toBe(false)

    await act(async () => {
      sourceAPlay.reject(new DOMException('superseded', 'AbortError'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(video.muted).toBe(false)
    expect(container.querySelector('[aria-label="Play video"]')).toBeNull()
    expect(playMock).toHaveBeenCalledTimes(2)
  })

  it('treats a current-source AbortError after deliberate pause as a no-op', async () => {
    const interruptedPlay = deferred<void>()
    const playMock = vi.fn().mockImplementationOnce(() => interruptedPlay.promise)
    HTMLMediaElement.prototype.play = playMock
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)

    const { container } = render(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?clip=current"
        poster={null}
        muted={false}
        onRequestUnmute={vi.fn()}
      />,
    )
    const video = container.querySelector('video') as HTMLVideoElement
    activateVideo(video, '/api/media/video?clip=current')

    act(() => {
      window.dispatchEvent(new CustomEvent('theater-pause'))
    })
    await act(async () => {
      interruptedPlay.reject(new DOMException('play interrupted by pause', 'AbortError'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(playMock).toHaveBeenCalledTimes(1)
    expect(video.muted).toBe(false)
    expect(container.querySelector('[aria-label="Play video"]')).toBeNull()
    expect(container.textContent).not.toContain("This video couldn't load.")
  })

  it('does not publish playing when an old source play resolves after the new source mounts', async () => {
    const sourceAPlay = deferred<void>()
    const sourceBPlay = deferred<void>()
    const playMock = vi
      .fn()
      .mockImplementationOnce(() => sourceAPlay.promise)
      .mockImplementationOnce(() => sourceBPlay.promise)
    HTMLMediaElement.prototype.play = playMock
    const playingEvents: boolean[] = []
    const onPlayingState = (event: Event) => {
      playingEvents.push((event as CustomEvent<{ playing: boolean }>).detail.playing)
    }
    window.addEventListener('theater-playing-state', onPlayingState)

    const props = {
      item: makeItem(),
      poster: null,
      muted: true,
      onRequestUnmute: vi.fn(),
    }
    const { rerender } = render(<StageVideo {...props} src="/api/media/video?clip=a" />)
    await act(async () => {
      rerender(<StageVideo {...props} src="/api/media/video?clip=b" />)
      await Promise.resolve()
    })
    playingEvents.length = 0

    await act(async () => {
      sourceAPlay.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(playingEvents).not.toContain(true)
    window.removeEventListener('theater-playing-state', onPlayingState)
  })

  it('does not let a stale muted fallback settle or issue another play against the new source', async () => {
    const sourceAInitial = deferred<void>()
    const sourceAFallback = deferred<void>()
    const playMock = vi
      .fn()
      .mockImplementationOnce(() => sourceAInitial.promise)
      .mockImplementationOnce(() => sourceAFallback.promise)
      .mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = playMock

    const props = {
      item: makeItem(),
      poster: null,
      muted: false,
      onRequestUnmute: vi.fn(),
    }
    const { container, rerender } = render(<StageVideo {...props} src="/api/media/video?clip=a" />)

    await act(async () => {
      sourceAInitial.reject(new Error('unmuted autoplay rejected'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(playMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      rerender(<StageVideo {...props} src="/api/media/video?clip=b" />)
      await Promise.resolve()
    })
    expect(playMock).toHaveBeenCalledTimes(3)

    await act(async () => {
      sourceAFallback.reject(new DOMException('superseded', 'AbortError'))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(playMock).toHaveBeenCalledTimes(3)
    expect(container.querySelector('[aria-label="Play video"]')).toBeNull()
  })

  it('keeps only the latest generation current across rapid album source swaps', async () => {
    const clipA = deferred<void>()
    const clipB = deferred<void>()
    const clipC = deferred<void>()
    const playMock = vi
      .fn()
      .mockImplementationOnce(() => clipA.promise)
      .mockImplementationOnce(() => clipB.promise)
      .mockImplementationOnce(() => clipC.promise)
    HTMLMediaElement.prototype.play = playMock

    const props = {
      item: makeItem(),
      poster: null,
      muted: false,
      onRequestUnmute: vi.fn(),
      albumCount: 3,
      albumPosters: [],
      onAlbumIndexChange: vi.fn(),
    }
    const { container, rerender } = render(
      <StageVideo {...props} src="/api/media/video?index=1" albumIndex={0} />,
    )
    await act(async () => {
      rerender(<StageVideo {...props} src="/api/media/video?index=2" albumIndex={1} />)
      await Promise.resolve()
    })
    await act(async () => {
      rerender(<StageVideo {...props} src="/api/media/video?index=3" albumIndex={2} />)
      await Promise.resolve()
    })

    await act(async () => {
      clipA.reject(new Error('old clip failed'))
      clipB.reject(new DOMException('old clip aborted', 'AbortError'))
      clipC.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    const video = container.querySelector('video') as HTMLVideoElement
    expect(playMock).toHaveBeenCalledTimes(3)
    expect(video.muted).toBe(false)
    expect(container.querySelector('[aria-label="Play video"]')).toBeNull()
  })

  it('does not let a stale error probe mark the replacement source unavailable', async () => {
    const sourceAProbe = deferred<{ status: number; json: () => Promise<{ reason: string }> }>()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => sourceAProbe.promise),
    )

    const props = {
      item: makeItem(),
      poster: null,
      muted: true,
      onRequestUnmute: vi.fn(),
    }
    const { container, rerender, queryByText } = render(
      <StageVideo {...props} src="/api/media/video?clip=a" />,
    )
    const video = container.querySelector('video') as HTMLVideoElement
    activateVideo(video, '/api/media/video?clip=a')
    fireEvent.error(video)

    await act(async () => {
      rerender(<StageVideo {...props} src="/api/media/video?clip=b" />)
      await Promise.resolve()
    })

    await act(async () => {
      sourceAProbe.resolve({
        status: 410,
        json: async () => ({ reason: 'Source A is unavailable' }),
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(queryByText('Source A is unavailable')).toBeNull()
    expect(queryByText("This video couldn't load.")).toBeNull()
  })

  it('invalidates A during commit before B passive load/play work runs', async () => {
    const sourceA = '/api/media/video?clip=commit-a'
    const sourceB = '/api/media/video?clip=commit-b'
    const onEnded = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({ status: 500, json: async () => null })
    vi.stubGlobal('fetch', fetchMock)
    const playMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('unmuted autoplay rejected'))
      .mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = playMock

    let sourceSeenInParentLayout: string | null = null
    let playCallsAfterStaleEvents: number | null = null
    let mutedAfterStaleEvents: boolean | null = null

    function CommitRaceHarness({ source }: { source: string }) {
      const hostRef = useRef<HTMLDivElement>(null)
      // Child layout effects run before parent layout effects. This callback
      // therefore sits exactly after StageVideo's synchronous invalidation
      // and before its passive [src] load/play effect.
      useLayoutEffect(() => {
        if (source !== sourceB) return
        const video = hostRef.current?.querySelector('video')
        if (!video) throw new Error('no <video> rendered')
        sourceSeenInParentLayout = video.src
        setCurrentSrc(video, sourceA)
        video.dispatchEvent(new Event('pause'))
        video.dispatchEvent(new Event('ended'))
        video.dispatchEvent(new Event('error'))
        playCallsAfterStaleEvents = playMock.mock.calls.length
        mutedAfterStaleEvents = video.muted
      }, [source])

      return (
        <div ref={hostRef}>
          <StageVideo
            item={makeItem()}
            src={source}
            poster={null}
            muted={false}
            onRequestUnmute={vi.fn()}
            onEnded={onEnded}
          />
        </div>
      )
    }

    const { container, rerender, queryByText } = render(<CommitRaceHarness source={sourceA} />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    const video = container.querySelector('video') as HTMLVideoElement
    activateVideo(video, sourceA)
    await act(async () => {
      video.dispatchEvent(new Event('playing'))
      await Promise.resolve()
    })
    expect(video.muted).toBe(false)
    expect(playMock).toHaveBeenCalledTimes(2)

    rerender(<CommitRaceHarness source={sourceB} />)

    // B's passive effect had not assigned its source when the parent layout
    // callback ran, proving the stale events exercised the commit/effect gap.
    expect(sourceSeenInParentLayout).toBe(new URL(sourceA, document.baseURI).href)
    expect(playCallsAfterStaleEvents).toBe(2)
    expect(mutedAfterStaleEvents).toBe(false)
    expect(onEnded).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(queryByText("This video couldn't load.")).toBeNull()
    // Only B's own passive startup added a play call.
    expect(playMock).toHaveBeenCalledTimes(3)
  })

  it('rejects queued old-source pause, ended, and error events until the new lifecycle activates', async () => {
    const sourceA = '/api/media/video?clip=a'
    const sourceB = '/api/media/video?clip=b'
    const onEnded = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({ status: 500, json: async () => null })
    vi.stubGlobal('fetch', fetchMock)
    const playMock = vi.fn().mockResolvedValue(undefined)
    HTMLMediaElement.prototype.play = playMock

    const props = {
      item: makeItem(),
      poster: null,
      muted: false,
      onRequestUnmute: vi.fn(),
      onEnded,
    }
    const { container, rerender, queryByText } = render(<StageVideo {...props} src={sourceA} />)
    const video = container.querySelector('video') as HTMLVideoElement
    activateVideo(video, sourceA)

    await act(async () => {
      rerender(<StageVideo {...props} src={sourceB} />)
      await Promise.resolve()
    })
    // Model the browser's ordered media task queue: B has been assigned and
    // load() called, but its loadstart has not activated yet; currentSrc still
    // identifies the resource whose queued events are now arriving.
    setCurrentSrc(video, sourceA)
    const callsAfterBPlay = playMock.mock.calls.length

    act(() => {
      video.dispatchEvent(new Event('pause'))
      video.dispatchEvent(new Event('ended'))
      video.dispatchEvent(new Event('error'))
    })

    expect(onEnded).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(playMock).toHaveBeenCalledTimes(callsAfterBPlay)
    expect(video.muted).toBe(false)
    expect(queryByText("This video couldn't load.")).toBeNull()

    // Once B's matching loadstart arrives, genuine B lifecycle events work.
    activateVideo(video, sourceB)
    act(() => {
      video.dispatchEvent(new Event('ended'))
    })
    expect(onEnded).toHaveBeenCalledTimes(1)

    act(() => {
      video.dispatchEvent(new Event('error'))
    })
    expect(fetchMock).toHaveBeenCalledWith(sourceB, { headers: { Range: 'bytes=0-1' } })
    expect(queryByText("This video couldn't load.")).not.toBeNull()
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
    HTMLMediaElement.prototype.pause = vi.fn()
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
    activateVideo(video)

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
    activateVideo(video)

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
    activateVideo(video)

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

  it('treats a covered resolver pause as deliberate and resumes without reverting sound', async () => {
    const playMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('unmuted autoplay rejected'))
      .mockResolvedValue(undefined)
    const pauseMock = vi.fn()
    HTMLMediaElement.prototype.play = playMock
    HTMLMediaElement.prototype.pause = pauseMock

    const props = {
      item: makeItem(),
      src: '/api/media/video?a=1',
      poster: null,
      muted: false,
      onRequestUnmute: vi.fn(),
    }
    const { container, rerender } = render(<StageVideo {...props} />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    const video = container.querySelector('video') as HTMLVideoElement
    activateVideo(video)
    await act(async () => {
      video.dispatchEvent(new Event('playing'))
      await Promise.resolve()
    })
    expect(video.muted).toBe(false)

    Object.defineProperty(video, 'paused', { configurable: true, value: false })
    rerender(<StageVideo {...props} covered />)
    expect(pauseMock).toHaveBeenCalled()

    const callsBeforePauseEvent = playMock.mock.calls.length
    await act(async () => {
      video.dispatchEvent(new Event('pause'))
      await Promise.resolve()
    })
    expect(video.muted).toBe(false)
    expect(playMock).toHaveBeenCalledTimes(callsBeforePauseEvent)

    Object.defineProperty(video, 'paused', { configurable: true, value: true })
    rerender(<StageVideo {...props} />)
    expect(playMock.mock.calls.length).toBeGreaterThan(callsBeforePauseEvent)
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
    activateVideo(video)

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

  it('treats a cross-tab unmute as catch-up and recovers from an autoplay-policy pause', async () => {
    const playMock = vi.fn().mockResolvedValue(undefined)
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
    })
    const video = container.querySelector('video') as HTMLVideoElement
    activateVideo(video)

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('theater-set-muted', {
          detail: { muted: false, source: 'catchup' },
        }),
      )
    })
    expect(video.muted).toBe(false)

    const callsBeforePause = playMock.mock.calls.length
    await act(async () => {
      video.dispatchEvent(new Event('pause'))
      await Promise.resolve()
    })

    expect(video.muted).toBe(true)
    expect(playMock.mock.calls.length).toBeGreaterThan(callsBeforePause)
  })
})

/**
 * Owner report: a video whose proxy/mirror fails shows "This video couldn't
 * load" and the playlist STOPS there. A dead post should cost the same ~10s a
 * text post does and then move on.
 */
describe('StageVideo: a failed video does not stall the playlist', () => {
  afterEach(() => {
    vi.useRealTimers()
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  })

  /**
   * `errored` comes from the element's own `error` event (the src failing to
   * load), not from a rejected play() — that path shows the tap-to-play
   * overlay instead. The handler also range-fetches the src to tell a deleted
   * post from a transient failure, so `fetch` is stubbed.
   *
   * Fake timers are installed BEFORE render but the render is NOT wrapped in
   * `act` — nesting act around it while the scheduler is faked leaves React
   * uncommitted and the container empty.
   */
  function renderErrored(props: { onEnded?: () => void; repeat?: boolean; covered?: boolean }) {
    global.fetch = vi.fn().mockResolvedValue({ status: 500, json: async () => null }) as never
    vi.useFakeTimers()
    const rendered = render(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?a=1"
        poster={null}
        muted
        onRequestUnmute={vi.fn()}
        {...props}
      />,
    )
    const video = rendered.container.querySelector('video')
    if (!video) throw new Error('no <video> rendered')
    act(() => {
      activateVideo(video)
      fireEvent.error(video)
    })
    return rendered
  }

  it('advances after ~10s instead of sitting on the error forever', () => {
    const onEnded = vi.fn()
    renderErrored({ onEnded })
    expect(onEnded).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(9_000)
    })
    expect(onEnded).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1_500)
    })
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('stays put when the post is deliberately repeating', () => {
    const onEnded = vi.fn()
    renderErrored({ onEnded, repeat: true })
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(onEnded).not.toHaveBeenCalled()
  })

  it('restarts the error-advance timer after a resolver cover leaves', () => {
    const onEnded = vi.fn()
    const rendered = renderErrored({ onEnded, covered: true })
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(onEnded).not.toHaveBeenCalled()

    rendered.rerender(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?a=1"
        poster={null}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={onEnded}
      />,
    )
    act(() => {
      vi.advanceTimersByTime(10_500)
    })
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there is nowhere to advance to (collection)', () => {
    renderErrored({})
    // No onEnded: nothing is scheduled and nothing throws.
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
  })
})

describe('StageVideo stage tap enters focus and resumes playback', () => {
  afterEach(() => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  })

  function DeclutterVideo({ onRequestUnmute }: { onRequestUnmute: () => void }) {
    const [declutter, setDeclutter] = useState(false)
    useTheaterStageTapDeclutter(declutter, setDeclutter)
    return (
      <StageVideo
        item={makeItem()}
        src="/api/media/video?a=1"
        poster={null}
        muted
        onRequestUnmute={onRequestUnmute}
      />
    )
  }

  function renderVideo(withDeclutter = false) {
    const onRequestUnmute = vi.fn()
    const view = render(
      withDeclutter ? (
        <DeclutterVideo onRequestUnmute={onRequestUnmute} />
      ) : (
        <StageVideo
          item={makeItem()}
          src="/api/media/video?a=1"
          poster={null}
          muted
          onRequestUnmute={onRequestUnmute}
        />
      ),
    )
    return { ...view, onRequestUnmute }
  }

  it('dispatches theater-stage-tap and does not pause a playing video', () => {
    const heard = vi.fn()
    window.addEventListener('theater-stage-tap', heard)
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause')
    const { container, onRequestUnmute } = renderVideo()
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'paused', { configurable: true, get: () => false })
    pause.mockClear()

    fireEvent.click(container.firstElementChild as Element)

    expect(heard).toHaveBeenCalledTimes(1)
    expect(pause).not.toHaveBeenCalled()
    expect(onRequestUnmute).not.toHaveBeenCalled()
    window.removeEventListener('theater-stage-tap', heard)
  })

  it('plays a paused video from a stage tap', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { container } = renderVideo()
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'paused', { configurable: true, get: () => true })
    play.mockClear()

    fireEvent.click(container.firstElementChild as Element)

    expect(play).toHaveBeenCalledTimes(1)
  })

  it('does not turn a generic error-overlay tap into an implicit retry', () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 500 }))
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { container, getByText } = renderVideo()
    const video = container.querySelector('video') as HTMLVideoElement
    activateVideo(video, '/api/media/video?a=1')
    fireEvent.error(video)
    expect(getByText("This video couldn't load.")).toBeInTheDocument()
    play.mockClear()

    fireEvent.click(container.firstElementChild as Element)

    expect(play).not.toHaveBeenCalled()
    expect(getByText("This video couldn't load.")).toBeInTheDocument()
    fetchMock.mockRestore()
  })

  it('does not retry an error when autoplay had already requested a gesture', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValue(new DOMException('Gesture required', 'NotAllowedError'))
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 500 }))
    const { container, findByText } = renderVideo(true)
    const video = container.querySelector('video') as HTMLVideoElement
    await act(async () => {
      await Promise.resolve()
    })
    play.mockResolvedValue(undefined)
    activateVideo(video, '/api/media/video?a=1')
    fireEvent.error(video)
    expect(await findByText("This video couldn't load.")).toBeInTheDocument()
    play.mockClear()

    fireEvent.click(container.firstElementChild as Element)

    expect(play).not.toHaveBeenCalled()
    fetchMock.mockRestore()
  })

  it('does not retry an unavailable video from a stage tap', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ reason: 'This post is unavailable' }), {
        status: 410,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { container, findByText } = renderVideo()
    const video = container.querySelector('video') as HTMLVideoElement
    activateVideo(video, '/api/media/video?a=1')
    fireEvent.error(video)
    expect(await findByText('This post is unavailable')).toBeInTheDocument()
    play.mockClear()

    fireEvent.click(container.firstElementChild as Element)

    expect(play).not.toHaveBeenCalled()
    expect(await findByText('This post is unavailable')).toBeInTheDocument()
    fetchMock.mockRestore()
  })

  it('does not unmute on tap — sound stays on the chrome audio button', () => {
    const { container, onRequestUnmute } = renderVideo()
    fireEvent.click(container.firstElementChild as Element)
    expect(onRequestUnmute).not.toHaveBeenCalled()
  })
})

describe('StageVideo twitter album', () => {
  it('shows the same snap chrome as multi-photo when there are 2+ clips', () => {
    const onAlbumIndexChange = vi.fn()
    const { getByLabelText, getByRole } = render(
      <StageVideo
        item={makeItem()}
        src="/api/media/video?author=jpschroeder&tweetId=1&quality=hd"
        poster={null}
        muted
        onRequestUnmute={vi.fn()}
        albumCount={2}
        albumIndex={0}
        albumPosters={['https://example.com/a.jpg', 'https://example.com/b.jpg']}
        onAlbumIndexChange={onAlbumIndexChange}
      />,
    )
    expect(getByLabelText('Videos, 2')).toBeInTheDocument()
    fireEvent.click(getByRole('button', { name: 'Next video, 1 of 2' }))
    expect(onAlbumIndexChange).toHaveBeenCalledWith(1)
  })

  it('advances the album on ended until the last clip, then calls onEnded', () => {
    const onAlbumIndexChange = vi.fn()
    const onEnded = vi.fn()
    const props = {
      item: makeItem(),
      src: '/api/media/video?author=jpschroeder&tweetId=1&quality=hd',
      poster: null as string | null,
      muted: true,
      onRequestUnmute: vi.fn(),
      albumCount: 2,
      albumPosters: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
      onAlbumIndexChange,
      onEnded,
    }
    const { container, rerender } = render(<StageVideo {...props} albumIndex={0} />)
    const video = container.querySelector('video') as HTMLVideoElement
    activateVideo(video)
    fireEvent.ended(video)
    expect(onAlbumIndexChange).toHaveBeenCalledWith(1)
    expect(onEnded).not.toHaveBeenCalled()

    rerender(<StageVideo {...props} albumIndex={1} />)
    fireEvent.ended(video)
    expect(onEnded).toHaveBeenCalledTimes(1)
  })
})
