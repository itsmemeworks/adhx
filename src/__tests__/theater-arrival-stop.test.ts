import { describe, it, expect } from 'vitest'
import {
  orderLiveQueue,
  unseenBlockLength,
  computeLiveNext,
  computeQueueTotal,
} from '@/components/theater/TheaterShell'
import type { RepeatMode } from '@/components/theater/types'

/**
 * Owner report: "I was watching the Live Theater playlist. I added a preview
 * on a different device, which added it to the top. After it finished
 * looping around to watch this new video, it then stopped. It didn't show
 * the final screen which says 'do you want to watch everything again?'"
 * Screenshot: "NEW SINCE YOU OPENED" (1, clay-bordered/current), "WATCHED
 * EARLIER 19", peek-bar counter "1 / 20", stage black with a paused ▶ button.
 *
 * Key clue: with exactly one unwatched arrival at index 0, the counter
 * SHOULD read "1 / 1" (denominator = the unwatched run). It read "1 / 20" —
 * the full queue length — so some input to that calculation was wrong.
 *
 * This file reconstructs the reported state through the pure functions only.
 */

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

/** The reported queue: 19 posts watched in a prior visit, 1 fresh arrival. */
function buildReportedQueue() {
  const watched = Array.from({ length: 19 }, (_, i) => item(`w${i}`, i + 1))
  const arrival = item('new', 0.01) // just landed
  const items = [...watched, arrival]
  const wasSeenOnEntry = setOf(...watched.map((w) => w.bookmarkId)) // arrival NOT in the set
  const isFresh = setOf('new')
  const ordered = orderLiveQueue(items, wasSeenOnEntry, isFresh)
  return { ordered, wasSeenOnEntry, isFresh }
}

describe('Q1 — the reported 20-item queue (19 watched-on-entry + 1 fresh arrival)', () => {
  it('orders the arrival to index 0, exactly matching the screenshot groups (1 arrived / 19 watched)', () => {
    const { ordered } = buildReportedQueue()
    expect(ordered).toHaveLength(20)
    expect(ids(ordered)[0]).toBe('new')
  })

  it('unseenBlockLength correctly reports 1 (not 20) for this queue', () => {
    const { ordered, wasSeenOnEntry } = buildReportedQueue()
    expect(unseenBlockLength(ordered, wasSeenOnEntry)).toBe(1)
  })

  it('computeQueueTotal correctly reports 1 / 20 (not 20 / 20) when fed the correct unseenCount', () => {
    expect(computeQueueTotal({ index: 0, length: 20, unseenCount: 1, repeatMode: 'off' })).toBe(1)
  })

  it('enumerates EVERY (unseenCount, repeatMode) combination that makes computeQueueTotal return 20 at index 0, length 20', () => {
    // computeQueueTotal's body:
    //   if (repeatMode !== 'off') return length
    //   if (unseenCount <= 0 || index < 0 || index >= unseenCount) return length
    //   return unseenCount
    // At index === 0, `index < 0` is impossible and `index >= unseenCount`
    // collapses to `unseenCount <= 0` (0 >= unseenCount only when unseenCount
    // <= 0). So there are exactly two independent families of input that
    // yield 20 at index 0:
    const repeatModes: RepeatMode[] = ['off', 'all', 'one']
    const unseenCounts = [-1, 0, 1, 5, 19, 20]
    const yieldsTwenty: Array<{ unseenCount: number; repeatMode: RepeatMode }> = []
    for (const repeatMode of repeatModes) {
      for (const unseenCount of unseenCounts) {
        const total = computeQueueTotal({ index: 0, length: 20, unseenCount, repeatMode })
        if (total === 20) yieldsTwenty.push({ unseenCount, repeatMode })
      }
    }
    // Family A: repeatMode is 'all' or 'one' — ANY unseenCount, by design
    // (this is the existing, intended "the switch changes the number"
    // behaviour, already guarded by theater-live-queue.test.ts).
    for (const unseenCount of unseenCounts) {
      expect(yieldsTwenty).toContainEqual({ unseenCount, repeatMode: 'all' })
      expect(yieldsTwenty).toContainEqual({ unseenCount, repeatMode: 'one' })
    }
    // Family B: repeatMode 'off' AND unseenCount <= 0 (i.e. the unwatched
    // run was computed as EMPTY, despite a real unwatched arrival existing).
    expect(yieldsTwenty).toContainEqual({ unseenCount: 0, repeatMode: 'off' })
    expect(yieldsTwenty).toContainEqual({ unseenCount: -1, repeatMode: 'off' })
    // The only OTHER way 'off' reaches 20 is the trivial arithmetic
    // coincidence unseenCount === length (the whole queue genuinely is the
    // unwatched run, so "unseenCount" and "length" are the same number by
    // construction — not the buggy fallback path at all).
    const offCombos = yieldsTwenty.filter((c) => c.repeatMode === 'off')
    expect(offCombos.every((c) => c.unseenCount <= 0 || c.unseenCount === 20)).toBe(true)
  })
})

