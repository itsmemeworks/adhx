import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from '../api/setup'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction: <R>(fn: () => R): R => testInstance.sqlite.transaction(fn)(),
}))

// No query model in tests: naming falls back to the posts' shared word.
vi.mock('@/lib/semantic/supervisor', () => ({
  embedQuery: async () => {
    throw new Error('no model')
  },
  embedQueries: async () => {
    throw new Error('no model')
  },
  wakeJobs: () => {},
  jobActivity: () => null,
  startSemanticProcesses: () => {},
}))

import { saveEmbedding } from '@/lib/semantic/store'
import { __resetVectorIndex } from '@/lib/semantic/vector-index'
import {
  __moments,
  __resetMoments,
  getMomentDetail,
  getMomentsSnapshot,
  subscribe,
  type MomentEvent,
} from '@/lib/moments/engine'
import {
  addToForming,
  bestMoment,
  findGroups,
  formingProgress,
  isRising,
  matchPrevious,
  minuteBars,
  normalize,
  pickHue,
  slugFor,
  type Forming,
  type Moment,
  type RecentPost,
} from '@/lib/moments/group'
import { nameMoment, tellingWord } from '@/lib/moments/naming'
import { applyEvent, timeAgo, type MomentsSnapshot } from '@/components/next/moments/live'
import {
  backHref,
  momentPlayHref,
  queueUrl,
  sourceFromParams,
} from '@/components/next/theater/queue'

const USER_C = 'user-c'

/** Deterministic noise so posts on one topic are close but not identical. */
function noise(seed: number, dims: number): Float32Array {
  const v = new Float32Array(dims)
  let t = seed * 9973 + 1
  for (let i = 0; i < dims; i++) {
    t = (t * 16807) % 2147483647
    v[i] = (t / 2147483647 - 0.5) * 0.12
  }
  return v
}

/** Unit vector pointing mostly along `axis`, with a little noise. */
function topic(axis: number, seed: number, dims = 768): Float32Array {
  const v = noise(seed, dims)
  v[axis] += 1
  return normalize(v)
}

function save(
  userId: string,
  id: string,
  text: string,
  overrides: Partial<schema.NewBookmark> = {},
) {
  testInstance.db
    .insert(schema.bookmarks)
    .values(
      createTestBookmark(userId, id, { text, processedAt: new Date().toISOString(), ...overrides }),
    )
    .run()
}

async function understood(id: string, vector: Float32Array) {
  await saveEmbedding({
    platform: 'twitter',
    postId: id,
    kind: 'text',
    contentHash: `h-${id}`,
    status: 'ok',
    vector,
  })
}

/** A library: frogs (two people), synths (one person) and unrelated background. */
async function seedLibrary() {
  for (let i = 0; i < 6; i++) {
    save(USER_A, `frog${i}`, `frog video number ${i}`)
    await understood(`frog${i}`, topic(0, i + 1))
  }
  save(USER_B, 'frog0', 'frog video number 0')
  save(USER_B, 'frog1', 'frog video number 1')
  for (let i = 0; i < 5; i++) {
    save(USER_A, `synth${i}`, `synth patch ${i}`)
    await understood(`synth${i}`, topic(1, 100 + i))
  }
  for (let i = 0; i < 50; i++) {
    save(USER_A, `bg${i}`, `something else ${i}`)
    await understood(`bg${i}`, topic(10 + i, 200 + i))
  }
}

