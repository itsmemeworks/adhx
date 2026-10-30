// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { MomentsSnapshot, MomentView } from '@/components/next/moments/live'

/**
 * Right now's lead card says how busy a moment is lately for members
 * ("LIVE · 3 saves in 10 min"), and keeps the totals for everyone else.
 */

const state = vi.hoisted(() => ({ snapshot: null as unknown, authenticated: true }))

vi.mock('@/components/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/auth')>()),
  useAuthMe: () => ({
    me: { authenticated: state.authenticated },
    loading: false,
    refresh: async () => {},
  }),
}))

vi.mock('@/components/next/moments/live', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/next/moments/live')>()
  return {
    ...actual,
    useMoments: () => ({
      snapshot: state.snapshot,
      flashes: new Map(),
      popped: new Set(),
      connected: true,
    }),
  }
})

import { RightNow } from '@/components/next/moments/RightNow'
import { applyEvent } from '@/components/next/moments/live'
import { recentLine } from '@/components/next/moments/people'

function moment(extra: Partial<MomentView> = {}): MomentView {
  return {
    slug: 'babies-vs-objects',
    title: 'Babies vs objects',
    hue: '#ff8fa3',
    people: 5,
    posts: 26,
    lastAt: new Date().toISOString(),
    rising: false,
    watching: 0,
    covers: [],
    ...extra,
  }
}

function snapshot(m: MomentView): MomentsSnapshot {
  return {
    label: 'Right now',
    hours: 24,
    moments: [m],
    forming: [],
    stream: [],
    stats: { today: 3, lastHour: 3 },
  }
}

describe('recentLine', () => {
  it('says how many saves in how long, or nothing', () => {
    expect(recentLine({ recentSaves: 3, windowMinutes: 10 })).toBe('3 saves in 10 min')
    expect(recentLine({ recentSaves: 1, windowMinutes: 5 })).toBe('1 save in 5 min')
    expect(recentLine({ recentSaves: 0, windowMinutes: 60 })).toBeNull()
    expect(recentLine({})).toBeNull()
  })
})

describe('Right now lead card', () => {
  it('members see "LIVE · 3 saves in 10 min"', () => {
    state.snapshot = snapshot(moment({ recentSaves: 3, windowMinutes: 10, savers: [] }))
    render(<RightNow headingLevel="h1" />)
    expect(screen.getAllByText('LIVE').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/3 saves in 10 min/).length).toBeGreaterThan(0)
    expect(screen.queryByText('5 people')).not.toBeInTheDocument()
  })

  it('without the figure (signed out, or quiet lately) it keeps the totals', () => {
    state.snapshot = snapshot(moment({ recentSaves: 0, windowMinutes: 60 }))
    const { unmount } = render(<RightNow headingLevel="h1" />)
    expect(screen.getByText('5 people')).toBeInTheDocument()
    expect(screen.queryByText(/ in \d+ min/)).not.toBeInTheDocument()
    unmount()
    state.snapshot = snapshot(moment())
    render(<RightNow headingLevel="h1" />)
    expect(screen.getByText('5 people')).toBeInTheDocument()
  })

  it('a live event without the figure keeps the one the card had', () => {
    const before = snapshot(moment({ recentSaves: 3, windowMinutes: 10 }))
    const after = applyEvent(before, {
      type: 'save',
      item: { id: 's1', key: 'twitter:1', at: new Date().toISOString(), post: {}, to: null },
      moment: moment({ posts: 27 }),
    } as never)
    expect(after.moments[0]).toMatchObject({ posts: 27, recentSaves: 3, windowMinutes: 10 })
  })
})

describe('Right now with many moments', () => {
  it('keeps two beside the lead and wraps the rest underneath, losing none', () => {
    const names = ['AI music', 'Marketing', 'Gym and lifting', 'Startups', 'Wiki', 'Cats']
    state.snapshot = {
      ...snapshot(moment()),
      moments: names.map((title, i) => moment({ slug: `m-${i}`, title })),
    }
    const { container } = render(<RightNow headingLevel="h1" />)
    for (const name of names) expect(screen.getAllByText(name).length).toBeGreaterThan(0)
    // The lead's row holds the lead and two cards; three more wrap below it.
    const below = container.querySelector('.lg\\:col-span-2')
    expect(below).not.toBeNull()
    expect(below!.querySelectorAll('article').length).toBe(3)
  })
})

describe('Right now when nothing is trending', () => {
  const quiet = (): MomentsSnapshot => ({ ...snapshot(moment()), moments: [] })

  it('offers members Browse channels and Play my saves', () => {
    state.authenticated = true
    state.snapshot = quiet()
    render(<RightNow headingLevel="h1" />)
    expect(screen.getByRole('link', { name: 'Browse channels' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Play my saves' })).toBeInTheDocument()
  })

  it('offers signed-out visitors nothing that would only bounce to sign in', () => {
    state.authenticated = false
    state.snapshot = quiet()
    render(<RightNow headingLevel="h1" />)
    expect(screen.getByText(/Nothing’s trending yet/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Browse channels' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Play my saves' })).not.toBeInTheDocument()
    state.authenticated = true
  })
})

describe('the Just saved strip', () => {
  it('shows a post once, however many people save it', () => {
    const item = (id: string, key: string) =>
      ({ id, key, at: new Date().toISOString(), post: {}, to: null }) as never
    let s = { ...snapshot(moment()), stream: [] } as MomentsSnapshot
    s = applyEvent(s, { type: 'save', item: item('twitter:1@a', 'twitter:1') } as never)
    s = applyEvent(s, { type: 'save', item: item('twitter:2@a', 'twitter:2') } as never)
    s = applyEvent(s, { type: 'save', item: item('twitter:1@b', 'twitter:1') } as never)
    expect(s.stream.map((x) => x.key)).toEqual(['twitter:1', 'twitter:2'])
  })
})
