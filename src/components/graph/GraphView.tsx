'use client'

/**
 * Knowledge Graph — view shell.
 *
 * Fetches `/api/graph`, owns the selected node + the annotation store, and lays
 * out the sub-header + graph stage + detail surface. The detail is an absolute
 * overlay on desktop (384px, opacity-fade entrance) and a bottom sheet on
 * mobile — never a flex sibling (it would get shrunk). The stage is measured
 * with a ResizeObserver to drive the SVG viewBox + the compact (mobile) layout.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Network, RefreshCw } from 'lucide-react'
import { GraphCanvas } from './GraphCanvas'
import { GraphDetail } from './GraphDetail'
import { useGraphMeta } from './useGraphMeta'
import type { GraphData } from './types'

export function GraphView() {
  const [data, setData] = useState<GraphData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/graph')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load graph (${r.status})`)
        return r.json()
      })
      .then((d: GraphData) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Failed to load graph'))
    return () => {
      alive = false
    }
  }, [])

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
        <Network className="h-8 w-8 text-ink-3" />
        <p className="text-[15px] font-semibold text-ink">Couldn’t load your graph</p>
        <p className="max-w-sm text-[13px] text-ink-3">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-1 inline-flex items-center gap-2 rounded-full bg-clay-grad px-4 py-2 text-[13px] font-semibold text-white shadow-glow"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center bg-paper text-[13px] text-ink-3">
        Building your knowledge graph…
      </div>
    )
  }

  return <GraphViewInner data={data} />
}

function GraphViewInner({ data }: { data: GraphData }) {
  const meta = useGraphMeta(data.annotations)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const compact = size.w > 0 && size.w < 768
  const { stats } = data

  const selectionExists = useMemo(() => {
    if (selectedKey == null) return false
    return (
      data.saves.some((s) => s.key === selectedKey) || data.themes.some((t) => t.id === selectedKey)
    )
  }, [selectedKey, data])

  const isEmpty = data.saves.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper">
      {/* sub-header */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 pb-3.5 pt-4 sm:px-6">
        <h1 className="m-0 font-serif text-[26px] font-semibold tracking-tight text-ink">
          Knowledge graph
        </h1>
        <span className="text-[13.5px] text-ink-2">
          <b className="text-ink">{stats.shown}</b> saves ·{' '}
          <b className="text-ink">{stats.themeCount}</b> themes ·{' '}
          <b className="text-ink">{stats.connectionCount}</b> connections
          {stats.capped && (
            <span className="text-ink-3">
              {' '}
              · newest {stats.shown} of {stats.totalSaves}
            </span>
          )}
        </span>
        <span className="ml-auto hidden text-[12.5px] text-ink-3 lg:inline">
          Drag a node · click to open · zoom to explore
        </span>
      </div>

      {/* stage */}
      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 overflow-hidden border-t border-hairline"
      >
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Network className="h-8 w-8 text-ink-3" />
            <p className="text-[15px] font-semibold text-ink">Your graph is empty</p>
            <p className="max-w-sm text-[13px] text-ink-3">
              Sync or save a few posts and they’ll appear here, clustered by theme.
            </p>
          </div>
        ) : (
          size.w > 0 && (
            <GraphCanvas
              saves={data.saves}
              themes={data.themes}
              relations={data.relations}
              meta={meta}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              width={size.w}
              height={size.h}
              compact={compact}
            />
          )
        )}

        {/* detail — desktop overlay */}
        {selectionExists && !compact && (
          <aside
            className="absolute bottom-0 right-0 top-0 z-10 w-[384px] animate-kg-in overflow-y-auto border-l border-hairline bg-surface"
            style={{ boxShadow: '-18px 0 50px rgba(20,16,12,.10)' }}
          >
            <GraphDetail
              selectedKey={selectedKey!}
              data={data}
              meta={meta}
              onClose={() => setSelectedKey(null)}
              onNavigate={setSelectedKey}
            />
          </aside>
        )}

        {/* detail — mobile bottom sheet */}
        {selectionExists && compact && (
          <div
            className="absolute inset-x-0 bottom-0 z-10 max-h-[66%] animate-kg-in overflow-y-auto rounded-t-[20px] border-t border-hairline bg-surface"
            style={{ boxShadow: '0 -10px 40px rgba(0,0,0,.18)' }}
          >
            <div className="flex justify-center pb-0.5 pt-2.5">
              <span className="h-1 w-9 rounded-full bg-hairline" />
            </div>
            <GraphDetail
              selectedKey={selectedKey!}
              data={data}
              meta={meta}
              onClose={() => setSelectedKey(null)}
              onNavigate={setSelectedKey}
            />
          </div>
        )}
      </div>
    </div>
  )
}
