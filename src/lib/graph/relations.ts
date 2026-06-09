/**
 * Knowledge Graph — relation (edge) construction, all zero-cost + local.
 *
 *   topic   — save ↔ its theme hub(s)
 *   author  — saves by the same person (star from the first, capped)
 *   related — semantic-ish bridges: quote-tweet links + strong keyword overlap
 *             (≥2 shared keyword themes), capped per node. Behind this interface
 *             so a future paid embedding/LLM step can replace the heuristic.
 *   user    — links the user drew by hand (from graph_links)
 *
 * Save↔save edges are deduped to one per pair with priority user > related >
 * author, so a pair never renders two overlapping lines. topic edges (save↔hub)
 * are independent and always kept.
 */
import type { GraphRelation, LinkEndpoint } from '@/components/graph/types'
import { saveKey } from '@/components/graph/types'

export interface RelationInput {
  key: string
  handle: string | null
  /** All theme ids this save belongs to (tag + keyword). */
  themeIds: string[]
  /** The saveKey of this save's quoted tweet, if it's also in the graph. */
  quotedKey: string | null
}

export interface BuildRelationsOptions {
  authorStarCap?: number
  relatedPerNodeCap?: number
}

const RANK: Record<'author' | 'related' | 'user', number> = { author: 1, related: 2, user: 3 }

function pairId(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function buildRelations(
  saves: RelationInput[],
  userLinks: { a: LinkEndpoint; b: LinkEndpoint }[],
  options: BuildRelationsOptions = {},
): GraphRelation[] {
  const authorStarCap = options.authorStarCap ?? 12
  const relatedPerNodeCap = options.relatedPerNodeCap ?? 3
  const keySet = new Set(saves.map((s) => s.key))

  const relations: GraphRelation[] = []

  // ---- topic (save ↔ hub) ----
  for (const s of saves) {
    for (const themeId of s.themeIds) {
      relations.push({ from: s.key, to: themeId, kind: 'topic' })
    }
  }

  // ---- save↔save edges, deduped by priority ----
  const saveSave = new Map<
    string,
    { from: string; to: string; kind: 'author' | 'related' | 'user' }
  >()
  const relatedDegree = new Map<string, number>()

  const put = (from: string, to: string, kind: 'author' | 'related' | 'user'): boolean => {
    if (from === to) return false
    const id = pairId(from, to)
    const existing = saveSave.get(id)
    if (existing && RANK[existing.kind] >= RANK[kind]) return false
    saveSave.set(id, { from, to, kind })
    return true
  }

  // author stars
  const byHandle = new Map<string, string[]>()
  for (const s of saves) {
    if (!s.handle) continue
    const list = byHandle.get(s.handle) || []
    list.push(s.key)
    byHandle.set(s.handle, list)
  }
  for (const list of byHandle.values()) {
    if (list.length < 2) continue
    const hub = list[0]
    for (let i = 1; i < list.length && i <= authorStarCap; i++) put(hub, list[i], 'author')
  }

  // related — quote links first (always meaningful), then keyword overlap
  const addRelated = (a: string, b: string): void => {
    if (a === b) return
    if ((relatedDegree.get(a) || 0) >= relatedPerNodeCap) return
    if ((relatedDegree.get(b) || 0) >= relatedPerNodeCap) return
    if (put(a, b, 'related')) {
      relatedDegree.set(a, (relatedDegree.get(a) || 0) + 1)
      relatedDegree.set(b, (relatedDegree.get(b) || 0) + 1)
    }
  }

  for (const s of saves) {
    if (s.quotedKey && keySet.has(s.quotedKey)) addRelated(s.key, s.quotedKey)
  }

  // keyword-theme co-occurrence
  const kwMembers = new Map<string, string[]>()
  for (const s of saves) {
    for (const id of s.themeIds) {
      if (!id.startsWith('kw:')) continue
      const list = kwMembers.get(id) || []
      list.push(s.key)
      kwMembers.set(id, list)
    }
  }
  const shared = new Map<string, number>()
  for (const members of kwMembers.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const id = pairId(members[i], members[j])
        shared.set(id, (shared.get(id) || 0) + 1)
      }
    }
  }
  // deterministic order: most-shared first, then pair id
  const overlapPairs = [...shared.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  for (const [id] of overlapPairs) {
    const [a, b] = id.split('|')
    addRelated(a, b)
  }

  // ---- user links (both endpoints must be in the graph to render) ----
  for (const link of userLinks) {
    const a = saveKey(link.a.platform, link.a.id)
    const b = saveKey(link.b.platform, link.b.id)
    if (a === b || !keySet.has(a) || !keySet.has(b)) continue
    put(a, b, 'user')
  }

  for (const edge of saveSave.values()) {
    relations.push({ from: edge.from, to: edge.to, kind: edge.kind })
  }

  return relations
}
