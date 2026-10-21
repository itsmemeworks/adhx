import { describe, expect, it } from 'vitest'
import {
  LINEUP,
  blend,
  type BlendCandidate,
  type BlendContext,
  type BlendSave,
} from '@/lib/feed/blend'

/**
 * The lineup (New on the phones): Just saved since you last looked, Not seen
 * yet, then For you, always in that order, so opening the app is predictable.
 */

const NOW = Date.parse('2026-10-21T12:00:00Z')
const H = 3_600_000
const ME = 'me'

const people: Record<string, { userId: string; username: string; name: string | null }> = {
  me: { userId: ME, username: 'pete', name: 'Pete' },
  ana: { userId: 'u-ana', username: 'ana', name: 'Ana' },
  ben: { userId: 'u-ben', username: 'ben', name: 'Ben' },
}

function save(who: keyof typeof people, hoursAgo: number): BlendSave {
  return { ...people[who], savedAt: NOW - hoursAgo * H }
}

function post(
  key: string,
  saves: BlendSave[],
  extra: Partial<BlendCandidate> = {},
): BlendCandidate {
  return { key, saves, similarity: null, seen: false, ...extra }
}

function ctx(extra: Partial<BlendContext> = {}): BlendContext {
  return { viewerId: ME, now: NOW, closeness: new Map(), weights: {}, seed: 'seed1', ...extra }
}

const order = (picks: { key: string }[]) => picks.map((p) => p.key)
const parts = (picks: { section?: string }[]) => picks.map((p) => p.section)

describe('the lineup', () => {
  it('plays Just saved, then Not seen yet, newest first, split at when you last looked', () => {
    const picks = blend(
      [
        post('x:old', [save('ana', 30)]),
        post('x:new', [save('ben', 1)]),
        post('x:mid', [save('ana', 5)]),
        post('x:newer', [save('ana', 0.5)]),
      ],
      ctx({ lastLookedAt: NOW - 3 * H }),
      'lineup',
    )
    expect(order(picks)).toEqual(['x:newer', 'x:new', 'x:mid', 'x:old'])
    expect(parts(picks)).toEqual(['just', 'just', 'unseen', 'unseen'])
  })

  it('never looked: Just saved is the last day', () => {
    const picks = blend(
      [post('x:a', [save('ana', 2)]), post('x:b', [save('ana', 30)])],
      ctx({ lastLookedAt: null }),
      'lineup',
    )
    expect(parts(picks)).toEqual(['just', 'unseen'])
  })

  it('a long time away still caps Just saved at two days', () => {
    const picks = blend(
      [post('x:a', [save('ana', 10)]), post('x:b', [save('ana', LINEUP.justHours + 5)])],
      ctx({ lastLookedAt: NOW - 30 * 24 * H }),
      'lineup',
    )
    expect(parts(picks)).toEqual(['just', 'unseen'])
  })

  it('a post sent to you counts from when it was sent', () => {
    const picks = blend(
      [
        post('x:saved', [save('ana', 1)]),
        post('x:sent', [save('ben', 200)], {
          sent: [{ username: 'ben', name: 'Ben', at: NOW - 0.2 * H, note: null }],
        }),
      ],
      ctx({ lastLookedAt: NOW - 3 * H }),
      'lineup',
    )
    expect(order(picks)).toEqual(['x:sent', 'x:saved'])
    expect(picks[0].why).toBe('Ben sent you this')
  })

  it('For you comes last: closest to your taste, unwatched before watched, with why', () => {
    const like = { label: 'the synth videos', topic: 'synths', post: { platform: 'x', id: 'k' } }
    const picks = blend(
      [
        post('x:unseen', [save('ana', 1)]),
        post('x:seen-close', [save('ana', 50)], { seen: true, similarity: 0.95, like }),
        post('x:old-close', [save('ben', 24 * 20)], { similarity: 0.9, like }),
        post('x:seen-far', [save('ben', 3)], { seen: true, similarity: 0.1 }),
        post('x:mine', [save('me', 1)], { similarity: 0.99 }),
      ],
      ctx({ lastLookedAt: NOW - 3 * H }),
      'lineup',
    )
    expect(order(picks)).toEqual(['x:unseen', 'x:old-close', 'x:seen-close', 'x:seen-far'])
    expect(parts(picks)).toEqual(['just', 'foryou', 'foryou', 'foryou'])
    // An unwatched post from before the window is For you, not Not seen yet.
    const oldClose = picks.find((p) => p.key === 'x:old-close')!
    expect(oldClose.why).toBe('Like the synth videos you kept')
  })

  it('with nothing unseen, For you still plays something', () => {
    const picks = blend(
      [
        post('x:a', [save('ana', 5)], { seen: true }),
        post('x:b', [save('ben', 2)], { seen: true }),
      ],
      ctx({ lastLookedAt: NOW - H }),
      'lineup',
    )
    expect(picks.length).toBe(2)
    expect(parts(picks)).toEqual(['foryou', 'foryou'])
  })

  it('is the same order every time for the same posts', () => {
    const candidates = [
      post('x:a', [save('ana', 1)]),
      post('x:b', [save('ben', 1)]),
      post('x:c', [save('ana', 4)], { seen: true }),
    ]
    const one = blend(candidates, ctx({ seed: 'a', lastLookedAt: NOW - 2 * H }), 'lineup')
    const two = blend(candidates, ctx({ seed: 'b', lastLookedAt: NOW - 2 * H }), 'lineup')
    expect(order(one)).toEqual(order(two))
  })
})
