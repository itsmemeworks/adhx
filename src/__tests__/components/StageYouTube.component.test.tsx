/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { StageYouTube } from '@/components/theater/StageYouTube'
import type { TheaterItem } from '@/components/theater/types'

/**
 * StageYouTube drives the raw YouTube IFrame postMessage protocol (no
 * external script — CSP disallows loading `iframe_api`). These tests fake
 * the player side of that protocol: they grab the rendered iframe, stub its
 * `contentWindow.postMessage`, and dispatch `message` events shaped like the
 * player's own `onReady`/`onStateChange`/`onError` payloads.
 */

const YT_ORIGIN = 'https://www.youtube-nocookie.com'

function makeItem(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'youtube',
    bookmarkId: 'dQw4w9WgXcQ',
    author: 'someone',
    url: '/shorts/dQw4w9WgXcQ',
    createdAt: '2026-08-20T00:00:00Z',
    ...overrides,
  } as TheaterItem
}

/** Stub the iframe's `contentWindow` with a plain object carrying a spy
 * `postMessage`, and return both so tests can assert on outbound commands
 * and dispatch inbound messages with a matching `source`. */
function stubContentWindow(iframe: HTMLIFrameElement) {
  const postMessage = vi.fn()
  const fakeWindow = { postMessage } as unknown as Window
  Object.defineProperty(iframe, 'contentWindow', {
    value: fakeWindow,
    configurable: true,
  })
  return { postMessage, fakeWindow }
}

function postFromPlayer(fakeWindow: Window, payload: Record<string, unknown>) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: YT_ORIGIN,
        source: fakeWindow as unknown as MessageEventSource,
        data: JSON.stringify(payload),
      }),
    )
  })
}

function dispatchWindowEvent(event: Event) {
  act(() => {
    window.dispatchEvent(event)
  })
}

