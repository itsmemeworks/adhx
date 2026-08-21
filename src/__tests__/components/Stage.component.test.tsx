/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { Stage } from '@/components/theater/Stage'
import type { TheaterItem } from '@/components/theater/types'

/**
 * Regression coverage for a reported live-theater bug: the tester manually
 * advanced OFF a stalled (never-started) YouTube Short at ~t+6s, and ~2s
 * later — right at the Short's own 8s stall-watchdog mark — the theater
 * auto-advanced AGAIN off the item the user had just navigated to, with no
 * input. The suspected mechanism: StageYouTube's stall-watchdog `setTimeout`
 * surviving the manual navigation and firing into whatever item is current
 * by the time it goes off.
 *
 * `Stage` is the actual production mechanism that's supposed to prevent
 * this: a manual advance changes `item.platform`/type, which changes which
 * child component `Stage` returns, which is a different React element type
 * at the same tree position — React unmounts the old subtree (running
 * StageYouTube's cleanup, clearing its timers) before mounting the new one.
 * These tests exercise that path through `Stage` itself (not StageYouTube in
 * isolation), because the isolation-level unmount/id-change tests already
 * added in round 2 don't cover the parent-driven type-swap path that's
 * actually at play here.
 */

const YT_ORIGIN = 'https://www.youtube-nocookie.com'

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

function youtubeItem(): TheaterItem {
  return {
    action: 'save',
    platform: 'youtube',
    bookmarkId: 'dQw4w9WgXcQ',
    author: 'someone',
    url: '/shorts/dQw4w9WgXcQ',
    createdAt: '2026-08-20T00:00:00Z',
  } as TheaterItem
}

/** A plain twitter text tweet — no thumbnail, no contentType — resolves to
 * `inferType() === 'text'`, so `Stage` renders `StageText` (no network
 * fetch, unlike `StageArticle`, keeping this test simple). */
function textItem(): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '999',
    author: 'someone-else',
    url: '/someone-else/status/999',
    text: 'just a plain tweet',
    createdAt: '2026-08-20T00:01:00Z',
  } as TheaterItem
}

describe('Stage: manual advance off a stalled YouTube item must not double-advance', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not fire onEnded from the old YouTube stall watchdog after manually advancing to a different item type', () => {
    const onEnded = vi.fn()

    const { container, rerender } = render(
      <Stage item={youtubeItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} />,
    )

    // The YouTube Short loads but never starts (localhost/blocked embed —
    // exactly the reported repro conditions).
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    expect(iframe).toBeTruthy()
    const { fakeWindow } = stubContentWindow(iframe)
    fireEvent.load(iframe)
    postFromPlayer(fakeWindow, { event: 'onReady' })

    // t+6s: the user manually advances (chevron) to a different item type —
    // simulated here exactly as TheaterShell does it: the SAME `onEnded`
    // callback identity is irrelevant to a manual nav (it doesn't go
    // through `onEnded` at all), only the `item` prop changes.
    act(() => {
      vi.advanceTimersByTime(6_000)
    })
    expect(onEnded).not.toHaveBeenCalled()

    rerender(<Stage item={textItem()} muted onRequestUnmute={vi.fn()} onEnded={onEnded} />)

    // StageYouTube's iframe must be gone — confirms the unmount actually
    // happened (not just a prop update on a surviving instance).
    expect(container.querySelector('iframe')).toBeNull()

    // t+9s from the YouTube item's mount (past its 8s stall watchdog) — the
    // watchdog must NOT have survived into the new item.
    act(() => {
      vi.advanceTimersByTime(3_000)
    })

    expect(onEnded).not.toHaveBeenCalled()
  })
})
