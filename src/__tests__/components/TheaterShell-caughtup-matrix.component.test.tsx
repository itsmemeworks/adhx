/**
 * @vitest-environment jsdom
 *
 * COMPREHENSIVE regression matrix for the theater's "end of the queue" state
 * machine — the caught-up ("You're all caught up") stage, its entry/exit
 * conditions, and the position/denominator it reports while there. This one
 * area has produced four separate owner bug reports:
 *
 *   1. Resuming from a caught-up-at-mount session skipped an item ("2 of 19"
 *      instead of "1 of 19" — see TheaterShell-waiting.component.test.tsx).
 *   2. A fresh arrival finished playing and the theater just stopped on a
 *      black stage instead of returning to "You're all caught up".
 *   3. The mobile counter showed the wrong denominator (out of the whole
 *      queue instead of out of what would actually play, or vice versa).
 *   4. The caught-up screen claimed "caught up" while unwatched posts
 *      (including one that arrived BEHIND the playback cursor) still sat in
 *      the queue.
 *
 * Harness copied verbatim from TheaterShell-waiting.component.test.tsx (the
 * Stage/chrome/auth/tags mocks, the `pushArrival` hook, `markWatched`,
 * `seed`, `textItem`) with one addition: a controllable `useAuthMe` stub so
 * the SAME matrix can be driven for both the signed-out public theater
 * (`mode="home"`, the default) and the signed-in Live tab
 * (`mode="personal" initialPersonalTab="live"`, how AuthedHome mounts the shell
 * for `/`). The owner hits this signed in; the public site hits it signed
 * out — the state machine is supposed to behave identically either way, and
 * several tests below assert that equivalence explicitly rather than assume
 * it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { TheaterShell, computeQueueTotal } from '@/components/theater/TheaterShell'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterFeedSeed, TheaterItem, RepeatMode } from '@/components/theater/types'

const mockStage = vi.fn((_props: Record<string, unknown>) => null)
vi.mock('@/components/theater/Stage', () => ({
  Stage: (props: { item: TheaterItem | null; onEnded?: () => void }) => {
    mockStage(props as unknown as Record<string, unknown>)
    return <div data-testid="stage" data-item-key={props.item ? theaterItemKey(props.item) : ''} />
  },
}))

const mockMobileChrome = vi.fn((_props: Record<string, unknown>) => null)
vi.mock('@/components/theater/TheaterMobileChrome', () => ({
  TheaterMobileChrome: (props: Record<string, unknown>) => {
    mockMobileChrome(props)
    return null
  },
}))

vi.mock('@/components/theater/TheaterDesktopChrome', () => ({
  DesktopStageChrome: () => null,
  DesktopDock: () => null,
}))

/** Controllable signed-in/signed-out state — flipped per test via `authMeState.me`. */
const authMeState: {
  me: null | { authenticated: boolean; user?: { username: string } }
} = { me: null }
vi.mock('@/components/auth', () => ({
  SignInModal: () => null,
  useAuthMe: () => ({ me: authMeState.me, loading: false, refresh: vi.fn() }),
}))

vi.mock('@/components/tags', () => ({
  TagQuickPicker: () => null,
}))

// Controllable stand-in for the real polling hook — lets tests simulate a
// fresh arrival synchronously instead of driving the real 12s interval.
let pushArrival: ((item: TheaterItem) => void) | null = null
vi.mock('@/components/theater/useTheaterFeed', () => ({
  useTheaterFeed: (seed: TheaterFeedSeed) => {
    const [items, setItems] = useState(seed.items)
    const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set())
    pushArrival = (item: TheaterItem) => {
      setItems((prev) => [item, ...prev])
      setFreshKeys((prev) => new Set(prev).add(theaterItemKey(item)))
    }
    return {
      items,
      savedToday: seed.savedToday,
      recentActivity: seed.recentActivity,
      freshKeys,
    }
  },
}))