describe('StageYouTube', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds an embed src with the autoplay/mute/jsapi params', () => {
    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    expect(iframe).toBeTruthy()
    const src = new URL(iframe.src)
    expect(src.hostname).toBe('www.youtube-nocookie.com')
    expect(src.pathname).toBe('/embed/dQw4w9WgXcQ')
    expect(src.searchParams.get('enablejsapi')).toBe('1')
    expect(src.searchParams.get('autoplay')).toBe('1')
    expect(src.searchParams.get('mute')).toBe('1')
    expect(src.searchParams.get('playsinline')).toBe('1')
  })

  it('suppresses YouTube native chrome (controls/keyboard/fullscreen/annotations)', () => {
    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const src = new URL(iframe.src)
    expect(src.searchParams.get('controls')).toBe('0')
    expect(src.searchParams.get('disablekb')).toBe('1')
    expect(src.searchParams.get('fs')).toBe('0')
    expect(src.searchParams.get('iv_load_policy')).toBe('3')
  })

  it('sends the listening handshake to the embed origin on iframe load', () => {
    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage } = stubContentWindow(iframe)

    fireEvent.load(iframe)

    expect(postMessage).toHaveBeenCalledTimes(1)
    const [payload, targetOrigin] = postMessage.mock.calls[0]
    expect(targetOrigin).toBe(YT_ORIGIN)
    expect(JSON.parse(payload)).toMatchObject({ event: 'listening' })
  })

  it('advances (onEnded) when the player reports state 0 (ended)', () => {
    const onEnded = vi.fn()
    const { container } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)

    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 0 })

    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('advances (onEnded) on onError — an unplayable Short is skipped, not stalled', () => {
    const onEnded = vi.fn()
    const { container } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)

    postFromPlayer(fakeWindow, { event: 'onError', info: 150 })

    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('advances (onEnded) after the stall timeout when the player never starts playing', () => {
    const onEnded = vi.fn()
    render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} />)

    act(() => {
      vi.advanceTimersByTime(8_000)
    })

    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('does not advance on the stall timeout once the player has started playing', () => {
    const onEnded = vi.fn()
    const { container } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)

    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })
    act(() => {
      vi.advanceTimersByTime(8_000)
    })

    expect(onEnded).not.toHaveBeenCalled()
  })

  // The raw postMessage protocol streams player state inside `infoDelivery`
  // payloads — the discrete `onStateChange` event is synthesized by the
  // official iframe_api script, which we don't load. Regression coverage for
  // the staging bug where only onStateChange was handled and the watchdog
  // skipped videos that were playing fine.
  it('treats infoDelivery playerState 1 as playing — watchdog disarmed', () => {
    const onEnded = vi.fn()
    const { container } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)

    postFromPlayer(fakeWindow, {
      event: 'infoDelivery',
      info: { playerState: 1, currentTime: 0.4 },
    })
    act(() => {
      vi.advanceTimersByTime(8_000)
    })

    expect(onEnded).not.toHaveBeenCalled()
  })

  it('advances (onEnded) when infoDelivery reports playerState 0 (ended)', () => {
    const onEnded = vi.fn()
    const { container } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)

    postFromPlayer(fakeWindow, { event: 'infoDelivery', info: { playerState: 1 } })
    postFromPlayer(fakeWindow, { event: 'infoDelivery', info: { playerState: 0 } })

    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('does nothing without an onEnded callback (triage never auto-advances)', () => {
    // No onEnded passed at all — every internal advance path must be a
    // silent no-op, matching StageVideo's triage call sites.
    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)

    expect(() => {
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 0 })
      act(() => {
        vi.advanceTimersByTime(8_000)
      })
    }).not.toThrow()
  })

  it('honors theater-toggle-play by posting the pauseVideo/playVideo command', () => {
    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postMessage.mockClear()

    // Ready + playing.
    postFromPlayer(fakeWindow, { event: 'onReady' })
    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })
    postMessage.mockClear()

    dispatchWindowEvent(new CustomEvent('theater-toggle-play'))
    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(JSON.parse(postMessage.mock.calls[0][0])).toMatchObject({ func: 'pauseVideo' })

    postMessage.mockClear()
    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 2 })
    postMessage.mockClear()

    dispatchWindowEvent(new CustomEvent('theater-toggle-play'))
    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(JSON.parse(postMessage.mock.calls[0][0])).toMatchObject({ func: 'playVideo' })
  })

  it('honors explicit theater-pause/theater-resume commands', () => {
    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })
    postMessage.mockClear()

    dispatchWindowEvent(new CustomEvent('theater-pause'))
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toMatchObject({ func: 'pauseVideo' })

    postMessage.mockClear()
    dispatchWindowEvent(new CustomEvent('theater-resume'))
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toMatchObject({ func: 'playVideo' })
  })

  it('sends mute immediately, but defers unMute until a confirmed playing state, when the muted prop transitions', () => {
    const { container, rerender } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })
    postMessage.mockClear()

    // Toggling to unmuted before any confirmed playing state must NOT ask
    // the embed for sound yet — iOS rejects an unmuted request with no
    // in-iframe gesture and no `playing` confirmation.
    rerender(<StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />)
    expect(postMessage.mock.calls.map(([p]) => JSON.parse(p).func)).not.toContain('unMute')

    // Once the player confirms it's actually playing, the deferred request
    // fires.
    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toMatchObject({ func: 'unMute' })

    postMessage.mockClear()
    rerender(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toMatchObject({ func: 'mute' })
  })

  it('never asks for sound before a confirmed playing state, even when the shell is already unmuted before the handshake completes', () => {
    const { container } = render(
      <StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postMessage.mockClear()

    postFromPlayer(fakeWindow, { event: 'onReady' })

    const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    expect(funcs).not.toContain('unMute')
    expect(funcs).toContain('playVideo')
  })

  it('unmutes once a confirmed playing state arrives, when the shell was already unmuted before the handshake completed', () => {
    const { container } = render(
      <StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })
    postMessage.mockClear()

    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })

    const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    expect(funcs).toContain('unMute')
  })

  it('falls back to muted playback when an explicit pause follows the unMute request (iOS rejecting the unmuted resume)', () => {
    const mutedEvents: boolean[] = []
    const handler = (e: Event) => mutedEvents.push((e as CustomEvent).detail.muted)
    window.addEventListener('theater-muted-state', handler)

    const { container } = render(
      <StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })

    // Confirmed playing (muted) — the deferred unmute fires.
    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })
    expect(mutedEvents.at(-1)).toBe(false) // optimistic: we just asked for sound

    postMessage.mockClear()
    // iOS silently pauses instead of erroring when it rejects the unmuted
    // resume — the player reports state 2 with no user action involved.
    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 2 })

    const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    expect(funcs).toContain('mute')
    expect(funcs).toContain('playVideo')
    expect(mutedEvents.at(-1)).toBe(true)

    window.removeEventListener('theater-muted-state', handler)
  })

  it('falls back to muted playback if no further state signal follows the unMute request at all (silent stall)', () => {
    const { container } = render(
      <StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })
    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })
    postMessage.mockClear()

    act(() => {
      vi.advanceTimersByTime(1_500)
    })

    const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    expect(funcs).toContain('mute')
    expect(funcs).toContain('playVideo')
  })

  it('falls back to the poster/preview-link stage for an invalid video id', () => {
    const { container } = render(
      <StageYouTube
        item={makeItem({ bookmarkId: 'not-a-real-id' })}
        muted
        onRequestUnmute={vi.fn()}
      />,
    )
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('a[href]')).toBeTruthy()
  })

  // shared-post-repeat: while pinned, an ended state (0) is answered with a
  // seek-to-0-and-replay instead of ever calling onEnded — the embed's
  // stand-in for `<video loop>` on the raw postMessage protocol.
  it('repeat=true: replays via seekTo(0)+playVideo on ended instead of advancing', () => {
    const onEnded = vi.fn()
    const { container } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} repeat />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postMessage.mockClear()

    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 0 })

    expect(onEnded).not.toHaveBeenCalled()
    const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    expect(funcs).toContain('seekTo')
    expect(funcs).toContain('playVideo')
    const seekCall = postMessage.mock.calls.find(
      ([payload]) => JSON.parse(payload).func === 'seekTo',
    )
    expect(JSON.parse(seekCall![0]).args).toEqual([0, true])
  })

  it('repeat=true: onError still advances rather than looping on a broken video', () => {
    const onEnded = vi.fn()
    const { container } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} repeat />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)

    postFromPlayer(fakeWindow, { event: 'onError', info: 150 })

    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('repeat=true: the stall watchdog still advances a video that never starts', () => {
    const onEnded = vi.fn()
    render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} repeat />,
    )

    act(() => {
      vi.advanceTimersByTime(8_000)
    })

    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('repeat=false: an ended state advances as before (no seek command)', () => {
    const onEnded = vi.fn()
    const { container } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postMessage.mockClear()

    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 0 })

    expect(onEnded).toHaveBeenCalledTimes(1)
    const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    expect(funcs).not.toContain('seekTo')
  })

  it('ignores messages from an unrelated origin', () => {
    const onEnded = vi.fn()
    const { container } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)

    dispatchWindowEvent(
      new MessageEvent('message', {
        origin: 'https://evil.example.com',
        source: fakeWindow as unknown as MessageEventSource,
        data: JSON.stringify({ event: 'onStateChange', info: 0 }),
      }),
    )

    expect(onEnded).not.toHaveBeenCalled()
  })
})