describe('Q2 — computeLiveNext for each "returns 20" combo, arrival finishing at index 0', () => {
  const finishing = { index: 0, userInitiated: false, loop: false }

  it('repeatMode "all"/"one" alone (unseenCount=1, loop=false as literally asked) resolves to "waiting", never null', () => {
    // Note: in the live component, repeatMode 'all' is ALSO threaded into
    // computeLiveNext's `loop` param (`loop || repeatModeRef.current ===
    // 'all'`), so in practice this combo never reaches this literal
    // loop:false shape for 'all'. Tested here exactly as the question asks.
    expect(computeLiveNext({ ...finishing, length: 20, unseenCount: 1 })).toBe('waiting')
  })

  it('unseenCount=0 without rewatch waits — only an explicit re-watch walks the list', () => {
    expect(computeLiveNext({ ...finishing, length: 20, unseenCount: 0 })).toBe('waiting')
    expect(computeLiveNext({ ...finishing, length: 20, unseenCount: 0, rewatch: true })).toBe(1)
  })

  it('unseenCount=-1 (defensively malformed) waits — only a positive run walks without live indices', () => {
    expect(computeLiveNext({ ...finishing, length: 20, unseenCount: -1 })).toBe('waiting')
  })

  it('none of the "returns 20" combos alone reproduce a null (do-nothing) result at a valid index', () => {
    // Answering Q2's specific question: with index 0 (a valid, in-range
    // index) supplied directly, computeLiveNext ALWAYS returns either a
    // concrete next index or 'waiting' — never null. The wrong "1 / 20"
    // display and the "it just stopped" playback freeze are therefore NOT
    // explained by the same (unseenCount, repeatMode) inputs alone: the
    // total's wrongness (Q1) and the stuck playback (Q3/Q4 below) need a
    // DIFFERENT bad input to co-occur.
    for (const unseenCount of [-1, 0, 1, 5, 19, 20]) {
      const next = computeLiveNext({ ...finishing, length: 20, unseenCount })
      expect(next).not.toBeNull()
    }
  })
})

describe('Q3 — can computeLiveNext return null with length > 0?', () => {
  it('YES: whenever the current item cannot be found in the queue (index === -1), regardless of everything else', () => {
    // computeLiveNext delegates the null case entirely to computeLoopedNext,
    // whose only null branches are `index === -1` or `length === 0`. So for
    // length > 0, null happens iff index === -1 — a "the current post fell
    // out of the queue" state. This is the one shape that returns NEITHER a
    // next index NOR 'waiting': goNext's caller does `if (next === null)
    // return key` — a pure no-op. No waiting stage is entered, nothing
    // advances, matching "it just stopped" with no re-watch prompt.
    const shared = { length: 20, unseenCount: 1, loop: false, userInitiated: false }
    expect(computeLiveNext({ ...shared, index: -1 })).toBeNull()
    expect(computeLiveNext({ ...shared, index: -1, nextUnwatchedIndex: 0 })).toBeNull()
    expect(computeLiveNext({ ...shared, index: -1, nextUnwatchedIndex: null })).toBeNull()
    expect(computeLiveNext({ ...shared, index: -1, loop: true })).toBeNull()
    expect(computeLiveNext({ ...shared, index: -1, userInitiated: true })).toBeNull()
    expect(computeLiveNext({ ...shared, index: -1, unseenCount: 0 })).toBeNull()
  })

  it('is NOT null for any in-range index (0..length-1), no matter unseenCount/nextUnwatchedIndex', () => {
    const length = 20
    for (let index = 0; index < length; index++) {
      for (const unseenCount of [0, 1, 7, 20]) {
        for (const nextUnwatchedIndex of [undefined, null, 0, 3, index, length - 1, 999, -5]) {
          const result = computeLiveNext({
            length,
            index,
            unseenCount,
            loop: false,
            userInitiated: false,
            nextUnwatchedIndex,
          })
          expect(result).not.toBeNull()
        }
      }
    }
  })
})

