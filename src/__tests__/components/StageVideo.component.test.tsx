/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
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
