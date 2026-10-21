/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useDoing } from '@/components/next/doing/useDoing'
import { useSeenPosts } from '@/components/next/theater/useSeenPosts'

const json = (value: unknown, status = 200) =>
  ({ ok: status === 200, status, json: async () => value }) as Response
const progress = { items: [], summary: { onTheirWay: 2 } }
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

it('stops pending progress requests after unmount and does not restart polling', async () => {
  let resolve!: (response: Response) => void
  const fetcher = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((done) => {
        resolve = done
      }),
  )
  vi.stubGlobal('fetch', fetcher)
  const hook = renderHook(() => useDoing({ everyMs: 3000 }))
  const signal = fetcher.mock.calls[0]?.[1]?.signal
  hook.unmount()
  expect(signal?.aborted).toBe(true)
  await act(async () => {
    resolve(json(progress))
  })
  await tick(30_000)
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('shares progress updates and retires the shared request only after the last consumer leaves', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json(progress))
  vi.stubGlobal('fetch', fetcher)
  const one = renderHook(() => useDoing({ everyMs: 3000, accountId: 'ana' }))
  const two = renderHook(() => useDoing({ everyMs: 3000, accountId: 'ana', summaryOnly: true }))
  await tick(0)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(two.result.current.summary?.onTheirWay).toBe(2)
  one.unmount()
  await tick(3000)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(String(fetcher.mock.calls[1]?.[0])).toContain('summary=1')
  two.unmount()
  await tick(9000)
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('pauses progress while hidden, resumes once, and exposes request failures for retry', async () => {
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json(progress))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(json(progress))
  vi.stubGlobal('fetch', fetcher)
  const hook = renderHook(() => useDoing({ everyMs: 3000 }))
  await tick(0)
  hidden.mockReturnValue(true)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  await tick(30_000)
  expect(fetcher).toHaveBeenCalledTimes(1)
  hidden.mockReturnValue(false)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  await tick(0)
  expect(hook.result.current.error).toContain('Couldn’t update')
  expect(hook.result.current.summary?.onTheirWay).toBe(2)
  act(() => hook.result.current.refresh())
  await tick(0)
  expect(hook.result.current.error).toBeNull()
})

it('rejects late progress data from a previous account', async () => {
  let resolve!: (response: Response) => void
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done
        }),
    )
    .mockResolvedValue(json({ items: [], summary: { onTheirWay: 7 } }))
  vi.stubGlobal('fetch', fetcher)
  const hook = renderHook(({ accountId }) => useDoing({ everyMs: 3000, accountId }), {
    initialProps: { accountId: 'ana' },
  })
  hook.rerender({ accountId: 'ben' })
  await act(async () => {
    resolve(json(progress))
  })
  await tick(0)
  expect(hook.result.current.summary?.onTheirWay).toBe(7)
})

it.each(['network', 'http'])(
  'retries %s failures without losing or duplicating a viewing mark',
  async (kind) => {
    const fetcher = vi.fn()
    if (kind === 'network') fetcher.mockRejectedValueOnce(new Error('offline'))
    else fetcher.mockResolvedValueOnce(json({}, 503))
    fetcher.mockResolvedValue(json({}))
    vi.stubGlobal('fetch', fetcher)
    const hook = renderHook(() => useSeenPosts(true, 'ana'))
    act(() => {
      hook.result.current('twitter:post1')
      hook.result.current('twitter:post1')
    })
    await tick(4000)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('adhx-seen-outbox:ana')).toContain('post1')
    await tick(8000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)).posts).toEqual([
      { platform: 'twitter', id: 'post1' },
    ])
    expect(localStorage.getItem('adhx-seen-outbox:ana')).toBeNull()
    act(() => hook.result.current('twitter:post1'))
    await tick(20_000)
    expect(fetcher).toHaveBeenCalledTimes(2)
  },
)

it('restores an interrupted viewing outbox only for its owner and resumes on reconnect', async () => {
  localStorage.setItem(
    'adhx-seen-outbox:ana',
    JSON.stringify([{ platform: 'twitter', id: 'post1', at: Date.now() }]),
  )
  const fetcher = vi.fn<typeof fetch>(async () => json({}))
  vi.stubGlobal('fetch', fetcher)
  const hook = renderHook(({ accountId }) => useSeenPosts(true, accountId), {
    initialProps: { accountId: 'ben' },
  })
  await tick(4000)
  expect(fetcher).not.toHaveBeenCalled()
  hook.rerender({ accountId: 'ana' })
  act(() => window.dispatchEvent(new Event('online')))
  await tick(0)
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).posts[0].id).toBe('post1')
  expect(localStorage.getItem('adhx-seen-outbox:ana')).toBeNull()
})

it('does not submit an old account’s pending views when the signed-in account changes', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => json({}))
  vi.stubGlobal('fetch', fetcher)
  const hook = renderHook(({ accountId }) => useSeenPosts(true, accountId), {
    initialProps: { accountId: 'ana' },
  })
  act(() => hook.result.current('twitter:secret'))
  hook.rerender({ accountId: 'ben' })
  await tick(10_000)
  expect(fetcher).not.toHaveBeenCalled()
  expect(localStorage.getItem('adhx-seen-outbox:ana')).toContain('secret')
})

it('sends only one hidden-page keepalive batch and resumes the remainder in front', async () => {
  localStorage.setItem(
    'adhx-seen-outbox:ana',
    JSON.stringify(
      Array.from({ length: 75 }, (_, n) => ({
        platform: 'twitter',
        id: `seen-${n}`,
        at: Date.now(),
      })),
    ),
  )
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const fetcher = vi.fn<typeof fetch>(async () => json({}))
  vi.stubGlobal('fetch', fetcher)
  renderHook(() => useSeenPosts(true, 'ana'))
  hidden.mockReturnValue(true)
  act(() => window.dispatchEvent(new Event('pagehide')))
  await tick(0)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(JSON.parse(localStorage.getItem('adhx-seen-outbox:ana')!)).toHaveLength(25)
  await tick(60_000)
  expect(fetcher).toHaveBeenCalledTimes(1)
  hidden.mockReturnValue(false)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  await tick(0)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(localStorage.getItem('adhx-seen-outbox:ana')).toBeNull()
})

it('bounds the in-memory viewing outbox as well as its saved copy', async () => {
  localStorage.setItem(
    'adhx-seen-outbox:ana',
    JSON.stringify(
      Array.from({ length: 5000 }, (_, n) => ({
        platform: 'twitter',
        id: `seen-${n}`,
        at: Date.now(),
      })),
    ),
  )
  let finish!: (response: Response) => void
  const fetcher = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve
      }),
  )
  vi.stubGlobal('fetch', fetcher)
  const hook = renderHook(() => useSeenPosts(true, 'ana'))
  act(() => hook.result.current('twitter:newest'))
  const posts = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).posts
  expect(posts[0].id).toBe('seen-1')
  expect(JSON.parse(localStorage.getItem('adhx-seen-outbox:ana')!)).toHaveLength(5000)
  hook.unmount()
  await act(async () => {
    finish(json({}))
  })
})