beforeEach(() => {
  testInstance = createTestDb()
  __resetVectorIndex()
  __resetMoments()
  vi.stubEnv('MOMENT_MIN_SAVERS', '2')
  vi.stubEnv('TYPESAFE_API_KEY', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  __resetMoments()
})

// ——— Pure grouping ———

function recent(key: string, vector: Float32Array, savers: string[]): RecentPost {
  return { key, vector, savers: new Set(savers), lastAt: Date.now() }
}

describe('grouping recent saves', () => {
  const posts = [
    ...[0, 1, 2, 3, 4].map((i) => recent(`a${i}`, topic(0, i, 64), i < 2 ? ['u1', 'u2'] : ['u1'])),
    ...[0, 1, 2, 3, 4].map((i) => recent(`b${i}`, topic(1, 50 + i, 64), ['u1'])),
    ...Array.from({ length: 40 }, (_, i) => recent(`n${i}`, topic(4 + i, 90 + i, 64), ['u3'])),
  ]

  it('finds tight groups that enough people saved, and nothing in the noise', () => {
    const groups = findGroups(posts, { minSavers: 2, seed: 1, now: Date.now() })
    expect(groups).toHaveLength(1)
    expect([...groups[0].members.keys()].sort()).toEqual(['a0', 'a1', 'a2', 'a3', 'a4'])
    // One saver is enough when the threshold says so.
    expect(findGroups(posts, { minSavers: 1, seed: 1, now: Date.now() })).toHaveLength(2)
  })

  it('keeps a moment’s identity while it changes, and only joins close posts', () => {
    const [draft] = findGroups(posts, { minSavers: 2, seed: 1, now: Date.now() })
    const previous: Moment = {
      slug: 'frogs-abc',
      title: 'Frogs',
      hue: '#7ee08a',
      centroid: draft.centroid,
      raw: draft.centroid,
      members: draft.members,
      recent: [],
      createdAt: 0,
    }
    expect(matchPrevious([draft], [previous])).toEqual([previous])
    expect(bestMoment(topic(0, 77, 64), [previous])?.moment).toBe(previous)
    expect(bestMoment(topic(30, 78, 64), [previous])).toBeNull()
  })

  it('starts a forming group and grows it with close saves', () => {
    const forming: Forming[] = []
    let n = 0
    const id = () => `f${++n}`
    const first = addToForming(forming, 'x1', topic(2, 1, 64), 'u1', 1, id, '#c3a6ff')
    const second = addToForming(forming, 'x2', topic(2, 2, 64), 'u2', 2, id, '#c3a6ff')
    const other = addToForming(forming, 'x3', topic(3, 3, 64), 'u1', 3, id, '#7fe3d6')
    expect(second).toBe(first)
    expect(other).not.toBe(first)
    expect(formingProgress(first, 2)).toMatchObject({
      have: 2,
      need: 2,
      unit: 'people',
      ready: true,
    })
    expect(formingProgress(other, 1)).toMatchObject({
      have: 1,
      need: 4,
      unit: 'saves',
      ready: false,
    })
  })

  it('counts saves per minute, spots a rising moment, and makes stable slugs and colours', () => {
    const now = Date.parse('2026-10-16T12:00:00Z')
    const times = [now - 30_000, now - 90_000, now - 95_000, now - 5_000_000]
    expect(minuteBars(times, now, 3)).toEqual([0, 2, 1])
    expect(isRising(times, now)).toBe(true)
    expect(isRising([now - 5_000_000, now - 5_100_000], now)).toBe(false)
    const v = topic(0, 1, 64)
    expect(slugFor('Frogs & toads!', v)).toBe(slugFor('Frogs & toads!', v))
    expect(slugFor('Frogs & toads!', v)).toMatch(/^frogs-toads-[a-z0-9]+$/)
    expect(pickHue(0, new Set(['#7ee08a']))).not.toBe('#7ee08a')
  })
})

describe('naming a moment', () => {
  it('uses the word most posts share when nothing better is known', async () => {
    expect(tellingWord(['A frog in a pond', 'frog mug', 'Tree frog!'])).toEqual({
      word: 'Frog',
      share: 1,
    })
    expect(tellingWord(['one', 'two'])).toBeNull()
    const name = await nameMoment(new Float32Array(256), ['frog one', 'frog two'], new Set())
    expect(name).toBe('Frog')
  })

  it('lets Jev choose among the closest topics', async () => {
    const choose = vi.fn(async (candidates: string[]) => candidates[1])
    const embedTopics = async (prompts: string[]) => prompts.map((_, i) => topic(i % 50, i, 768))
    const name = await nameMoment(topic(0, 1, 256), ['a', 'b'], new Set(), { embedTopics, choose })
    expect(choose).toHaveBeenCalled()
    expect(typeof name).toBe('string')
  })
})

// ——— The engine against a real (test) database ———

describe('Right now, live', () => {
  it('shows moments that several people are saving, anonymously', async () => {
    await seedLibrary()
    await __moments.recompute()
    const snapshot = await getMomentsSnapshot()
    expect(snapshot.label).toBe('Right now')
    expect(snapshot.moments.map((m) => m.title)).toEqual(['Frog'])
    const [frog] = snapshot.moments
    expect(frog).toMatchObject({ people: 2, posts: 6 })
    // Anonymised copies only: nothing about who saved them.
    expect(JSON.stringify(snapshot)).not.toContain(USER_A)
    expect(JSON.stringify(snapshot)).not.toContain(USER_B)
    const detail = await getMomentDetail(frog.slug)
    expect(detail?.items).toHaveLength(6)
    expect(detail?.bars).toHaveLength(30)
  })

  it('tells listeners the moment a new save lands in a moment', async () => {
    await seedLibrary()
    await __moments.recompute()
    const events: MomentEvent[] = []
    const stop = subscribe((e) => events.push(e), (await getMomentsSnapshot()).moments[0].slug)

    save(USER_C, 'frog9', 'frog video number 9')
    await understood('frog9', topic(0, 9))
    // Saves that aren't someone's choice, or are by a banned account, never count.
    save(USER_C, 'frog10', 'frog video number 10', { source: 'quoted' })
    await understood('frog10', topic(0, 10))
    testInstance.db
      .insert(schema.userBans)
      .values({
        userId: USER_B,
        reason: 'spam',
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
      })
      .run()
    save(USER_B, 'frog11', 'frog video number 11')
    await understood('frog11', topic(0, 11))

    await __moments.processNewSaves()
    const saves = events.filter((e) => e.type === 'save')
    expect(saves).toHaveLength(1)
    const [event] = saves as Extract<MomentEvent, { type: 'save' }>[]
    expect(event.item.key).toBe('twitter:frog9')
    expect(event.item.to).toMatchObject({ kind: 'moment', title: 'Frog' })
    expect(event.moment).toMatchObject({ people: 3, posts: 7, watching: 1 })
    expect(JSON.stringify(event)).not.toContain(USER_C)
    stop()
  })

  it('forms a new moment once enough people save the same kind of thing', async () => {
    await seedLibrary()
    await __moments.recompute()
    const events: MomentEvent[] = []
    const stop = subscribe((e) => events.push(e))

    save(USER_A, 'duck1', 'duckling learning to swim')
    await understood('duck1', topic(5, 301))
    await __moments.processNewSaves()
    expect(events.filter((e) => e.type === 'save').at(-1)).toMatchObject({
      type: 'save',
      item: { to: { kind: 'forming' } },
    })

    save(USER_C, 'duck2', 'duckling jumping in')
    await understood('duck2', topic(5, 302))
    await __moments.processNewSaves()
    const formed = events.find((e) => e.type === 'formed') as Extract<
      MomentEvent,
      { type: 'formed' }
    >
    expect(formed.moment).toMatchObject({ title: 'Duckling', people: 2, posts: 2 })
    expect((await getMomentsSnapshot()).moments.map((m) => m.title)).toContain('Duckling')
    stop()
  })

  it('widens the window and says so when the last day is quiet', async () => {
    const old = new Date(Date.now() - 48 * 3_600_000).toISOString()
    for (let i = 0; i < 6; i++) {
      save(USER_A, `frog${i}`, `frog video number ${i}`, { processedAt: old })
      save(USER_B, `frog${i}`, `frog video number ${i}`, { processedAt: old })
      await understood(`frog${i}`, topic(0, i + 1))
    }
    for (let i = 0; i < 40; i++) {
      save(USER_A, `bg${i}`, `something else ${i}`, { processedAt: old })
      await understood(`bg${i}`, topic(10 + i, 200 + i))
    }
    await __moments.recompute()
    const snapshot = await getMomentsSnapshot()
    expect(snapshot.label).not.toBe('Right now')
    expect(snapshot.moments.map((m) => m.title)).toEqual(['Frog'])
  })
})

// ——— Client ———

describe('the Right now client', () => {
  const base: MomentsSnapshot = {
    label: 'Right now',
    hours: 24,
    moments: [
      {
        slug: 'a',
        title: 'A',
        hue: '#fff',
        people: 2,
        posts: 5,
        lastAt: '',
        rising: false,
        watching: 0,
        covers: [],
      },
      {
        slug: 'b',
        title: 'B',
        hue: '#fff',
        people: 1,
        posts: 4,
        lastAt: '',
        rising: false,
        watching: 0,
        covers: [],
      },
    ],
    forming: [{ id: 'f1', title: 'C', hue: '#fff', have: 1, need: 2, unit: 'people', covers: [] }],
    stream: [],
    stats: { today: 1, lastHour: 1 },
  }

  it('folds live events into the snapshot', () => {
    const item = { id: 'x@1', key: 'twitter:x', at: '', post: {} as never, to: null }
    const saved = applyEvent(base, {
      type: 'save',
      item,
      moment: { ...base.moments[1], people: 2 },
    })
    expect(saved.stream[0]).toBe(item)
    expect(saved.moments[1].people).toBe(2)
    const formed = applyEvent(base, {
      type: 'formed',
      formingId: 'f1',
      moment: { ...base.moments[0], slug: 'c', title: 'C' },
    })
    // A new moment goes right after the lead; its forming card goes.
    expect(formed.moments.map((m) => m.slug)).toEqual(['a', 'c', 'b'])
    expect(formed.forming).toEqual([])
    expect(applyEvent(base, { type: 'watching', slug: 'b', watching: 3 }).moments[1].watching).toBe(
      3,
    )
  })

  it('says how long ago', () => {
    const now = Date.parse('2026-10-16T12:00:00Z')
    expect(timeAgo('2026-10-16T11:59:30Z', now)).toBe('just now')
    expect(timeAgo('2026-10-16T11:56:00Z', now)).toBe('4 min ago')
    expect(timeAgo('2026-10-16T09:00:00Z', now)).toBe('3h ago')
  })

  it('tunes the theater in to a moment', () => {
    const source = sourceFromParams({ moment: 'frogs-abc', start: 'twitter:1' })
    expect(source).toMatchObject({ moment: 'frogs-abc', start: 'twitter:1' })
    expect(sourceFromParams({ moment: '../etc' }).moment).toBeNull()
    expect(queueUrl(source, () => '/api/search')).toBe('/api/moments/frogs-abc?limit=100')
    expect(backHref(source)).toBe('/moments/frogs-abc')
    expect(momentPlayHref('frogs-abc')).toBe('/play?moment=frogs-abc')
  })
})
