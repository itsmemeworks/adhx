import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from './setup'
import type { GraphData } from '@/components/graph/types'

/**
 * API Route Tests: /api/graph (+ annotation endpoints)
 *
 * Validates the computed graph (themes/relations/stats), per-user annotations,
 * multi-user isolation, the node cap, and the items/themes/links mutations.
 */

let mockUserId: string | null = USER_A
let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
}))

function req(url: string, method = 'GET', body?: object): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function getGraph(): Promise<GraphData> {
  const { GET } = await import('@/app/api/graph/route')
  const res = await GET(req('/api/graph'))
  return (await res.json()) as GraphData
}

describe('API: /api/graph', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    mockUserId = USER_A
    vi.clearAllMocks()

    const db = testInstance.db
    // alice has two saves (author edge); t1 + t3 share keywords (related edge)
    await db.insert(schema.bookmarks).values([
      createTestBookmark(USER_A, 't1', {
        author: 'alice',
        authorName: 'Alice',
        text: 'Claude AI coding agents are powerful',
        category: 'article',
      }),
      createTestBookmark(USER_A, 't2', {
        author: 'alice',
        authorName: 'Alice',
        text: 'Weekend coffee and slow mornings',
        category: 'tweet',
      }),
      createTestBookmark(USER_A, 't3', {
        author: 'bob',
        authorName: 'Bob',
        text: 'Claude AI agents for coding workflows',
        category: 'tweet',
      }),
      createTestBookmark(USER_A, 't4', {
        author: 'carol',
        authorName: 'Carol',
        text: 'Fitness rowing and habits',
        category: 'tweet',
      }),
      // a different user's save — must never leak into USER_A's graph
      createTestBookmark(USER_B, 'z9', { author: 'eve', text: 'Claude AI agents secret' }),
    ])

    await db.insert(schema.bookmarkTags).values([
      { userId: USER_A, platform: 'twitter', bookmarkId: 't1', tag: 'ai' },
      { userId: USER_A, platform: 'twitter', bookmarkId: 't4', tag: 'fit' },
    ])
    await db
      .insert(schema.readStatus)
      .values({
        userId: USER_A,
        platform: 'twitter',
        bookmarkId: 't2',
        readAt: new Date().toISOString(),
      })
  })

  afterEach(() => {
    testInstance.close()
  })

  it('returns 401 when unauthenticated', async () => {
    mockUserId = null
    const { GET } = await import('@/app/api/graph/route')
    const res = await GET(req('/api/graph'))
    expect(res.status).toBe(401)
  })

  it('computes saves, themes, relations and stats', async () => {
    const g = await getGraph()

    expect(g.saves.map((s) => s.key).sort()).toEqual([
      'twitter:t1',
      'twitter:t2',
      'twitter:t3',
      'twitter:t4',
    ])

    // tag themes + keyword themes (hybrid)
    const themeIds = g.themes.map((t) => t.id)
    expect(themeIds).toContain('tag:ai')
    expect(themeIds).toContain('tag:fit')
    expect(themeIds).toContain('kw:agents')
    expect(themeIds).toContain('kw:claude')
    // no orphan hubs
    for (const t of g.themes) {
      expect(g.relations.some((r) => r.kind === 'topic' && r.to === t.id)).toBe(true)
    }

    // author edge between alice's two saves
    expect(
      g.relations.some(
        (r) =>
          r.kind === 'author' &&
          [r.from, r.to].sort().join() === ['twitter:t1', 'twitter:t2'].sort().join(),
      ),
    ).toBe(true)

    // related edge between t1 and t3 (shared keyword themes)
    expect(
      g.relations.some(
        (r) =>
          r.kind === 'related' &&
          [r.from, r.to].sort().join() === ['twitter:t1', 'twitter:t3'].sort().join(),
      ),
    ).toBe(true)

    // t1 is an article
    expect(g.saves.find((s) => s.key === 'twitter:t1')?.type).toBe('article')

    expect(g.stats.totalSaves).toBe(4)
    expect(g.stats.shown).toBe(4)
    expect(g.stats.capped).toBe(false)
    expect(g.stats.themeCount).toBe(g.themes.length)
    expect(g.stats.connectionCount).toBe(g.relations.length)
  })

  it('folds in read + tag annotations, scoped to the user', async () => {
    const g = await getGraph()
    expect(g.annotations.items['twitter:t2']?.read).toBe(true)
    expect(g.annotations.items['twitter:t1']?.tags).toEqual(['ai'])
    expect(g.annotations.items['twitter:t4']?.tags).toEqual(['fit'])
    // USER_B's save never appears
    expect(g.saves.some((s) => s.id === 'z9')).toBe(false)
  })

  it('isolates per user', async () => {
    mockUserId = USER_B
    const g = await getGraph()
    expect(g.saves.map((s) => s.id)).toEqual(['z9'])
  })

  it('caps the node count and flags it', async () => {
    const db = testInstance.db
    const many = Array.from({ length: 300 }, (_, i) =>
      createTestBookmark(USER_B, `m${i}`, { author: `u${i}`, text: `post ${i}` }),
    )
    await db.insert(schema.bookmarks).values(many)
    mockUserId = USER_B
    const g = await getGraph()
    expect(g.stats.totalSaves).toBe(301) // 300 + z9
    expect(g.stats.shown).toBe(280)
    expect(g.saves.length).toBe(280)
    expect(g.stats.capped).toBe(true)
  })

  describe('annotation endpoints', () => {
    it('PATCH /api/graph/items/[id] upserts title + note, and clears', async () => {
      const { PATCH } = await import('@/app/api/graph/items/[id]/route')
      const ctx = { params: Promise.resolve({ id: 't1' }) }

      await PATCH(
        req('/api/graph/items/t1?platform=twitter', 'PATCH', { title: 'My title', note: 'why' }),
        ctx,
      )
      let g = await getGraph()
      expect(g.annotations.items['twitter:t1']?.title).toBe('My title')
      expect(g.annotations.items['twitter:t1']?.note).toBe('why')

      // clearing both removes the row
      await PATCH(req('/api/graph/items/t1?platform=twitter', 'PATCH', { title: '', note: '' }), {
        params: Promise.resolve({ id: 't1' }),
      })
      g = await getGraph()
      expect(g.annotations.items['twitter:t1']?.title).toBeUndefined()
    })

    it('PATCH /api/graph/themes renames + re-icons', async () => {
      const { PATCH } = await import('@/app/api/graph/themes/route')
      await PATCH(
        req('/api/graph/themes', 'PATCH', {
          themeId: 'tag:ai',
          name: 'Artificial Intelligence',
          icon: 'sparkle',
        }),
      )
      const g = await getGraph()
      expect(g.annotations.themes['tag:ai']).toEqual({
        name: 'Artificial Intelligence',
        icon: 'sparkle',
      })
    })

    it('POST/DELETE /api/graph/links adds + removes a user edge', async () => {
      const links = await import('@/app/api/graph/links/route')
      await links.POST(
        req('/api/graph/links', 'POST', {
          a: { platform: 'twitter', id: 't2' },
          b: { platform: 'twitter', id: 't4' },
        }),
      )
      let g = await getGraph()
      expect(
        g.relations.some(
          (r) =>
            r.kind === 'user' &&
            [r.from, r.to].sort().join() === ['twitter:t2', 'twitter:t4'].sort().join(),
        ),
      ).toBe(true)
      expect(g.annotations.links.length).toBe(1)

      await links.DELETE(
        req('/api/graph/links', 'DELETE', {
          a: { platform: 'twitter', id: 't4' },
          b: { platform: 'twitter', id: 't2' },
        }),
      )
      g = await getGraph()
      expect(g.relations.some((r) => r.kind === 'user')).toBe(false)
      expect(g.annotations.links.length).toBe(0)
    })

    it('rejects a self-link', async () => {
      const links = await import('@/app/api/graph/links/route')
      const res = await links.POST(
        req('/api/graph/links', 'POST', {
          a: { platform: 'twitter', id: 't1' },
          b: { platform: 'twitter', id: 't1' },
        }),
      )
      expect(res.status).toBe(400)
    })
  })
})
