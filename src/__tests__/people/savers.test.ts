import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, type TestDbInstance } from '../api/setup'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction: <R>(fn: () => R): R => testInstance.sqlite.transaction(fn)(),
}))

import { saversFor, visibleSave, visibleSaveFilter, withSavers } from '@/lib/people/savers'
import { listMembers } from '@/lib/people/members'

const ANA = 'u_ana'
const BEN = 'u_ben'
const CAL = 'u_cal'

function addUser(id: string, username: string, displayName: string | null = null) {
  testInstance.db
    .insert(schema.users)
    .values({ id, username, displayName, avatarUrl: `https://img.test/${username}.png` } as never)
    .run()
}

function save(userId: string, id: string, at: string, extra: Partial<schema.NewBookmark> = {}) {
  testInstance.db
    .insert(schema.bookmarks)
    .values(createTestBookmark(userId, id, { processedAt: at, ...extra }))
    .run()
}

function ban(userId: string) {
  testInstance.db
    .insert(schema.userBans)
    .values({ userId, createdAt: new Date().toISOString(), createdBy: 'admin' })
    .run()
}

const post = (id: string) => ({ platform: 'twitter', id })

beforeEach(() => {
  testInstance = createTestDb()
  addUser(ANA, 'ana', 'Ana')
  addUser(BEN, 'ben', 'Ben')
  addUser(CAL, 'cal')
})

afterEach(() => testInstance.close())

describe('saversFor', () => {
  it('names members who saved a post, newest first', () => {
    save(ANA, '1', '2026-10-01T10:00:00.000Z')
    save(BEN, '1', '2026-10-03T10:00:00.000Z')
    save(CAL, '1', '2026-10-02T10:00:00.000Z')
    const savers = saversFor([post('1')], ANA).get('twitter:1')!
    expect(savers.map((s) => s.username)).toEqual(['ben', 'cal', 'ana'])
    expect(savers[0]).toEqual({
      username: 'ben',
      name: 'Ben',
      avatarUrl: 'https://img.test/ben.png',
      savedAt: '2026-10-03T10:00:00.000Z',
      isYou: false,
    })
    expect(savers.find((s) => s.username === 'ana')?.isYou).toBe(true)
  })

  it('hides a private save from others but shows it to its owner', () => {
    save(BEN, '1', '2026-10-01T10:00:00.000Z', { isPrivate: true })
    expect(saversFor([post('1')], ANA).get('twitter:1')).toBeUndefined()
    const own = saversFor([post('1')], BEN).get('twitter:1')!
    expect(own).toHaveLength(1)
    expect(own[0]).toMatchObject({ username: 'ben', isYou: true })
  })

  it('never counts quoted copies, even the viewer’s own', () => {
    save(BEN, '1', '2026-10-01T10:00:00.000Z', { source: 'quoted' })
    save(ANA, '1', '2026-10-01T11:00:00.000Z', { source: 'quoted' })
    expect(saversFor([post('1')], ANA).size).toBe(0)
  })

  it('leaves out banned savers', () => {
    save(BEN, '1', '2026-10-01T10:00:00.000Z')
    save(CAL, '1', '2026-10-02T10:00:00.000Z')
    ban(CAL)
    expect(
      saversFor([post('1')], ANA)
        .get('twitter:1')!
        .map((s) => s.username),
    ).toEqual(['ben'])
  })

  it('returns nothing for a signed-out viewer', () => {
    save(BEN, '1', '2026-10-01T10:00:00.000Z')
    expect(saversFor([post('1')], '').size).toBe(0)
  })

  it('keeps platforms apart and drops the generated-icon photo', () => {
    save(BEN, '1', '2026-10-01T10:00:00.000Z', { platform: 'tiktok' })
    testInstance.db
      .insert(schema.userPreferences)
      .values({ userId: BEN, key: 'avatarSource', value: 'generated' })
      .run()
    const map = saversFor([post('1'), { platform: 'tiktok', id: '1' }], ANA)
    expect(map.get('twitter:1')).toBeUndefined()
    expect(map.get('tiktok:1')![0].avatarUrl).toBeNull()
  })
})

