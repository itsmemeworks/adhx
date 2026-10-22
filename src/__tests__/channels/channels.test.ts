import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from '../api/setup'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction: <R>(fn: () => R): R => testInstance.sqlite.transaction(fn)(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/semantic/supervisor', () => ({
  embedQueries: vi.fn(),
  embedQuery: vi.fn(),
  wakeJobs: () => {},
  jobActivity: () => null,
  startSemanticProcesses: () => {},
}))

import { groupCount, groupSaves, kmeans, seedFrom } from '@/lib/channels/cluster'
import {
  autoChannelsBuilding,
  computeAutoChannels,
  getAutoChannels,
  keepAutoChannel,
} from '@/lib/channels/auto'
import { channelQueue } from '@/lib/channels/channels'
import { CHANNEL_NAMES } from '@/lib/channels/names'
import { saveEmbedding } from '@/lib/semantic/store'
import { SEMANTIC_MODEL_VERSION } from '@/lib/semantic/config'

function unit(weights: Record<number, number>): Float32Array {
  const v = new Float32Array(768)
  for (const [i, w] of Object.entries(weights)) v[Number(i)] = w
  const n = Math.hypot(...v)
  return v.map((x) => x / n)
}

/** Two clear topics: dimension 0 ("cats") and dimension 1 ("synths"), with a little noise. */
function topicVector(topic: 0 | 1, i: number): Float32Array {
  return unit({ [topic]: 1, [10 + (i % 7)]: 0.15 })
}

function addUser(userId: string, username: string) {
  testInstance.db
    .insert(schema.users)
    .values({ id: userId, username, createdAt: new Date().toISOString() } as never)
    .run()
}

async function seedLibrary(userId: string, perTopic = 8) {
  for (const topic of [0, 1] as const) {
    for (let i = 0; i < perTopic; i++) {
      const id = `${topic}${i}`
      testInstance.db
        .insert(schema.bookmarks)
        .values(
          createTestBookmark(userId, id, {
            text: topic === 0 ? `cat picture ${i}` : `synth patch ${i}`,
          }),
        )
        .run()
      await saveEmbedding({
        platform: 'twitter',
        postId: id,
        kind: 'text',
        contentHash: id,
        status: 'ok',
        vector: topicVector(topic, i),
      })
    }
  }
}

/** Name vectors: "Cats" on the cat axis, "Synths" on the synth axis, the rest elsewhere. */
async function nameVectors(prompts: string[]): Promise<Float32Array[]> {
  return prompts.map((p, i) =>
    p.endsWith(': Cats')
      ? unit({ 0: 1 })
      : p.endsWith(': Synths')
        ? unit({ 1: 1 })
        : unit({ [100 + (i % 600)]: 1 }),
  )
}

beforeEach(() => {
  testInstance = createTestDb()
  vi.clearAllMocks()
})

describe('clustering', () => {
  it('finds obvious groups and is stable for a seed', () => {
    const vectors = [
      ...Array.from({ length: 10 }, (_, i) => topicVector(0, i)),
      ...Array.from({ length: 10 }, (_, i) => topicVector(1, i)),
    ]
    const a = kmeans(vectors, 2, seedFrom('u'))
    const b = kmeans(vectors, 2, seedFrom('u'))
    expect(a.map((c) => c.members.sort())).toEqual(b.map((c) => c.members.sort()))
    const groups = a.map((c) => new Set(c.members.map((m) => (m < 10 ? 'cats' : 'synths'))))
    expect(groups.every((g) => g.size === 1)).toBe(true)
  })

  it('splits oversized groups and skips tiny libraries', () => {
    expect(groupCount(5)).toBe(0)
    const big = Array.from({ length: 80 }, (_, i) => unit({ 0: 1, [2 + (i % 4)]: 0.6 }))
    expect(groupSaves(big, 1, { maxSize: 30 }).every((c) => c.members.length <= 40)).toBe(true)
  })
})

