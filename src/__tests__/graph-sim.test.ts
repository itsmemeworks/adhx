import { describe, it, expect } from 'vitest'
import {
  hubRadius,
  itemRadius,
  degreeMap,
  buildSim,
  stepSim,
  warmStart,
  kick,
  isSettled,
  setLinks,
  ALPHA_START,
  ALPHA_DECAY,
  ALPHA_MIN,
  WARM_TICKS,
} from '@/components/graph/graph-sim'
import type { GraphSave, GraphTheme, GraphRelation } from '@/components/graph/types'

// ---- tiny fixtures ----

function makeSave(key: string, overrides: Partial<GraphSave> = {}): GraphSave {
  const [platform, id] = key.split(':')
  return {
    key,
    id: id ?? key,
    platform: (platform as GraphSave['platform']) ?? 'twitter',
    type: 'text',
    authorName: 'Author',
    handle: 'author',
    label: key,
    thumbnailUrl: null,
    openUrl: `https://x.com/${id}`,
    createdAt: '2026-01-01T00:00:00Z',
    degree: 0,
    card: {
      type: 'text',
      platform: (platform as GraphSave['platform']) ?? 'twitter',
      authorName: 'Author',
      handle: 'author',
      avatarUrl: null,
      body: 'hello',
      heroUrl: null,
      isVideo: false,
      durationMs: null,
      articleTitle: null,
      articleDescription: null,
      quote: null,
    },
    ...overrides,
  }
}

function makeTheme(id: string, overrides: Partial<GraphTheme> = {}): GraphTheme {
  return {
    id,
    label: id,
    kind: 'tag',
    degree: 0,
    ...overrides,
  }
}

const themes: GraphTheme[] = [makeTheme('tag:ai'), makeTheme('tag:design'), makeTheme('kw:rust')]

const saves: GraphSave[] = [
  makeSave('twitter:1'),
  makeSave('twitter:2'),
  makeSave('instagram:3'),
  makeSave('tiktok:4'),
]

const relations: GraphRelation[] = [
  { from: 'twitter:1', to: 'tag:ai', kind: 'topic' },
  { from: 'twitter:2', to: 'tag:ai', kind: 'topic' },
  { from: 'instagram:3', to: 'tag:design', kind: 'topic' },
  { from: 'twitter:1', to: 'twitter:2', kind: 'related' },
]

function buildFixtureSim(width = 800, height = 600) {
  return buildSim({ saves, themes, relations, width, height, rand: () => 0.5 })
}

describe('constants', () => {
  it('match the documented "feel"', () => {
    expect(ALPHA_START).toBe(1)
    expect(ALPHA_DECAY).toBe(0.972)
    expect(ALPHA_MIN).toBe(0.004)
    expect(WARM_TICKS).toBe(90)
  })
})

describe('hubRadius / itemRadius', () => {
  it('radius grows with degree', () => {
    expect(hubRadius(4)).toBeGreaterThan(hubRadius(0))
    expect(hubRadius(9)).toBeGreaterThan(hubRadius(4))
    expect(itemRadius(4)).toBeGreaterThan(itemRadius(0))
    expect(itemRadius(9)).toBeGreaterThan(itemRadius(4))
  })

  it('base radius at degree 0 is the documented constant', () => {
    expect(hubRadius(0)).toBe(17)
    expect(itemRadius(0)).toBe(13)
  })

  it('matches the sqrt formula', () => {
    expect(hubRadius(4)).toBeCloseTo(17 + 2 * 2.4, 6)
    expect(itemRadius(4)).toBeCloseTo(13 + 2 * 2.6, 6)
  })
})

describe('degreeMap', () => {
  it('counts both endpoints of every relation', () => {
    const deg = degreeMap([
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
    ])
    expect(deg.get('a')).toBe(2)
    expect(deg.get('b')).toBe(1)
    expect(deg.get('c')).toBe(1)
  })

  it('accumulates across the fixture relations', () => {
    const deg = degreeMap(relations.map((r) => ({ from: r.from, to: r.to })))
    // twitter:1 appears in topic(ai) + related(2) = 2
    expect(deg.get('twitter:1')).toBe(2)
    // tag:ai is endpoint of two topic edges
    expect(deg.get('tag:ai')).toBe(2)
    expect(deg.get('instagram:3')).toBe(1)
    expect(deg.get('tag:design')).toBe(1)
  })

  it('returns an empty map for no relations', () => {
    expect(degreeMap([]).size).toBe(0)
  })
})

