/**
 * @vitest-environment jsdom
 *
 * The repeat control IS the auto-advance switch (owner asked whether the
 * boundary needed one of its own; it doesn't). Two properties make it read like
 * a switch rather than a per-visit toggle:
 *
 *  1. "Keep playing" (mode 'all') PERSISTS across visits, so a viewer who
 *     wants continuous play doesn't re-set it every time. 'one' deliberately
 *     does NOT persist — it's about the post in front of you, and inheriting it
 *     next visit would strand you looping something at random.
 *  2. Repeat off counts Now playing + Next; Repeat all counts the pile.
 *
 * Harness copied from TheaterShell-waiting.component.test.tsx: the chromes are
 * capturing stubs, so the test drives `onCycleRepeat` and reads back the props
 * the shell hands them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, act, screen } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'

const mockStage = vi.fn((_props: Record<string, unknown>) => null)
vi.mock('@/components/theater/Stage', () => ({
  Stage: (props: Record<string, unknown>) => {
    mockStage(props)
    return <div data-testid="stage" />
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

vi.mock('@/components/auth', () => ({
  SignInModal: () => null,
  useAuthMe: () => ({ me: null, loading: false, refresh: vi.fn() }),
}))

vi.mock('@/components/tags', () => ({
  TagQuickPicker: () => null,
}))

vi.mock('@/components/theater/useTheaterFeed', () => ({
  useTheaterFeed: (seed: TheaterFeedSeed) => {
    const [items] = useState(seed.items)
    return {
      items,
      savedToday: seed.savedToday,
      recentActivity: seed.recentActivity,
      freshKeys: new Set<string>(),
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
    addedAt: '2026-08-18T00:00:00Z',
    contentType: 'text',
    text: `post ${bookmarkId}`,
    trendCount: 0,
  } as TheaterItem
}

function seed(items: TheaterItem[]): TheaterFeedSeed {
  return { items, savedToday: 0, recentActivity: 0 }
}

/** Latest props the shell handed the mobile chrome. */
function chromeProps() {
  const call = mockMobileChrome.mock.calls.at(-1)
  if (!call) throw new Error('mobile chrome never rendered')
  return call[0]
}

async function cycleRepeat() {
  const cycle = chromeProps().onCycleRepeat as (() => void) | undefined
  if (!cycle) throw new Error('repeat control not offered')
  await act(async () => cycle())
}

const STORAGE_KEY = 'adhx-theater-repeat'

