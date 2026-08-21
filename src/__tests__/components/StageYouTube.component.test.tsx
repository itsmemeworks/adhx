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

  it('sends unMute/mute commands when the muted prop transitions', () => {
    const { container, rerender } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })
    postMessage.mockClear()

    rerender(<StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />)
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toMatchObject({ func: 'unMute' })

    postMessage.mockClear()
    rerender(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toMatchObject({ func: 'mute' })
  })

  it('unMutes on ready when the shell was already unmuted before the handshake completed', () => {
    const { container } = render(
      <StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postMessage.mockClear()

    postFromPlayer(fakeWindow, { event: 'onReady' })

    const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    expect(funcs).toContain('unMute')
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
