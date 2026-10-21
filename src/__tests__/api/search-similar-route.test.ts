import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const viewer = vi.hoisted(() => ({ id: null as string | null }))
vi.mock('@/lib/auth/session', () => ({ getCurrentUserId: async () => viewer.id }))
const similarPosts = vi.fn(async () => ({ hits: [], total: 0, understood: true, close: true }))
const loadSearchItems = vi.fn(async () => [])
vi.mock('@/lib/semantic/search', () => ({
  similarPosts: (...a: unknown[]) => similarPosts(...(a as [])),
}))
vi.mock('@/lib/semantic/items', () => ({
  loadSearchItems: (...a: unknown[]) => loadSearchItems(...(a as [])),
}))

import { GET } from '@/app/api/search/similar/route'

function req(query: string) {
  return new NextRequest(`http://localhost/api/search/similar?${query}`)
}

describe('GET /api/search/similar', () => {
  beforeEach(() => {
    similarPosts.mockClear()
    loadSearchItems.mockClear()
    viewer.id = null
  })

  it('lets a signed-out shared page keep going with everyone’s saves, anonymised', async () => {
    const res = await GET(req('platform=twitter&id=20&scope=everyone'))
    expect(res.status).toBe(200)
    expect(similarPosts).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'everyone', userId: '' }),
    )
    expect(loadSearchItems).toHaveBeenCalledWith([], '')
  })

  it('keeps your own saves private: signed out, scope=mine is refused', async () => {
    const res = await GET(req('platform=twitter&id=20&scope=mine'))
    expect(res.status).toBe(401)
    expect(similarPosts).not.toHaveBeenCalled()
  })

  it('works as before when signed in', async () => {
    viewer.id = 'u1'
    const res = await GET(req('platform=twitter&id=20&scope=mine'))
    expect(res.status).toBe(200)
    expect(similarPosts).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'mine', userId: 'u1' }),
    )
  })
})
