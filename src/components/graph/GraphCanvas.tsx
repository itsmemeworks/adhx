'use client'

/**
 * Knowledge Graph — the interactive canvas (force sim + SVG render +
 * pan/zoom/drag + hover-highlight + connect-mode + filters).
 *
 * Faithful port of the design prototype's `GraphSVG`: node positions live in a
 * ref (the sim, see graph-sim.ts) so they never reset on re-render; a cooling
 * rAF loop settles then stops; filters DIM (never relayout); a 4px threshold
 * separates click (select) from drag (pin + re-heat). Colors come from Matter
 * CSS vars (`var(--m-*)`) so light/dark flip for free; content-type ring colors
 * are the fixed `TYPE_COLORS`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Minus, Maximize, Link2, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NodeGlyph } from './icons'
import {
  buildSim,
  stepSim,
  warmStart,
  kick as kickAlpha,
  isSettled,
  setLinks,
  WARM_KICK,
  type SimState,
} from './graph-sim'
import type { GraphMetaStore } from './useGraphMeta'
import {
  READ_GREEN,
  TYPE_COLORS,
  type ContentType,
  type GraphRelation,
  type GraphSave,
  type GraphTheme,
  type RelationKind,
} from './types'

const GTYPES: { k: ContentType; label: string }[] = [
  { k: 'article', label: 'Articles' },
  { k: 'text', label: 'Text' },
  { k: 'video', label: 'Video' },
  { k: 'photo', label: 'Photo' },
  { k: 'quote', label: 'Quotes' },
]
const GKINDS: { k: RelationKind; label: string }[] = [
  { k: 'topic', label: 'Theme links' },
  { k: 'author', label: 'Same author' },
  { k: 'related', label: 'Related ideas' },
  { k: 'user', label: 'My links' },
]
const EDGE_COLOR: Record<RelationKind, string> = {
  topic: 'var(--m-ink3)',
  author: 'var(--m-accent2)',
  related: 'var(--m-accent)',
  user: 'var(--m-accent2)',
}

function clipId(key: string): string {
  return 'kgc-' + key.replace(/[^a-zA-Z0-9_-]/g, '-')
}

/** Map a client point into an SVG element's own user space. */
function toLocal(el: SVGGraphicsElement, cx: number, cy: number): { x: number; y: number } {
  const svg = (el.ownerSVGElement || el) as SVGSVGElement
  const pt = svg.createSVGPoint()
  pt.x = cx
  pt.y = cy
  const m = el.getScreenCTM()
  if (!m) return { x: 0, y: 0 }
  const p = pt.matrixTransform(m.inverse())
  return { x: p.x, y: p.y }
}

interface GraphCanvasProps {
  saves: GraphSave[]
  themes: GraphTheme[]
  /** Server relations (any kind); `user` edges are taken live from `meta`. */
  relations: GraphRelation[]
  meta: GraphMetaStore
  selectedKey: string | null
  onSelect: (key: string | null) => void
  width: number
  height: number
  compact?: boolean
}