describe('notes on saves', () => {
  it('carries each member’s note, and leaves it off when there is none', () => {
    save(ANA, '1', '2026-10-01T10:00:00.000Z', { note: 'the original and still the best' })
    save(BEN, '1', '2026-10-02T10:00:00.000Z')
    const savers = saversFor([post('1')], CAL).get('twitter:1')!
    expect(savers.find((s) => s.username === 'ana')!.note).toBe('the original and still the best')
    expect('note' in savers.find((s) => s.username === 'ben')!).toBe(false)
  })

  it('never shows a private save’s note to anyone but its owner', () => {
    save(BEN, '1', '2026-10-01T10:00:00.000Z', { isPrivate: true, note: 'just for me, this' })
    save(CAL, '1', '2026-10-02T10:00:00.000Z')
    expect(JSON.stringify(saversFor([post('1')], ANA).get('twitter:1'))).not.toContain(
      'just for me',
    )
    const own = saversFor([post('1')], BEN).get('twitter:1')!
    expect(own.find((s) => s.isYou)!.note).toBe('just for me, this')
  })

  it('never reaches a signed-out viewer or a banned saver’s friends', () => {
    save(BEN, '1', '2026-10-01T10:00:00.000Z', { note: 'you’re welcome' })
    save(CAL, '1', '2026-10-02T10:00:00.000Z', { note: 'banned words' })
    ban(CAL)
    expect(saversFor([post('1')], '').size).toBe(0)
    expect(withSavers([{ id: '1', platform: 'twitter' }], '')).toEqual([
      { id: '1', platform: 'twitter' },
    ])
    expect(JSON.stringify(saversFor([post('1')], ANA).get('twitter:1'))).not.toContain('banned')
  })

  it('withSavers carries notes for members', () => {
    save(BEN, '1', '2026-10-01T10:00:00.000Z', { note: 'you’re welcome' })
    const [item] = withSavers([{ id: '1', platform: 'twitter' }], ANA)
    expect(item.savers).toEqual([
      expect.objectContaining({ username: 'ben', note: 'you’re welcome' }),
    ])
  })
})

describe('visibleSave', () => {
  it('drops private, quoted and banned saves, aliased or not', () => {
    save(ANA, '1', '2026-10-01T10:00:00.000Z')
    save(BEN, '2', '2026-10-01T10:00:00.000Z', { isPrivate: true })
    save(BEN, '3', '2026-10-01T10:00:00.000Z', { source: 'quoted' })
    save(CAL, '4', '2026-10-01T10:00:00.000Z')
    ban(CAL)
    const plain = testInstance.db
      .select({ id: schema.bookmarks.id })
      .from(schema.bookmarks)
      .where(visibleSaveFilter)
      .all()
    expect(plain.map((r) => r.id)).toEqual(['1'])
    const aliased = testInstance.db.all<{ id: string }>(
      sql`SELECT b.id FROM bookmarks b WHERE ${visibleSave('b')}`,
    )
    expect(aliased.map((r) => r.id)).toEqual(['1'])
  })
})

describe('withSavers', () => {
  it('adds savers and the viewer’s private flag only when signed in', () => {
    save(ANA, '1', '2026-10-01T10:00:00.000Z', { isPrivate: true })
    save(BEN, '1', '2026-10-02T10:00:00.000Z')
    const [mine] = withSavers([{ id: '1', platform: 'twitter' }], ANA)
    expect(mine.isPrivate).toBe(true)
    expect(mine.savers!.map((s) => s.username)).toEqual(['ben', 'ana'])
    const [stranger] = withSavers([{ id: '1', platform: 'twitter' }], '')
    expect(stranger).toEqual({ id: '1', platform: 'twitter' })
  })
})

describe('listMembers', () => {
  it('lists non-banned members with the saves the viewer can see', () => {
    save(ANA, '1', '2026-10-01T10:00:00.000Z', { isPrivate: true })
    save(BEN, '1', '2026-10-02T10:00:00.000Z')
    save(BEN, '2', '2026-10-03T10:00:00.000Z', { isPrivate: true })
    save(BEN, '3', '2026-10-01T10:00:00.000Z', { source: 'quoted' })
    save(CAL, '1', '2026-10-04T10:00:00.000Z')
    ban(CAL)
    const asAna = listMembers(ANA)
    expect(asAna.map((m) => [m.username, m.saves, m.isYou])).toEqual([
      ['ben', 1, false],
      ['ana', 1, true],
    ])
    expect(asAna[0].lastSavedAt).toBe('2026-10-02T10:00:00.000Z')
    const asBen = listMembers(BEN)
    expect(asBen.find((m) => m.username === 'ben')!.saves).toBe(2)
    expect(asBen.find((m) => m.username === 'ana')!.saves).toBe(0)
  })

  it('is empty when signed out', () => {
    save(BEN, '1', '2026-10-02T10:00:00.000Z')
    expect(listMembers('')).toEqual([])
  })
})
