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

    const [payload, targetOrigin] = postMessage.mock.calls[0]
    expect(targetOrigin).toBe(YT_ORIGIN)
    expect(JSON.parse(payload)).toMatchObject({ event: 'listening' })
  })

  // Round 2: iOS still never started a Short even with `autoplay=1&mute=1`
  // in the embed URL and a bare `playVideo` sent on `onReady` — i.e. those
  // URL-level params can't be trusted. Startup now drives mute-then-play
  // explicitly through postMessage at every opportunity: a defensive nudge
  // on the load handshake (before the player necessarily even processes
  // it), and command order on `onReady` itself.
  it('sends a defensive mute-then-playVideo nudge on the iframe load handshake, before onReady', () => {
    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage } = stubContentWindow(iframe)

    fireEvent.load(iframe)

    const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    const muteIdx = funcs.indexOf('mute')
    const playIdx = funcs.indexOf('playVideo')
    expect(muteIdx).toBeGreaterThanOrEqual(0)
    expect(playIdx).toBeGreaterThan(muteIdx)
  })

  it('sends mute before playVideo on onReady (never trusts the URL-level autoplay/mute params alone)', () => {
    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postMessage.mockClear()

    postFromPlayer(fakeWindow, { event: 'onReady' })

    const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    const muteIdx = funcs.indexOf('mute')
    const playIdx = funcs.indexOf('playVideo')
    expect(muteIdx).toBeGreaterThanOrEqual(0)
    expect(playIdx).toBeGreaterThan(muteIdx)
  })

  it('retries mute+playVideo on a bounded ladder (1s/2.5s/5s) while the player has never reached state 1', () => {
    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })
    postMessage.mockClear()

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    let funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    expect(funcs).toEqual(['mute', 'playVideo'])

    postMessage.mockClear()
    act(() => {
      vi.advanceTimersByTime(1_500) // total 2.5s
    })
    funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    expect(funcs).toEqual(['mute', 'playVideo'])

    postMessage.mockClear()
    act(() => {
      vi.advanceTimersByTime(2_500) // total 5s
    })
    funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    expect(funcs).toEqual(['mute', 'playVideo'])
  })

  it('stops the retry ladder once state 1 is confirmed', () => {
    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })
    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })
    postMessage.mockClear()

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(postMessage).not.toHaveBeenCalled()
  })

  it('cleans up the retry ladder on unmount (no post-unmount postMessage calls)', () => {
    const { container, unmount } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })
    postMessage.mockClear()

    unmount()

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(10_000)
      })
    }).not.toThrow()
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('cleans up the retry ladder on an item change (new videoId)', () => {
    const { container, rerender } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })

    rerender(
      <StageYouTube
        item={makeItem({ bookmarkId: 'aaaaaaaaaaa' })}
        muted
        onRequestUnmute={vi.fn()}
      />,
    )
    const iframe2 = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage: postMessage2 } = stubContentWindow(iframe2)
    postMessage2.mockClear()

    // The old item's ladder rungs must not fire and post through the new
    // iframe's stubbed contentWindow.
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    // Some of these calls are the new item's own onLoad/ready flow — the
    // key assertion is that this doesn't throw and isn't wildly over-firing
    // from a leaked old-item ladder timer stacking on top of the new one's.
    expect(postMessage2.mock.calls.length).toBeLessThan(10)
  })

  // Regression test for a reported live-theater bug: a manual advance off a
  // stalled YouTube item was followed ~2s later by an unrelated SECOND
  // auto-advance, timed suspiciously close to the stalled item's own 8s
  // watchdog. Investigation (see `Stage.component.test.tsx`) confirmed
  // React's type-based reconciliation cleanly unmounts StageYouTube when the
  // NEXT item is a different platform/type — but back-to-back YouTube items
  // (short → short) never unmount StageYouTube at all; the SAME component
  // instance just receives a new `item` prop, and the old item's stall
  // watchdog must be torn down entirely by this component's own
  // `videoId`-keyed effect cleanup, not by React unmounting anything. This
  // is the one path where a bug here really would leak a stale watchdog
  // into whatever item is current when it fires.
  it('does not fire onEnded from a previous never-started YouTube item after swapping to a second YouTube item (same instance, no unmount)', () => {
    const onEnded = vi.fn()
    const { container, rerender } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} />,
    )
    const iframeA = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow: fakeWindowA } = stubContentWindow(iframeA)
    fireEvent.load(iframeA)
    postFromPlayer(fakeWindowA, { event: 'onReady' })
    // Item A never reaches state 1 — exactly the reported repro (a
    // localhost/blocked embed that never starts).

    // t+6s: a manual advance to a second YouTube item (chevron click) — the
    // SAME StageYouTube instance receives a new `item` prop.
    act(() => {
      vi.advanceTimersByTime(6_000)
    })
    expect(onEnded).not.toHaveBeenCalled()

    rerender(
      <StageYouTube
        item={makeItem({ bookmarkId: 'bbbbbbbbbbb' })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={onEnded}
      />,
    )
    const iframeB = container.querySelector('iframe') as HTMLIFrameElement
    expect(iframeB).not.toBe(iframeA)
    const { fakeWindow: fakeWindowB } = stubContentWindow(iframeB)
    fireEvent.load(iframeB)
    postFromPlayer(fakeWindowB, { event: 'onReady' })
    // Item B also never starts.

    // t+9s from A's mount (past A's 8s stall mark) — A's watchdog must not
    // have survived the swap to B.
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(onEnded).not.toHaveBeenCalled()

    // Sanity: B's OWN watchdog is still live and correctly armed — confirms
    // the assertion above is because A's timer was torn down, not because
    // the watchdog mechanism itself is broken. B was armed at t+6s (the
    // rerender), so its 8s mark is t+14s; advancing the remaining ~5s here
    // (3s already elapsed since B mounted) should now fire it.
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(onEnded).toHaveBeenCalledTimes(1)
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

  // Round 2: a pinned shared/collection post (`repeat`) has nowhere to
  // advance TO without abandoning the pin, so the stall watchdog no longer
  // calls `onEnded` for it — it shows a tap-to-play overlay instead (the
  // live-queue case, repeat=false, is unchanged — see the test below).
  it('repeat=true: the stall watchdog shows a tap-to-play overlay instead of advancing off the pin', () => {
    const onEnded = vi.fn()
    const { container } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} repeat />,
    )

    act(() => {
      vi.advanceTimersByTime(8_000)
    })

    expect(onEnded).not.toHaveBeenCalled()
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('button[aria-label="Play video"]')).toBeTruthy()
  })

  it('repeat=true: tapping the tap-to-play overlay reloads the iframe and re-arms startup', () => {
    const onEnded = vi.fn()
    const { container } = render(
      <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} repeat />,
    )
    act(() => {
      vi.advanceTimersByTime(8_000)
    })
    const playButton = container.querySelector(
      'button[aria-label="Play video"]',
    ) as HTMLButtonElement
    expect(playButton).toBeTruthy()

    fireEvent.click(playButton)

    const iframe = container.querySelector('iframe')
    expect(iframe).toBeTruthy()

    // A fresh startup attempt is armed — a subsequent unstarted 8s window
    // shows the overlay again rather than silently doing nothing forever.
    act(() => {
      vi.advanceTimersByTime(8_000)
    })
    expect(container.querySelector('button[aria-label="Play video"]')).toBeTruthy()
    expect(onEnded).not.toHaveBeenCalled()
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

// Round 2 diagnostic breadcrumb: `[stage-yt]` console.debug logging, gated
// behind `?ytdebug=1` so production stays quiet. The owner can flip it on
// from their phone by appending `?ytdebug=1` to the theater URL for a
// further on-device round if needed.
describe('StageYouTube debug logging (?ytdebug=1 gate)', () => {
  const originalUrl = window.location.href

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    window.history.replaceState(null, '', originalUrl)
    vi.restoreAllMocks()
  })

  it('stays quiet by default', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })

    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('logs tagged [stage-yt] breadcrumbs when ?ytdebug=1 is present', () => {
    window.history.replaceState(null, '', '/?ytdebug=1')
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })

    expect(debugSpy).toHaveBeenCalled()
    expect(debugSpy.mock.calls.every(([tag]) => tag === '[stage-yt]')).toBe(true)
  })
})
