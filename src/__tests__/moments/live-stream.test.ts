import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { MomentEvent } from '@/lib/moments/engine'
const state = vi.hoisted(() => ({
  active: true,
  revision: '0',
  watchers: 0,
  events: new Set<(e: MomentEvent) => void>(),
  fingerprint: vi.fn((): string => '0'),
  named: vi.fn((e: MomentEvent) => e),
}))
vi.mock('@/lib/db', () => ({ db: { get: () => (state.active ? { id: 'member' } : undefined) } }))
vi.mock('@/lib/bookmarks/privacy', () => ({ savePrivacyFingerprint: () => state.fingerprint() }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/moments/engine', () => ({
  subscribe: (fn: (e: MomentEvent) => void) => {
    state.events.add(fn)
    return () => state.events.delete(fn)
  },
  watchingCount: () => state.watchers,
}))
vi.mock('@/lib/moments/people', () => ({
  eventForViewer: (e: MomentEvent) => state.named(e),
  reactionForViewer: () => null,
}))
vi.mock('@/lib/moments/presence', () => ({
  joinWatch: () => {
    state.watchers++
    return () => {
      state.watchers--
    }
  },
  onReaction: () => () => {},
  renewWatch: vi.fn(() => false),
  holdWebWatch: vi.fn(),
}))
import { momentStreamResponse } from '@/lib/moments/stream'
const readers: ReadableStreamDefaultReader<Uint8Array>[] = []
function open(notify = true, watch?: string) {
  const response = momentStreamResponse({
    request: new Request('https://example.com/stream'),
    viewerId: 'member',
    keyId: 'phone',
    notify,
    watch,
  })
  const reader = response.body!.getReader()
  readers.push(reader)
  return reader
}
beforeEach(() => {
  vi.useFakeTimers()
  state.active = true
  state.revision = '0'
  state.watchers = 0
  state.events.clear()
  state.fingerprint.mockReset().mockImplementation(() => state.revision)
  state.named.mockReset().mockImplementation((e) => e)
})
afterEach(async () => {
  await Promise.all(readers.splice(0).map((r) => r.cancel()))
  vi.useRealTimers()
})
const emit = (event: MomentEvent) => {
  for (const fn of [...state.events]) fn(event)
}

it('sends only a small invalidation, with no named hydration or saved content', async () => {
  const reader = open()
  await reader.read()
  emit({ type: 'stats', stats: { today: 1, lastHour: 1 } })
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('event: refresh\ndata: {}\n\n')
  expect(state.named).not.toHaveBeenCalled()
})
it('checks a durable revision once per tick for all subscribers and stops at the last cancel', async () => {
  const group = Array.from({ length: 100 }, () => open())
  await Promise.all(group.map((r) => r.read()))
  state.fingerprint.mockClear()
  state.revision = '1'
  vi.advanceTimersByTime(3_000)
  expect(state.fingerprint).toHaveBeenCalledTimes(1)
  for (const reader of group)
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: refresh')
  await Promise.all(group.map((r) => r.cancel()))
  expect(vi.getTimerCount()).toBe(0)
})
it('drops a slow reader with bounded queued bytes and releases its presence/listeners', async () => {
  const reader = open(false, 'room')
  for (let i = 0; i < 12; i++)
    emit({
      type: 'stats',
      stats: { today: 1, lastHour: 1, body: 'x'.repeat(300_000) },
    } as unknown as MomentEvent)
  expect(state.watchers).toBe(0)
  expect(state.events.size).toBe(0)
  let bytes = 0
  for (;;) {
    const row = await reader.read()
    if (row.done) break
    bytes += row.value.length
  }
  expect(bytes).toBeLessThanOrEqual(1_048_576)
})
it('closes instead of sending an event whose visibility/naming check failed', async () => {
  const reader = open(false, 'room')
  await reader.read()
  state.named.mockImplementation(() => {
    throw new Error('visibility unavailable')
  })
  emit({ type: 'stats', stats: { today: 1, lastHour: 1 } })
  expect((await reader.read()).done).toBe(true)
  expect(state.watchers).toBe(0)
})
it('isolates a failed payload mapper from the shared emitter and other subscribers', async () => {
  const response = momentStreamResponse({
    request: new Request('https://example.com/stream'),
    viewerId: 'member',
    map: () => {
      throw new Error('invalid mapped payload')
    },
  })
  const bad = response.body!.getReader()
  readers.push(bad)
  const good = open()
  await bad.read()
  await good.read()
  expect(() => emit({ type: 'stats', stats: { today: 1, lastHour: 1 } })).not.toThrow()
  expect((await bad.read()).done).toBe(true)
  expect(new TextDecoder().decode((await good.read()).value)).toContain('event: refresh')
})
it('ends stale notification presence within a minute, without waiting for TCP timeout', async () => {
  const reader = open(true, 'room')
  await reader.read()
  vi.advanceTimersByTime(60_000)
  expect(state.watchers).toBe(0)
  expect(state.events.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})
it('rechecks a revoked credential on a quiet heartbeat and releases its revision monitor', async () => {
  const reader = open()
  await reader.read()
  state.active = false
  vi.advanceTimersByTime(20_000)
  expect((await reader.read()).done).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
