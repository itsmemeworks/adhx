// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  useMoments,
  useMomentStream,
  useMoment,
  type MomentsSnapshot,
  type MomentDetail,
} from '@/components/next/moments/live'
import type { MomentEvent } from '@/lib/moments/engine'

class FakeSource {
  static all: FakeSource[] = []
  listeners = new Map<string, EventListener>()
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()
  constructor(readonly url: string) {
    FakeSource.all.push(this)
  }
  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, listener)
  }
  emit(event: MomentEvent) {
    this.listeners.get(event.type)?.({ data: JSON.stringify(event) } as unknown as Event)
  }
}
const snapshot = (today: number): MomentsSnapshot => ({
  label: 'Right now',
  hours: 24,
  moments: [],
  forming: [],
  stream: [],
  stats: { today, lastHour: today },
})
const answer = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response
beforeEach(() => {
  FakeSource.all = []
  vi.stubGlobal('EventSource', FakeSource)
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})

it('resynchronises on each open and drops background/late old-stream events', () => {
  const event = vi.fn(),
    ready = vi.fn()
  const { result, unmount } = renderHook(() => useMomentStream(event, 'frogs', true, ready))
  const first = FakeSource.all[0]
  expect(first.url).toContain('watch=frogs')
  act(() => first.onopen?.())
  expect(result.current).toBe(true)
  act(() => {
    first.onerror?.()
    first.onopen?.()
  })
  expect(ready).toHaveBeenCalledTimes(2)
  act(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(first.close).toHaveBeenCalledTimes(1)
  expect(result.current).toBe(false)
  act(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(FakeSource.all).toHaveLength(2)
  act(() => first.emit({ type: 'stats', stats: { today: 1, lastHour: 1 } }))
  expect(event).not.toHaveBeenCalled()
  unmount()
  expect(FakeSource.all[1].close).toHaveBeenCalledTimes(1)
})

it('reconciles reconnects while preserving events received during the snapshot request', async () => {
  let resolve!: (r: Response) => void
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(answer(snapshot(1)))
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    .mockResolvedValue(answer(snapshot(5)))
  vi.stubGlobal('fetch', fetcher)
  const { result } = renderHook(useMoments)
  await waitFor(() => expect(result.current.snapshot?.stats.today).toBe(1))
  act(() => FakeSource.all[0].onopen?.())
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  act(() => FakeSource.all[0].emit({ type: 'stats', stats: { today: 3, lastHour: 3 } }))
  await act(async () => resolve(answer(snapshot(2))))
  expect(result.current.snapshot?.stats.today).toBe(3)
  act(() => {
    FakeSource.all[0].onerror?.()
    FakeSource.all[0].onopen?.()
  })
  await waitFor(() => expect(result.current.snapshot?.stats.today).toBe(5))
})

it('retries a failed initial snapshot and cancels retry work on unmount', async () => {
  vi.useFakeTimers()
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(answer(snapshot(7)))
  vi.stubGlobal('fetch', fetcher)
  const { result, unmount } = renderHook(useMoments)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
  })
  expect(result.current.snapshot?.stats.today).toBe(7)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('bounds a startup event backlog and requests a new authoritative snapshot on overflow', async () => {
  let resolve!: (r: Response) => void
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    .mockResolvedValue(answer(snapshot(777)))
  vi.stubGlobal('fetch', fetcher)
  const { result } = renderHook(useMoments)
  act(() => {
    for (let i = 0; i < 300; i++)
      FakeSource.all[0].emit({ type: 'stats', stats: { today: i, lastHour: i } })
  })
  await act(async () => resolve(answer(snapshot(0))))
  await waitFor(() => expect(result.current.snapshot?.stats.today).toBe(777))
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('replays detail updates over a reconnect response without duplicating or recounting its save', async () => {
  const detail = {
    moment: { slug: 'frogs', watching: 0 },
    items: [],
    watchers: [],
    bars: [0],
  } as unknown as MomentDetail
  let resolve!: (r: Response) => void
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(answer(detail))
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
  vi.stubGlobal('fetch', fetcher)
  const { result } = renderHook(() => useMoment('frogs'))
  await waitFor(() => expect(result.current.detail).not.toBeNull())
  act(() => FakeSource.all[0].onopen?.())
  const post = { platform: 'twitter', id: 'new' }
  const ana = { username: 'ana', name: 'Ana', avatarUrl: null, isYou: false }
  const ben = { username: 'ben', name: 'Ben', avatarUrl: null, isYou: false }
  const save = {
    type: 'save',
    saver: ana,
    item: {
      id: 'arrival',
      key: 'twitter:new',
      at: '2026-10-22',
      post,
      to: { kind: 'moment', slug: 'frogs' },
    },
  } as unknown as MomentEvent
  act(() => {
    FakeSource.all[0].emit(save)
    FakeSource.all[0].emit({ type: 'watching', slug: 'frogs', watching: 2, watchers: [] })
  })
  await act(async () =>
    resolve(
      answer({
        ...detail,
        items: [{ post, savedAt: '2026-10-22', people: 2, savers: [ana, ben] }],
        bars: [1],
      }),
    ),
  )
  expect(result.current.detail?.items).toHaveLength(1)
  expect(result.current.detail?.bars).toEqual([1])
  expect(result.current.detail?.items[0].people).toBe(2)
  expect(result.current.detail?.items[0].savers?.map((s) => s.username)).toEqual(['ana', 'ben'])
  expect(result.current.watching).toBe(2)
})
