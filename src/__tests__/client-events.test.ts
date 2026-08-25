/**
 * @vitest-environment jsdom
 *
 * `src/lib/client-events.ts` centralizes the cross-component "something
 * changed" window events that used to be dispatched ad hoc from a dozen call
 * sites (see the module's own header comment — the owner's report was
 * "certain areas of the website don't update when things happen"). These
 * tests pin down the exact dispatch contract so a future refactor of the
 * helpers can't silently drop an event a listener depends on.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  CLIENT_EVENTS,
  notifyCollectionChanged,
  notifyTagsChanged,
  resetClientEventBridgeForTests,
  startClientEventBridge,
} from '@/lib/client-events'
import type { FeedItem } from '@/components/feed/types'

function spyOn(eventName: string) {
  const calls: Event[] = []
  window.addEventListener(eventName, (e) => calls.push(e))
  return calls
}

describe('notifyCollectionChanged', () => {
  beforeEach(() => {
    resetClientEventBridgeForTests()
  })

  it('with no args, fires both stats-updated and tweet-added — the common case of adding/removing a post the caller has not rendered itself', () => {
    const stats = spyOn('stats-updated')
    const feed = spyOn('tweet-added')

    notifyCollectionChanged()

    expect(stats).toHaveLength(1)
    expect(feed).toHaveLength(1)
  })

  it("refetchFeed: false fires stats-updated but NOT tweet-added — tweet-added's listener (useSyncListener) does a full feed refetch, which would discard a caller's own optimistic in-place update to the grid (e.g. paste-to-add)", () => {
    const stats = spyOn('stats-updated')
    const feed = spyOn('tweet-added')

    notifyCollectionChanged({ refetchFeed: false })

    expect(stats).toHaveLength(1)
    expect(feed).toHaveLength(0)
  })

  it('tagsChanged: true additionally fires bookmark-tags-changed; omitting it does not — cloning a whole playlist adds a tag as well as posts, so the tags page/FilterBar counts need to move too, but a plain add/remove that touches no tags should not force the tags page to refetch', () => {
    const tags = spyOn('bookmark-tags-changed')

    notifyCollectionChanged({ tagsChanged: true })
    expect(tags).toHaveLength(1)

    notifyCollectionChanged({ tagsChanged: false })
    expect(tags).toHaveLength(1)
  })

  it('removed puts { removed } on tweet-added so Saved theaters can splice that identity', () => {
    const feed = spyOn('tweet-added')
    notifyCollectionChanged({ removed: { platform: 'twitter', id: '99' } })
    expect(feed).toHaveLength(1)
    expect((feed[0] as CustomEvent).detail).toEqual({
      removed: { platform: 'twitter', id: '99' },
    })
  })

  it('added + refetchFeed true puts { added } on tweet-added', () => {
    const feed = spyOn('tweet-added')
    const added = { platform: 'twitter', id: '88', text: 'hi' } as FeedItem
    notifyCollectionChanged({ added })
    expect(feed).toHaveLength(1)
    expect((feed[0] as CustomEvent).detail).toEqual({ added })
  })

  it('added + refetchFeed false does not fire tweet-added locally — the caller already placed the row', () => {
    const feed = spyOn('tweet-added')
    notifyCollectionChanged({
      refetchFeed: false,
      added: { platform: 'twitter', id: '88' } as FeedItem,
    })
    expect(feed).toHaveLength(0)
  })
})

const canBroadcast = typeof BroadcastChannel !== 'undefined'

function waitUntil(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve()
        return
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('timed out waiting for BroadcastChannel'))
        return
      }
      setTimeout(tick, 5)
    }
    tick()
  })
}

describe.skipIf(!canBroadcast)('notifyCollectionChanged cross-tab', () => {
  beforeEach(() => {
    resetClientEventBridgeForTests()
  })

  it('posts the same payload on BroadcastChannel so other windows hear Archive', async () => {
    const other = new BroadcastChannel('adhx-client-events')
    const received: unknown[] = []
    other.onmessage = (event) => received.push(event.data)
    try {
      notifyCollectionChanged({ removed: { platform: 'twitter', id: '7' } })
      await waitUntil(() => received.length > 0)
      expect(received).toContainEqual({
        name: 'tweet-added',
        detail: { removed: { platform: 'twitter', id: '7' } },
      })
    } finally {
      other.close()
    }
  })

  it('broadcasts added even when refetchFeed is false so other windows hear the paste', async () => {
    const other = new BroadcastChannel('adhx-client-events')
    const received: unknown[] = []
    other.onmessage = (event) => received.push(event.data)
    try {
      notifyCollectionChanged({
        refetchFeed: false,
        added: { platform: 'twitter', id: '88' } as FeedItem,
      })
      await waitUntil(() => received.length > 0)
      expect(received).toContainEqual({
        name: 'tweet-added',
        detail: { added: { platform: 'twitter', id: '88' } },
      })
    } finally {
      other.close()
    }
  })

  it('turns an inbound BroadcastChannel message into a local tweet-added', async () => {
    startClientEventBridge()
    const feed = spyOn('tweet-added')
    const other = new BroadcastChannel('adhx-client-events')
    try {
      other.postMessage({
        name: 'tweet-added',
        detail: { removed: { platform: 'twitter', id: '9' } },
      })
      await waitUntil(() => feed.length > 0)
      expect(feed).toHaveLength(1)
      expect((feed[0] as CustomEvent).detail).toEqual({
        removed: { platform: 'twitter', id: '9' },
      })
    } finally {
      other.close()
    }
  })
})

describe('notifyTagsChanged', () => {
  it('dispatches bookmark-tags-changed carrying the exact detail object, so listeners can patch a single bookmark in place instead of refetching everything', () => {
    let received: unknown
    window.addEventListener('bookmark-tags-changed', (e) => {
      received = (e as CustomEvent).detail
    })

    const detail = { platform: 'twitter', bookmarkId: '123', tags: ['work', 'reading'] }
    notifyTagsChanged(detail)

    expect(received).toEqual(detail)
    expect(received).toBe(detail)
  })
})

describe('CLIENT_EVENTS', () => {
  // Listeners subscribe with the CLIENT_EVENTS constants, but some existing
  // call sites (e.g. the tags-search custom event, unrelated to this module)
  // and older code still key off the literal strings. A rename here without
  // updating every literal would silently break those listeners — pin the
  // exact names so that can't happen unnoticed.
  it('exports the three event names matching the string literals other code listens for', () => {
    expect(CLIENT_EVENTS.statsUpdated).toBe('stats-updated')
    expect(CLIENT_EVENTS.feedChanged).toBe('tweet-added')
    expect(CLIENT_EVENTS.tagsChanged).toBe('bookmark-tags-changed')
  })
})
