import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from '../api/setup'

let instance: TestDbInstance
vi.mock('@/lib/db', () => ({
  get db() {
    return instance.db
  },
  runInTransaction: <R>(fn: () => R): R => instance.sqlite.transaction(fn)(),
}))
import { hasPostText, indexPostText } from '@/lib/semantic/keywords'

beforeEach(() => {
  instance = createTestDb()
})
afterEach(() => instance.close())
function rows() {
  return instance.sqlite
    .prepare(
      'SELECT f.rowid,f.platform,f.post_id,f.body,k.row_id FROM post_text_fts f LEFT JOIN post_text_keys k ON k.row_id=f.rowid ORDER BY f.platform,f.rowid',
    )
    .all()
}

describe('keyword row-id lookup', () => {
  it('replaces only the requested network and leaves a matching row-id entry for every FTS row', () => {
    indexPostText('twitter', 'same', 'old words')
    indexPostText('instagram', 'same', 'other words')
    expect(hasPostText('twitter', 'same')).toBe(true)
    indexPostText('twitter', 'same', 'new words')
    const all = rows() as { platform: string; body: string; rowid: number; row_id: number }[]
    expect(all.map((r) => [r.platform, r.body])).toEqual([
      ['instagram', 'other words'],
      ['twitter', 'new words'],
    ])
    expect(all.every((r) => r.rowid === r.row_id)).toBe(true)
    indexPostText('twitter', 'same', '  ')
    expect(hasPostText('twitter', 'same')).toBe(false)
    expect(rows()).toHaveLength(1)
    expect(hasPostText('instagram', 'same')).toBe(true)
  })
  it('rolls back both text and its lookup when writing the lookup fails', () => {
    indexPostText('twitter', 'same', 'original words')
    const before = rows()
    instance.sqlite.exec(
      `CREATE TRIGGER fail_keyword_lookup BEFORE INSERT ON post_text_keys BEGIN SELECT RAISE(ABORT,'injected lookup failure'); END`,
    )
    expect(() => indexPostText('twitter', 'same', 'replacement')).toThrow(/post_text_keys/)
    expect(rows()).toEqual(before)
    expect(hasPostText('twitter', 'same')).toBe(true)
  })
  it('finds metadata through the B-tree and reads/deletes FTS through row ids', () => {
    indexPostText('twitter', 'same', 'words')
    const lookup = instance.sqlite
      .prepare(
        "EXPLAIN QUERY PLAN SELECT row_id FROM post_text_keys WHERE platform='twitter' AND post_id='same'",
      )
      .all() as { detail: string }[]
    expect(
      lookup.some((r) =>
        r.detail.includes('SEARCH post_text_keys USING COVERING INDEX post_text_keys_post_idx'),
      ),
    ).toBe(true)
    const text = instance.sqlite
      .prepare(
        "EXPLAIN QUERY PLAN SELECT body FROM post_text_fts WHERE rowid IN(SELECT row_id FROM post_text_keys WHERE platform='twitter' AND post_id='same')",
      )
      .all() as { detail: string }[]
    expect(text.some((r) => /VIRTUAL TABLE INDEX .*:=/.test(r.detail))).toBe(true)
    expect(text.some((r) => r.detail.startsWith('SCAN post_text_keys'))).toBe(false)
  })
})
