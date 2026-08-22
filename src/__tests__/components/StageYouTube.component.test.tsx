/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { StageYouTube } from '@/components/theater/StageYouTube'
import { resetYtDebugLines, YtDebugOverlay } from '@/components/theater/YtDebugOverlay'
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

  it('stops the mute/playVideo retry ladder once state 1 is confirmed (round 8: the progress-starvation poll is a separate, unrelated mechanism)', () => {
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

    // No more startup-retry-ladder mute/playVideo commands once state 1 has
    // confirmed the player actually started.
    const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    expect(funcs).not.toContain('mute')
    expect(funcs).not.toContain('playVideo')
    // Round 8: the progress-starvation poll DOES fire `listening` handshakes
    // here — this test never sends a currentTime-bearing payload, so every
    // post-state-1 poll tick (every 750ms, once >1500ms since the last
    // time signal) re-asks for an `initialDelivery`. That's the intended
    // behavior this round adds, not a regression of this test's original
    // intent (which was only ever about the mute/playVideo ladder above).
    const events = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).event)
    expect(events.every((e) => e === 'listening')).toBe(true)
    expect(events.length).toBeGreaterThan(0)
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

  // Gesture-unmute fix: the chrome's audio button now ALSO dispatches this
  // synchronous window event (alongside the `muted` prop update above, which
  // is the async/persistence path). For this postMessage-based cross-origin
  // player it maps onto the SAME `requestUnmute`/`mute` command path and gate
  // — postMessage isn't restricted by WebKit's same-call-stack rule the way
  // StageVideo's `video.muted` is, but routing through one shared listener
  // keeps every stage on the same contract.
  it('theater-set-muted maps onto the same requestUnmute/mute command path as the muted prop', () => {
    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })
    postMessage.mockClear()

    // Unmute request before a confirmed playing state defers, exactly like
    // the `muted` prop transition.
    dispatchWindowEvent(new CustomEvent('theater-set-muted', { detail: { muted: false } }))
    expect(postMessage.mock.calls.map(([p]) => JSON.parse(p).func)).not.toContain('unMute')

    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })
    expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toMatchObject({ func: 'unMute' })

    postMessage.mockClear()
    dispatchWindowEvent(new CustomEvent('theater-set-muted', { detail: { muted: true } }))
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

  // Round 4: the owner reproduced the unmute→remute loop on DESKTOP too,
  // where iOS's cross-origin-gesture policy doesn't even apply — proving a
  // silent "no signal yet" timer was never a reliable rejection signal for
  // EITHER path, not just the user-gesture one. The catch-up path (item
  // mounts already-unmuted, via the `muted={false}` initial prop — never a
  // prop transition) is now ALSO trusted through silence; see the round-3
  // block below for the identical guarantee on the user-gesture path.
  it('does not fall back to muted if no further state signal follows a catch-up unmute at all (round 4: no timer for either path)', () => {
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
      vi.advanceTimersByTime(10_000)
    })

    const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    expect(funcs).not.toContain('mute')
  })

  it('still falls back to muted if a catch-up unmute is followed by an OBSERVED pause (state 2)', () => {
    const { container } = render(
      <StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { postMessage, fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })
    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })
    postMessage.mockClear()

    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 2 })

    const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
    expect(funcs).toContain('mute')
    expect(funcs).toContain('playVideo')
  })

  // Round 3: owner on-device report — tapping the audio button unmuted the
  // Short, then it re-muted itself ~1.5s later, repeatedly. Root cause: a
  // SUCCESSFUL unmute normally produces NO further state signal at all (the
  // player just keeps playing) — the old code treated that silence as
  // failure. Fix: a USER-GESTURE unmute (the `muted` prop transitioning to
  // false, i.e. the audio-button tap) is trusted outright — no time-based
  // fallback armed for it at all. Only the automatic catch-up unmute (item
  // mounts already-unmuted) still arms one (tested above).
  describe('round 3: user-gesture unmute is trusted (not re-muted by silence)', () => {
    it('does not auto-remute a user-gesture unmute even when no further signal ever arrives', () => {
      const { container, rerender } = render(
        <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { postMessage, fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)
      postFromPlayer(fakeWindow, { event: 'onReady' })
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 }) // confirmed playing, muted
      postMessage.mockClear()

      // The audio-button tap: shell flips `muted` false.
      rerender(<StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />)
      expect(JSON.parse(postMessage.mock.calls.at(-1)![0])).toMatchObject({ func: 'unMute' })

      postMessage.mockClear()
      // No further state signal ever arrives — exactly what a SUCCESSFUL
      // unmute looks like. Advance well past the old 1.5s settle window.
      act(() => {
        vi.advanceTimersByTime(10_000)
      })

      const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
      expect(funcs).not.toContain('mute')
    })

    it('still falls back to muted if a user-gesture unmute is followed by an OBSERVED pause (state 2)', () => {
      const { container, rerender } = render(
        <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { postMessage, fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)
      postFromPlayer(fakeWindow, { event: 'onReady' })
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })

      rerender(<StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />)
      postMessage.mockClear()

      // A real, observed pause with no user action — genuine evidence of
      // rejection, unlike mere silence.
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 2 })

      const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
      expect(funcs).toContain('mute')
      expect(funcs).toContain('playVideo')
    })

    it('treats infoDelivery muted:false as immediate confirmation for the catch-up path', () => {
      const { container } = render(
        <StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { postMessage, fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)
      postFromPlayer(fakeWindow, { event: 'onReady' })
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 }) // deferred catch-up unmute fires
      postMessage.mockClear()

      postFromPlayer(fakeWindow, { event: 'infoDelivery', info: { playerState: 1, muted: false } })

      act(() => {
        vi.advanceTimersByTime(10_000)
      })

      const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
      expect(funcs).not.toContain('mute')
    })

    // Round 4 originally treated the `muted:false` confirmation itself as
    // enough to protect against a later, unrelated pause. Round 7's
    // on-device trace overturned that FOR THE CATCH-UP PATH specifically:
    // iOS's real enforcement pattern is confirm-then-pause — `infoDelivery`
    // reports `muted:false`, then a pause follows within about a second,
    // and that pause IS the rejection, not something unrelated. A `user`
    // gesture still isn't policed this way (see the top of this describe
    // block) — this test (`muted={false}` from mount, so onReady's `if
    // (!mutedRef.current) requestUnmute('catchup')` branch fires) is
    // specifically the catch-up path.
    it('DOES fall back on a pause shortly after a catch-up confirmation, absent sustained playback evidence (round 7: iOS confirm-then-pause)', () => {
      const mutedEvents: boolean[] = []
      const handler = (e: Event) =>
        mutedEvents.push((e as CustomEvent<{ muted: boolean }>).detail.muted)
      window.addEventListener('theater-muted-state', handler)

      try {
        const { container } = render(
          <StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />,
        )
        const iframe = container.querySelector('iframe') as HTMLIFrameElement
        const { postMessage, fakeWindow } = stubContentWindow(iframe)
        fireEvent.load(iframe)
        postFromPlayer(fakeWindow, { event: 'onReady' })
        postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 }) // deferred catch-up unmute fires
        postFromPlayer(fakeWindow, {
          event: 'infoDelivery',
          info: { playerState: 1, muted: false },
        })
        postMessage.mockClear()

        // The exact device-trace shape: the pause follows the confirmation
        // with no intervening sustained-progress evidence.
        postFromPlayer(fakeWindow, { event: 'onStateChange', info: 2 })

        const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
        expect(funcs).toContain('mute')
        expect(funcs).toContain('playVideo')
        // effectiveMuted reflects the fallback, not the earlier (real, but
        // ultimately policed) confirmation.
        expect(mutedEvents.at(-1)).toBe(true)
      } finally {
        window.removeEventListener('theater-muted-state', handler)
      }
    })

    it('does NOT fall back on a later pause once sustained currentTime progress has cleared the catch-up attribution', () => {
      const { container } = render(
        <StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { postMessage, fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)
      postFromPlayer(fakeWindow, { event: 'onReady' })
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 }) // deferred catch-up unmute fires, baseline currentTime=0
      postFromPlayer(fakeWindow, { event: 'infoDelivery', info: { playerState: 1, muted: false } })

      // Sustained evidence: currentTime has advanced well past the >1.5s
      // threshold from the (defaulted-to-0) baseline, while still playing.
      postFromPlayer(fakeWindow, {
        event: 'infoDelivery',
        info: { playerState: 1, currentTime: 3, duration: 30 },
      })
      postMessage.mockClear()

      // Now a later pause really is unrelated (e.g. the user's own pause
      // button, or buffering) — round 4's original protective intent, just
      // gated on real evidence instead of an unconditional confirmation.
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 2 })

      const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
      expect(funcs).not.toContain('mute')
    })

    // Closes a second instance of the same premature-clear bug class: state 1
    // (`applyPlayerState`'s OWN "kept playing, it took" branch) used to clear
    // `unmuteAwaitingConfirmRef` unconditionally, exactly like the
    // `muted:false` confirmation did. A stray state-1 heartbeat landing
    // between the catch-up unmute and iOS's enforcement pause is no more
    // trustworthy than the confirmation is for that path.
    it('a bare state-1 heartbeat does not clear catch-up attribution either — still falls back without sustained progress', () => {
      const { container } = render(
        <StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { postMessage, fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)
      postFromPlayer(fakeWindow, { event: 'onReady' })
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 }) // deferred catch-up unmute fires
      postFromPlayer(fakeWindow, { event: 'infoDelivery', info: { playerState: 1, muted: false } })
      // A redundant state-1 heartbeat, no currentTime attached — must not be
      // treated as proof either.
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })
      postMessage.mockClear()

      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 2 })

      const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
      expect(funcs).toContain('mute')
    })

    it('treats infoDelivery volume>0 as immediate confirmation when no muted field is present', () => {
      const { container } = render(
        <StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { postMessage, fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)
      postFromPlayer(fakeWindow, { event: 'onReady' })
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })
      postMessage.mockClear()

      postFromPlayer(fakeWindow, { event: 'infoDelivery', info: { playerState: 1, volume: 100 } })

      act(() => {
        vi.advanceTimersByTime(1_500)
      })

      const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
      expect(funcs).not.toContain('mute')
    })

    it('resets cleanly on rapid repeated taps — the final unmute is still trusted through silence', () => {
      const { container, rerender } = render(
        <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { postMessage, fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)
      postFromPlayer(fakeWindow, { event: 'onReady' })
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })

      // Unmute, mute, unmute again in quick succession (repeated taps).
      rerender(<StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />)
      rerender(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
      rerender(<StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />)

      postMessage.mockClear()
      // No further signal at all — the final state is "unmuted", and
      // silence must not revert it.
      act(() => {
        vi.advanceTimersByTime(10_000)
      })

      const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
      expect(funcs).not.toContain('mute')
    })
  })

  // Round 6: owner on-device report — the audio icon needed TWO presses to
  // unmute a fresh YouTube item. Root cause: `infoDelivery` streams so
  // frequently that a heartbeat reflecting the state from BEFORE our
  // `unMute` command routinely arrives right after we send it — the old
  // code trusted every heartbeat's `muted` field unconditionally, so that
  // stale `muted:true` echo flipped `effectiveMuted` (and the broadcast
  // `theater-muted-state` the chrome's icon reads) back to muted for one
  // render, reading as the tap having failed.
  describe('round 6: a stale infoDelivery muted echo does not undo a fresh command', () => {
    it('ignores a muted:true heartbeat that contradicts a just-sent unMute (ignores the stale echo entirely)', () => {
      const mutedEvents: boolean[] = []
      const handler = (e: Event) => mutedEvents.push((e as CustomEvent).detail.muted)
      window.addEventListener('theater-muted-state', handler)

      const { container, rerender } = render(
        <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)
      postFromPlayer(fakeWindow, { event: 'onReady' })
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })

      // The audio-button tap: shell flips `muted` false -> unMute sent,
      // effectiveMuted optimistically flips false.
      rerender(<StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />)
      expect(mutedEvents.at(-1)).toBe(false)

      // A heartbeat that was queued by the player BEFORE it processed our
      // unMute command — still reports the pre-command muted:true state.
      postFromPlayer(fakeWindow, { event: 'infoDelivery', info: { playerState: 1, muted: true } })

      // Must NOT flip back to muted — that flicker is exactly what read as
      // "the tap didn't work" on-device.
      expect(mutedEvents.at(-1)).toBe(false)

      // The real confirmation, once it lands, is trusted normally.
      postFromPlayer(fakeWindow, { event: 'infoDelivery', info: { playerState: 1, muted: false } })
      expect(mutedEvents.at(-1)).toBe(false)

      window.removeEventListener('theater-muted-state', handler)
    })

    it('ignores a muted:false heartbeat that contradicts a just-sent mute command', () => {
      const mutedEvents: boolean[] = []
      const handler = (e: Event) => mutedEvents.push((e as CustomEvent).detail.muted)
      window.addEventListener('theater-muted-state', handler)

      const { container, rerender } = render(
        <StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)
      postFromPlayer(fakeWindow, { event: 'onReady' })
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })
      expect(mutedEvents.at(-1)).toBe(false)

      // User re-mutes: shell flips `muted` true -> mute sent, effectiveMuted
      // flips true immediately (muting is always trusted immediately).
      rerender(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
      expect(mutedEvents.at(-1)).toBe(true)

      // A stale heartbeat still reporting the pre-command unmuted state.
      postFromPlayer(fakeWindow, { event: 'infoDelivery', info: { playerState: 1, muted: false } })

      expect(mutedEvents.at(-1)).toBe(true)

      window.removeEventListener('theater-muted-state', handler)
    })

    it('still accepts a real observed pause as rejection evidence even with the new guard in place', () => {
      const { container, rerender } = render(
        <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { postMessage, fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)
      postFromPlayer(fakeWindow, { event: 'onReady' })
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })

      rerender(<StageYouTube item={makeItem()} muted={false} onRequestUnmute={vi.fn()} />)
      postMessage.mockClear()

      // A genuine observed pause (state 2) — real rejection evidence,
      // unaffected by the stale-echo guard (which only gates the `muted`
      // field on infoDelivery, not onStateChange).
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 2 })

      const funcs = postMessage.mock.calls.map(([payload]) => JSON.parse(payload).func)
      expect(funcs).toContain('mute')
      expect(funcs).toContain('playVideo')
    })
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

  // Round 5: drive the shared clay progress bar from infoDelivery's
  // currentTime/duration, via the SAME `theater-video-progress` window
  // event + `{ progress }` detail shape StageVideo dispatches on
  // timeupdate — TheaterProgressLine's 'video'-kind listener can't tell the
  // two apart.
  describe('round 5: progress bar (theater-video-progress from infoDelivery)', () => {
    function captureProgressEvents() {
      const progress: number[] = []
      const handler = (e: Event) =>
        progress.push((e as CustomEvent<{ progress: number }>).detail.progress)
      window.addEventListener('theater-video-progress', handler)
      return {
        progress,
        stop: () => window.removeEventListener('theater-video-progress', handler),
      }
    }

    it('dispatches theater-video-progress with currentTime/duration from infoDelivery', () => {
      const { progress, stop } = captureProgressEvents()
      const { container } = render(
        <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)

      postFromPlayer(fakeWindow, {
        event: 'infoDelivery',
        info: { playerState: 1, currentTime: 5, duration: 20 },
      })

      expect(progress).toEqual([0.25])
      stop()
    })

    it('does not dispatch when duration is missing', () => {
      const { progress, stop } = captureProgressEvents()
      const { container } = render(
        <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)

      postFromPlayer(fakeWindow, {
        event: 'infoDelivery',
        info: { playerState: 1, currentTime: 5 },
      })

      expect(progress).toEqual([])
      stop()
    })

    it('does not dispatch when duration is 0 (guards a divide-by-zero)', () => {
      const { progress, stop } = captureProgressEvents()
      const { container } = render(
        <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)

      postFromPlayer(fakeWindow, {
        event: 'infoDelivery',
        info: { playerState: 1, currentTime: 0, duration: 0 },
      })

      expect(progress).toEqual([])
      stop()
    })

    it('dispatches progress:1 on ended (state 0), mirroring StageVideo', () => {
      const { progress, stop } = captureProgressEvents()
      const { container } = render(
        <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)

      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 0 })

      expect(progress).toEqual([1])
      stop()
    })

    it('keeps working alongside existing playerState/mute handling in the same payload', () => {
      const onEnded = vi.fn()
      const { progress, stop } = captureProgressEvents()
      const { container } = render(
        <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)

      // A single payload carrying playerState, muted, AND currentTime/duration
      // — the stall watchdog should disarm (playerState) and the bar should
      // fill (currentTime/duration), from the very same message.
      postFromPlayer(fakeWindow, {
        event: 'infoDelivery',
        info: { playerState: 1, muted: true, currentTime: 10, duration: 20 },
      })

      expect(progress).toEqual([0.5])
      act(() => {
        vi.advanceTimersByTime(8_000)
      })
      expect(onEnded).not.toHaveBeenCalled() // stall watchdog correctly disarmed
      stop()
    })
  })

  // Round 8 (owner on-device report: the clay progress bar never fills on
  // plain autoplay on iOS — only after an in-iframe gesture wakes YouTube's
  // own progress reporter). `initialDelivery` is the player's snapshot
  // answer to a `listening` handshake and is parsed through the exact same
  // handler as `infoDelivery`; a starvation poll re-sends that handshake
  // while confirmed-playing and no currentTime-bearing payload has arrived
  // recently, but stays silent when heartbeats already flow normally.
  describe('round 8: initialDelivery parsing + progress-starvation poll', () => {
    function captureProgressEvents() {
      const progress: number[] = []
      const handler = (e: Event) =>
        progress.push((e as CustomEvent<{ progress: number }>).detail.progress)
      window.addEventListener('theater-video-progress', handler)
      return {
        progress,
        stop: () => window.removeEventListener('theater-video-progress', handler),
      }
    }

    it('parses an initialDelivery payload exactly like infoDelivery, dispatching theater-video-progress', () => {
      const { progress, stop } = captureProgressEvents()
      const { container } = render(
        <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)

      postFromPlayer(fakeWindow, {
        event: 'initialDelivery',
        info: { playerState: 1, currentTime: 5, duration: 20 },
      })

      expect(progress).toEqual([0.25])
      stop()
    })

    it('re-sends the listening handshake once starved (state 1 confirmed, no currentTime for >1.5s)', () => {
      const { container } = render(
        <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { postMessage, fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)
      postFromPlayer(fakeWindow, { event: 'onReady' })
      // Confirm state 1 WITHOUT any currentTime — this is the iOS-starved
      // case the poll exists for.
      postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })
      postMessage.mockClear()

      // Under the 1.5s starvation window (first poll tick, at 750ms) — no
      // poll message yet.
      act(() => {
        vi.advanceTimersByTime(1_000)
      })
      expect(postMessage).not.toHaveBeenCalled()

      // The next poll tick lands at 1500ms (still <= the starvation window,
      // a no-op); the one after that, at 2250ms, is the first to actually
      // exceed 1500ms since the last time signal and fires the handshake.
      act(() => {
        vi.advanceTimersByTime(1_300)
      })
      const calls = postMessage.mock.calls.map(([payload]) => JSON.parse(payload))
      expect(calls.some((c) => c.event === 'listening')).toBe(true)
    })

    it('never sends an extra listening handshake while currentTime heartbeats keep arriving', () => {
      const { container } = render(
        <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />,
      )
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      const { postMessage, fakeWindow } = stubContentWindow(iframe)
      fireEvent.load(iframe)
      postFromPlayer(fakeWindow, { event: 'onReady' })
      postFromPlayer(fakeWindow, {
        event: 'infoDelivery',
        info: { playerState: 1, currentTime: 0, duration: 20 },
      })
      postMessage.mockClear()

      // Send a fresh currentTime-bearing heartbeat every 1s (well under the
      // 1.5s starvation window) for 6s of poll ticks.
      for (let t = 1; t <= 6; t++) {
        act(() => {
          vi.advanceTimersByTime(1_000)
        })
        postFromPlayer(fakeWindow, {
          event: 'infoDelivery',
          info: { playerState: 1, currentTime: t, duration: 20 },
        })
      }

      const calls = postMessage.mock.calls.map(([payload]) => JSON.parse(payload))
      expect(calls.some((c) => c.event === 'listening')).toBe(false)
    })
  })
})

