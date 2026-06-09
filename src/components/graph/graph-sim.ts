/**
 * Knowledge Graph — force simulation.
 *
 * A dependency-free velocity-Verlet-ish layout: pairwise repulsion (+ soft
 * collision), per-kind link springs, gravity to center, velocity damping, and a
 * cooling `alpha`. Ported 1:1 from the design prototype's hand-rolled sim so the
 * *feel* matches exactly (see design_handoff_knowledge_graph/README → "Force
 * simulation"). Pure functions over a `SimState` — the React layer owns the
 * rAF loop and a ref to the state; tests drive `stepSim` directly.
 */
import type { GraphRelation, GraphSave, GraphTheme, RelationKind } from './types'

// ---- constants (the documented "feel"; exported for tests) ----
export const REPULSION = 2600
export const HUB_REPULSION_MULT = 1.5
export const COLLISION_PAD = 22
export const COLLISION_K = 0.5
export const SPRING_REST: Record<RelationKind, number> = {
  topic: 92,
  author: 140,
  user: 130,
  related: 168,
}
export const SPRING_K_TOPIC = 0.035
export const SPRING_K_OTHER = 0.02
export const GRAVITY = 0.0016
export const DAMPING = 0.86
export const ALPHA_START = 1
export const ALPHA_DECAY = 0.972
export const ALPHA_MIN = 0.004
export const WARM_TICKS = 90
export const WARM_KICK = 0.45
export const BOUNDS_PAD = 14

export type SimKind = 'hub' | 'item'

export interface SimNode {
  key: string
  kind: SimKind
  r: number
  x: number
  y: number
  vx: number
  vy: number
  /** Pinned position while dragging (null = free). */
  fx: number | null
  fy: number | null
}

export interface SimLink {
  s: string
  t: string
  kind: RelationKind
}

export interface SimState {
  nodes: Map<string, SimNode>
  order: string[]
  links: SimLink[]
  width: number
  height: number
  alpha: number
}

/** Node radius from degree — hubs a touch larger. Matches the prototype. */
export function hubRadius(degree: number): number {
  return 17 + Math.sqrt(degree) * 2.4
}
export function itemRadius(degree: number): number {
  return 13 + Math.sqrt(degree) * 2.6
}

/** Degree per node key from a relation list (undirected). */
export function degreeMap(relations: Array<{ from: string; to: string }>): Map<string, number> {
  const deg = new Map<string, number>()
  for (const r of relations) {
    deg.set(r.from, (deg.get(r.from) || 0) + 1)
    deg.set(r.to, (deg.get(r.to) || 0) + 1)
  }
  return deg
}

export interface BuildSimOpts {
  saves: GraphSave[]
  themes: GraphTheme[]
  relations: GraphRelation[]
  width: number
  height: number
  /** Injectable RNG for deterministic tests (default Math.random). */
  rand?: () => number
}

/**
 * Build initial layout: hubs on a ring around center, items scattered near
 * their first theme hub so clusters form quickly. Radii from degree.
 */
export function buildSim(opts: BuildSimOpts): SimState {
  const { saves, themes, relations, width, height } = opts
  const rand = opts.rand ?? Math.random
  const cx = width / 2
  const cy = height / 2
  const R = Math.min(width, height) * 0.3

  const deg = degreeMap(relations)
  const nodes = new Map<string, SimNode>()
  const order: string[] = []

  themes.forEach((h, i) => {
    const a = (i / Math.max(1, themes.length)) * Math.PI * 2 - Math.PI / 2
    nodes.set(h.id, {
      key: h.id,
      kind: 'hub',
      r: hubRadius(deg.get(h.id) || 0),
      x: cx + Math.cos(a) * R,
      y: cy + Math.sin(a) * R,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
    })
    order.push(h.id)
  })

  // first theme hub per save (its home cluster)
  const homeOf = new Map<string, string>()
  for (const rel of relations) {
    if (rel.kind !== 'topic') continue
    // topic edges are save→theme; record the first theme seen per save
    const save = nodes.has(rel.to) ? rel.from : rel.to
    const theme = save === rel.from ? rel.to : rel.from
    if (!homeOf.has(save) && nodes.has(theme)) homeOf.set(save, theme)
  }

  saves.forEach((it) => {
    const home = nodes.get(homeOf.get(it.key) || '') || { x: cx, y: cy }
    const a = rand() * Math.PI * 2
    const rr = 40 + rand() * 60
    nodes.set(it.key, {
      key: it.key,
      kind: 'item',
      r: itemRadius(deg.get(it.key) || 0),
      x: home.x + Math.cos(a) * rr,
      y: home.y + Math.sin(a) * rr,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
    })
    order.push(it.key)
  })

  const links: SimLink[] = relations.map((r) => ({ s: r.from, t: r.to, kind: r.kind }))

  return { nodes, order, links, width, height, alpha: ALPHA_START }
}