export function GraphCanvas({
  saves,
  themes,
  relations,
  meta,
  selectedKey,
  onSelect,
  width,
  height,
  compact = false,
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const worldRef = useRef<SVGGElement>(null)
  const stateRef = useRef<SimState | null>(null)
  const rafRef = useRef<number>(0)
  const [, forceTick] = useState(0)
  const [ready, setReady] = useState(false)

  const [hover, setHover] = useState<string | null>(null)
  const [connect, setConnect] = useState(false)
  const [pending, setPending] = useState<{
    from: string
    x: number
    y: number
    over: string | null
  } | null>(null)
  const [kinds, setKinds] = useState<Record<RelationKind, boolean>>({
    topic: true,
    author: true,
    related: true,
    user: true,
  })
  const [typeOn, setTypeOn] = useState<Set<ContentType> | null>(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })

  // server relations minus user (user edges come live from the meta store)
  const allRelations = useMemo<GraphRelation[]>(
    () => [...relations.filter((r) => r.kind !== 'user'), ...meta.userRelations],
    [relations, meta.userRelations],
  )
  const allRelationsRef = useRef(allRelations)
  allRelationsRef.current = allRelations

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const r of allRelations) {
      ;(m.get(r.from) || m.set(r.from, new Set()).get(r.from)!).add(r.to)
      ;(m.get(r.to) || m.set(r.to, new Set()).get(r.to)!).add(r.from)
    }
    return m
  }, [allRelations])

  // ---- rAF loop ----
  const loop = useCallback(() => {
    const s = stateRef.current
    if (!s) return
    stepSim(s)
    forceTick((t) => t + 1)
    if (!isSettled(s)) rafRef.current = requestAnimationFrame(loop)
    else rafRef.current = 0
  }, [])

  const kickSim = useCallback(
    (a: number) => {
      const s = stateRef.current
      if (!s) return
      kickAlpha(s, a)
      if (!rafRef.current) rafRef.current = requestAnimationFrame(loop)
    },
    [loop],
  )

  // build once on mount (client-only, avoids SSR hydration mismatch from random layout)
  useEffect(() => {
    const s = buildSim({ saves, themes, relations: allRelationsRef.current, width, height })
    stateRef.current = s
    warmStart(s)
    kickAlpha(s, WARM_KICK)
    setReady(true)
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // re-spring when the user adds/removes a link
  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    setLinks(s, allRelationsRef.current)
    kickSim(0.5)
  }, [allRelations, kickSim])

  // ---- pan (drag background) ----
  const panRef = useRef<{ id: number; p: { x: number; y: number }; v: typeof view } | null>(null)
  const onBgDown = (e: React.PointerEvent) => {
    const target = e.target as SVGElement
    if (target.dataset && target.dataset.node) return
    e.stopPropagation()
    svgRef.current?.setPointerCapture(e.pointerId)
    panRef.current = {
      id: e.pointerId,
      p: toLocal(svgRef.current!, e.clientX, e.clientY),
      v: { ...view },
    }
    onSelect(null)
  }
  const onBgMove = (e: React.PointerEvent) => {
    const p = panRef.current
    if (!p || e.pointerId !== p.id) return
    const cur = toLocal(svgRef.current!, e.clientX, e.clientY)
    setView({ ...p.v, x: p.v.x + (cur.x - p.p.x), y: p.v.y + (cur.y - p.p.y) })
  }
  const onBgUp = (e: React.PointerEvent) => {
    if (panRef.current && e.pointerId === panRef.current.id) {
      try {
        svgRef.current?.releasePointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      panRef.current = null
    }
  }

  // ---- node drag / connect ----
  const dragRef = useRef<{
    id: number
    node: string
    moved: boolean
    sx: number
    sy: number
  } | null>(null)
  const connectRef = useRef<{
    id: number
    from: string
    over: string | null
    moved?: boolean
  } | null>(null)

  const onNodeDown = (e: React.PointerEvent, key: string, kind: 'hub' | 'item') => {
    e.stopPropagation()
    try {
      svgRef.current?.setPointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    if (connect && kind === 'item') {
      const p = toLocal(worldRef.current!, e.clientX, e.clientY)
      connectRef.current = { id: e.pointerId, from: key, over: null }
      setPending({ from: key, x: p.x, y: p.y, over: null })
      return
    }
    dragRef.current = { id: e.pointerId, node: key, moved: false, sx: e.clientX, sy: e.clientY }
  }

  const onConnectMove = (e: React.PointerEvent) => {
    const c = connectRef.current
    const s = stateRef.current
    if (!c || !s || e.pointerId !== c.id) return
    const p = toLocal(worldRef.current!, e.clientX, e.clientY)
    let over: string | null = null
    let best = Infinity
    for (const nid of s.order) {
      if (nid === c.from) continue
      const n = s.nodes.get(nid)
      if (!n || n.kind !== 'item') continue
      const dd = Math.hypot(n.x - p.x, n.y - p.y)
      if (dd < n.r + 10 && dd < best) {
        best = dd
        over = nid
      }
    }
    c.over = over
    c.moved = true
    setPending({ from: c.from, x: p.x, y: p.y, over })
  }

  const onConnectUp = (e: React.PointerEvent) => {
    const c = connectRef.current
    if (!c || e.pointerId !== c.id) return
    try {
      svgRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    if (c.over) {
      meta.addLink(c.from, c.over)
      kickSim(0.55)
    } else if (!c.moved) {
      onSelect(c.from)
    }
    connectRef.current = null
    setPending(null)
  }

  const onNodeMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    const s = stateRef.current
    if (!d || !s || e.pointerId !== d.id) return
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return
    const n = s.nodes.get(d.node)
    if (!n) return
    if (!d.moved) {
      n.fx = n.x
      n.fy = n.y
    }
    const p = toLocal(worldRef.current!, e.clientX, e.clientY)
    n.fx = p.x
    n.fy = p.y
    d.moved = true
    kickSim(0.5)
  }

  const onNodeUp = (e: React.PointerEvent, key: string) => {
    const d = dragRef.current
    const s = stateRef.current
    if (!d || !s || e.pointerId !== d.id) return
    try {
      svgRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    const n = s.nodes.get(d.node)
    if (n) {
      n.fx = null
      n.fy = null
    }
    if (!d.moved) onSelect(key)
    dragRef.current = null
    kickSim(0.25)
  }

  const zoomBy = (f: number) =>
    setView((v) => {
      const k = Math.max(0.4, Math.min(3, v.k * f))
      const cx = width / 2
      const cy = height / 2
      return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) }
    })
  const resetView = () => setView({ x: 0, y: 0, k: 1 })

  // ---- derived view helpers ----
  const focus = selectedKey || hover
  const lit = useMemo(() => {
    if (!focus) return null
    const set = new Set<string>([focus])
    for (const n of adjacency.get(focus) || []) set.add(n)
    return set
  }, [focus, adjacency])

  const typeVisible = (t: ContentType) => !typeOn || typeOn.has(t)
  const showLabels = view.k > 1.55

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const s of saves) for (const t of meta.itemMeta(s.key).tags || []) set.add(t)
    return [...set].sort()
  }, [saves, meta])

  const typeByKey = useMemo(() => {
    const m = new Map<string, ContentType>()
    for (const s of saves) m.set(s.key, s.type)
    return m
  }, [saves])
  const themeKeys = useMemo(() => new Set(themes.map((t) => t.id)), [themes])

  const filterFail = useCallback(
    (key: string): boolean => {
      const isHub = themeKeys.has(key)
      if (isHub) return !!typeOn // any active type filter dims hubs
      const t = typeByKey.get(key)
      if (t && !typeVisible(t)) return true
      const im = meta.itemMeta(key)
      if (unreadOnly && im.read) return true
      if (tagFilter && !(im.tags || []).includes(tagFilter)) return true
      return false
    },
    [themeKeys, typeByKey, typeOn, unreadOnly, tagFilter, meta],
  )
  const dimmed = (key: string) => filterFail(key) || (lit ? !lit.has(key) : false)

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of saves) c[s.type] = (c[s.type] || 0) + 1
    return c
  }, [saves])

  const state = stateRef.current
  const saveByKey = useMemo(() => {
    const m = new Map<string, GraphSave>()
    for (const s of saves) m.set(s.key, s)
    return m
  }, [saves])
  const themeByKey = useMemo(() => {
    const m = new Map<string, GraphTheme>()
    for (const t of themes) m.set(t.id, t)
    return m
  }, [themes])

  return (
    <div className="relative h-full w-full overflow-hidden bg-paper">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="100%"
        className="block"
        style={{
          cursor: connect ? 'crosshair' : panRef.current ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
        onPointerDown={onBgDown}
        onPointerMove={(e) => {
          onBgMove(e)
          onNodeMove(e)
          onConnectMove(e)
        }}
        onPointerUp={(e) => {
          if (connectRef.current) onConnectUp(e)
          else if (dragRef.current) onNodeUp(e, dragRef.current.node)
          else onBgUp(e)
        }}
        onPointerCancel={(e) => {
          connectRef.current = null
          setPending(null)
          dragRef.current = null
          onBgUp(e)
        }}
      >
        <defs>
          <radialGradient id="kgHub" cx="34%" cy="28%" r="80%">
            <stop offset="0%" stopColor="var(--m-accent2)" />
            <stop offset="100%" stopColor="var(--m-accent)" />
          </radialGradient>
        </defs>
        <g ref={worldRef} transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {/* edges */}
          {ready &&
            state &&
            allRelations.map((l, i) => {
              if (!kinds[l.kind]) return null
              const A = state.nodes.get(l.from)
              const B = state.nodes.get(l.to)
              if (!A || !B) return null
              const both = !dimmed(l.from) && !dimmed(l.to)
              const emph = lit && lit.has(l.from) && lit.has(l.to)
              let op =
                l.kind === 'topic'
                  ? 0.2
                  : l.kind === 'related'
                    ? 0.34
                    : l.kind === 'user'
                      ? 0.62
                      : 0.5
              if (!both) op = 0.04
              else if (lit)
                op = emph ? (l.kind === 'topic' ? 0.5 : l.kind === 'user' ? 0.85 : 0.72) : 0.05
              return (
                <line
                  key={i}
                  x1={A.x}
                  y1={A.y}
                  x2={B.x}
                  y2={B.y}
                  stroke={EDGE_COLOR[l.kind]}
                  strokeOpacity={op}
                  strokeWidth={((emph ? 1.8 : 1) * (l.kind === 'user' ? 1.7 : 1)) / view.k}
                  strokeLinecap="round"
                  strokeDasharray={l.kind === 'author' ? `${5 / view.k} ${4 / view.k}` : undefined}
                />
              )
            })}

          {/* nodes */}
          {ready &&
            state &&
            state.order.map((key) => {
              const n = state.nodes.get(key)
              if (!n) return null
              const isHub = n.kind === 'hub'
              const r = n.r
              const dim = dimmed(key)
              const active = focus === key
              const sel = selectedKey === key
              const o = dim ? 0.16 : 1

              if (isHub) {
                const t = themeByKey.get(key)
                const hubMeta = meta.hubMeta(key)
                const labelText = hubMeta.name != null ? hubMeta.name : t?.label || ''
                const hubIcon = hubMeta.icon || ''
                return (
                  <g
                    key={key}
                    opacity={o}
                    style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => onNodeDown(e, key, 'hub')}
                    onPointerUp={(e) => onNodeUp(e, key)}
                    onPointerEnter={() => setHover(key)}
                    onPointerLeave={() => setHover((h) => (h === key ? null : h))}
                  >
                    <circle
                      data-node={key}
                      cx={n.x}
                      cy={n.y}
                      r={r * 1.85}
                      fill="var(--m-accent)"
                      opacity={active ? 0.3 : 0.14}
                      style={{ pointerEvents: 'none' }}
                    />
                    <circle
                      data-node={key}
                      cx={n.x}
                      cy={n.y}
                      r={r}
                      fill="url(#kgHub)"
                      stroke="var(--m-card)"
                      strokeWidth={2.5}
                    />
                    {hubIcon && (
                      <NodeGlyph
                        d={hubIcon}
                        cx={n.x}
                        cy={n.y}
                        size={r * 1.15}
                        color="#fff"
                        sw={2.1}
                      />
                    )}
                    {(sel || active) && (
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={r + 4.5}
                        fill="none"
                        stroke={sel ? 'var(--m-ink)' : 'var(--m-accent)'}
                        strokeWidth={sel ? 2.4 : 2}
                        strokeOpacity={sel ? 0.85 : 0.6}
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    <text
                      x={n.x}
                      y={n.y + r + 16}
                      textAnchor="middle"
                      style={{
                        pointerEvents: 'none',
                        fontFamily: 'var(--font-newsreader, serif)',
                        fontWeight: 600,
                        fontSize: 14.5,
                        fill: 'var(--m-ink)',
                        paintOrder: 'stroke',
                        stroke: 'var(--m-paper)',
                        strokeWidth: 4.5,
                        strokeLinejoin: 'round',
                      }}
                    >
                      {labelText}
                    </text>
                  </g>
                )
              }

              // item node
              const save = saveByKey.get(key)
              if (!save) return null
              const col = TYPE_COLORS[save.type]
              const thumb = save.thumbnailUrl
              const isVid = save.type === 'video'
              const im = meta.itemMeta(key)
              const isRead = !!im.read
              const labelText = im.title || save.label
              const showLabel = active || sel || showLabels || (lit ? lit.has(key) : false)
              return (
                <g
                  key={key}
                  opacity={o}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => onNodeDown(e, key, 'item')}
                  onPointerUp={(e) => onNodeUp(e, key)}
                  onPointerEnter={() => setHover(key)}
                  onPointerLeave={() => setHover((h) => (h === key ? null : h))}
                >
                  <circle
                    data-node={key}
                    cx={n.x}
                    cy={n.y}
                    r={r * 1.85}
                    fill={col}
                    opacity={active ? 0.3 : 0.14}
                    style={{ pointerEvents: 'none' }}
                  />
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r - 1}
                    fill="var(--m-inset)"
                    style={{ pointerEvents: 'none' }}
                  />
                  {thumb && (
                    <>
                      <clipPath id={clipId(key)}>
                        <circle cx={n.x} cy={n.y} r={r - 2} />
                      </clipPath>
                      <image
                        data-node={key}
                        href={thumb}
                        x={n.x - r}
                        y={n.y - r}
                        width={r * 2}
                        height={r * 2}
                        clipPath={`url(#${clipId(key)})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    </>
                  )}
                  <circle
                    data-node={key}
                    cx={n.x}
                    cy={n.y}
                    r={r - 1}
                    fill="none"
                    stroke={col}
                    strokeWidth={3}
                  />
                  {isVid && (
                    <g style={{ pointerEvents: 'none' }}>
                      <circle cx={n.x} cy={n.y} r={r * 0.42} fill="rgba(15,12,9,.55)" />
                      <path
                        d={`M${n.x - r * 0.13} ${n.y - r * 0.2} L${n.x + r * 0.22} ${n.y} L${n.x - r * 0.13} ${n.y + r * 0.2} Z`}
                        fill="#fff"
                      />
                    </g>
                  )}
                  {isRead &&
                    (() => {
                      const bx = n.x + r * 0.72
                      const by = n.y - r * 0.72
                      const br = Math.max(5, r * 0.46)
                      return (
                        <g style={{ pointerEvents: 'none' }}>
                          <circle
                            cx={bx}
                            cy={by}
                            r={br}
                            fill={READ_GREEN}
                            stroke="var(--m-card)"
                            strokeWidth={1.6}
                          />
                          <path
                            d={`M${bx - br * 0.42} ${by} L${bx - br * 0.05} ${by + br * 0.38} L${bx + br * 0.46} ${by - br * 0.4}`}
                            fill="none"
                            stroke="#fff"
                            strokeWidth={Math.max(1.3, br * 0.34)}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </g>
                      )
                    })()}
                  {(sel || active) && (
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={r + 4.5}
                      fill="none"
                      stroke={sel ? 'var(--m-ink)' : col}
                      strokeWidth={sel ? 2.4 : 2}
                      strokeOpacity={sel ? 0.85 : 0.6}
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                  {showLabel && (
                    <text
                      x={n.x}
                      y={n.y + r + 13}
                      textAnchor="middle"
                      style={{
                        pointerEvents: 'none',
                        fontFamily: 'var(--font-inter, sans-serif)',
                        fontWeight: 600,
                        fontSize: 11.5,
                        fill: 'var(--m-ink2)',
                        paintOrder: 'stroke',
                        stroke: 'var(--m-paper)',
                        strokeWidth: 3.5,
                        strokeLinejoin: 'round',
                      }}
                    >
                      {labelText}
                    </text>
                  )}
                </g>
              )
            })}

          {/* rubber-band while drawing a new link */}
          {ready &&
            state &&
            pending &&
            (() => {
              const f = state.nodes.get(pending.from)
              if (!f) return null
              const overNode = pending.over ? state.nodes.get(pending.over) : null
              const tx = overNode ? overNode.x : pending.x
              const ty = overNode ? overNode.y : pending.y
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <line
                    x1={f.x}
                    y1={f.y}
                    x2={tx}
                    y2={ty}
                    stroke="var(--m-accent2)"
                    strokeWidth={2.4 / view.k}
                    strokeLinecap="round"
                    strokeDasharray={overNode ? undefined : `${6 / view.k} ${5 / view.k}`}
                  />
                  <circle cx={f.x} cy={f.y} r={4 / view.k} fill="var(--m-accent2)" />
                  {overNode && (
                    <circle
                      cx={overNode.x}
                      cy={overNode.y}
                      r={overNode.r + 5}
                      fill="none"
                      stroke="var(--m-accent2)"
                      strokeWidth={2.5 / view.k}
                    />
                  )}
                </g>
              )
            })()}
        </g>
      </svg>

      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-ink-3">
          Laying out your graph…
        </div>
      )}

      {/* zoom controls */}
      <div
        className={cn(
          'absolute flex flex-col overflow-hidden rounded-[11px] border border-hairline shadow-glow',
          compact ? 'bottom-3 right-3' : 'bottom-[18px] right-[18px]',
        )}
      >
        {(
          [
            [<Plus key="i" className="h-4 w-4" />, () => zoomBy(1.25), 'Zoom in'],
            [<Maximize key="f" className="h-4 w-4" />, resetView, 'Fit'],
            [<Minus key="o" className="h-4 w-4" />, () => zoomBy(0.8), 'Zoom out'],
          ] as [React.ReactNode, () => void, string][]
        ).map(([icon, fn, title], i) => (
          <button
            key={title}
            onClick={fn}
            title={title}
            aria-label={title}
            className={cn(
              'flex h-[34px] w-[34px] items-center justify-center bg-surface text-ink-2',
              i < 2 && 'border-b border-hairline',
            )}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* connect toggle (desktop, top-right) */}
      {!compact && (
        <div className="absolute right-[18px] top-[18px] flex flex-col items-end gap-2">
          <button
            onClick={() => {
              setConnect((v) => !v)
              setPending(null)
            }}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13.5px] font-semibold shadow-glow transition-colors',
              connect ? 'bg-clay-grad text-white' : 'border border-hairline bg-surface text-ink-2',
            )}
          >
            <Link2 className="h-4 w-4" />
            {connect ? 'Linking…' : 'Connect'}
          </button>
          {connect && (
            <span className="max-w-[210px] rounded-lg bg-ink px-2.5 py-1.5 text-[12px] font-semibold leading-snug text-paper shadow-m-sm">
              Drag from one save to another to link them.
            </span>
          )}
        </div>
      )}

      {/* filter panel (desktop, top-left) */}
      {!compact && (
        <div className="absolute left-[18px] top-[18px] w-[230px] rounded-2xl border border-hairline bg-surface/90 p-4 shadow-glow backdrop-blur-md">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 animate-live-pulse rounded-full bg-live" />
            <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-3">
              Synced · just now
            </span>
          </div>

          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">
            Content type
          </div>
          <div className="mb-3.5 flex flex-col gap-0.5">
            {GTYPES.map((t) => {
              const on = typeVisible(t.k)
              return (
                <button
                  key={t.k}
                  onClick={() =>
                    setTypeOn((s) => {
                      const cur = s || new Set<ContentType>(GTYPES.map((x) => x.k))
                      const next = new Set(cur)
                      if (next.has(t.k)) next.delete(t.k)
                      else next.add(t.k)
                      return next.size === GTYPES.length ? null : next
                    })
                  }
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-opacity',
                    on ? 'opacity-100' : 'opacity-40',
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{
                      background: TYPE_COLORS[t.k],
                      boxShadow: `0 0 0 3px ${TYPE_COLORS[t.k]}22`,
                    }}
                  />
                  <span
                    className={cn('text-[13px] text-ink', on ? 'font-semibold' : 'font-medium')}
                  >
                    {t.label}
                  </span>
                  <span className="ml-auto font-mono text-[11.5px] tabular-nums text-ink-3">
                    {typeCounts[t.k] || 0}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="-mx-4 mb-3 h-px bg-hairline" />
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">
            Relationships
          </div>
          <div className="flex flex-col gap-0.5">
            {GKINDS.map((g) => {
              const on = kinds[g.k]
              return (
                <button
                  key={g.k}
                  onClick={() => setKinds((s) => ({ ...s, [g.k]: !s[g.k] }))}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-opacity',
                    on ? 'opacity-100' : 'opacity-40',
                  )}
                >
                  <svg width="18" height="10" className="flex-none">
                    <line
                      x1="1"
                      y1="5"
                      x2="17"
                      y2="5"
                      stroke={EDGE_COLOR[g.k]}
                      strokeWidth="2"
                      strokeDasharray={g.k === 'author' ? '4 3' : undefined}
                    />
                  </svg>
                  <span
                    className={cn('text-[13px] text-ink', on ? 'font-semibold' : 'font-medium')}
                  >
                    {g.label}
                  </span>
                  <Toggle on={on} />
                </button>
              )
            })}
          </div>

          <div className="-mx-4 my-3 h-px bg-hairline" />
          <button
            onClick={() => setUnreadOnly((v) => !v)}
            className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left"
          >
            <EyeOff
              className="h-[15px] w-[15px]"
              style={{ color: unreadOnly ? 'var(--m-accent)' : 'var(--m-ink2)' }}
            />
            <span
              className={cn(
                'text-[13px]',
                unreadOnly ? 'font-bold text-clay' : 'font-medium text-ink',
              )}
            >
              Unread only
            </span>
            <Toggle on={unreadOnly} />
          </button>

          {allTags.length > 0 && (
            <>
              <div className="mb-2 mt-3.5 flex items-center">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">
                  Tags
                </span>
                {tagFilter && (
                  <button
                    onClick={() => setTagFilter(null)}
                    className="ml-auto text-[11.5px] font-bold text-clay"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((t) => {
                  const on = tagFilter === t
                  return (
                    <button
                      key={t}
                      onClick={() => setTagFilter(on ? null : t)}
                      className={cn(
                        'rounded-full border px-2.5 py-[5px] text-[12.5px] font-semibold',
                        on
                          ? 'border-clay bg-clay text-white'
                          : 'border-hairline bg-inset text-ink-2',
                      )}
                    >
                      #{t}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* compact filter bar (mobile) */}
      {compact && (
        <div className="absolute inset-x-2.5 bottom-2.5 flex flex-col gap-2 rounded-[14px] border border-hairline bg-surface/95 p-2.5 backdrop-blur">
          <div className="flex gap-1.5 overflow-x-auto">
            <button
              onClick={() => {
                setConnect((v) => !v)
                setPending(null)
              }}
              className={cn(
                'inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-bold',
                connect ? 'bg-clay-grad text-white' : 'border border-hairline bg-inset text-ink-2',
              )}
            >
              <Link2 className="h-3.5 w-3.5" />
              {connect ? 'Linking…' : 'Connect'}
            </button>
            <button
              onClick={() => setUnreadOnly((v) => !v)}
              className={cn(
                'inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-bold',
                unreadOnly ? 'bg-clay text-white' : 'border border-hairline bg-inset text-ink-2',
              )}
            >
              <EyeOff className="h-3.5 w-3.5" />
              Unread
            </button>
            {allTags.map((t) => {
              const on = tagFilter === t
              return (
                <button
                  key={t}
                  onClick={() => setTagFilter(on ? null : t)}
                  className={cn(
                    'flex-none rounded-full border px-2.5 py-1.5 text-[12px] font-semibold',
                    on ? 'border-clay bg-clay text-white' : 'border-hairline bg-inset text-ink-2',
                  )}
                >
                  #{t}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-2.5">
            {GTYPES.map((t) => {
              const on = typeVisible(t.k)
              return (
                <button
                  key={t.k}
                  onClick={() =>
                    setTypeOn((s) => {
                      const cur = s || new Set<ContentType>(GTYPES.map((x) => x.k))
                      const next = new Set(cur)
                      if (next.has(t.k)) next.delete(t.k)
                      else next.add(t.k)
                      return next.size === GTYPES.length ? null : next
                    })
                  }
                  className={cn(
                    'inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-2',
                    on ? 'opacity-100' : 'opacity-40',
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[t.k] }} />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        'relative ml-auto h-[18px] w-[34px] flex-none rounded-full border border-hairline transition-colors',
        on ? 'bg-clay' : 'bg-inset',
      )}
    >
      <span
        className={cn(
          'absolute top-[1px] h-3.5 w-3.5 rounded-full bg-white shadow transition-all',
          on ? 'left-[17px]' : 'left-[1px]',
        )}
      />
    </span>
  )
}
