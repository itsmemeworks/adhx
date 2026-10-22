import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from '../api/setup'
import { SEMANTIC_MODEL_VERSION } from '@/lib/semantic/config'

let instance: TestDbInstance
vi.mock('@/lib/db', () => ({
  get db() {
    return instance.db
  },
}))
import { __resetVectorIndex, postVector, refreshIndex } from '@/lib/semantic/vector-index'

beforeEach(() => {
  instance = createTestDb()
  __resetVectorIndex()
})
afterEach(() => {
  __resetVectorIndex()
  instance.close()
})

it('pages tied timestamps and reads later inserts and updates without mixing models', async () => {
  const first = '2026-10-22T10:00:00.000Z'
  const insert = instance.sqlite.prepare(`INSERT INTO post_embeddings
    (platform,post_id,kind,model,content_hash,status,vector,dims,created_at)
    VALUES('twitter',?,'text',?,'synthetic','ok',?,2,?)`)
  const vector = Buffer.from(new Float32Array([1, 0]).buffer)
  instance.sqlite.transaction(() => {
    for (let i = 0; i < 2005; i++) insert.run(`p${i}`, SEMANTIC_MODEL_VERSION, vector, first)
    insert.run('old-model', 'retired-model', vector, first)
  })()
  await refreshIndex(true)
  for (let i = 0; i < 2005; i++) expect(postVector(`twitter:p${i}`)?.[0]).toBe(1)
  expect(postVector('twitter:old-model')).toBeNull()
  insert.run('same-time', SEMANTIC_MODEL_VERSION, vector, first)
  insert.run('later', SEMANTIC_MODEL_VERSION, vector, '2026-10-22T10:00:01.000Z')
  await refreshIndex(true)
  expect(postVector('twitter:same-time')?.[0]).toBe(1)
  expect(postVector('twitter:later')?.[0]).toBe(1)
  instance.sqlite
    .prepare(`UPDATE post_embeddings SET vector=?,created_at=? WHERE post_id='p0'`)
    .run(Buffer.from(new Float32Array([0, 1]).buffer), '2026-10-22T10:00:02.000Z')
  await refreshIndex(true)
  expect(postVector('twitter:p0')?.[0]).toBe(0)
  expect(postVector('twitter:p0')?.[1]).toBe(1)
})