// Round 2 diagnostic breadcrumb: `[yt]` console.debug logging, gated behind
// `?ytdebug=1` (or the widened `?avdebug=1`) so production stays quiet. The
// owner can flip it on from their phone by appending `?ytdebug=1` to the
// theater URL for a further on-device round if needed. `<YtDebugOverlay/>` is
// no longer mounted inside StageYouTube itself (gesture-unmute round: moved
// to TheaterShell so ONE overlay serves every stage) — it's rendered as a
// sibling here, matching the real render tree.
describe('StageYouTube debug logging (?ytdebug=1 gate)', () => {
  const originalUrl = window.location.href

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    window.history.replaceState(null, '', originalUrl)
    vi.restoreAllMocks()
    resetYtDebugLines()
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

  it('logs tagged [yt] breadcrumbs when ?ytdebug=1 is present', () => {
    window.history.replaceState(null, '', '/?ytdebug=1')
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })

    expect(debugSpy).toHaveBeenCalled()
    expect(debugSpy.mock.calls.every(([tag]) => tag === '[yt]')).toBe(true)
  })

  // Widened gate: the alternate `?avdebug=1` param name (shared with
  // StageVideo/the chrome's audio button now) must also enable YouTube's
  // breadcrumbs.
  it('also logs when ?avdebug=1 is present instead of ?ytdebug=1', () => {
    window.history.replaceState(null, '', '/?avdebug=1')
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    const { container } = render(<StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />)
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })

    expect(debugSpy).toHaveBeenCalled()
  })

  // Round 6: the same breadcrumbs also render on-screen (no Mac tether
  // needed to read iOS Safari's console) — verifies the actual protocol run
  // surfaces its key moments in `<YtDebugOverlay/>`, not just `console.debug`.
  // The overlay is rendered as a sibling (TheaterShell mounts it once,
  // outside StageYouTube — see the describe block's own note above).
  it('surfaces the on-screen overlay with curated protocol moments, not the raw per-message noise', () => {
    window.history.replaceState(null, '', '/?ytdebug=1')

    const { container } = render(
      <>
        <StageYouTube item={makeItem()} muted onRequestUnmute={vi.fn()} />
        <YtDebugOverlay />
      </>,
    )
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })
    postFromPlayer(fakeWindow, { event: 'onStateChange', info: 1 })

    // The curated moments show up on-screen...
    expect(container.textContent).toContain('iframe onLoad')
    expect(container.textContent).toContain('onReady -> mute, playVideo')
    expect(container.textContent).toContain('state -> playing (1)')

    // ...but the raw per-message entry log (fired for every inbound
    // postMessage, including this one) does not — it's console-only.
    expect(container.textContent).not.toContain('onStateChange')
  })
})
