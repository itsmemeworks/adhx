import { describe, it, expect } from 'vitest'
import {
  pinKeyFirst,
  theaterUrlSyncPath,
  theaterTabNavRestore,
  isFeedEnd,
  computeCanPrev,
  computeCanNext,
  findFreshArrival,
  isSharedPostPinned,
  isSharedItemUnavailable,
  nextRepeatMode,
  shouldRewaitAfterArrival,
} from '@/components/theater/TheaterShell'
import { theaterItemKey } from '@/components/theater/types'

/**
 * Pure list-reorder helper backing TheaterShell's lead-pick/shared-item
 * pinning (docs/specs/theater-first.md): moves the item matching `pinnedKey`
 * to index 0 so the rail's visual order and the keyboard-nav order are
 * always the same list.
 */

type Item = { platform: string; bookmarkId: string; url: string }

function item(bookmarkId: string): Item {
  return { platform: 'twitter', bookmarkId, url: `https://x.com/u/status/${bookmarkId}` }
}

describe('pinKeyFirst', () => {
  const items = [item('a'), item('b'), item('c'), item('d')]

  it('moves the matching item to the front, preserving the rest of the order', () => {
    const key = theaterItemKey(item('c'))
    const result = pinKeyFirst(items, key)
    expect(result.map((it) => it.bookmarkId)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('returns the list unchanged (same reference) when the key is not found', () => {
    const result = pinKeyFirst(items, theaterItemKey(item('missing')))
    expect(result).toBe(items)
  })

  it('returns the list unchanged (same reference) when the key is already first', () => {
    const key = theaterItemKey(item('a'))
    const result = pinKeyFirst(items, key)
    expect(result).toBe(items)
  })

  it('returns the list unchanged when pinnedKey is null', () => {
    const result = pinKeyFirst(items, null)
    expect(result).toBe(items)
  })
})

/**
 * theaterUrlSyncPath() backs TheaterShell's address-bar sync (theater-first.md
 * §7): guards previewPath() with the "id AND author both present" rule so a
 * malformed path (e.g. `//status/123`) never reaches history.replaceState.
 */
describe('theaterUrlSyncPath', () => {
  it('builds the canonical preview path for a tweet', () => {
    expect(theaterUrlSyncPath({ platform: 'twitter', bookmarkId: '123', author: 'someuser' })).toBe(
      '/someuser/status/123',
    )
  })

  it('builds the canonical preview path for instagram, tiktok, and youtube', () => {
    expect(
      theaterUrlSyncPath({ platform: 'instagram', bookmarkId: 'abc', author: 'someuser' }),
    ).toBe('/reels/abc')
    expect(theaterUrlSyncPath({ platform: 'tiktok', bookmarkId: '999', author: '@someuser' })).toBe(
      '/@someuser/video/999',
    )
    expect(theaterUrlSyncPath({ platform: 'youtube', bookmarkId: 'xyz', author: 'someuser' })).toBe(
      '/shorts/xyz',
    )
  })

  it('returns null when bookmarkId is missing', () => {
    expect(theaterUrlSyncPath({ platform: 'twitter', bookmarkId: null, author: 'someuser' })).toBe(
      null,
    )
    expect(
      theaterUrlSyncPath({ platform: 'twitter', bookmarkId: undefined, author: 'someuser' }),
    ).toBe(null)
    expect(theaterUrlSyncPath({ platform: 'twitter', bookmarkId: '', author: 'someuser' })).toBe(
      null,
    )
  })

  it('returns null when author is missing or empty', () => {
    expect(theaterUrlSyncPath({ platform: 'twitter', bookmarkId: '123', author: '' })).toBe(null)
  })

  it('returns null for a null item', () => {
    expect(theaterUrlSyncPath(null)).toBe(null)
  })
})

describe('theaterTabNavRestore', () => {
  it('is a no-op when the bar is already a theater tab', () => {
    expect(theaterTabNavRestore('/live', '/saved')).toBe(null)
    expect(theaterTabNavRestore('/saved', '/live')).toBe(null)
    expect(theaterTabNavRestore('/saved', '/saved')).toBe(null)
    expect(theaterTabNavRestore('/collection', '/saved')).toBe(null)
    expect(theaterTabNavRestore('/collection', '/live')).toBe(null)
  })

  it('resyncs a Live replaceState preview path to the tab the viewer asked for', () => {
    expect(theaterTabNavRestore('/author99/status/99', '/saved')).toBe('/saved')
    expect(theaterTabNavRestore('/@bob/video/1', '/live')).toBe('/live')
  })
})

/**
 * End-of-feed waiting stage (theater-first.md addendum): the theater dead-
 * ends at the last post otherwise while fresh pulse items prepend unseen at
 * the top. These pure helpers back TheaterShell's enter/exit transitions —
 * see isFeedEnd (enters), computeCanPrev/computeCanNext (chevron state),
 * findFreshArrival (exits + auto-plays a genuinely new post).
 */
describe('isFeedEnd', () => {
  it('is true at the last index of a non-empty list', () => {
    expect(isFeedEnd(4, 3)).toBe(true)
  })

  it('is false everywhere before the last index', () => {
    expect(isFeedEnd(4, 0)).toBe(false)
    expect(isFeedEnd(4, 2)).toBe(false)
  })

  it('is false for a not-found index (-1), matching the pre-waiting clamp no-op', () => {
    expect(isFeedEnd(4, -1)).toBe(false)
  })

  it('is true for a single-item list at index 0', () => {
    expect(isFeedEnd(1, 0)).toBe(true)
  })
})

describe('computeCanPrev / computeCanNext', () => {
  it('mid-feed: prev enabled past the first item, next always enabled (not waiting)', () => {
    expect(computeCanPrev(2, false)).toBe(true)
    expect(computeCanNext(2, false)).toBe(true)
  })

  it('at the first item (not waiting): prev disabled, next enabled', () => {
    expect(computeCanPrev(0, false)).toBe(false)
    expect(computeCanNext(0, false)).toBe(true)
  })

  it('at the last real item (not waiting): next stays enabled — it leads into waiting', () => {
    expect(computeCanNext(3, false)).toBe(true)
  })

  it('while waiting: prev enabled (returns to the last post), next disabled', () => {
    expect(computeCanPrev(3, true)).toBe(true)
    expect(computeCanNext(3, true)).toBe(false)
  })

  it('no current item (-1): both disabled regardless of waiting', () => {
    expect(computeCanNext(-1, false)).toBe(false)
    expect(computeCanNext(-1, true)).toBe(false)
  })
})

/**
 * shared-post-repeat (owner rationale: a visitor lands on a shared preview
 * link and a 5s auto-advance carries them into the live pulse before they
 * can Save/tag/copy the link): `isSharedPostPinned` is the pure gate behind
 * both the player-level repeat (StageVideo's `loop` / StageYouTube's
 * seek-to-0 replay) and the 'timed' auto-advance suppression
 * (`progressKindForPin`). It's true only in shared mode, only while the pin
 * hasn't been cleared by a deliberate nav, and only while the shared post is
 * actually the item on stage.
 */
describe('isSharedPostPinned', () => {
  const sharedKey = 'twitter:123'
  const otherKey = 'twitter:456'

  it('is true on landing: shared mode, pinned, current IS the shared post', () => {
    expect(isSharedPostPinned('shared', sharedKey, true, sharedKey)).toBe(true)
  })

  it('is false once the pin is cleared (a deliberate nav happened)', () => {
    expect(isSharedPostPinned('shared', sharedKey, false, sharedKey)).toBe(false)
  })

  it('is false for every other mode, even if pinned=true and the keys match', () => {
    expect(isSharedPostPinned('home', sharedKey, true, sharedKey)).toBe(false)
    expect(isSharedPostPinned('playlist', sharedKey, true, sharedKey)).toBe(false)
    expect(isSharedPostPinned('personal', sharedKey, true, sharedKey)).toBe(false)
  })

  it('is false once the visitor has navigated to a different post, even if the pin flag is stale', () => {
    expect(isSharedPostPinned('shared', sharedKey, true, otherKey)).toBe(false)
  })

  it('is false when there is no shared item (home mode has none)', () => {
    expect(isSharedPostPinned('shared', null, true, sharedKey)).toBe(false)
  })

  it('is false when nothing is current yet (currentKey null)', () => {
    expect(isSharedPostPinned('shared', sharedKey, true, null)).toBe(false)
  })
})

/**
 * TASK 3 (owner screenshot report): a shared-mode preview page whose source
 * tweet couldn't be resolved (deleted/private/suspended) renders a graceful
 * `StageUnavailable` lead instead of the real post. `isSharedItemUnavailable`
 * is the pure gate deciding when — same identity discipline as
 * `isSharedPostPinned` (mode + key match), but independent of the pin (an
 * unavailable lead is never pinned in the first place — see the shell's
 * `sharedPinned` init).
 */
describe('isSharedItemUnavailable', () => {
  const sharedKey = 'twitter:123'
  const otherKey = 'twitter:456'

  it('is true when the current item IS the shared lead and it was flagged unavailable', () => {
    expect(isSharedItemUnavailable('shared', true, sharedKey, sharedKey)).toBe(true)
  })

  it('is false when the lead resolved fine (not flagged unavailable)', () => {
    expect(isSharedItemUnavailable('shared', false, sharedKey, sharedKey)).toBe(false)
  })

  it('is false for every other mode, even if flagged unavailable and the keys match', () => {
    expect(isSharedItemUnavailable('home', true, sharedKey, sharedKey)).toBe(false)
    expect(isSharedItemUnavailable('playlist', true, sharedKey, sharedKey)).toBe(false)
    expect(isSharedItemUnavailable('personal', true, sharedKey, sharedKey)).toBe(false)
  })

  it('is false once the queue has auto-advanced (or the visitor navigated) past the unavailable lead', () => {
    expect(isSharedItemUnavailable('shared', true, sharedKey, otherKey)).toBe(false)
  })

  it('is false when there is no shared item (home mode has none)', () => {
    expect(isSharedItemUnavailable('shared', true, null, sharedKey)).toBe(false)
  })

  it('is false when nothing is current yet (currentKey null)', () => {
    expect(isSharedItemUnavailable('shared', true, sharedKey, null)).toBe(false)
  })
})

describe('findFreshArrival', () => {
  it('returns null when freshKeys has nothing beyond the baseline', () => {
    const baseline = new Set(['twitter:1', 'twitter:2'])
    const freshKeys = new Set(['twitter:1', 'twitter:2'])
    expect(findFreshArrival(freshKeys, baseline)).toBe(null)
  })

  it('returns a key present in freshKeys but not in the baseline', () => {
    const baseline = new Set(['twitter:1'])
    const freshKeys = new Set(['twitter:1', 'twitter:3'])
    expect(findFreshArrival(freshKeys, baseline)).toBe('twitter:3')
  })

  it('returns the earliest-inserted new key when several arrived', () => {
    const baseline = new Set(['twitter:1'])
    const freshKeys = new Set(['twitter:1', 'twitter:2', 'twitter:3'])
    expect(findFreshArrival(freshKeys, baseline)).toBe('twitter:2')
  })

  it('returns null against an empty freshKeys set', () => {
    expect(findFreshArrival(new Set(), new Set())).toBe(null)
  })
})

/**
 * Round 8: Spotify-style repeat control. `nextRepeatMode` is the button's
 * pure cycle order (off -> all -> one -> off); `shouldRewaitAfterArrival`
 * decides whether a non-user advance off the waiting stage's auto-played
 * fresh arrival re-enters waiting instead of continuing into the queue.
 */
describe('nextRepeatMode', () => {
  it('cycles off -> all -> one -> off (default, wrapOnly omitted)', () => {
    expect(nextRepeatMode('off')).toBe('all')
    expect(nextRepeatMode('all')).toBe('one')
    expect(nextRepeatMode('one')).toBe('off')
  })

  it('cycles off -> all -> one -> off when wrapOnly is explicitly false', () => {
    expect(nextRepeatMode('off', false)).toBe('all')
    expect(nextRepeatMode('all', false)).toBe('one')
    expect(nextRepeatMode('one', false)).toBe('off')
  })

  /**
   * Collection mode (a curated tag collection): looping is the resting
   * state, so there's no 'off' to cycle to — the button just toggles
   * whole-queue <-> this-post.
   */
  it('wrapOnly: toggles all <-> one, with no "off" state', () => {
    expect(nextRepeatMode('all', true)).toBe('one')
    expect(nextRepeatMode('one', true)).toBe('all')
  })

  it('wrapOnly: an "off" input (shouldn\'t normally occur in collection mode) resolves to "all", never "off"', () => {
    expect(nextRepeatMode('off', true)).toBe('all')
  })
})

describe('shouldRewaitAfterArrival', () => {
  it('is true when the current item is the staged fresh arrival and repeat is off', () => {
    expect(shouldRewaitAfterArrival('twitter:1', 'twitter:1', 'off')).toBe(true)
  })

  it('is false when nothing is staged (stagedKey null)', () => {
    expect(shouldRewaitAfterArrival(null, 'twitter:1', 'off')).toBe(false)
  })

  it('is false once the current item has moved past the staged arrival', () => {
    expect(shouldRewaitAfterArrival('twitter:1', 'twitter:2', 'off')).toBe(false)
  })

  it('is false under repeat "all" — the queue loops instead of re-waiting', () => {
    expect(shouldRewaitAfterArrival('twitter:1', 'twitter:1', 'all')).toBe(false)
  })

  it('is false under repeat "one" — the staged post repeats instead of re-waiting', () => {
    expect(shouldRewaitAfterArrival('twitter:1', 'twitter:1', 'one')).toBe(false)
  })
})