describe('buildSim', () => {
  it('creates one node per save + theme', () => {
    const sim = buildFixtureSim()
    expect(sim.nodes.size).toBe(saves.length + themes.length)
    expect(sim.order.length).toBe(saves.length + themes.length)
    for (const t of themes) expect(sim.nodes.has(t.id)).toBe(true)
    for (const s of saves) expect(sim.nodes.has(s.key)).toBe(true)
  })

  it('assigns the correct kind to hubs and items', () => {
    const sim = buildFixtureSim()
    for (const t of themes) expect(sim.nodes.get(t.id)!.kind).toBe('hub')
    for (const s of saves) expect(sim.nodes.get(s.key)!.kind).toBe('item')
  })

  it('gives every node numeric finite x/y', () => {
    const sim = buildFixtureSim()
    for (const n of sim.nodes.values()) {
      expect(typeof n.x).toBe('number')
      expect(typeof n.y).toBe('number')
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
  })

  it('starts at ALPHA_START and seeds free (unpinned) nodes', () => {
    const sim = buildFixtureSim()
    expect(sim.alpha).toBe(ALPHA_START)
    for (const n of sim.nodes.values()) {
      expect(n.fx).toBeNull()
      expect(n.fy).toBeNull()
      expect(n.vx).toBe(0)
      expect(n.vy).toBe(0)
    }
  })

  it('builds one link per relation, preserving kind', () => {
    const sim = buildFixtureSim()
    expect(sim.links.length).toBe(relations.length)
    expect(sim.links[0]).toEqual({ s: 'twitter:1', t: 'tag:ai', kind: 'topic' })
  })

  it('is reproducible with a deterministic rand', () => {
    const a = buildFixtureSim()
    const b = buildFixtureSim()
    for (const key of a.nodes.keys()) {
      const na = a.nodes.get(key)!
      const nb = b.nodes.get(key)!
      expect(na.x).toBe(nb.x)
      expect(na.y).toBe(nb.y)
    }
  })

  it('sizes node radii from degree (hub with more topic edges is larger)', () => {
    const sim = buildFixtureSim()
    const ai = sim.nodes.get('tag:ai')! // degree 2
    const design = sim.nodes.get('tag:design')! // degree 1
    const rust = sim.nodes.get('kw:rust')! // degree 0
    expect(ai.r).toBeGreaterThan(design.r)
    expect(design.r).toBeGreaterThan(rust.r)
  })
})

describe('stepSim', () => {
  it('decays alpha by ALPHA_DECAY each tick', () => {
    const sim = buildFixtureSim()
    stepSim(sim)
    expect(sim.alpha).toBeCloseTo(ALPHA_START * ALPHA_DECAY, 10)
    stepSim(sim)
    expect(sim.alpha).toBeCloseTo(ALPHA_START * ALPHA_DECAY * ALPHA_DECAY, 10)
  })

  it('keeps a pinned (fx/fy) node at its exact position', () => {
    const sim = buildFixtureSim()
    const node = sim.nodes.get('twitter:1')!
    node.fx = 123
    node.fy = 456
    // move it away from its current spot first to prove the pin wins
    node.x = 0
    node.y = 0
    stepSim(sim)
    expect(node.x).toBe(123)
    expect(node.y).toBe(456)
    expect(node.vx).toBe(0)
    expect(node.vy).toBe(0)
    // and it stays pinned across multiple ticks
    stepSim(sim)
    stepSim(sim)
    expect(node.x).toBe(123)
    expect(node.y).toBe(456)
  })

  it('moves free nodes but keeps them finite and inside bounds', () => {
    const sim = buildFixtureSim()
    warmStart(sim, 5)
    for (const n of sim.nodes.values()) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
      const p = n.r
      expect(n.x).toBeGreaterThanOrEqual(p)
      expect(n.x).toBeLessThanOrEqual(sim.width)
      expect(n.y).toBeGreaterThanOrEqual(p)
      expect(n.y).toBeLessThanOrEqual(sim.height)
    }
  })

  it('is deterministic given the same seed', () => {
    const a = buildFixtureSim()
    const b = buildFixtureSim()
    warmStart(a, 20)
    warmStart(b, 20)
    for (const key of a.nodes.keys()) {
      expect(a.nodes.get(key)!.x).toBe(b.nodes.get(key)!.x)
      expect(a.nodes.get(key)!.y).toBe(b.nodes.get(key)!.y)
    }
  })
})

describe('warmStart', () => {
  it('runs WARM_TICKS ticks by default, driving alpha down', () => {
    const sim = buildFixtureSim()
    warmStart(sim)
    expect(sim.alpha).toBeCloseTo(ALPHA_START * Math.pow(ALPHA_DECAY, WARM_TICKS), 8)
    expect(sim.alpha).toBeLessThan(ALPHA_START)
  })

  it('eventually settles the sim', () => {
    const sim = buildFixtureSim()
    expect(isSettled(sim)).toBe(false)
    // enough ticks to cross ALPHA_MIN
    let guard = 0
    while (!isSettled(sim) && guard < 5000) {
      stepSim(sim)
      guard++
    }
    expect(isSettled(sim)).toBe(true)
  })

  it('honors a custom tick count', () => {
    const sim = buildFixtureSim()
    warmStart(sim, 3)
    expect(sim.alpha).toBeCloseTo(ALPHA_START * Math.pow(ALPHA_DECAY, 3), 10)
  })
})

describe('isSettled', () => {
  it('is true exactly when alpha <= ALPHA_MIN', () => {
    const sim = buildFixtureSim()
    sim.alpha = ALPHA_MIN + 0.001
    expect(isSettled(sim)).toBe(false)
    sim.alpha = ALPHA_MIN
    expect(isSettled(sim)).toBe(true)
    sim.alpha = ALPHA_MIN - 0.001
    expect(isSettled(sim)).toBe(true)
  })
})

describe('kick', () => {
  it('re-heats alpha up to the requested value', () => {
    const sim = buildFixtureSim()
    sim.alpha = 0.001
    kick(sim, 0.5)
    expect(sim.alpha).toBe(0.5)
  })

  it('never lowers an already-hotter alpha', () => {
    const sim = buildFixtureSim()
    sim.alpha = 0.8
    kick(sim, 0.3)
    expect(sim.alpha).toBe(0.8)
  })
})

describe('setLinks', () => {
  it('replaces the link set without moving nodes', () => {
    const sim = buildFixtureSim()
    const before = new Map([...sim.nodes.entries()].map(([k, n]) => [k, { x: n.x, y: n.y }]))
    const newRels: GraphRelation[] = [{ from: 'twitter:1', to: 'kw:rust', kind: 'author' }]
    setLinks(sim, newRels)
    expect(sim.links).toEqual([{ s: 'twitter:1', t: 'kw:rust', kind: 'author' }])
    for (const [k, pos] of before) {
      expect(sim.nodes.get(k)!.x).toBe(pos.x)
      expect(sim.nodes.get(k)!.y).toBe(pos.y)
    }
  })
})