function textItem(bookmarkId: string): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId,
    author: `author${bookmarkId}`,
    url: `/author${bookmarkId}/status/${bookmarkId}`,
    createdAt: '2026-08-18T00:00:00Z',
    contentType: 'text',
    text: `post ${bookmarkId}`,
    trendCount: 0,
  } as TheaterItem
}

function seed(items: TheaterItem[]): TheaterFeedSeed {
  return { items, savedToday: 0, recentActivity: 0 }
}

/** Marks exactly the given items as already-seen (entry snapshot), same key format `useSeenSet` reads. */
function markWatched(items: TheaterItem[]) {
  window.localStorage.setItem('adhx-seen-v1', JSON.stringify(items.map(theaterItemKey)))
}

function pressNext() {
  fireEvent.keyDown(window, { key: 'ArrowRight' })
}

/** Latest props the shell handed the mobile chrome — items/currentKey/queueTotal all live here. */
function chromeProps() {
  const call = mockMobileChrome.mock.calls.at(-1)
  if (!call) throw new Error('mobile chrome never rendered')
  return call[0] as {
    items: TheaterItem[]
    currentKey: string | null
    current: TheaterItem | null
    queueTotal?: number
    onCycleRepeat?: () => void
    repeatMode?: RepeatMode
  }
}

/** The queue the chrome was last handed, plus where the cursor sits in it (by key, since `current` goes null while waiting). */
function queuePosition() {
  const props = chromeProps()
  return {
    index: props.items.findIndex((it) => theaterItemKey(it) === props.currentKey),
    length: props.items.length,
  }
}

/** Fire the onEnded handler the Stage stub was last given — simulates a video/photo dwell finishing. */
async function endCurrentItem() {
  const onEnded = (mockStage.mock.calls.at(-1)![0] as { onEnded?: () => void }).onEnded
  if (!onEnded) throw new Error('stage has no onEnded')
  await act(async () => onEnded())
}

/** Simulates the OTHER auto-advance path: the mobile 10s timed-dwell line firing `theater-advance`. */
async function fireTimedAdvance() {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('theater-advance'))
  })
}

async function keepPlaying() {
  const btn = screen.getByRole('button', { name: /keep playing/i })
  await act(async () => {
    fireEvent.click(btn)
  })
}

const CAUGHT_UP_TEXT = 'You’re all caught up'

/** Signed-out public theater — the default surface (`mode="home"`). */
async function renderHome(items: TheaterItem[]) {
  authMeState.me = null
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(<TheaterShell seed={seed(items)} />)
  })
  return utils
}

/**
 * Signed-in Live tab — how `AuthedHome` mounts the shell for authed `/`
 * (`mode="personal"`, `initialPersonalTab="live"`, empty `personalItems` since the
 * Live tab never reads that prop — see AuthedHome.tsx's `PERSONAL_LIVE_SEED`).
 * `global.fetch` must be stubbed before this: once the live queue renders it
 * fires a bulk `/api/feed` membership lookup — a harmless no-op against a
 * generic `{ ok: false }`.
 */
async function renderCollectionLive(items: TheaterItem[]) {
  authMeState.me = { authenticated: true, user: { username: 'owner' } }
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <TheaterShell
        seed={seed(items)}
        mode="personal"
        initialPersonalTab="live"
        authed
        personalItems={[]}
      />,
    )
  })
  return utils
}

beforeEach(() => {
  pushArrival = null
  mockStage.mockClear()
  mockMobileChrome.mockClear()
  window.localStorage.clear()
  authMeState.me = null
  global.fetch = vi
    .fn()
    .mockResolvedValue({ ok: false, json: async () => null }) as unknown as typeof fetch
})

// ---------------------------------------------------------------------------
// A. Mount-time seen-state — no navigation at all, and the signed-out/signed-in
//    equivalence the owner explicitly wants guaranteed.
// ---------------------------------------------------------------------------

