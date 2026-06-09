import { describe, expect, it } from 'vitest'

import { buildRelations, type RelationInput } from '@/lib/graph/relations'
import type { GraphRelation, LinkEndpoint } from '@/components/graph/types'
import { saveKey } from '@/components/graph/types'

/** Build a `twitter:<id>` key the same way the source does. */
const k = (id: string) => saveKey('twitter', id)

/** Find all edges (undirected) connecting two keys, regardless of from/to order. */
function edgesBetween(rels: GraphRelation[], a: string, b: string): GraphRelation[] {
  return rels.filter((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a))
}

/** Find a topic edge from a save to a theme hub. */
function topicEdge(
  rels: GraphRelation[],
  from: string,
  themeId: string,
): GraphRelation | undefined {
  return rels.find((r) => r.kind === 'topic' && r.from === from && r.to === themeId)
}

function save(partial: Partial<RelationInput> & { key: string }): RelationInput {
  return {
    handle: null,
    themeIds: [],
    quotedKey: null,
    ...partial,
  }
}

describe('buildRelations — topic edges', () => {
  it('emits one topic edge from each save to each of its themeIds', () => {
    const saves = [
      save({ key: k('1'), themeIds: ['tag:ai', 'kw:robots'] }),
      save({ key: k('2'), themeIds: ['tag:ai'] }),
    ]
    const rels = buildRelations(saves, [])

    expect(topicEdge(rels, k('1'), 'tag:ai')).toEqual({ from: k('1'), to: 'tag:ai', kind: 'topic' })
    expect(topicEdge(rels, k('1'), 'kw:robots')).toBeDefined()
    expect(topicEdge(rels, k('2'), 'tag:ai')).toBeDefined()

    // exactly three topic edges, no extras
    expect(rels.filter((r) => r.kind === 'topic')).toHaveLength(3)
  })

  it('emits no topic edges for a save with no themes', () => {
    const rels = buildRelations([save({ key: k('1') })], [])
    expect(rels.filter((r) => r.kind === 'topic')).toHaveLength(0)
  })
})

describe('buildRelations — author star', () => {
  it('links saves sharing a handle from the first to the others', () => {
    const saves = [
      save({ key: k('1'), handle: 'alice' }),
      save({ key: k('2'), handle: 'alice' }),
      save({ key: k('3'), handle: 'alice' }),
    ]
    const rels = buildRelations(saves, [])
    const author = rels.filter((r) => r.kind === 'author')

    // star centered on the first save
    expect(author).toHaveLength(2)
    expect(author).toContainEqual({ from: k('1'), to: k('2'), kind: 'author' })
    expect(author).toContainEqual({ from: k('1'), to: k('3'), kind: 'author' })
    // no direct 2↔3 edge (it's a star, not a clique)
    expect(edgesBetween(rels, k('2'), k('3'))).toHaveLength(0)
  })

  it('does not link a handle that only one save uses', () => {
    const saves = [save({ key: k('1'), handle: 'alice' }), save({ key: k('2'), handle: 'bob' })]
    const rels = buildRelations(saves, [])
    expect(rels.filter((r) => r.kind === 'author')).toHaveLength(0)
  })

  it('ignores null handles', () => {
    const saves = [save({ key: k('1') }), save({ key: k('2') })]
    const rels = buildRelations(saves, [])
    expect(rels.filter((r) => r.kind === 'author')).toHaveLength(0)
  })

  it('caps the author star at authorStarCap spokes', () => {
    const saves = Array.from({ length: 6 }, (_, i) =>
      save({ key: k(String(i + 1)), handle: 'alice' }),
    )
    const rels = buildRelations(saves, [], { authorStarCap: 2 })
    // hub = save 1; spokes capped to 2 (saves 2 and 3)
    const author = rels.filter((r) => r.kind === 'author')
    expect(author).toHaveLength(2)
    expect(author).toContainEqual({ from: k('1'), to: k('2'), kind: 'author' })
    expect(author).toContainEqual({ from: k('1'), to: k('3'), kind: 'author' })
  })
})

describe('buildRelations — related edges', () => {
  it('links a save to its quoted save when the quote is in the set', () => {
    const saves = [save({ key: k('1'), quotedKey: k('2') }), save({ key: k('2') })]
    const rels = buildRelations(saves, [])
    const between = edgesBetween(rels, k('1'), k('2'))
    expect(between).toHaveLength(1)
    expect(between[0].kind).toBe('related')
  })

  it('does not create a related edge for a quotedKey absent from the set', () => {
    const saves = [save({ key: k('1'), quotedKey: k('999') })]
    const rels = buildRelations(saves, [])
    expect(rels.filter((r) => r.kind === 'related')).toHaveLength(0)
  })

  it('links two saves sharing >=2 keyword themes', () => {
    const saves = [
      save({ key: k('1'), themeIds: ['kw:x', 'kw:y'] }),
      save({ key: k('2'), themeIds: ['kw:x', 'kw:y'] }),
    ]
    const rels = buildRelations(saves, [])
    const between = edgesBetween(rels, k('1'), k('2'))
    expect(between).toHaveLength(1)
    expect(between[0].kind).toBe('related')
  })

  it('does NOT link saves sharing only a single keyword theme', () => {
    const saves = [
      save({ key: k('1'), themeIds: ['kw:x'] }),
      save({ key: k('2'), themeIds: ['kw:x'] }),
    ]
    const rels = buildRelations(saves, [])
    expect(rels.filter((r) => r.kind === 'related')).toHaveLength(0)
  })

  it('does NOT treat shared non-keyword (tag:) themes as keyword overlap', () => {
    const saves = [
      save({ key: k('1'), themeIds: ['tag:a', 'tag:b'] }),
      save({ key: k('2'), themeIds: ['tag:a', 'tag:b'] }),
    ]
    const rels = buildRelations(saves, [])
    expect(rels.filter((r) => r.kind === 'related')).toHaveLength(0)
  })

  it('respects relatedPerNodeCap', () => {
    // save 1 shares >=2 kw themes with 2, 3, and 4 — cap to 1 related edge on node 1
    const saves = [
      save({ key: k('1'), themeIds: ['kw:x', 'kw:y'] }),
      save({ key: k('2'), themeIds: ['kw:x', 'kw:y'] }),
      save({ key: k('3'), themeIds: ['kw:x', 'kw:y'] }),
      save({ key: k('4'), themeIds: ['kw:x', 'kw:y'] }),
    ]
    const rels = buildRelations(saves, [], { relatedPerNodeCap: 1 })
    const related = rels.filter((r) => r.kind === 'related')
    // node 1 can only participate in 1 related edge
    const touching1 = related.filter((r) => r.from === k('1') || r.to === k('1'))
    expect(touching1).toHaveLength(1)
  })
})

