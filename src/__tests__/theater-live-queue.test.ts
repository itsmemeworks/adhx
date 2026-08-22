import { describe, it, expect } from 'vitest'
import {
  orderLiveQueue,
  liveQueueGroupOf,
  unseenBlockLength,
  computeLiveNext,
  computeQueueTotal,
  LIVE_QUEUE_GROUP_LABEL,
} from '@/components/theater/TheaterShell'
import { REPEAT_MODE_LABEL } from '@/components/theater/types'

/**
 * Live mode is "the last 24 hours of community activity", and what plays is
 * what you HAVEN'T watched (owner):
 *   - new arrivals lead, then unwatched, then watched;
 *   - each settled group is newest-ADDED first, using the SAME timestamp the
 *     row chips display, because ordering by the pulse event time while
 *     displaying `addedAt` made the list read "14h, 2h, 4h, 1d, 1w" (owner:
 *     "these time stamps are not right, they're out of order");
 *   - auto-advance stops at the end of the unwatched run instead of replaying;
 *   - browsing on, repeat 'all', and the explicit re-watch button pass through.
 */

type Item = {
  platform: string
  bookmarkId: string
  url: string
  addedAt?: string | null
  createdAt: string
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

/** `added` in hours ago; `event` (the pulse time) deliberately unrelated to it. */
const item = (id: string, added: number | null, event = 1): Item => ({
  platform: 'twitter',
  bookmarkId: id,
  url: `/a/status/${id}`,
  addedAt: added === null ? null : hoursAgo(added),
  createdAt: hoursAgo(event),
})
const key = (id: string) => `twitter:${id}`
const setOf = (...ids: string[]) => {
  const s = new Set(ids.map(key))
  return (k: string) => s.has(k)
}
const none = () => false
const ids = (list: Item[]) => list.map((i) => i.bookmarkId)

describe('liveQueueGroupOf', () => {
  it('classifies arrived / unwatched / watched', () => {
    expect(liveQueueGroupOf(key('a'), setOf('a'), none)).toBe('watched')
    expect(liveQueueGroupOf(key('b'), none, none)).toBe('unwatched')
    expect(liveQueueGroupOf(key('c'), none, setOf('c'))).toBe('arrived')
  })

  it('calls a fresh arrival "arrived" even if it was watched before', () => {
    // A resurfacing post the viewer saw days ago still just landed.
    expect(liveQueueGroupOf(key('d'), setOf('d'), setOf('d'))).toBe('arrived')
  })

  it('has a label for every group', () => {
    expect(LIVE_QUEUE_GROUP_LABEL.arrived).toBeTruthy()
    expect(LIVE_QUEUE_GROUP_LABEL.unwatched).toBeTruthy()
    expect(LIVE_QUEUE_GROUP_LABEL.watched).toBeTruthy()
  })
})

describe('orderLiveQueue', () => {
  it('puts arrivals first, then unwatched, then watched', () => {
    const items = [item('seen', 5), item('fresh', 90), item('todo', 3)]
    const ordered = orderLiveQueue(items, setOf('seen'), setOf('fresh'))
    expect(ids(ordered)).toEqual(['fresh', 'todo', 'seen'])
  })

  it('sorts each settled group newest-ADDED first, so the chips read in order', () => {
    // Deliberately shuffled input, and the pulse event times are all equal —
    // only `addedAt` may decide the order.
    const items = [item('14h', 14), item('2h', 2), item('4h', 4), item('1w', 168), item('1d', 24)]
    const ordered = orderLiveQueue(items, none, none)
    expect(ids(ordered)).toEqual(['2h', '4h', '14h', '1d', '1w'])
  })

  it('does NOT order by the pulse event time', () => {
    // `stale` has the most recent event but the oldest addedAt; ordering by
    // event time would put it first, which is the reported bug.
    const items = [item('stale', 168, 0.1), item('fresh-add', 1, 20)]
    expect(ids(orderLiveQueue(items, none, none))).toEqual(['fresh-add', 'stale'])
  })

  it('keeps arrivals in the order the merge gave them, not by addedAt', () => {
    // Both just landed; the newest arrival is prepended by mergeFeedItems, and
    // a resurfacing post can be weeks old yet be the thing that just arrived.
    const items = [item('justIn', 200), item('alsoNew', 1)]
    const ordered = orderLiveQueue(items, none, setOf('justIn', 'alsoNew'))
    expect(ids(ordered)).toEqual(['justIn', 'alsoNew'])
  })

  it('falls back to the event time when addedAt is missing or an epoch sentinel', () => {
    const missing = item('missing', null, 1)
    const older = item('older', null, 50)
    expect(ids(orderLiveQueue([older, missing], none, none))).toEqual(['missing', 'older'])
  })

  it('returns the same reference when nothing moves', () => {
    const items = [item('a', 1), item('b', 2)]
    expect(orderLiveQueue(items, none, none)).toBe(items)
  })

  it('handles an empty queue', () => {
    expect(orderLiveQueue([], setOf('a'), none)).toEqual([])
  })
})

describe('unseenBlockLength', () => {
  it('counts arrivals AND unwatched as the leading not-watched run', () => {
    const items = [item('fresh', 1), item('todo', 2), item('seen', 3)]
    const ordered = orderLiveQueue(items, setOf('seen'), setOf('fresh'))
    expect(unseenBlockLength(ordered, setOf('seen'))).toBe(2)
  })

  it('is 0 when everything was already watched (the caught-up case)', () => {
    const items = [item('a', 1), item('b', 2)]
    expect(unseenBlockLength(items, setOf('a', 'b'))).toBe(0)
  })

  it('is the whole length on a first visit', () => {
    expect(unseenBlockLength([item('a', 1), item('b', 2), item('c', 3)], none)).toBe(3)
  })
})

describe('computeLiveNext', () => {
  const base = { length: 5, unseenCount: 2, loop: false, userInitiated: false }

  it('advances inside the unwatched run', () => {
    expect(computeLiveNext({ ...base, index: 0 })).toBe(1)
  })

  it('waits instead of auto-advancing into an already-watched post', () => {
    expect(computeLiveNext({ ...base, index: 1 })).toBe('waiting')
  })

  it('lets the user browse straight past the boundary', () => {
    expect(computeLiveNext({ ...base, index: 1, userInitiated: true })).toBe(2)
  })

  it('lets repeat "all" (loop) past the boundary and wrap', () => {
    expect(computeLiveNext({ ...base, index: 1, loop: true })).toBe(2)
    expect(computeLiveNext({ ...base, index: 4, loop: true })).toBe(0)
  })

  it('applies no boundary once nothing is unwatched (a re-watch, or all watched)', () => {
    expect(computeLiveNext({ ...base, index: 1, unseenCount: 0 })).toBe(2)
    expect(computeLiveNext({ ...base, index: 3, unseenCount: 0 })).toBe(4)
  })

  it('still waits at the true end of the queue', () => {
    expect(computeLiveNext({ ...base, index: 4, unseenCount: 0 })).toBe('waiting')
    expect(computeLiveNext({ ...base, index: 4, unseenCount: 0, userInitiated: true })).toBe(
      'waiting',
    )
  })

  it('is a no-op for an unknown index or an empty queue', () => {
    expect(computeLiveNext({ ...base, index: -1 })).toBeNull()
    expect(computeLiveNext({ ...base, length: 0, index: 0 })).toBeNull()
  })

  it('never strands a first-time visitor: a whole-queue unwatched run plays through', () => {
    const path = [0, 1, 2, 3, 4].map((index) => computeLiveNext({ ...base, index, unseenCount: 5 }))
    expect(path).toEqual([1, 2, 3, 4, 'waiting'])
  })
})

/**
 * Owner: "maybe for mobile where it shows the count and position in that
 * count, it should be aware of that too" — i.e. "3 / 26" was misleading when
 * auto-advance was only ever going to play the handful of unwatched posts. The
 * denominator is now what will actually play, so flipping repeat visibly
 * changes the number.
 */
describe('computeQueueTotal', () => {
  const base = { index: 1, length: 26, unseenCount: 7 }

  it('counts out of the unwatched run while repeat is off', () => {
    expect(computeQueueTotal({ ...base, repeatMode: 'off' })).toBe(7)
  })

  it('counts out of the whole queue once repeat is on — the switch changes the number', () => {
    expect(computeQueueTotal({ ...base, repeatMode: 'all' })).toBe(26)
    expect(computeQueueTotal({ ...base, repeatMode: 'one' })).toBe(26)
  })

  it('falls back to the whole queue when nothing is pending (caught up)', () => {
    expect(computeQueueTotal({ ...base, unseenCount: 0, repeatMode: 'off' })).toBe(26)
  })

  it('falls back to the whole queue when the viewer browsed into watched posts', () => {
    // index 9 sits outside the 7-long run, so the run no longer describes it —
    // "10 / 7" would be nonsense.
    expect(computeQueueTotal({ ...base, index: 9, repeatMode: 'off' })).toBe(26)
    expect(computeQueueTotal({ ...base, index: -1, repeatMode: 'off' })).toBe(26)
  })

  it('reads sensibly at the last unwatched post — the boundary the counter describes', () => {
    expect(computeQueueTotal({ index: 6, length: 26, unseenCount: 7, repeatMode: 'off' })).toBe(7)
  })
})

describe('REPEAT_MODE_LABEL', () => {
  it('names what each state DOES at the boundary, not just "repeat on/off"', () => {
    // The old labels ("Repeat: off") said nothing about stopping when caught
    // up, which is the actual decision the control makes.
    expect(REPEAT_MODE_LABEL.off.action).toBe('Stop when caught up')
    expect(REPEAT_MODE_LABEL.all.action).toBe('Keep playing')
    expect(REPEAT_MODE_LABEL.one.action).toBe('Repeat this post')
    for (const mode of ['off', 'all', 'one'] as const) {
      expect(REPEAT_MODE_LABEL[mode].state).toBeTruthy()
    }
  })
})

/**
 * Owner report: "a new video came in but it's not automatically playing that…
 * I shouldn't have to click re-watch because I haven't seen the new video
 * yet." A fresh arrival PREPENDS to index 0, but auto-advance only moves
 * forward, so a viewer at index 13 sailed past it and the boundary then
 * claimed they were caught up while 14 unwatched posts sat behind the cursor.
 * "Caught up" now means nothing unwatched ANYWHERE.
 */
describe('computeLiveNext — nothing unwatched anywhere', () => {
  const base = { length: 5, unseenCount: 2, loop: false, userInitiated: false }

  it('goes BACK to an arrival that landed behind the cursor instead of waiting', () => {
    // At the end of the unwatched run, but index 0 just arrived and is unseen.
    expect(computeLiveNext({ ...base, index: 1, nextUnwatchedIndex: 0 })).toBe(0)
  })

  it('still waits when there is genuinely nothing unwatched left', () => {
    expect(computeLiveNext({ ...base, index: 1, nextUnwatchedIndex: null })).toBe('waiting')
    expect(computeLiveNext({ ...base, index: 1 })).toBe('waiting')
  })

  it('rescues the true end of the queue too, not just the run boundary', () => {
    // Last item, nothing ahead — but something unwatched sits behind.
    expect(computeLiveNext({ ...base, index: 4, unseenCount: 0, nextUnwatchedIndex: 2 })).toBe(2)
    expect(computeLiveNext({ ...base, index: 4, unseenCount: 0, nextUnwatchedIndex: null })).toBe(
      'waiting',
    )
  })

  it('never diverts a normal in-run advance', () => {
    // Plenty of run left: go to the next item, not to the pending index.
    expect(computeLiveNext({ ...base, index: 0, nextUnwatchedIndex: 4 })).toBe(1)
  })

  it('leaves repeat and user navigation alone', () => {
    expect(computeLiveNext({ ...base, index: 4, loop: true, nextUnwatchedIndex: 1 })).toBe(0)
    expect(computeLiveNext({ ...base, index: 1, userInitiated: true, nextUnwatchedIndex: 0 })).toBe(
      2,
    )
  })
})
