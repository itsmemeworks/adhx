import { describe, it, expect } from 'vitest'
import {
  orderLifoQueue,
  sortNewestFirst,
  queueSectionHeading,
  QUEUE_NOW_PLAYING,
  QUEUE_NEXT,
  QUEUE_SEEN,
  firstPendingLiveKey,
  computeLoopedNext,
  computeQueueCounts,
  formatQueueCount,
} from '@/components/theater/TheaterShell'

type Item = {
  platform: string
  bookmarkId: string
  url: string
  addedAt?: string | null
  createdAt: string
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

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

describe('sortNewestFirst', () => {
  it('orders by ADHX addedAt, newest first', () => {
    expect(ids(sortNewestFirst([item('old', 10), item('new', 1), item('mid', 4)]))).toEqual([
      'new',
      'mid',
      'old',
    ])
  })

  it('returns the same reference when already newest-first', () => {
    const items = [item('new', 1), item('old', 8)]
    expect(sortNewestFirst(items)).toBe(items)
  })
})

describe('orderLifoQueue', () => {
  it('is newest-first', () => {
    expect(ids(orderLifoQueue([item('old', 10), item('new', 1)]))).toEqual(['new', 'old'])
  })

  it('repeat-off drops seen posts', () => {
    const items = [item('seen', 1), item('todo', 3), item('older', 8)]
    expect(ids(orderLifoQueue(items, { onlyUnseen: true, isSeen: setOf('seen') }))).toEqual([
      'todo',
      'older',
    ])
  })

  it('appendSeen keeps watched rows after Now / Next', () => {
    const items = [item('seen', 1), item('todo', 3), item('older', 8)]
    expect(
      ids(
        orderLifoQueue(items, {
          onlyUnseen: true,
          isSeen: setOf('seen'),
          appendSeen: true,
        }),
      ),
    ).toEqual(['todo', 'older', 'seen'])
  })

  it('keeps the playing row even after dwell marks it seen', () => {
    const items = [item('playing', 2), item('next', 4)]
    expect(
      ids(
        orderLifoQueue(items, {
          onlyUnseen: true,
          isSeen: setOf('playing'),
          currentKey: key('playing'),
          pinCurrent: true,
        }),
      ),
    ).toEqual(['playing', 'next'])
  })

  it('repeat-all is newest-first without a pin so Next can walk the pile', () => {
    const items = [item('a', 1), item('b', 2), item('c', 3)]
    expect(
      ids(
        orderLifoQueue(items, {
          currentKey: key('c'),
          pinCurrent: false,
        }),
      ),
    ).toEqual(['a', 'b', 'c'])
  })

  it('paste interrupt sits as Next under the new lead', () => {
    const items = [item('watching', 5), item('paste', 0), item('older', 8)]
    expect(
      ids(
        orderLifoQueue(items, {
          currentKey: key('paste'),
          pinNextKey: key('watching'),
        }),
      ),
    ).toEqual(['paste', 'watching', 'older'])
  })

  it('pins now playing so a newer arrival is Next, not a steal', () => {
    const items = [item('current', 5), item('arrival', 0)]
    expect(
      ids(
        orderLifoQueue(items, {
          onlyUnseen: true,
          isSeen: none,
          currentKey: key('current'),
          pinCurrent: true,
        }),
      ),
    ).toEqual(['current', 'arrival'])
  })

  it('does not pin the parked last post while caught-up', () => {
    const items = [item('done', 1), item('fresh', 0)]
    expect(
      ids(
        orderLifoQueue(items, {
          onlyUnseen: true,
          isSeen: setOf('done'),
          currentKey: key('done'),
          pinCurrent: false,
        }),
      ),
    ).toEqual(['fresh'])
  })

  it('keeps an opened preview even if this viewer has seen it', () => {
    const items = [item('lead', 2), item('todo', 4)]
    expect(
      ids(
        orderLifoQueue(items, {
          onlyUnseen: true,
          isSeen: setOf('lead'),
          keepKey: key('lead'),
          currentKey: key('lead'),
          pinCurrent: true,
        }),
      ),
    ).toEqual(['lead', 'todo'])
  })
})

describe('queueSectionHeading', () => {
  it('labels now playing and next when Repeat is on', () => {
    expect(queueSectionHeading(0, 0)).toEqual({ label: QUEUE_NOW_PLAYING })
    expect(queueSectionHeading(1, 0)).toEqual({ label: QUEUE_NEXT })
    expect(queueSectionHeading(2, 0)).toBeNull()
  })

  it('adds Seen after the playable rows when Repeat is off', () => {
    expect(queueSectionHeading(0, 0, 2)).toEqual({ label: QUEUE_NOW_PLAYING })
    expect(queueSectionHeading(1, 0, 2)).toEqual({ label: QUEUE_NEXT })
    expect(queueSectionHeading(2, 0, 2)).toEqual({ label: QUEUE_SEEN })
    expect(queueSectionHeading(3, 0, 2)).toBeNull()
  })

  it('labels only Seen when caught-up', () => {
    expect(queueSectionHeading(0, -1, 0)).toEqual({ label: QUEUE_SEEN })
    expect(queueSectionHeading(1, -1, 0)).toBeNull()
  })
})

describe('firstPendingLiveKey', () => {
  it('skips seen rows', () => {
    expect(firstPendingLiveKey([item('a', 1), item('b', 2)], setOf('a'))).toBe(key('b'))
  })
})

describe('computeLoopedNext', () => {
  it('advances to the next row, then waits', () => {
    expect(computeLoopedNext(2, 0, false)).toBe(1)
    expect(computeLoopedNext(2, 1, false)).toBe('waiting')
  })

  it('loops when repeat-all', () => {
    expect(computeLoopedNext(2, 1, true)).toBe(0)
  })
})

describe('computeQueueCounts + formatQueueCount', () => {
  it('repeat off is Now playing + Next', () => {
    expect(computeQueueCounts({ length: 18, unseenCount: 3, repeatMode: 'off' })).toEqual({
      looping: false,
      played: 0,
      toPlay: 3,
      length: 18,
    })
    expect(
      formatQueueCount(computeQueueCounts({ length: 18, unseenCount: 3, repeatMode: 'off' })),
    ).toEqual({
      text: '3 in queue',
      ariaLabel: '3 in queue',
    })
  })

  it('repeat all is the playlist size', () => {
    expect(computeQueueCounts({ length: 18, unseenCount: 3, repeatMode: 'all' })).toEqual({
      looping: true,
      played: 0,
      toPlay: 18,
      length: 18,
    })
    expect(
      formatQueueCount(computeQueueCounts({ length: 18, unseenCount: 3, repeatMode: 'all' })),
    ).toEqual({
      text: '18 on repeat',
      ariaLabel: '18 on repeat',
    })
  })

  it('repeat this post is 1', () => {
    expect(computeQueueCounts({ length: 18, unseenCount: 3, repeatMode: 'one' })).toEqual({
      looping: true,
      played: 0,
      toPlay: 1,
      length: 1,
    })
    expect(
      formatQueueCount(computeQueueCounts({ length: 18, unseenCount: 3, repeatMode: 'one' })),
    ).toEqual({
      text: '1 on repeat',
      ariaLabel: '1 on repeat',
    })
  })

  it('caught-up (nothing unseen) hides the count', () => {
    expect(
      formatQueueCount(computeQueueCounts({ length: 18, unseenCount: 0, repeatMode: 'off' })),
    ).toBeNull()
  })
})
