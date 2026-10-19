import { loadSearchItems, type SearchItem } from '@/lib/semantic/items'
import { stillLearning } from '@/lib/semantic/status'
import { jevStrength, rerank, RERANK_TOP } from '@/lib/semantic/rerank'
import { searchPosts, type SearchRequest } from '@/lib/semantic/search'

/** Jev's 0–4 relevance under this means "unrelated" (its lowest level). */
const UNRELATED_JEV = 0.5

export interface FindResult {
  items: SearchItem[]
  total: number
  understood: boolean
  close: boolean
  refined: boolean
  nextOffset: number | null
}

/**
 * Find saved posts by meaning: the search itself, the saves it points at, and
 * (with `refine`) a Jev rerank of the first results. Shared by `/api/search`
 * (the app) and `/api/agent/search` (access keys).
 */
export async function findPosts(request: SearchRequest & { refine: boolean }): Promise<FindResult> {
  const { q, userId, offset, refine } = request
  if (!q.trim()) {
    return { items: [], total: 0, understood: true, close: false, refined: false, nextOffset: null }
  }
  const result = await searchPosts(request)
  let items = await loadSearchItems(result.hits, userId)
  let refined = false
  let dropped = 0
  if (refine && items.length > 1) {
    const before = items.length
    const reranked = await rerank(
      q,
      items.slice(0, RERANK_TOP).map((item) => ({
        key: `${item.post.platform}:${item.post.id}`,
        item: item.post,
        visual: item.matched[0] === 'picture' || item.matched[0] === 'video',
      })),
    )
    if (reranked) {
      const byKey = new Map(items.map((i) => [`${i.post.platform}:${i.post.id}`, i]))
      items = [...reranked.order.map((c) => byKey.get(c.key)!), ...items.slice(RERANK_TOP)]
      // Jev reads words, so it judges only matches made on words alone (never
      // one its picture or video also matched): it sets their strength, and
      // drops the ones it calls unrelated.
      const lead = items[0]
      items = items
        .map((i) => {
          const jev = reranked.scores.get(`${i.post.platform}:${i.post.id}`)
          const wordsOnly = i.matched.every((m) => m === 'words' || m === 'keywords')
          if (jev === undefined || !wordsOnly) return i
          if (jev < UNRELATED_JEV && i !== lead) return null
          return { ...i, strength: jevStrength(jev, i.strength) }
        })
        .filter((i): i is (typeof items)[number] => i !== null)
      dropped = before - items.length
      refined = true
    }
  }
  // Results whose picture/video isn't understood yet were matched on words alone.
  const learning = await stillLearning(items.map((i) => `${i.post.platform}:${i.post.id}`))
  items = items.map((i) =>
    learning.has(`${i.post.platform}:${i.post.id}`) ? { ...i, learning: true } : i,
  )
  const next = offset + result.hits.length
  return {
    items,
    total: result.total - dropped,
    understood: result.understood,
    close: result.close,
    refined,
    nextOffset: next < result.total ? next : null,
  }
}