describe('buildRelations — user links', () => {
  it('adds a user edge when both endpoints are in the save set', () => {
    const saves = [save({ key: k('1') }), save({ key: k('2') })]
    const userLinks: { a: LinkEndpoint; b: LinkEndpoint }[] = [
      { a: { platform: 'twitter', id: '1' }, b: { platform: 'twitter', id: '2' } },
    ]
    const rels = buildRelations(saves, userLinks)
    const between = edgesBetween(rels, k('1'), k('2'))
    expect(between).toHaveLength(1)
    expect(between[0].kind).toBe('user')
  })

  it('skips a user link when one endpoint is absent from the set', () => {
    const saves = [save({ key: k('1') })]
    const userLinks: { a: LinkEndpoint; b: LinkEndpoint }[] = [
      { a: { platform: 'twitter', id: '1' }, b: { platform: 'twitter', id: '2' } },
    ]
    const rels = buildRelations(saves, userLinks)
    expect(rels.filter((r) => r.kind === 'user')).toHaveLength(0)
  })

  it('produces no user edge for a self link (equal endpoints)', () => {
    const saves = [save({ key: k('1') })]
    const userLinks: { a: LinkEndpoint; b: LinkEndpoint }[] = [
      { a: { platform: 'twitter', id: '1' }, b: { platform: 'twitter', id: '1' } },
    ]
    const rels = buildRelations(saves, userLinks)
    expect(rels.filter((r) => r.kind === 'user')).toHaveLength(0)
  })
})

describe('buildRelations — save↔save dedupe priority', () => {
  it('a user link wins over an author edge for the same pair (single edge, kind user)', () => {
    // saves 1 and 2 share a handle → author edge; a user link covers the same pair
    const saves = [save({ key: k('1'), handle: 'alice' }), save({ key: k('2'), handle: 'alice' })]
    const userLinks: { a: LinkEndpoint; b: LinkEndpoint }[] = [
      { a: { platform: 'twitter', id: '1' }, b: { platform: 'twitter', id: '2' } },
    ]
    const rels = buildRelations(saves, userLinks)
    const between = edgesBetween(rels, k('1'), k('2'))
    expect(between).toHaveLength(1)
    expect(between[0].kind).toBe('user')
  })

  it('a related edge wins over an author edge for the same pair', () => {
    // same handle (author) AND quote link (related) on the same pair
    const saves = [
      save({ key: k('1'), handle: 'alice', quotedKey: k('2') }),
      save({ key: k('2'), handle: 'alice' }),
    ]
    const rels = buildRelations(saves, [])
    const between = edgesBetween(rels, k('1'), k('2'))
    expect(between).toHaveLength(1)
    expect(between[0].kind).toBe('related')
  })

  it('topic edges are independent of the deduped save↔save edge for the same nodes', () => {
    const saves = [
      save({ key: k('1'), handle: 'alice', themeIds: ['tag:ai'] }),
      save({ key: k('2'), handle: 'alice' }),
    ]
    const userLinks: { a: LinkEndpoint; b: LinkEndpoint }[] = [
      { a: { platform: 'twitter', id: '1' }, b: { platform: 'twitter', id: '2' } },
    ]
    const rels = buildRelations(saves, userLinks)
    // topic edge survives alongside the user edge
    expect(topicEdge(rels, k('1'), 'tag:ai')).toBeDefined()
    expect(edgesBetween(rels, k('1'), k('2'))).toHaveLength(1)
    expect(edgesBetween(rels, k('1'), k('2'))[0].kind).toBe('user')
  })
})

describe('buildRelations — combined / determinism', () => {
  it('is deterministic across repeated calls on the same input', () => {
    const build = () =>
      buildRelations(
        [
          save({
            key: k('1'),
            handle: 'alice',
            themeIds: ['tag:ai', 'kw:x', 'kw:y'],
            quotedKey: k('3'),
          }),
          save({ key: k('2'), handle: 'alice', themeIds: ['kw:x', 'kw:y'] }),
          save({ key: k('3'), themeIds: ['kw:x', 'kw:y'] }),
        ],
        [{ a: { platform: 'twitter', id: '2' }, b: { platform: 'twitter', id: '3' } }],
      )
    expect(build()).toEqual(build())
  })
})
