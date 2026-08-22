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
import { describe, it, expect } from 'vitest'
import { CLIENT_EVENTS, notifyCollectionChanged, notifyTagsChanged } from '@/lib/client-events'

function spyOn(eventName: string) {
  const calls: Event[] = []
  window.addEventListener(eventName, (e) => calls.push(e))
  return calls
}

describe('notifyCollectionChanged', () => {
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
