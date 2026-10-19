import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from '../api/setup'

let testDb: TestDbInstance
vi.mock('@/lib/db', () => ({
  get db() {
    return testDb.db
  },
}))

import { segmentScores } from '@/lib/processing/segment-search'
import { remoteVideoPrefix } from '@/lib/processing/config'
import { SEMANTIC_MODEL_VERSION } from '@/lib/semantic/config'
import { cosine, toBlob } from '@/lib/semantic/vectors'
import { saveEmbedding } from '@/lib/semantic/store'
import {
  __resetVectorIndex,
  __setBackgroundPrior,
  background,
  nearest,
  refreshIndex,
  truncate,
} from '@/lib/semantic/vector-index'

const unit = (weights: Record<number, number>) => {
  const out = new Float32Array(768)
  for (const [index, value] of Object.entries(weights)) out[Number(index)] = value
  const norm = Math.hypot(...out)
  return out.map((value) => value / norm)
}
const QUERY = unit({ 0: 1 })
const CLOSE = unit({ 0: 0.8, 1: 0.6 })
const FAR = unit({ 1: 1 })
const now = '2026-10-19T12:00:00.000Z'

function state(
  id: string,
  options: {
    hash?: string
    model?: string
    profile?: string
    segments?: number
    next?: number
    platform?: string
  } = {},
) {
  const hash = options.hash ?? `${remoteVideoPrefix()}${id}`
  const segments = options.segments ?? 3
  testDb.sqlite
    .prepare(
      `INSERT INTO video_index_state
    (platform,post_id,content_hash,model,profile,duration,segments,frames_per_segment,next_segment,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      options.platform ?? 'twitter',
      id,
      hash,
      options.model ?? SEMANTIC_MODEL_VERSION,
      options.profile ?? 'normal',
      segments * 60,
      segments,
      15,
      options.next ?? segments,
      now,
    )
  return hash
}
function segment(
  id: string,
  index: number,
  vector: Float32Array,
  options: { hash?: string; model?: string; platform?: string } = {},
) {
  testDb.sqlite
    .prepare(
      `INSERT INTO video_segments
    (platform,post_id,content_hash,model,segment_index,start_seconds,end_seconds,vector,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      options.platform ?? 'twitter',
      id,
      options.hash ?? `${remoteVideoPrefix()}${id}`,
      options.model ?? SEMANTIC_MODEL_VERSION,
      index,
      index * 60,
      (index + 1) * 60,
      toBlob(vector),
      now,
    )
}
async function averaged(id: string, vector: Float32Array) {
  await saveEmbedding({
    platform: 'twitter',
    postId: id,
    kind: 'video',
    contentHash: `${remoteVideoPrefix()}${id}`,
    status: 'ok',
    vector,
  })
}

beforeEach(() => {
  testDb = createTestDb()
  vi.stubEnv('PROCESSING_MODE', 'remote')
  vi.stubEnv('INDEXING_LEVEL', 'normal')
  __resetVectorIndex()
  __setBackgroundPrior(null)
})
afterEach(() => {
  __resetVectorIndex()
  __setBackgroundPrior(null)
  vi.unstubAllEnvs()
  testDb.close()
})

describe('current-generation segment search', () => {
  it('finds the best segment from the end of a video without diluting it into its average', async () => {
    state('long')
    segment('long', 0, FAR)
    segment('long', 1, FAR)
    segment('long', 2, QUERY)
    state('other', { segments: 1 })
    segment('other', 0, CLOSE)
    await averaged('long', FAR)
    await averaged('other', CLOSE)
    await refreshIndex(true)
    const result = await nearest('video', QUERY, 1)
    expect(result.hits).toHaveLength(1)
    expect(result.hits[0].key).toBe('twitter:long')
    expect(result.hits[0].score).toBeCloseTo(1)
  })

  it('keeps the allow-set account/platform scope and does not expose per-segment rows as posts', async () => {
    state('same')
    state('same', { platform: 'instagram' })
    for (let index = 0; index < 3; index++) {
      segment('same', index, CLOSE)
      segment('same', index, QUERY, { platform: 'instagram' })
    }
    const allow = new Set(['twitter:same'])
    const scores = await segmentScores(QUERY, truncate, allow)
    expect([...scores.keys()]).toEqual(['twitter:same'])
    const result = await nearest('video', QUERY, 20, allow)
    expect(result.hits.map((hit) => hit.key)).toEqual(['twitter:same'])
    expect(await segmentScores(QUERY, truncate, new Set())).toEqual(new Map())
  })

  it('excludes previous content, model/profile generations, orphan rows and uncommitted segments', async () => {
    state('current')
    segment('current', 0, CLOSE)
    state('changed', { hash: `${remoteVideoPrefix()}new-hash` })
    segment('changed', 0, QUERY, { hash: `${remoteVideoPrefix()}old-hash` })
    state('old-model', { model: 'old-model' })
    segment('old-model', 0, QUERY, { model: 'old-model' })
    state('old-profile', { hash: 'elastic-v1/light|old-profile', profile: 'light' })
    segment('old-profile', 0, QUERY, { hash: 'elastic-v1/light|old-profile' })
    state('bad-profile', { profile: 'deep' })
    segment('bad-profile', 0, QUERY)
    segment('orphan', 0, QUERY)
    state('not-committed', { next: 0 })
    segment('not-committed', 0, QUERY)
    expect([...(await segmentScores(QUERY, truncate)).keys()]).toEqual(['twitter:current'])
  })

  it('includes committed partial-video results before a whole-video vector exists', async () => {
    state('partial', { next: 1 })
    segment('partial', 0, QUERY)
    const result = await nearest('video', QUERY, 10)
    expect(result.hits).toEqual([{ key: 'twitter:partial', score: 1 }])
  })

  it('computes distribution statistics from one maximum per post rather than each segment', async () => {
    state('long', { segments: 100 })
    for (let index = 0; index < 100; index++) segment('long', index, QUERY)
    state('short', { segments: 1 })
    segment('short', 0, CLOSE)
    await averaged('long', FAR)
    await averaged('short', FAR)
    await refreshIndex(true)
    const result = await nearest('video', QUERY, 20)
    const closeScore = cosine(QUERY, truncate(CLOSE))
    const expected = background('video', 2, 1 + closeScore, 1 + closeScore ** 2)
    expect(result.hits).toHaveLength(2)
    expect(result.mean).toBeCloseTo(expected.mean, 8)
    expect(result.std).toBeCloseTo(expected.std, 8)
  })

  it('preserves the best full cosine even when a different segment wins projected scoring', async () => {
    const query = unit({ 0: 0.5, 400: Math.sqrt(0.75) })
    const strongestFull = unit({ 0: 0.45, 1: 0.05, 400: 0.89 })
    state('mixed')
    segment('mixed', 0, QUERY)
    segment('mixed', 1, strongestFull)
    const scores = await segmentScores(query, truncate)
    expect(scores.get('twitter:mixed')?.score).toBeCloseTo(1)
    expect(scores.get('twitter:mixed')?.fullScore).toBeCloseTo(cosine(query, strongestFull))
    const result = await nearest('video', query, 1)
    expect(result.hits[0].score).toBeCloseTo(cosine(query, strongestFull))
    expect(result.hits[0].score).toBeLessThan(1)
  })

  it('pages past a thousand vectors without losing a late match', async () => {
    const insert = testDb.sqlite.transaction(() => {
      state('first', { segments: 501 })
      state('last', { segments: 501 })
      for (let index = 0; index < 501; index++) segment('first', index, FAR)
      for (let index = 0; index < 501; index++) segment('last', index, index === 500 ? QUERY : FAR)
    })
    insert()
    const scores = await segmentScores(QUERY, truncate)
    expect(scores.size).toBe(2)
    expect(scores.get('twitter:last')?.fullScore).toBeCloseTo(1)
    expect(scores.get('twitter:first')?.fullScore).toBe(0)
  })

  it('leaves local mode unchanged without reading remote processing tables', async () => {
    vi.stubEnv('PROCESSING_MODE', 'local')
    await averaged('legacy', CLOSE)
    testDb.sqlite.exec('DROP TABLE video_segments; DROP TABLE video_index_state;')
    await refreshIndex(true)
    expect(await segmentScores(QUERY, truncate)).toEqual(new Map())
    const result = await nearest('video', QUERY, 10)
    expect(result.hits).toEqual([{ key: 'twitter:legacy', score: cosine(QUERY, CLOSE) }])
  })

  it('preserves existing video scoring when remote mode has no segments', async () => {
    await averaged('legacy', CLOSE)
    await refreshIndex(true)
    const result = await nearest('video', QUERY, 10)
    expect(result.hits).toEqual([{ key: 'twitter:legacy', score: cosine(QUERY, CLOSE) }])
    expect(result.mean).toBeCloseTo(
      background('video', 1, cosine(QUERY, truncate(CLOSE)), cosine(QUERY, truncate(CLOSE)) ** 2)
        .mean,
    )
  })
})