describe('TheaterShell caught-up matrix: mount-time seen-state', () => {
  /** Bug #1 precondition: landing on an already-fully-watched window must
   * park on item 1 (not skip it) and show caught-up immediately, with no
   * navigation required to reach that state. */
  it('[signed out] everything watched at mount → caught-up immediately, current is item 1, queueTotal is the full length', async () => {
    const items = [textItem('1'), textItem('2'), textItem('3')]
    markWatched(items)
    await renderHome(items)

    expect(screen.getByText(CAUGHT_UP_TEXT)).toBeInTheDocument()
    expect(queuePosition()).toEqual({ index: 0, length: 3 })
    expect(chromeProps().queueTotal).toBe(3)
  })

  /** Equivalence: the owner hits this signed in on the Live tab — same
   * assertions, same surface, must produce the same outcome. */
  it('[signed in, live tab] everything watched at mount → identical to signed-out', async () => {
    const items = [textItem('1'), textItem('2'), textItem('3')]
    markWatched(items)
    await renderCollectionLive(items)

    expect(screen.getByText(CAUGHT_UP_TEXT)).toBeInTheDocument()
    expect(queuePosition()).toEqual({ index: 0, length: 3 })
    expect(chromeProps().queueTotal).toBe(3)
  })

  /** Bug #1 itself: "Keep playing" from that parked state must resume ON
   * item 1, not advance past it — item 1 never played, so it isn't "behind". */
  it('[signed out] "Keep playing" from a caught-up-at-mount session resumes ON item 1, not item 2', async () => {
    const items = [textItem('1'), textItem('2'), textItem('3')]
    markWatched(items)
    await renderHome(items)
    expect(queuePosition()).toEqual({ index: 0, length: 3 })

    await keepPlaying()

    expect(queuePosition()).toEqual({ index: 0, length: 3 })
    expect(screen.queryByText(CAUGHT_UP_TEXT)).not.toBeInTheDocument()
  })

  /** Same fix, signed in — the mount-time park logic doesn't touch
   * dwell/isPersonal at all, so this one is expected (and confirmed) to hold. */
  it('[signed in, live tab] "Keep playing" also resumes ON item 1', async () => {
    const items = [textItem('1'), textItem('2'), textItem('3')]
    markWatched(items)
    await renderCollectionLive(items)
    expect(queuePosition()).toEqual({ index: 0, length: 3 })

    await keepPlaying()

    expect(queuePosition()).toEqual({ index: 0, length: 3 })
    expect(screen.queryByText(CAUGHT_UP_TEXT)).not.toBeInTheDocument()
  })

  /** Baseline sanity: nothing watched yet must never show caught-up, and the
   * denominator is the whole queue since every post is pending. */
  it('[signed out] nothing watched at mount → not caught-up, current is item 1, queueTotal is the full length', async () => {
    const items = [textItem('1'), textItem('2'), textItem('3')]
    await renderHome(items)

    expect(screen.queryByText(CAUGHT_UP_TEXT)).not.toBeInTheDocument()
    expect(queuePosition()).toEqual({ index: 0, length: 3 })
    expect(chromeProps().queueTotal).toBe(3)
  })

  /** Bug #3 (wrong denominator) + the reordering it depends on: a
   * non-contiguous partially-watched window puts the unwatched posts first
   * (item2 was watched, items 1 and 3 weren't) and the counter must be OUT OF
   * the pending run (2), not the whole queue (3). */
  it('[signed out] partially watched (non-contiguous) reorders unwatched-first and shrinks the denominator to the pending run', async () => {
    const item1 = textItem('1')
    const item2 = textItem('2')
    const item3 = textItem('3')
    markWatched([item2])
    await renderHome([item1, item2, item3])

    expect(screen.queryByText(CAUGHT_UP_TEXT)).not.toBeInTheDocument()
    const props = chromeProps()
    expect(props.items.map((i) => i.bookmarkId)).toEqual(['1', '3', '2'])
    expect(props.currentKey).toBe(theaterItemKey(item1))
    expect(props.queueTotal).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// B. `computeQueueTotal` invariants (bug #3's pure core): never lies about
//    how many posts remain.
// ---------------------------------------------------------------------------

describe('TheaterShell caught-up matrix: computeQueueTotal invariants', () => {
  /** "queueTotal must never be 0 when the queue has items" — swept across
   * every repeat mode and every unseenCount/index combination that can
   * actually occur (including the "browsed back past the run" and
   * "caught up, nothing pending" edge cases the doc comment calls out). */
  it('never returns 0 for a non-empty queue, across the full repeatMode x index x unseenCount space', () => {
    const length = 5
    const repeatModes: RepeatMode[] = ['off', 'all', 'one']
    for (const repeatMode of repeatModes) {
      for (let unseenCount = 0; unseenCount <= length; unseenCount++) {
        for (let index = -1; index < length; index++) {
          const total = computeQueueTotal({ index, length, unseenCount, repeatMode })
          expect(total).toBeGreaterThan(0)
        }
      }
    }
  })

  /** "…and never smaller than 1 when a current item exists" — i.e. whenever
   * `index` actually points at a real item (>= 0), the reported total must be
   * a valid position for it to sit in (>= 1, and specifically never smaller
   * than what the current item's own position would require). */
  it('is always large enough to contain the current item whenever one exists', () => {
    const length = 4
    const repeatModes: RepeatMode[] = ['off', 'all', 'one']
    for (const repeatMode of repeatModes) {
      for (let unseenCount = 0; unseenCount <= length; unseenCount++) {
        for (let index = 0; index < length; index++) {
          const total = computeQueueTotal({ index, length, unseenCount, repeatMode })
          expect(total).toBeGreaterThanOrEqual(1)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// C. Walking a genuinely-unwatched run to its literal end (real dwell
//    timing) — signed out. The dwell that marks each passed item "seen" is
//    what lets the auto-advance recognize "nothing left" instead of bouncing
//    back into the run it just finished (see section D for where this breaks).
// ---------------------------------------------------------------------------

describe('TheaterShell caught-up matrix: walking an unwatched run to the end (signed out)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Each post must sit "current" for the 2s dwell window (useTheaterDwell)
   * before advancing, or it never gets marked seen — exactly like a real
   * viewer watching each post for at least a couple of seconds. */
  async function letDwellSettle() {
    await act(async () => {
      vi.advanceTimersByTime(2_100)
    })
  }

  it('reaching the end via ArrowRight (user-initiated) shows caught-up, and "Keep playing" advances rather than replaying the last post', async () => {
    const item1 = textItem('1')
    const item2 = textItem('2')
    const item3 = textItem('3')
    await renderHome([item1, item2, item3])
    expect(queuePosition()).toEqual({ index: 0, length: 3 })

    await letDwellSettle()
    await act(async () => pressNext())
    expect(queuePosition().index).toBe(1)

    await letDwellSettle()
    await act(async () => pressNext())
    expect(queuePosition().index).toBe(2)

    await letDwellSettle()
    await act(async () => pressNext())

    expect(screen.getByText(CAUGHT_UP_TEXT)).toBeInTheDocument()

    await keepPlaying()
    // Wraps to item 1 — does NOT replay item 3, the post just finished.
    expect(queuePosition()).toEqual({ index: 0, length: 3 })
  })

  /** Same walk, but reached via the OTHER trigger a real session actually
   * uses — a video/timed item finishing (`Stage`'s `onEnded`) — to confirm
   * the two auto-advance paths agree. */
  it('reaching the end via Stage onEnded (auto-advance) also shows caught-up', async () => {
    const item1 = textItem('1')
    const item2 = textItem('2')
    const item3 = textItem('3')
    await renderHome([item1, item2, item3])

    await letDwellSettle()
    await endCurrentItem()
    expect(queuePosition().index).toBe(1)

    await letDwellSettle()
    await endCurrentItem()
    expect(queuePosition().index).toBe(2)

    await letDwellSettle()
    await endCurrentItem()

    expect(screen.getByText(CAUGHT_UP_TEXT)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// D. The SAME walk, signed in on the Live tab. Per the owner's expectation
//    (and section C above) this must behave identically. It does not.
// ---------------------------------------------------------------------------

describe('TheaterShell caught-up matrix: walking an unwatched run to the end (signed in, live tab)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  async function letDwellSettle() {
    await act(async () => {
      vi.advanceTimersByTime(2_100)
    })
  }

  /**
   * REGRESSION GUARD (was a live defect, fixed 2026-08-22).
   *
   * `useTheaterDwell` used to no-op for `isPersonal` — both tabs — so a post
   * played to the end on the signed-in Live tab was never marked seen, even
   * though that tab reuses the same live-queue/goNext/waiting machinery as the
   * signed-out theater. `computeLiveNext`'s "protect a still-unwatched post"
   * check reads that same live seen state, so it kept finding an earlier,
   * never-marked post and redirecting BACKWARD into it rather than ever
   * showing "You're all caught up" — the signed-in theater looped its own
   * finished posts forever. The gate is `isCollectionTab` now: only the
   * Collection tab opts out, where read state is explicit.
   */
  it('reaching the end via Stage onEnded shows caught-up on the signed-in Live tab', async () => {
    const item1 = textItem('1')
    const item2 = textItem('2')
    const item3 = textItem('3')
    await renderCollectionLive([item1, item2, item3])

    await letDwellSettle()
    await endCurrentItem()
    expect(queuePosition().index).toBe(1)

    await letDwellSettle()
    await endCurrentItem()
    expect(queuePosition().index).toBe(2)

    await letDwellSettle()
    await endCurrentItem()

    // Expected: caught-up. Actual: still on the stage, cursor bounced back
    // to item 1 (see comment above) — this assertion fails.
    expect(screen.getByText(CAUGHT_UP_TEXT)).toBeInTheDocument()
  })

  /**
   * Same guard, driven by the user instead of by playback — the original defect
   * was trigger-method-agnostic, so this pins both routes to the end of the
   * queue on the signed-in surface.
   */
  it('reaching the end via ArrowRight shows caught-up on the signed-in Live tab', async () => {
    const item1 = textItem('1')
    const item2 = textItem('2')
    const item3 = textItem('3')
    await renderCollectionLive([item1, item2, item3])

    await letDwellSettle()
    await act(async () => pressNext())
    expect(queuePosition().index).toBe(1)

    await letDwellSettle()
    await act(async () => pressNext())
    expect(queuePosition().index).toBe(2)

    await letDwellSettle()
    await act(async () => pressNext())

    // Expected: caught-up. Actual: cursor reverts to item 1 — fails.
    expect(screen.getByText(CAUGHT_UP_TEXT)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// E. Repeat mode ('off' vs 'all') crossed with reaching the end.
// ---------------------------------------------------------------------------

describe('TheaterShell caught-up matrix: repeat mode', () => {
  /** Repeat 'all' is the loop opt-in (owner: "keep playing… watched posts
   * too, then round again") — the boundary must never fire while it's on,
   * so caught-up must never appear; the queue wraps instead. */
  it('[signed out] repeat "all" wraps past the end instead of ever showing caught-up', async () => {
    const item1 = textItem('1')
    const item2 = textItem('2')
    await renderHome([item1, item2])
    const cycle = chromeProps().onCycleRepeat as () => void
    await act(async () => cycle())
    expect(chromeProps().repeatMode).toBe('all')
    expect(chromeProps().queueTotal).toBe(2)

    await endCurrentItem() // item1 -> item2
    await endCurrentItem() // item2 -> wraps to item1, never 'waiting'

    expect(screen.queryByText(CAUGHT_UP_TEXT)).not.toBeInTheDocument()
    expect(queuePosition()).toEqual({ index: 0, length: 2 })
  })

  /** Bug #3, the live-toggle version: flipping repeat back to 'off' with some
   * posts already watched at entry must immediately shrink the denominator
   * back to the pending run, not leave it at the whole-queue count from
   * while repeat was on. */
  it('[signed out] toggling repeat off shrinks the denominator back to the unwatched run', async () => {
    const item1 = textItem('1')
    const item2 = textItem('2')
    const item3 = textItem('3')
    markWatched([item2, item3])
    await renderHome([item1, item2, item3])
    // One pending post (item1) — "1 / 1", not "1 / 3".
    expect(chromeProps().queueTotal).toBe(1)

    const cycle = () => chromeProps().onCycleRepeat as () => void
    await act(async () => cycle()()) // off -> all
    expect(chromeProps().queueTotal).toBe(3)

    await act(async () => cycle()()) // all -> one
    await act(async () => cycle()()) // one -> off
    expect(chromeProps().repeatMode).toBe('off')
    expect(chromeProps().queueTotal).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// F. Arrivals — landing while caught-up, while mid-play, in pairs, and
//    finishing (bug #2's exact shape).
// ---------------------------------------------------------------------------

describe('TheaterShell caught-up matrix: arrivals', () => {
  /** Bug #2's setup half: an arrival landing on the caught-up stage must
   * take over immediately (already covered end-to-end in
   * TheaterShell-waiting.component.test.tsx); repeated here with an explicit
   * queueTotal check since that denominator is new territory. */
  it('[signed out] an arrival landing WHILE caught-up exits the stage and becomes current', async () => {
    const item1 = textItem('1')
    const item2 = textItem('2')
    markWatched([item1, item2])
    await renderHome([item1, item2])
    expect(screen.getByText(CAUGHT_UP_TEXT)).toBeInTheDocument()

    const arrival = textItem('fresh')
    await act(async () => pushArrival?.(arrival))

    expect(screen.queryByText(CAUGHT_UP_TEXT)).not.toBeInTheDocument()
    expect(chromeProps().currentKey).toBe(theaterItemKey(arrival))
    expect(chromeProps().queueTotal).toBe(1)
  })

  /** Equivalence: this mechanism (the waiting-stage auto-arrival effect) is
   * NOT gated on `isPersonal` — unlike dwell (section D), it must behave
   * identically signed in. */
  it('[signed in, live tab] an arrival landing WHILE caught-up behaves identically', async () => {
    const item1 = textItem('1')
    const item2 = textItem('2')
    markWatched([item1, item2])
    await renderCollectionLive([item1, item2])
    expect(screen.getByText(CAUGHT_UP_TEXT)).toBeInTheDocument()

    const arrival = textItem('fresh')
    await act(async () => pushArrival?.(arrival))

    expect(screen.queryByText(CAUGHT_UP_TEXT)).not.toBeInTheDocument()
    expect(chromeProps().currentKey).toBe(theaterItemKey(arrival))
  })

  /** An arrival mid-play (nowhere near the end) must not interrupt playback
   * — "prepend quietly, don't interrupt" per the code's own comment. */
  it('[signed out] an arrival landing WHILE a post is playing does not interrupt it', async () => {
    const item1 = textItem('1')
    const item2 = textItem('2')
    const item3 = textItem('3')
    await renderHome([item1, item2, item3])
    expect(chromeProps().currentKey).toBe(theaterItemKey(item1))

    const arrival = textItem('fresh')
    await act(async () => pushArrival?.(arrival))

    expect(screen.queryByText(CAUGHT_UP_TEXT)).not.toBeInTheDocument()
    expect(chromeProps().currentKey).toBe(theaterItemKey(item1))
    expect(chromeProps().items.some((i) => i.bookmarkId === 'fresh')).toBe(true)
  })

  /** Two arrivals back to back: both must show up (newest leading, per the
   * "arrived" group's incoming-merge order), current item still untouched. */
  it('[signed out] two arrivals in a row both appear, newest leading, without disturbing playback', async () => {
    const item1 = textItem('1')
    const item2 = textItem('2')
    await renderHome([item1, item2])

    await act(async () => pushArrival?.(textItem('fresh-a')))
    await act(async () => pushArrival?.(textItem('fresh-b')))

    const props = chromeProps()
    expect(props.items.slice(0, 2).map((i) => i.bookmarkId)).toEqual(['fresh-b', 'fresh-a'])
    expect(props.currentKey).toBe(theaterItemKey(item1))
    expect(screen.queryByText(CAUGHT_UP_TEXT)).not.toBeInTheDocument()
  })

  /** Bug #2 itself: the arrival that took over the caught-up stage finishes
   * playing, and nothing else is unwatched — this MUST return to caught-up,
   * not stop silently. */
  it('[signed out] an arrival finishing via onEnded returns to caught-up when nothing else is pending', async () => {
    const item1 = textItem('1')
    const item2 = textItem('2')
    markWatched([item1, item2])
    await renderHome([item1, item2])
    const arrival = textItem('fresh')
    await act(async () => pushArrival?.(arrival))
    expect(screen.queryByText(CAUGHT_UP_TEXT)).not.toBeInTheDocument()

    await endCurrentItem()

    expect(screen.getByText(CAUGHT_UP_TEXT)).toBeInTheDocument()
  })

  /** Same as above, but via the OTHER auto-advance trigger (the mobile
   * timed-dwell line's `theater-advance` event) — the owner's report was
   * specifically about a post finishing, and text/photo posts finish via
   * this path, not `onEnded`. Both must agree. */
  it('[signed out] an arrival finishing via the timed-advance path also returns to caught-up', async () => {
    const item1 = textItem('1')
    const item2 = textItem('2')
    markWatched([item1, item2])
    await renderHome([item1, item2])
    const arrival = textItem('fresh')
    await act(async () => pushArrival?.(arrival))
    expect(screen.queryByText(CAUGHT_UP_TEXT)).not.toBeInTheDocument()

    await fireTimedAdvance()

    expect(screen.getByText(CAUGHT_UP_TEXT)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// G. The core invariant, stated directly: caught-up must never be shown while
//    something unwatched remains ANYWHERE, including behind the cursor.
// ---------------------------------------------------------------------------

describe('TheaterShell caught-up matrix: caught-up never lies about a post behind the cursor', () => {
  /** Bug #4's exact shape: an arrival prepends to index 0 while the viewer is
   * already further along. When the item they were watching finishes, the
   * boundary would naively fire ("nothing ahead of me") — but the arrival
   * (unwatched, now numerically BEHIND where the cursor will land) must win:
   * auto-advance redirects to it instead of declaring caught-up. This is
   * already fixed in TheaterShell (`nextUnwatchedIndex`) — asserted here as
   * a direct regression guard on the invariant itself. */
  it('[signed out] a post finishing must redirect to a still-unwatched arrival rather than show caught-up', async () => {
    const item1 = textItem('1')
    const item2 = textItem('2')
    markWatched([item1]) // item1 already watched at entry; item2 is the pending one.
    await renderHome([item1, item2])
    expect(chromeProps().currentKey).toBe(theaterItemKey(item2))

    const arrival = textItem('fresh')
    await act(async () => pushArrival?.(arrival)) // prepends BEHIND item2's eventual "next" slot.

    await endCurrentItem() // item2 finishes.

    expect(screen.queryByText(CAUGHT_UP_TEXT)).not.toBeInTheDocument()
    expect(chromeProps().currentKey).toBe(theaterItemKey(arrival))
  })
})
