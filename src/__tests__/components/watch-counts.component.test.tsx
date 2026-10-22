/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useWatchCounts, WATCHED_FLUSH_MS } from '@/components/next/theater/useWatchCounts'

const ok = (status = 204) => ({ ok: status < 300, status }) as Response
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})
afterEach(async () => {
  cleanup()
  await act(async () => {
    await Promise.resolve()
  })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllTimers()
  vi.useRealTimers()
})
const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
/** The stage playing its video from `from` to `to` seconds. */
const play = (from: number, to: number, duration: number) =>
  act(() => {
    for (let s = from; s <= to; s += 0.25)
      window.dispatchEvent(
        new CustomEvent('theater-video-progress', { detail: { progress: s / duration, duration } }),
      )
  })
const ended = () => act(() => window.dispatchEvent(new CustomEvent('theater-video-ended')))
const sent = (fetcher: { mock: { calls: Parameters<typeof fetch>[] } }, call = 0) =>
  JSON.parse(String(fetcher.mock.calls[call]?.[1]?.body)).posts

it('counts plays, finishes and seconds of the video on stage and sends them', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => ok())
  vi.stubGlobal('fetch', fetcher)
  renderHook(() => useWatchCounts(true, 'ana', 'twitter:clip', true))
  play(0, 10, 10)
  ended()
  play(0, 4, 10)
  await tick(WATCHED_FLUSH_MS)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/watched')
  expect(sent(fetcher)).toEqual([
    { platform: 'twitter', id: 'clip', plays: 2, finishes: 1, seconds: 14 },
  ])
})

it('counts nothing for a post that isn’t a video, or for someone signed out', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => ok())
  vi.stubGlobal('fetch', fetcher)
  const photo = renderHook(() => useWatchCounts(true, 'ana', 'twitter:photo', false))
  play(0, 5, 10)
  photo.unmount()
  renderHook(() => useWatchCounts(false, undefined, 'twitter:clip', true))
  play(0, 5, 10)
  await tick(WATCHED_FLUSH_MS * 2)
  expect(fetcher).not.toHaveBeenCalled()
})

it('keeps a batch that didn’t get through, across a reload, for its own account only', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => ok(503))
  vi.stubGlobal('fetch', fetcher)
  const hook = renderHook(
    ({ accountId }) => useWatchCounts(true, accountId, 'twitter:clip', true),
    {
      initialProps: { accountId: 'ana' },
    },
  )
  play(0, 6, 30)
  await tick(WATCHED_FLUSH_MS)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(JSON.parse(localStorage.getItem('adhx-watched-outbox:ana')!)['twitter:clip'].plays).toBe(1)
  // Ben signs in on this browser: Ana's counts wait for her.
  hook.rerender({ accountId: 'ben' })
  fetcher.mockResolvedValue(ok())
  await tick(WATCHED_FLUSH_MS * 4)
  expect(fetcher).toHaveBeenCalledTimes(1)
  hook.unmount()
  renderHook(() => useWatchCounts(true, 'ana', 'twitter:other', true))
  await tick(WATCHED_FLUSH_MS)
  expect(sent(fetcher, 1)).toEqual([
    { platform: 'twitter', id: 'clip', plays: 1, finishes: 0, seconds: 6 },
  ])
  expect(localStorage.getItem('adhx-watched-outbox:ana')).toBeNull()
})
