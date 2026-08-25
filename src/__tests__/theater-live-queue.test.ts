import { describe, it, expect } from 'vitest'
import {
  orderLiveQueue,
  liveQueueGroupOf,
  unseenBlockLength,
  computeLiveNext,
  pendingBlockLength,
  firstPendingLiveKey,
  computeQueueTotal,
  computeQueueCounts,
  countPlayedThisRun,
  formatQueueCount,
  PINNED_POST_HEADING,
  LIVE_QUEUE_GROUP_LABEL,
} from '@/components/theater/TheaterShell'
import { REPEAT_MODE_LABEL, repeatModeLabel } from '@/components/theater/types'

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

  it('calls a fresh arrival "arrived" even if it was watched before this session', () => {
    // A resurfacing post the viewer saw days ago still just landed.
    expect(liveQueueGroupOf(key('d'), setOf('d'), setOf('d'))).toBe('arrived')
  })

  it('moves a post watched this session into watched once it is no longer current', () => {
    expect(liveQueueGroupOf(key('d'), none, setOf('d'), setOf('d'))).toBe('watched')
    expect(liveQueueGroupOf(key('todo'), none, none, setOf('todo'))).toBe('watched')
  })

  it('keeps the playing row in its group so dwell does not yank it', () => {
    expect(liveQueueGroupOf(key('d'), none, setOf('d'), setOf('d'), key('d'))).toBe('arrived')
    expect(liveQueueGroupOf(key('todo'), none, none, setOf('todo'), key('todo'))).toBe('unwatched')
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

  it('slides a watched-this-session post into watched, except the row on stage', () => {
    const items = [item('fresh', 1), item('todo', 2), item('old', 5)]
    const wasSeen = setOf('old')
    const isFresh = setOf('fresh')
    const isSeenNow = setOf('todo', 'old')
    // Playing the arrival: todo has been watched and leaves Up next.
    expect(ids(orderLiveQueue(items, wasSeen, isFresh, isSeenNow, key('fresh')))).toEqual([
      'fresh',
      'todo',
      'old',
    ])
    // After leaving fresh, it joins Watched too.
    expect(
      ids(orderLiveQueue(items, wasSeen, isFresh, setOf('fresh', 'todo', 'old'), key('todo'))),
    ).toEqual(['todo', 'fresh', 'old'])
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

  it('waits on Next from the last pending post instead of walking into Watched', () => {
    // After regroup the last new post sits at a low index with just-watched
    // rows behind it. Next there is caught-up, not a replay of that run.
    expect(computeLiveNext({ ...base, index: 1, userInitiated: true })).toBe('waiting')
  })

  it('lets the user browse once they are already in the watched suffix', () => {
    expect(computeLiveNext({ ...base, index: 2, userInitiated: true })).toBe(3)
  })

  it('lets repeat "all" (loop) past the boundary and wrap', () => {
    expect(computeLiveNext({ ...base, index: 1, loop: true })).toBe(2)
    expect(computeLiveNext({ ...base, index: 4, loop: true })).toBe(0)
  })

  it('applies no boundary on an explicit re-watch', () => {
    expect(computeLiveNext({ ...base, index: 1, unseenCount: 0, rewatch: true })).toBe(2)
    expect(computeLiveNext({ ...base, index: 3, unseenCount: 0, rewatch: true })).toBe(4)
  })

  it('waits when nothing is still unwatched and this is not a re-watch', () => {
    expect(computeLiveNext({ ...base, index: 1, unseenCount: 0 })).toBe('waiting')
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

describe('computeQueueCounts', () => {
  it('Live leftover is played of the pending run, not a playlist position', () => {
    expect(
      computeQueueCounts({ index: 0, length: 13, unseenCount: 2, repeatMode: 'off', played: 0 }),
    ).toEqual({ looping: false, played: 0, toPlay: 2, length: 13 })
    expect(
      computeQueueCounts({ index: 0, length: 13, unseenCount: 7, repeatMode: 'off', played: 16 }),
    ).toEqual({ looping: false, played: 16, toPlay: 23, length: 13 })
  })

  it('keeps leftover while browsing the watched suffix', () => {
    expect(
      computeQueueCounts({ index: 7, length: 13, unseenCount: 2, repeatMode: 'off', played: 5 }),
    ).toEqual({ looping: false, played: 5, toPlay: 7, length: 13 })
  })

  it('names the pile when Live is repeating; caught-up without a run is just the pile', () => {
    expect(computeQueueCounts({ index: 0, length: 13, unseenCount: 2, repeatMode: 'all' })).toEqual(
      { looping: true, played: 0, toPlay: 13, length: 13 },
    )
    expect(computeQueueCounts({ index: 0, length: 13, unseenCount: 0, repeatMode: 'off' })).toEqual(
      { looping: false, played: 0, toPlay: 0, length: 13 },
    )
  })

  it('Saved one-pass is the 1-based now-playing index; a loop just shows the pile', () => {
    expect(
      computeQueueCounts({
        index: 0,
        length: 92,
        unseenCount: 92,
        repeatMode: 'off',
        listWalk: true,
      }),
    ).toEqual({ looping: false, played: 1, toPlay: 92, length: 92 })
    expect(
      computeQueueCounts({
        index: 1,
        length: 92,
        unseenCount: 92,
        repeatMode: 'off',
        listWalk: true,
      }),
    ).toEqual({ looping: false, played: 2, toPlay: 92, length: 92 })
    expect(
      computeQueueCounts({ index: 5, length: 13, unseenCount: 13, repeatMode: 'all' }),
    ).toEqual({ looping: true, played: 0, toPlay: 13, length: 13 })
  })
})

describe('countPlayedThisRun', () => {
  function post(id: string) {
    return { platform: 'twitter', bookmarkId: id, url: `/${id}` }
  }

  it('skips the leftover row still on stage and ignores watched-on-entry posts', () => {
    const items = [post('now'), post('next'), post('done'), post('old')]
    expect(
      countPlayedThisRun(items, {
        currentKey: 'twitter:now',
        remaining: 2,
        currentIndex: 0,
        wasSeenOnEntry: (key) => key === 'twitter:old',
        isFresh: () => false,
        isSeen: (key) => key === 'twitter:now' || key === 'twitter:done' || key === 'twitter:old',
      }),
    ).toBe(1)
  })

  it('counts a mid-session arrival that has already been watched', () => {
    const items = [post('now'), post('fresh'), post('old')]
    expect(
      countPlayedThisRun(items, {
        currentKey: 'twitter:now',
        remaining: 1,
        currentIndex: 0,
        wasSeenOnEntry: (key) => key === 'twitter:old',
        isFresh: (key) => key === 'twitter:fresh',
        isSeen: (key) => key === 'twitter:now' || key === 'twitter:fresh' || key === 'twitter:old',
      }),
    ).toBe(1)
  })

  it('ignores a leftover run that already finished at caught-up', () => {
    // Owner screenshot: watched leftover this session, caught up, then one
    // new arrival. Those finished leftover keys are folded into
    // wasSeenOnEntry so the new run is just the arrival (1 in queue), not
    // "2 of 3".
    const items = [post('now'), post('done-1'), post('done-2'), post('old')]
    expect(
      countPlayedThisRun(items, {
        currentKey: 'twitter:now',
        remaining: 1,
        currentIndex: 0,
        wasSeenOnEntry: (key) =>
          key === 'twitter:old' || key === 'twitter:done-1' || key === 'twitter:done-2',
        isFresh: (key) => key === 'twitter:now',
        isSeen: (key) =>
          key === 'twitter:now' ||
          key === 'twitter:done-1' ||
          key === 'twitter:done-2' ||
          key === 'twitter:old',
      }),
    ).toBe(0)
  })
})

describe('PINNED_POST_HEADING', () => {
  it('names the opened post, not a share', () => {
    expect(PINNED_POST_HEADING).toBe('This post')
  })
})

describe('formatQueueCount', () => {
  it('shows run progress off-repeat and the pile on-repeat', () => {
    expect(formatQueueCount({ looping: false, played: 16, toPlay: 23, length: 40 })).toEqual({
      text: '16 of 23',
      ariaLabel: '16 watched of 23',
    })
    expect(formatQueueCount({ looping: false, played: 0, toPlay: 23, length: 40 })).toEqual({
      text: '23 in queue',
      ariaLabel: '23 in queue',
    })
    expect(formatQueueCount({ looping: false, played: 0, toPlay: 1, length: 1 })).toEqual({
      text: '1 in queue',
      ariaLabel: '1 in queue',
    })
    expect(formatQueueCount({ looping: true, played: 0, toPlay: 23, length: 23 })).toEqual({
      text: '23 on repeat',
      ariaLabel: '23 on repeat',
    })
    expect(formatQueueCount({ looping: false, played: 0, toPlay: 0, length: 13 })).toEqual({
      text: '13 in queue',
      ariaLabel: '13 in queue',
    })
    expect(formatQueueCount({ looping: true, played: 0, toPlay: 0, length: 0 })).toBeNull()
    expect(formatQueueCount({ looping: false, played: 23, toPlay: 23, length: 40 })).toEqual({
      text: '23 of 23',
      ariaLabel: '23 watched of 23',
    })
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

  it('Saved off is one run through the list, not Live caught-up copy', () => {
    expect(repeatModeLabel('off', { saved: true }).action).toBe('Play once')
    expect(repeatModeLabel('all', { saved: true }).action).toBe('Keep playing')
    expect(repeatModeLabel('off').action).toBe('Stop when caught up')
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

  it('finishes the unwatched run before jumping back to an arrival', () => {
    expect(
      computeLiveNext({
        ...base,
        index: 1,
        nextUnwatchedAhead: 2,
        nextUnwatchedIndex: 0,
      }),
    ).toBe(2)
  })

  it('after the run, plays the arrival and then waits — does not replay the run', () => {
    // Two unseen (1, 2) + a mid-play arrival prepended at 0. After 1 and 2
    // finish, jump to 0; after 0 there is nothing still unwatched.
    expect(
      computeLiveNext({
        ...base,
        unseenCount: 3,
        index: 2,
        nextUnwatchedAhead: null,
        nextUnwatchedIndex: 0,
      }),
    ).toBe(0)
    expect(
      computeLiveNext({
        ...base,
        unseenCount: 3,
        index: 0,
        nextUnwatchedAhead: null,
        nextUnwatchedIndex: null,
      }),
    ).toBe('waiting')
  })

  it('prefers the next still-unwatched ahead over a pending index behind', () => {
    expect(
      computeLiveNext({
        ...base,
        index: 0,
        nextUnwatchedAhead: 1,
        nextUnwatchedIndex: 4,
      }),
    ).toBe(1)
  })

  it('leaves repeat alone, and Next from the pending prefix plays an unwatched arrival', () => {
    expect(computeLiveNext({ ...base, index: 4, loop: true, nextUnwatchedIndex: 1 })).toBe(0)
    expect(computeLiveNext({ ...base, index: 1, userInitiated: true, nextUnwatchedIndex: 0 })).toBe(
      0,
    )
  })

  it('plays still-unwatched arrivals before caught-up even from the watched suffix', () => {
    // Owner screenshot: leftover run done, 2 New-since-opened still unseen,
    // Next / auto-advance said caught-up because unseenCount was 0 (pinned
    // watched lead zeroed the prefix) while nextUnwatchedIndex pointed at them.
    expect(
      computeLiveNext({
        length: 14,
        index: 13,
        unseenCount: 0,
        loop: false,
        userInitiated: true,
        nextUnwatchedIndex: 0,
      }),
    ).toBe(0)
    expect(
      computeLiveNext({
        length: 14,
        index: 13,
        unseenCount: 0,
        loop: false,
        userInitiated: false,
        nextUnwatchedIndex: 1,
      }),
    ).toBe(1)
  })
})

describe('pendingBlockLength', () => {
  it('skips a leading watched row so a pinned lead does not zero the run', () => {
    const items = [item('pin', 1), item('new', 2), item('todo', 3), item('old', 4)]
    const groupOf = (k: string) => {
      if (k === key('pin') || k === key('old')) return 'watched' as const
      if (k === key('new')) return 'arrived' as const
      return 'unwatched' as const
    }
    expect(pendingBlockLength(items, groupOf)).toBe(2)
  })
})

describe('firstPendingLiveKey', () => {
  it('returns the first unseen key, skipping the row being left', () => {
    const items = [item('a', 1), item('b', 2), item('c', 3)]
    expect(firstPendingLiveKey(items, setOf('a'), key('a'))).toBe(key('b'))
    expect(firstPendingLiveKey(items, setOf('a', 'b', 'c'), key('c'))).toBeNull()
  })
})
