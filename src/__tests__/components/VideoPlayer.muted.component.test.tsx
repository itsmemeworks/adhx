/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { VideoPlayer } from '@/components/feed/VideoPlayer'

vi.mock('hls.js', () => ({
  default: { isSupported: () => false },
}))

// tiktok skips the /info preflight and renders <video> synchronously, so
// these tests don't need to wait on a fetch round-trip.
describe('VideoPlayer controlled mute (theater transport wiring)', () => {
  it('syncs the `muted` prop onto the element, including on later changes', () => {
    const { container, rerender } = render(
      <VideoPlayer author="alice" tweetId="1" platform="tiktok" muted />,
    )
    const video = container.querySelector('video')!
    expect(video.muted).toBe(true)

    rerender(<VideoPlayer author="alice" tweetId="1" platform="tiktok" muted={false} />)
    expect(video.muted).toBe(false)

    rerender(<VideoPlayer author="alice" tweetId="1" platform="tiktok" muted />)
    expect(video.muted).toBe(true)
  })

  it('leaves `.muted` alone when the prop is undefined (byte-identical to existing callers)', () => {
    const { container } = render(<VideoPlayer author="alice" tweetId="1" platform="tiktok" />)
    const video = container.querySelector('video')!
    // Default DOM state — nothing in VideoPlayer ever assigns `.muted` for
    // callers that don't opt into the controlled prop.
    expect(video.muted).toBe(false)
  })

  it('reports a native unmute via onUserUnmute', () => {
    const onUserUnmute = vi.fn()
    const { container } = render(
      <VideoPlayer
        author="alice"
        tweetId="1"
        platform="tiktok"
        muted
        onUserUnmute={onUserUnmute}
      />,
    )
    const video = container.querySelector('video')!
    expect(video.muted).toBe(true)

    // Simulate the user unmuting via the native controls: flip the DOM
    // property directly (as the browser would), then fire the event our
    // listener is waiting for.
    video.muted = false
    fireEvent(video, new Event('volumechange'))

    expect(onUserUnmute).toHaveBeenCalled()
  })

  it('does not call onUserUnmute while the element stays muted', () => {
    const onUserUnmute = vi.fn()
    const { container } = render(
      <VideoPlayer
        author="alice"
        tweetId="1"
        platform="tiktok"
        muted
        onUserUnmute={onUserUnmute}
      />,
    )
    const video = container.querySelector('video')!

    fireEvent(video, new Event('volumechange'))

    expect(onUserUnmute).not.toHaveBeenCalled()
  })
})