/** One physics tick (mutates node positions in place, decays alpha). */
export function stepSim(state: SimState): void {
  const { nodes, order, links, width, height } = state
  const a = state.alpha
  const arr: SimNode[] = []
  for (const id of order) {
    const n = nodes.get(id)
    if (n) arr.push(n)
  }

  // pairwise repulsion + soft collision
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const A = arr[i]
      const B = arr[j]
      const dx = A.x - B.x
      const dy = A.y - B.y
      const d2 = dx * dx + dy * dy || 0.01
      const minD = A.r + B.r + COLLISION_PAD
      const f = (REPULSION * (A.kind === 'hub' || B.kind === 'hub' ? HUB_REPULSION_MULT : 1)) / d2
      const d = Math.sqrt(d2)
      const nx = dx / d
      const ny = dy / d
      const overlap = minD - d
      const coll = overlap > 0 ? overlap * COLLISION_K : 0
      A.vx += (nx * f + nx * coll) * a
      A.vy += (ny * f + ny * coll) * a
      B.vx -= (nx * f + nx * coll) * a
      B.vy -= (ny * f + ny * coll) * a
    }
  }

  // link springs
  for (const l of links) {
    const A = nodes.get(l.s)
    const B = nodes.get(l.t)
    if (!A || !B) continue
    const rest = SPRING_REST[l.kind] ?? SPRING_REST.related
    const k = l.kind === 'topic' ? SPRING_K_TOPIC : SPRING_K_OTHER
    const dx = B.x - A.x
    const dy = B.y - A.y
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01
    const f = (d - rest) * k * a
    const nx = dx / d
    const ny = dy / d
    A.vx += nx * f
    A.vy += ny * f
    B.vx -= nx * f
    B.vy -= ny * f
  }

  // gravity to center + integrate
  const cx = width / 2
  const cy = height / 2
  for (const n of arr) {
    n.vx += (cx - n.x) * GRAVITY * a
    n.vy += (cy - n.y) * GRAVITY * a
    if (n.fx != null && n.fy != null) {
      n.x = n.fx
      n.y = n.fy
      n.vx = 0
      n.vy = 0
      continue
    }
    n.vx *= DAMPING
    n.vy *= DAMPING
    n.x += n.vx
    n.y += n.vy
    const p = n.r + BOUNDS_PAD
    n.x = Math.max(p, Math.min(width - p, n.x))
    n.y = Math.max(p, Math.min(height - p, n.y))
  }

  state.alpha = a * ALPHA_DECAY
}

/** Run N synchronous ticks so the graph opens nearly settled. */
export function warmStart(state: SimState, ticks: number = WARM_TICKS): void {
  for (let i = 0; i < ticks; i++) stepSim(state)
}

/** Re-heat the sim (e.g. after a drag) so it re-settles. */
export function kick(state: SimState, a: number): void {
  state.alpha = Math.max(state.alpha, a)
}

/** Whether the sim has cooled enough to stop. */
export function isSettled(state: SimState): boolean {
  return state.alpha <= ALPHA_MIN
}

/** Replace the link set (e.g. when user links change) without moving nodes. */
export function setLinks(state: SimState, relations: GraphRelation[]): void {
  state.links = relations.map((r) => ({ s: r.from, t: r.to, kind: r.kind }))
}