describe('TheaterShell: repeat is a remembered switch', () => {
  beforeEach(() => {
    mockMobileChrome.mockClear()
    mockStage.mockClear()
    window.localStorage.clear()
  })

  it('remembers "keep playing" across visits', async () => {
    const { unmount } = render(<TheaterShell seed={seed([textItem('1'), textItem('2')])} />)
    expect(chromeProps().repeatMode).toBe('off')

    await cycleRepeat() // off -> all
    expect(chromeProps().repeatMode).toBe('all')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('all')

    // A later visit picks it back up rather than resetting to off.
    unmount()
    mockMobileChrome.mockClear()
    render(<TheaterShell seed={seed([textItem('1'), textItem('2')])} />)
    expect(chromeProps().repeatMode).toBe('all')
  })

  it('does NOT let "repeat this post" overwrite the remembered choice', async () => {
    render(<TheaterShell seed={seed([textItem('1'), textItem('2')])} />)

    await cycleRepeat() // off -> all
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('all')

    await cycleRepeat() // all -> one
    expect(chromeProps().repeatMode).toBe('one')
    // 'one' is about the current post, so the durable preference stands.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('all')
  })

  it('records turning it back off, so "off" is a choice too', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'all')
    render(<TheaterShell seed={seed([textItem('1'), textItem('2')])} />)
    expect(chromeProps().repeatMode).toBe('all')

    await cycleRepeat() // all -> one
    await cycleRepeat() // one -> off
    expect(chromeProps().repeatMode).toBe('off')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('off')
  })

  it('counts Now playing + Next off-repeat, and the full pile once repeat is on', async () => {
    // Nothing seen, so all three are pending: the off-repeat count IS the pile.
    render(<TheaterShell seed={seed([textItem('1'), textItem('2'), textItem('3')])} />)
    expect(chromeProps().queuePlayed).toBe(0)
    expect(chromeProps().queueToPlay).toBe(3)
    expect(chromeProps().queueLooping).toBe(false)
    expect(chromeProps().queueTotal).toBe(3)

    await cycleRepeat() // -> all: count is the pile, not a stop-count
    expect(chromeProps().queueLooping).toBe(true)
    expect(chromeProps().queueTotal).toBe(3)

    await cycleRepeat() // -> one: only the post on stage
    expect(chromeProps().queueLooping).toBe(true)
    expect(chromeProps().queueTotal).toBe(1)
  })

  it('counts remaining after Next as Now playing + Next, not 1 of N', async () => {
    render(<TheaterShell seed={seed([textItem('1'), textItem('2'), textItem('3')])} />)
    expect(chromeProps().queuePlayed).toBe(0)
    expect(chromeProps().queueToPlay).toBe(3)

    const onNext = chromeProps().onNext as (() => void) | undefined
    if (!onNext) throw new Error('next control not offered')
    await act(async () => onNext())

    expect(chromeProps().queuePlayed).toBe(0)
    expect(chromeProps().queueToPlay).toBe(2)
    expect(chromeProps().queueLooping).toBe(false)
    const items = chromeProps().items as TheaterItem[]
    expect(items.map((i) => i.bookmarkId)).toEqual(['2', '3', '1'])
  })

  it('can go back to rewatch the previous post while repeat is off', async () => {
    render(<TheaterShell seed={seed([textItem('1'), textItem('2'), textItem('3')])} />)
    expect((chromeProps().current as TheaterItem).bookmarkId).toBe('1')
    expect(chromeProps().canPrev).toBe(false)

    await act(async () => (chromeProps().onNext as () => void)())
    expect((chromeProps().current as TheaterItem).bookmarkId).toBe('2')
    expect(chromeProps().canPrev).toBe(true)

    await act(async () => (chromeProps().onPrev as () => void)())
    expect((chromeProps().current as TheaterItem).bookmarkId).toBe('1')
  })

  it('shrinks the denominator to the unwatched run when most posts were already watched', async () => {
    // Two of three watched before this session started.
    window.localStorage.setItem(
      'adhx-seen-v1',
      JSON.stringify([theaterItemKey(textItem('2')), theaterItemKey(textItem('3'))]),
    )
    await act(async () => {
      render(<TheaterShell seed={seed([textItem('1'), textItem('2'), textItem('3')])} />)
    })

    // One pending post of three — Now playing only, not a playlist position.
    expect(chromeProps().queuePlayed).toBe(0)
    expect(chromeProps().queueToPlay).toBe(1)
    expect(chromeProps().queueLooping).toBe(false)
    expect(chromeProps().queueTotal).toBe(1)

    await cycleRepeat() // -> all: the watched ones are back in play
    expect(chromeProps().queueLooping).toBe(true)
    expect(chromeProps().queueTotal).toBe(3)
  })
})

/**
 * Owner report: "If I go to a direct preview URL then I don't get the watched,
 * the different categorizations or sections within the playlist. If I just go
 * straight to the root domain then I do see the different sections. We just
 * need to be always consistent here."
 *
 * Shared mode's queue below the shared post IS the live feed, so it now takes
 * the same unseen-first ordering and grouping. The shared post keeps leading
 * (it's why the visitor is here) and is pinned out of the grouping —
 * `pinnedKey`, asserted here at the wiring level; UpNextList's own test covers
 * how it renders.
 */