describe('made for you channels', () => {
  it('groups saves and names them, with Jev’s pick or the closest name', async () => {
    await seedLibrary(USER_A)
    const chooseName = vi.fn(async (candidates: string[]) =>
      candidates.includes('Cats') ? 'Cats' : null,
    )
    const channels = await computeAutoChannels(USER_A, { embedNames: nameVectors, chooseName })
    expect(channels.map((c) => c.name).sort()).toEqual(['Cats', 'Synths'])
    const cats = channels.find((c) => c.name === 'Cats')!
    expect(cats.keys.every((k) => k.startsWith('twitter:0'))).toBe(true)
    expect(cats.slug).toBe('cats')
    const stored = testInstance.db.select().from(schema.autoChannels).all()
    expect(stored).toHaveLength(2)
    expect(stored[0].model).toBe(SEMANTIC_MODEL_VERSION)
  })

  it('reuses fresh results and recomputes when the model changes', async () => {
    await seedLibrary(USER_A)
    const deps = { embedNames: nameVectors, chooseName: vi.fn(async () => null) }
    await getAutoChannels(USER_A, deps)
    const calls = deps.chooseName.mock.calls.length
    await getAutoChannels(USER_A, deps)
    expect(deps.chooseName.mock.calls.length).toBe(calls)
    testInstance.sqlite.exec(`UPDATE auto_channels SET model = 'old'`)
    // The stored set is served at once while it's rebuilt.
    expect((await getAutoChannels(USER_A, deps)).length).toBeGreaterThan(0)
    await autoChannelsBuilding(USER_A)
    expect(deps.chooseName.mock.calls.length).toBeGreaterThan(calls)
  })

  it('goes on without channels that take too long to build the first time', async () => {
    await seedLibrary(USER_A)
    let release: (name: string | null) => void = () => {}
    const chooseName = vi.fn(() => new Promise<string | null>((resolve) => (release = resolve)))
    const deps = { embedNames: nameVectors, chooseName, firstWaitMs: 20 }
    expect(await getAutoChannels(USER_A, deps)).toEqual([])
    const building = autoChannelsBuilding(USER_A)!
    // Each name is asked for in turn; answer them all.
    const answer = setInterval(() => release(null), 5)
    const built = await building
    clearInterval(answer)
    expect(built.length).toBeGreaterThan(0)
    expect((await getAutoChannels(USER_A, deps)).length).toBe(built.length)
  })

  it('keeps a channel as a public tag, never past the per-post tag limit', async () => {
    addUser(USER_A, 'alice')
    await seedLibrary(USER_A)
    await computeAutoChannels(USER_A, { embedNames: nameVectors, chooseName: async () => null })
    const [slug] = testInstance.db
      .select()
      .from(schema.autoChannels)
      .all()
      .map((r) => r.slug)
    // One post already has five tags.
    const full = testInstance.db
      .select()
      .from(schema.autoChannels)
      .all()
      .find((r) => r.slug === slug)!
    const fullKey = (JSON.parse(full.postKeys) as string[])[0].split(':')[1]
    testInstance.db
      .insert(schema.bookmarkTags)
      .values(
        ['a', 'b', 'c', 'd', 'e'].map((tag) => ({
          userId: USER_A,
          platform: 'twitter',
          bookmarkId: fullKey,
          tag,
        })),
      )
      .run()

    const kept = await keepAutoChannel(USER_A, slug, true)
    expect(kept).toMatchObject({ tag: slug, shareUrl: `/t/alice/${slug}` })
    expect(kept!.added).toBe(full.size - 1)
    const share = testInstance.db.select().from(schema.tagShares).all()
    expect(share[0]).toMatchObject({ userId: USER_A, tag: slug, isPublic: true })
    expect(await keepAutoChannel(USER_B, slug, true)).toBeNull()
  })

  it('uses only plain, kind names', () => {
    expect(CHANNEL_NAMES).not.toContain('Cringe')
    expect(new Set(CHANNEL_NAMES).size).toBe(CHANNEL_NAMES.length)
  })
})

describe('channel queues', () => {
  beforeEach(() => {
    addUser(USER_A, 'alice')
    testInstance.db
      .insert(schema.bookmarks)
      .values(createTestBookmark(USER_A, '1', { text: 'a synth' }))
      .run()
    testInstance.db
      .insert(schema.bookmarkTags)
      .values({ userId: USER_A, platform: 'twitter', bookmarkId: '1', tag: 'synths' })
      .run()
  })

  it('hides a private channel from everyone but its owner', async () => {
    // Never shared or made private: either way, not visible ("not found" to others).
    expect((await channelQueue('alice', 'synths', null)).status).not.toBe('ok')
    expect((await channelQueue('alice', 'synths', USER_B)).status).not.toBe('ok')
    const own = await channelQueue('alice', 'synths', USER_A)
    expect(own).toMatchObject({ status: 'ok', mine: true, isPublic: false, count: 1 })
  })

  it('shows a public channel to anyone, anonymised', async () => {
    testInstance.db
      .insert(schema.tagShares)
      .values({ userId: USER_A, tag: 'synths', shareCode: 'abc', isPublic: true })
      .run()
    const anon = await channelQueue('alice', 'synths', null)
    expect(anon).toMatchObject({ status: 'ok', mine: false, count: 1 })
    if (anon.status !== 'ok') return
    expect(anon.items[0]).toMatchObject({ saved: false, post: { id: '1', tags: [] } })
    expect(JSON.stringify(anon.items)).not.toContain(USER_A)
  })
})
