import { describe, expect, it } from 'vitest'
import { putBack, takeBatch, WatchTracker } from '@/lib/watch/tally'

/** Plays a video from `from` to `to` in quarter-second samples. */
function play(t: WatchTracker, from: number, to: number, duration: number) {
  for (let s = from; s <= to + 1e-9; s += 0.25) t.sample(s, duration)
}

describe('WatchTracker', () => {
  it('counts a play once a pass from the top has really played, and the seconds', () => {
    const t = new WatchTracker()
    t.begin('twitter:1')
    play(t, 0, 0.75, 30)
    expect(t.tallies.get('twitter:1')?.plays).toBe(0)
    play(t, 1, 10, 30)
    expect(t.tallies.get('twitter:1')).toEqual({ plays: 1, finishes: 0, seconds: 10 })
  })

  it('counts a finish at the end, and a replay from the top as another play', () => {
    const t = new WatchTracker()
    t.begin('twitter:1')
    play(t, 0, 8, 8)
    t.ended()
    t.ended()
    play(t, 0, 3, 8)
    expect(t.tallies.get('twitter:1')).toEqual({ plays: 2, finishes: 1, seconds: 11 })
  })

  it('sees a native loop wrap round as a finish and a new play', () => {
    const t = new WatchTracker()
    t.begin('twitter:1')
    play(t, 0, 5.75, 6)
    play(t, 0, 5.75, 6)
    play(t, 0, 2, 6)
    expect(t.tallies.get('twitter:1')).toEqual({ plays: 3, finishes: 2, seconds: 13.5 })
  })

  it('counts short loops after half their length', () => {
    const t = new WatchTracker()
    t.begin('twitter:gif')
    play(t, 0, 0.75, 1)
    play(t, 0, 0.75, 1)
    expect(t.tallies.get('twitter:gif')?.plays).toBe(2)
    expect(t.tallies.get('twitter:gif')?.finishes).toBe(1)
  })

  it('doesn’t count picking up part-way, seeks or scrubbing back as plays', () => {
    const t = new WatchTracker()
    t.begin('youtube:long')
    play(t, 300, 310, 600)
    t.sample(500, 600) // a seek forward: no seconds
    t.sample(20, 600) // scrubbing back: not a loop
    play(t, 20.25, 25, 600)
    expect(t.tallies.get('youtube:long')).toEqual({ plays: 0, finishes: 0, seconds: 15 })
  })

  it('counts nothing with no post on stage, and keeps posts apart', () => {
    const t = new WatchTracker()
    t.begin(null)
    play(t, 0, 5, 10)
    t.ended()
    expect(t.tallies.size).toBe(0)
    t.begin('twitter:a')
    play(t, 0, 2, 10)
    t.begin('twitter:b')
    play(t, 0, 2, 10)
    expect([...t.tallies.keys()]).toEqual(['twitter:a', 'twitter:b'])
  })
})

describe('takeBatch / putBack', () => {
  it('sends whole seconds and keeps the fraction', () => {
    const t = new Map([
      ['twitter:a', { plays: 1, finishes: 0, seconds: 12.6 }],
      ['twitter:b', { plays: 0, finishes: 0, seconds: 0.4 }],
    ])
    const batch = takeBatch(t)
    expect(batch).toEqual([{ platform: 'twitter', id: 'a', plays: 1, finishes: 0, seconds: 12 }])
    expect(t.get('twitter:a')?.seconds).toBeCloseTo(0.6)
    expect(t.get('twitter:b')?.seconds).toBe(0.4)
    putBack(t, batch)
    expect(t.get('twitter:a')).toEqual({ plays: 1, finishes: 0, seconds: expect.closeTo(12.6) })
  })

  it('takes at most the batch size', () => {
    const t = new Map(
      Array.from({ length: 60 }, (_, i) => [`tiktok:${i}`, { plays: 1, finishes: 0, seconds: 0 }]),
    )
    expect(takeBatch(t, 50)).toHaveLength(50)
    expect(t.size).toBe(10)
  })
})