describe('TheaterShell: shared preview keeps the opened post', () => {
  beforeEach(() => {
    mockMobileChrome.mockClear()
    window.localStorage.clear()
  })

  const shared = textItem('shared')

  it('keeps the opened post on stage and drops already-seen rows', async () => {
    window.localStorage.setItem('adhx-seen-v1', JSON.stringify([theaterItemKey(textItem('3'))]))
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([textItem('3'), shared, textItem('2')])}
          mode="shared"
          sharedItem={shared}
        />,
      )
    })
    const items = chromeProps().items as TheaterItem[]
    expect(items.map((i) => i.bookmarkId)).toEqual(['shared', '2', '3'])
    expect(chromeProps().currentKey).toBe(theaterItemKey(shared))
  })

  it('counts a re-visited shared post plus remaining unseen', async () => {
    window.localStorage.setItem(
      'adhx-seen-v1',
      JSON.stringify([theaterItemKey(shared), theaterItemKey(textItem('3'))]),
    )
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([shared, textItem('2'), textItem('3')])}
          mode="shared"
          sharedItem={shared}
        />,
      )
    })
    expect(chromeProps().queuePlayed).toBe(0)
    expect(chromeProps().queueToPlay).toBe(1)
    expect(chromeProps().queueTotal).toBe(1)
    expect(chromeProps().queueLooping).toBe(true)
  })

  it('promotes a direct preview from repeat-one to repeat-all on repeat tap', async () => {
    await act(async () => {
      render(
        <TheaterShell seed={seed([shared, textItem('2')])} mode="shared" sharedItem={shared} />,
      )
    })
    expect(chromeProps().repeatCurrent).toBe(true)
    expect(chromeProps().repeatMode).toBe('one')

    await cycleRepeat()

    expect(chromeProps().repeatCurrent).toBe(false)
    expect(chromeProps().repeatMode).toBe('all')
    expect(chromeProps().queueLooping).toBe(true)
  })

  it('promotes a direct preview to repeat-all when moving next', async () => {
    await act(async () => {
      render(
        <TheaterShell seed={seed([shared, textItem('2')])} mode="shared" sharedItem={shared} />,
      )
    })

    await act(async () => {
      ;(chromeProps().onNext as () => void)()
    })

    expect(chromeProps().currentKey).toBe('twitter:2')
    expect(chromeProps().repeatMode).toBe('all')
    expect(chromeProps().queueLooping).toBe(true)
  })

  it('keeps a no-op Previous from escaping the direct-preview loop', async () => {
    await act(async () => {
      render(
        <TheaterShell seed={seed([shared, textItem('2')])} mode="shared" sharedItem={shared} />,
      )
    })
    expect(chromeProps().canPrev).toBe(false)

    await act(async () => {
      ;(chromeProps().onPrev as () => void)()
    })

    expect(chromeProps().currentKey).toBe(theaterItemKey(shared))
    expect(chromeProps().repeatCurrent).toBe(true)
    expect(chromeProps().repeatMode).toBe('one')
  })

  it('lets an unavailable-only preview reach waiting despite a saved Repeat-all preference', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'all')
    await act(async () => {
      render(
        <TheaterShell seed={seed([shared])} mode="shared" sharedItem={shared} sharedUnavailable />,
      )
    })
    expect(chromeProps().repeatMode).toBe('all')
    expect(chromeProps().repeatCurrent).toBe(false)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('theater-advance'))
    })

    expect(chromeProps().waiting).toBe(true)
    expect(chromeProps().items).toEqual([])
  })

  it('does not let keyboard Previous wrap an unavailable lead to the queue tail', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'all')
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([shared, textItem('2')])}
          mode="shared"
          sharedItem={shared}
          sharedUnavailable
        />,
      )
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    })

    expect(chromeProps().currentKey).toBe(theaterItemKey(shared))
  })

  it.each(['timed', 'ended'])(
    'keeps a direct preview on repeat-one after a stray $departure auto-advance',
    async (departure) => {
      await act(async () => {
        render(
          <TheaterShell seed={seed([shared, textItem('2')])} mode="shared" sharedItem={shared} />,
        )
      })

      await act(async () => {
        if (departure === 'ended') {
          const call = mockStage.mock.calls.at(-1)
          if (!call) throw new Error('stage never rendered')
          ;(call[0].onEnded as () => void)()
        } else {
          window.dispatchEvent(new CustomEvent('theater-advance'))
        }
      })

      expect(chromeProps().currentKey).toBe(theaterItemKey(shared))
      expect(chromeProps().repeatCurrent).toBe(true)
      expect(chromeProps().repeatMode).toBe('one')
    },
  )

  it.each([
    { unavailable: false, departure: 'next' },
    { unavailable: false, departure: 'select' },
    { unavailable: true, departure: 'timed' },
  ])(
    'releases an $unavailable lead after $departure and never queues it again',
    async ({ unavailable, departure }) => {
      window.localStorage.setItem('adhx-seen-v1', JSON.stringify([theaterItemKey(shared)]))
      await act(async () => {
        render(
          <TheaterShell
            seed={seed([shared, textItem('2')])}
            mode="shared"
            sharedItem={shared}
            sharedUnavailable={unavailable}
            authed={!unavailable && (departure === 'timed' || departure === 'ended')}
          />,
        )
      })
      expect(chromeProps().currentKey).toBe(theaterItemKey(shared))

      await act(async () => {
        if (departure === 'next') {
          ;(chromeProps().onNext as () => void)()
        } else if (departure === 'select') {
          ;(chromeProps().onSelect as (key: string) => void)('twitter:2')
        } else if (departure === 'ended') {
          const call = mockStage.mock.calls.at(-1)
          if (!call) throw new Error('stage never rendered')
          ;(call[0].onEnded as () => void)()
        } else {
          window.dispatchEvent(new CustomEvent('theater-advance'))
        }
      })

      expect(chromeProps().currentKey).toBe('twitter:2')
      expect((chromeProps().items as TheaterItem[]).map((item) => item.bookmarkId)).toEqual(['2'])
      expect(chromeProps().queueTotal).toBe(1)

      await act(async () => {
        ;(chromeProps().onPrev as () => void)()
      })
      expect(chromeProps().currentKey).toBe('twitter:2')

      if (!unavailable && (departure === 'next' || departure === 'select')) {
        expect(chromeProps().repeatMode).toBe('all')
      } else {
        expect(chromeProps().repeatMode).toBe('off')
        await cycleRepeat()
      }
      expect(chromeProps().repeatMode).toBe('all')
      expect(chromeProps().queueTotal).toBe(1)
      await act(async () => {
        ;(chromeProps().onNext as () => void)()
      })
      expect(chromeProps().currentKey).toBe('twitter:2')
      expect((chromeProps().items as TheaterItem[]).map((item) => item.bookmarkId)).toEqual(['2'])
    },
  )

  it.each([
    { unavailable: false, departure: 'next' },
    { unavailable: true, departure: 'timed' },
  ])(
    'releases a zero-successor $unavailable lead into waiting after $departure',
    async ({ unavailable, departure }) => {
      window.localStorage.setItem('adhx-seen-v1', JSON.stringify([theaterItemKey(shared)]))
      await act(async () => {
        render(
          <TheaterShell
            seed={seed([shared])}
            mode="shared"
            sharedItem={shared}
            sharedUnavailable={unavailable}
          />,
        )
      })

      await act(async () => {
        if (departure === 'next') {
          ;(chromeProps().onNext as () => void)()
        } else {
          window.dispatchEvent(new CustomEvent('theater-advance'))
        }
      })

      expect(chromeProps().waiting).toBe(true)
      expect(chromeProps().queueTotal).toBe(0)
      expect(chromeProps().items).toEqual([])
      expect(screen.getByText('You’re all caught up')).toBeInTheDocument()
      expect(screen.queryByText(/no longer available/i)).not.toBeInTheDocument()

      await act(async () => {
        ;(chromeProps().onPrev as () => void)()
      })
      expect(chromeProps().waiting).toBe(true)

      if (!unavailable && departure === 'next') {
        expect(chromeProps().repeatMode).toBe('all')
      } else {
        expect(chromeProps().repeatMode).toBe('off')
        await cycleRepeat()
      }
      expect(chromeProps().repeatMode).toBe('all')
      expect(chromeProps().waiting).toBe(true)
      expect(chromeProps().queueTotal).toBe(0)
      expect(screen.queryByText(/no longer available/i)).not.toBeInTheDocument()
    },
  )

  it.each([{ unavailable: false }, { unavailable: true }])(
    'releases an $unavailable lead when every successor is already seen',
    async ({ unavailable }) => {
      const successors = [textItem('2'), textItem('3')]
      window.localStorage.setItem(
        'adhx-seen-v1',
        JSON.stringify([shared, ...successors].map(theaterItemKey)),
      )
      await act(async () => {
        render(
          <TheaterShell
            seed={seed([shared, ...successors])}
            mode="shared"
            sharedItem={shared}
            sharedUnavailable={unavailable}
          />,
        )
      })

      await act(async () => {
        if (unavailable) {
          window.dispatchEvent(new CustomEvent('theater-advance'))
        } else {
          ;(chromeProps().onNext as () => void)()
        }
      })
      if (!unavailable) {
        expect(chromeProps().waiting).toBe(false)
        expect(chromeProps().repeatMode).toBe('all')
        expect(chromeProps().queueTotal).toBe(2)
        expect(chromeProps().currentKey).toBe('twitter:2')
        expect((chromeProps().items as TheaterItem[]).map((item) => item.bookmarkId)).toEqual([
          '2',
          '3',
        ])
        return
      }

      expect(chromeProps().waiting).toBe(true)
      expect(chromeProps().queueTotal).toBe(0)
      expect((chromeProps().items as TheaterItem[]).map((item) => item.bookmarkId)).toEqual([
        '2',
        '3',
      ])

      await act(async () => {
        ;(chromeProps().onPrev as () => void)()
      })
      expect(chromeProps().waiting).toBe(true)

      expect(chromeProps().repeatMode).toBe('off')
      await cycleRepeat()
      expect(chromeProps().waiting).toBe(false)
      expect(chromeProps().repeatMode).toBe('all')
      expect(chromeProps().queueTotal).toBe(2)
      expect(chromeProps().currentKey).toBe('twitter:2')
      expect((chromeProps().items as TheaterItem[]).map((item) => item.bookmarkId)).toEqual([
        '2',
        '3',
      ])
    },
  )
})