describe('Q4 — a STALE nextUnwatchedIndex (>= length, or === the current index)', () => {
  // These only matter when the normal advance WOULD stop (the "wouldStop"
  // branch) — i.e. at the boundary. Set up index=4 (last of a 5-length
  // unwatched run inside a 10-item queue) so a plain advance would trigger
  // the boundary and consult nextUnwatchedIndex.
  const atBoundary = { length: 10, index: 4, unseenCount: 5, loop: false, userInitiated: false }

  /**
   * THE reported stall. `nextUnwatchedIndexRef` excludes the current index by
   * construction (`i !== currentIndex`), but that exclusion is computed in an
   * earlier render than the `idx` goNext resolves at call time — so when a
   * fresh arrival prepends and shifts every position, the stale index can
   * coincide with "here".
   *
   * Returned verbatim (the old behaviour) the caller did
   * `setCurrentKey(theaterItemKey(items[next]))` with `next === index`: React
   * bails on identical state, nothing re-renders, the ended video never gets a
   * new src, and the waiting stage never appears. Black stage, paused button,
   * no caught-up screen — exactly the owner's report.
   */
  it('never hands back a "next" that IS the current post — it waits instead', () => {
    const next = computeLiveNext({ ...atBoundary, nextUnwatchedIndex: atBoundary.index })
    expect(next).not.toBe(atBoundary.index)
    expect(next).toBe('waiting')
  })

  /**
   * The same staleness can point PAST the end after the queue shrinks.
   * `items[999]` is undefined, and `theaterItemKey(undefined)` throws or
   * produces a garbage key — either way the queue stops with no caught-up
   * screen. An unusable index means "nothing to rescue to".
   */
  it('ignores an out-of-range nextUnwatchedIndex rather than indexing past the end', () => {
    const next = computeLiveNext({ ...atBoundary, nextUnwatchedIndex: 999 })
    expect(next).toBe('waiting')
  })

  it('a well-formed nextUnwatchedIndex (in range, not the current index) behaves correctly — the rescue this feature is FOR', () => {
    const next = computeLiveNext({ ...atBoundary, nextUnwatchedIndex: 0 })
    expect(next).toBe(0)
  })

  it('a negative-but-not-null nextUnwatchedIndex (e.g. -1, the findIndex "not found" sentinel) is correctly treated as "nothing pending"', () => {
    // Guarded explicitly: `typeof nextUnwatchedIndex === 'number' &&
    // nextUnwatchedIndex >= 0`. -1 fails that guard, so it correctly falls
    // through to 'waiting' rather than being misread as index -1.
    expect(computeLiveNext({ ...atBoundary, nextUnwatchedIndex: -1 })).toBe('waiting')
  })
})

describe('Q5 — does orderLiveQueue ever place a fresh arrival somewhere other than index 0?', () => {
  it('YES: with two simultaneous arrivals, only the FIRST lands at index 0 — the second sits at index 1', () => {
    const items = [item('watched1', 5), item('arrival-a', 1), item('arrival-b', 2)]
    const wasSeen = setOf('watched1')
    const isFresh = setOf('arrival-a', 'arrival-b')
    const ordered = orderLiveQueue(items, wasSeen, isFresh)
    // Arrivals keep the order the merge gave them (not resorted by addedAt).
    expect(ids(ordered)).toEqual(['arrival-a', 'arrival-b', 'watched1'])
    expect(ids(ordered).indexOf('arrival-b')).toBe(1)
  })

  it('a resurfacing arrival that was ALSO previously watched still leads (arrived beats watched), but not necessarily at 0 behind another arrival', () => {
    const items = [item('brandNew', 1), item('resurfaced', 100), item('untouchedWatched', 2)]
    const wasSeen = setOf('resurfaced', 'untouchedWatched')
    const isFresh = setOf('brandNew', 'resurfaced')
    const ordered = orderLiveQueue(items, wasSeen, isFresh)
    expect(ids(ordered)).toEqual(['brandNew', 'resurfaced', 'untouchedWatched'])
    expect(ids(ordered).indexOf('resurfaced')).toBe(1)
  })

  it('single-arrival case (the reported scenario) DOES land at index 0 — confirms the screenshot grouping is not itself the bug', () => {
    const { ordered } = buildReportedQueue()
    expect(ids(ordered).indexOf('new')).toBe(0)
  })

  it('with no arrivals, orderLiveQueue never invents one at index 0 — unwatched leads instead', () => {
    const items = [item('watchedOld', 10), item('unwatchedTodo', 1)]
    const ordered = orderLiveQueue(items, setOf('watchedOld'), none)
    expect(ids(ordered)).toEqual(['unwatchedTodo', 'watchedOld'])
  })
})
