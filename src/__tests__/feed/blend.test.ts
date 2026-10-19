import { describe, expect, it } from 'vitest'
import {
  BLEND_WEIGHTS,
  MAX_RUN,
  applyVariety,
  blend,
  decodeCursor,
  encodeCursor,
  likeScores,
  parseBlendQuery,
  parseWeights,
  scoreCandidate,
  shortAgo,
  togetherLine,
  type BlendCandidate,
  type BlendContext,
  type BlendPick,
  type BlendSave,
} from '@/lib/feed/blend'

/**
 * The blend's rules, without a database: each signal, the variety rule, the
 * words for why, and the cursor that keeps pages stable.
 */

const NOW = Date.parse('2026-10-19T12:00:00Z')
const H = 3_600_000
const ME = 'me'

const people: Record<string, { userId: string; username: string; name: string | null }> = {
  me: { userId: ME, username: 'pete', name: 'Pete' },
  ana: { userId: 'u-ana', username: 'ana', name: 'Ana' },
  ben: { userId: 'u-ben', username: 'ben', name: 'Ben' },
  mum: { userId: 'u-mum', username: 'mum', name: 'Mum' },
  jo: { userId: 'u-jo', username: 'jo', name: null },
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

describe('signals', () => {
  it('fresh decays over about a day', () => {
    const now = scoreCandidate(post('x:1', [save('ana', 0)]), ctx(), 'everyone')!
    const day = scoreCandidate(post('x:1', [save('ana', 24)]), ctx(), 'everyone')!
    const week = scoreCandidate(post('x:1', [save('ana', 24 * 7)]), ctx(), 'everyone')!
    expect(now.signals.fresh).toBeCloseTo(1, 5)
    expect(day.signals.fresh).toBeCloseTo(Math.exp(-1), 5)
    expect(week.signals.fresh).toBeLessThan(0.01)
    expect(now.score).toBeGreaterThan(day.score)
  })

  it('saved together needs two or more people, and grows with more', () => {
    const one = scoreCandidate(post('x:1', [save('ana', 1)]), ctx(), 'everyone')!
    const two = scoreCandidate(post('x:1', [save('ana', 1), save('ben', 2)]), ctx(), 'everyone')!
    const four = scoreCandidate(
      post('x:1', [save('ana', 1), save('ben', 2), save('mum', 3), save('jo', 4)]),
      ctx(),
      'everyone',
    )!
    expect(one.signals.together).toBe(0)
    expect(two.signals.together).toBe(0.5)
    expect(four.signals.together).toBe(1)
    expect(two.score).toBeGreaterThan(one.score)
  })

  it('a re-save by the same person is not a second voice', () => {
    const twice = scoreCandidate(post('x:1', [save('ana', 1), save('ana', 3)]), ctx(), 'everyone')!
    expect(twice.signals.together).toBe(0)
  })

  it('you saving it too counts as saved together', () => {
    const both = scoreCandidate(post('x:1', [save('ana', 1), save('me', 2)]), ctx(), 'everyone')!
    expect(both.signals.together).toBe(0.5)
    expect(both.reasons[0]).toEqual({
      kind: 'together',
      text: 'You and Ana saved this',
      username: 'ana',
    })
  })

  it('close to you: the friend whose saves you watch most', () => {
    const closeness = new Map([
      ['u-ben', 0.7],
      ['u-ana', 0.1],
    ])
    const ben = scoreCandidate(post('x:1', [save('ben', 5)]), ctx({ closeness }), 'everyone')!
    const ana = scoreCandidate(post('x:2', [save('ana', 5)]), ctx({ closeness }), 'everyone')!
    expect(ben.signals.close).toBe(0.7)
    expect(ben.score).toBeGreaterThan(ana.score)
    expect(ben.reasons.map((r) => r.text)).toContain('You watch most of Ben’s saves')
    expect(ana.reasons.map((r) => r.kind)).not.toContain('close')
  })

  it('like what you keep: relative to the pool, top tenth reads 1', () => {
    const pool = Array.from({ length: 11 }, (_, i) =>
      post(`x:${i}`, [save('ana', 1)], { similarity: 0.5 + i * 0.01 }),
    )
    pool.push(post('x:none', [save('ana', 1)]))
    const likes = likeScores(pool)
    expect(likes.get('x:0')).toBe(0)
    expect(likes.get('x:5')).toBe(0) // the median
    expect(likes.get('x:10')).toBe(1)
    expect(likes.get('x:7')).toBeCloseTo(0.5, 5)
    expect(likes.has('x:none')).toBe(false) // not understood yet
  })

  it('names the kept post it is like, once it is clearly like it', () => {
    const like = { label: 'the frog videos', topic: 'frogs' }
    const strong = scoreCandidate(post('x:1', [save('mum', 30)], { like }), ctx(), 'everyone', 0.9)!
    const weak = scoreCandidate(post('x:1', [save('mum', 30)], { like }), ctx(), 'everyone', 0.2)!
    expect(strong.reasons[0].text).toBe('Like the frog videos you kept')
    expect(strong.score - weak.score).toBeCloseTo(BLEND_WEIGHTS.like * 0.7, 5)
    expect(weak.reasons.map((r) => r.kind)).toEqual(['fresh'])
  })

  it('show more / less from a friend scales their posts', () => {
    const base = scoreCandidate(post('x:1', [save('ana', 2)]), ctx(), 'everyone')!
    const more = scoreCandidate(
      post('x:1', [save('ana', 2)]),
      ctx({ weights: { ana: 1 } }),
      'everyone',
    )!
    const less = scoreCandidate(
      post('x:1', [save('ana', 2)]),
      ctx({ weights: { ana: -1 } }),
      'everyone',
    )!
    expect(more.score).toBeCloseTo(base.score * BLEND_WEIGHTS.more, 5)
    expect(less.score).toBeCloseTo(base.score * BLEND_WEIGHTS.less, 5)
    expect(more.reasons[0]).toEqual({
      kind: 'more',
      text: 'You asked for more from Ana',
      username: 'ana',
    })
    // Less from Ana doesn't hide what Ben saved with her.
    const shared = scoreCandidate(
      post('x:2', [save('ana', 2), save('ben', 2)]),
      ctx({ weights: { ana: -1 } }),
      'everyone',
    )!
    const sharedBase = scoreCandidate(
      post('x:2', [save('ana', 2), save('ben', 2)]),
      ctx(),
      'everyone',
    )!
    expect(shared.score).toBeCloseTo(sharedBase.score, 5)
  })
})

describe('modes and seen', () => {
  const seen = post('x:seen', [save('ana', 1)], { seen: true })
  const unseen = post('x:new', [save('ana', 1)])
  const mine = post('x:mine', [save('me', 1)])
  const coSaved = post('x:co', [save('me', 3), save('ben', 1)])

  it('new: only what someone else saved and you have not seen', () => {
    const keys = blend([seen, unseen, mine, coSaved], ctx(), 'new').map((p) => p.key)
    expect(keys.sort()).toEqual(['x:co', 'x:new'])
  })

  it('everyone: seen posts drop back, your own play sparingly', () => {
    const picks = blend([seen, unseen, mine], ctx(), 'everyone')
    const score = (k: string) => picks.find((p) => p.key === k)!.score
    expect(picks.map((p) => p.key)).toContain('x:seen')
    expect(score('x:seen')).toBeLessThan(score('x:new') * BLEND_WEIGHTS.seen + 0.05)
    expect(score('x:mine')).toBeLessThan(score('x:new') * BLEND_WEIGHTS.own + 0.05)
  })

  it('friends: what friends saved that you have not', () => {
    expect(blend([unseen, mine, coSaved], ctx(), 'friends').map((p) => p.key)).toEqual(['x:new'])
  })

  it('mine: your saves only, at full weight', () => {
    const picks = blend([unseen, mine, coSaved], ctx(), 'mine')
    expect(picks.map((p) => p.key).sort()).toEqual(['x:co', 'x:mine'])
    expect(picks.find((p) => p.key === 'x:mine')!.why).toBe('You saved this · 1h')
  })
})

describe('why', () => {
  it('reads like a friend telling you', () => {
    expect(togetherLine(['Ana', 'Ben'])).toBe('Ana and Ben saved this')
    expect(togetherLine(['You', 'Ana', 'Ben', 'Jo'])).toBe('You and 3 others saved this')
    const [mum] = blend([post('x:1', [save('mum', 1.2)])], ctx(), 'everyone')
    expect(mum.why).toBe('Mum saved this · 1h')
    const [jo] = blend([post('x:2', [save('jo', 0)])], ctx(), 'everyone')
    expect(jo.why).toBe('jo saved this · just now') // no display name: the username
    const [both] = blend([post('x:3', [save('ana', 1), save('ben', 2)])], ctx(), 'everyone')
    expect(both.why).toBe('Ana and Ben saved this')
    expect(both.reasons[0].kind).toBe('together')
  })

  it('short times', () => {
    expect(shortAgo(NOW - 30_000, NOW)).toBe('just now')
    expect(shortAgo(NOW - 5 * 60_000, NOW)).toBe('5m')
    expect(shortAgo(NOW - 3 * H, NOW)).toBe('3h')
    expect(shortAgo(NOW - 50 * H, NOW)).toBe('2d')
    expect(shortAgo(NOW - 21 * 24 * H, NOW)).toBe('3w')
  })

  it('lists every reason, headline first', () => {
    const [pick] = blend(
      [
        post('x:1', [save('ben', 1), save('ana', 2)], {
          similarity: 0.9,
          like: { label: 'the baby videos', topic: 'babies' },
        }),
      ],
      ctx({ closeness: new Map([['u-ben', 0.8]]) }),
      'everyone',
    )
    expect(pick.reasons.map((r) => r.text)).toEqual([
      'Ben and Ana saved this',
      'Like the baby videos you kept',
      'You watch most of Ben’s saves',
    ])
  })
})

describe('variety', () => {
  const pick = (key: string, saver: string, extra: Partial<BlendPick> = {}): BlendPick => ({
    key,
    score: 1,
    why: '',
    reasons: [],
    saver,
    topic: null,
    ownOnly: false,
    ...extra,
  })

  function longestRun(list: BlendPick[], field: 'saver' | 'topic'): number {
    let best = 0
    let run = 0
    for (let i = 0; i < list.length; i++) {
      run = i > 0 && list[i][field] !== null && list[i][field] === list[i - 1][field] ? run + 1 : 1
      best = Math.max(best, run)
    }
    return best
  }

  it(`no more than ${MAX_RUN} in a row from one friend`, () => {
    const sorted = [
      pick('a1', 'ana'),
      pick('a2', 'ana'),
      pick('a3', 'ana'),
      pick('a4', 'ana'),
      pick('b1', 'ben'),
      pick('b2', 'ben'),
    ]
    const out = applyVariety(sorted, 'everyone')
    expect(out.map((p) => p.key)).toEqual(['a1', 'a2', 'b1', 'a3', 'a4', 'b2'])
    expect(longestRun(out, 'saver')).toBeLessThanOrEqual(MAX_RUN)
  })

  it('plays the best anyway when only one friend saved anything', () => {
    const out = applyVariety([pick('a1', 'ana'), pick('a2', 'ana'), pick('a3', 'ana')], 'everyone')
    expect(out.map((p) => p.key)).toEqual(['a1', 'a2', 'a3'])
  })

  it('one topic at most twice in a row', () => {
    const sorted = [
      pick('f1', 'ana', { topic: 'frogs' }),
      pick('f2', 'ben', { topic: 'frogs' }),
      pick('f3', 'mum', { topic: 'frogs' }),
      pick('s1', 'jo', { topic: 'synths' }),
    ]
    expect(applyVariety(sorted, 'everyone').map((p) => p.key)).toEqual(['f1', 'f2', 's1', 'f3'])
  })

  it('your own saves at most one in every four outside Mine', () => {
    const sorted = [
      pick('m1', ME, { ownOnly: true }),
      pick('m2', ME, { ownOnly: true }),
      pick('a1', 'ana'),
      pick('b1', 'ben'),
      pick('a2', 'ana'),
      pick('b2', 'ben'),
    ]
    const out = applyVariety(sorted, 'everyone').map((p) => p.key)
    expect(out).toEqual(['m1', 'a1', 'b1', 'a2', 'm2', 'b2'])
    expect(applyVariety(sorted, 'mine').map((p) => p.key)).toEqual(sorted.map((p) => p.key))
  })

  it('the whole blend keeps the rule on a realistic pool', () => {
    const pool = [
      ...Array.from({ length: 8 }, (_, i) => post(`ana:${i}`, [save('ana', i * 0.1)])),
      ...Array.from({ length: 3 }, (_, i) => post(`ben:${i}`, [save('ben', 30 + i)])),
    ]
    const out = blend(pool, ctx(), 'new')
    // Ben's three older posts break up Ana's run until they're used up.
    expect(longestRun(out.slice(0, 9), 'saver')).toBeLessThanOrEqual(MAX_RUN)
    expect(out).toHaveLength(11)
  })
})

describe('stable pages', () => {
  const pool = Array.from({ length: 30 }, (_, i) =>
    post(`x:${i}`, [save(i % 2 ? 'ana' : 'ben', 5)], { similarity: (i * 7) % 10 }),
  )

  it('the same seed gives the same order; the order is a total one', () => {
    const a = blend(pool, ctx({ seed: 'abc1' }), 'everyone').map((p) => p.key)
    const b = blend([...pool].reverse(), ctx({ seed: 'abc1' }), 'everyone').map((p) => p.key)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(30)
  })

  it('pages of one snapshot never overlap and cover it all', () => {
    const order = blend(pool, ctx({ seed: 'abc1' }), 'everyone').map((p) => p.key)
    const pages = [order.slice(0, 10), order.slice(10, 20), order.slice(20, 30)]
    expect(pages.flat()).toEqual(order)
  })

  it('cursors are opaque and checked', () => {
    const text = encodeCursor({ s: 'abc123', o: 20 })
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeCursor(text)).toEqual({ s: 'abc123', o: 20 })
    expect(decodeCursor('not a cursor')).toBeNull()
    expect(decodeCursor(encodeCursor({ s: 'ABC!', o: 1 }))).toBeNull()
    expect(decodeCursor(encodeCursor({ s: 'abcd', o: -1 }))).toBeNull()
    expect(decodeCursor(null)).toBeNull()
  })

  it('reads mode, limit and cursor from a query', () => {
    expect(parseBlendQuery(new URLSearchParams(''))).toEqual({
      mode: 'new',
      limit: 20,
      cursor: null,
    })
    expect(parseBlendQuery(new URLSearchParams('mode=friends&limit=500'))).toMatchObject({
      mode: 'friends',
      limit: 50,
    })
    expect(parseBlendQuery(new URLSearchParams('mode=trending'))).toHaveProperty('error')
    expect(parseBlendQuery(new URLSearchParams('cursor=zzz'))).toHaveProperty('error')
  })
})

describe('feed weights preference', () => {
  it('keeps only usernames set to more or less', () => {
    expect(parseWeights('{"ana":1,"ben":-1,"jo":0,"x y":1,"mum":"1"}')).toEqual({
      ana: 1,
      ben: -1,
    })
    expect(parseWeights('nonsense')).toEqual({})
    expect(parseWeights('[1]')).toEqual({})
    expect(parseWeights(null)).toEqual({})
  })
})
