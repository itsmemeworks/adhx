'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  FormingView,
  MomentDetail,
  MomentEvent,
  MomentView,
  MomentsSnapshot,
  StreamItem,
} from '@/lib/moments/engine'
import type { Saver } from '@/lib/people/types'

/**
 * Client side of "Right now": the snapshot plus the live event stream
 * (`/api/moments/stream`), folded into one state. A card "flashes" for a
 * moment when a save lands in it; a moment that just formed "pops".
 */

export type { FormingView, MomentDetail, MomentEvent, MomentView, MomentsSnapshot, StreamItem }

const FLASH_MS = 1_600
const POP_MS = 4_000

/** "just now", "4 min ago", "3h ago", "2d ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86_400)}d ago`
}

/** "last 3 hours" style wording for a moment's age. */
export function windowLabel(hours: number): string {
  if (hours <= 24) return 'today'
  if (hours <= 72) return 'last few days'
  return 'this week'
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`
}

/**
 * A moment from an event, keeping the names the card already had when the
 * event carries none (a stranger's events never do; a member's always do).
 */
function keepPeople(next: MomentView, prev: MomentView | undefined): MomentView {
  if (!prev) return next
  return {
    ...next,
    ...(next.savers === undefined && prev.savers ? { savers: prev.savers } : {}),
    ...(next.watchers === undefined && prev.watchers ? { watchers: prev.watchers } : {}),
    ...(next.recentSaves === undefined && prev.recentSaves !== undefined
      ? { recentSaves: prev.recentSaves, windowMinutes: prev.windowMinutes }
      : {}),
  }
}

/** Apply one live event to a snapshot (pure; exported for tests). */
export function applyEvent(snapshot: MomentsSnapshot, event: MomentEvent): MomentsSnapshot {
  switch (event.type) {
    case 'snapshot':
      return event.snapshot
    case 'stats':
      return { ...snapshot, stats: event.stats }
    case 'watching':
      return {
        ...snapshot,
        moments: snapshot.moments.map((m) =>
          m.slug === event.slug
            ? {
                ...m,
                watching: event.watching,
                ...(event.watchers ? { watchers: event.watchers } : {}),
              }
            : m,
        ),
      }
    case 'reaction':
      return snapshot
    case 'formed':
      return {
        ...snapshot,
        // A new moment goes right after the lead, where it's seen.
        moments: (() => {
          const prev = snapshot.moments.find((m) => m.slug === event.moment.slug)
          const rest = snapshot.moments.filter((m) => m.slug !== event.moment.slug)
          return [...rest.slice(0, 1), keepPeople(event.moment, prev), ...rest.slice(1)]
        })(),
        forming: snapshot.forming.filter((f) => f.id !== event.formingId),
      }
    case 'save': {
      const stream = [event.item, ...snapshot.stream.filter((x) => x.id !== event.item.id)].slice(
        0,
        12,
      )
      const moments = event.moment
        ? snapshot.moments.map((m) =>
            m.slug === event.moment!.slug ? keepPeople(event.moment!, m) : m,
          )
        : snapshot.moments
      let forming = snapshot.forming
      if (event.forming) {
        const has = forming.some((f) => f.id === event.forming!.id)
        // Keep the faces and bell a card already had when the event carries none.
        const next = (prev: FormingView): FormingView => ({
          ...event.forming!,
          ...(event.forming!.people === undefined && prev.people ? { people: prev.people } : {}),
          ...(event.forming!.alert === undefined && prev.alert !== undefined
            ? { alert: prev.alert }
            : {}),
        })
        forming = has
          ? forming.map((f) => (f.id === event.forming!.id ? next(f) : f))
          : [...forming, event.forming].slice(-3)
      }
      return { ...snapshot, stream, moments, forming }
    }
  }
}

export interface Flash {
  /** The save that caused it (its post drops into the card). */
  item: StreamItem
}

/**
 * Subscribe to the live stream. `watch` counts this page as watching that
 * moment. Calls `onEvent` for every event; reconnects on its own.
 */
export function useMomentStream(
  onEvent: (event: MomentEvent) => void,
  watch?: string | null,
  enabled = true,
): boolean {
  const handler = useRef(onEvent)
  handler.current = onEvent
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return
    const url = watch
      ? `/api/moments/stream?watch=${encodeURIComponent(watch)}`
      : '/api/moments/stream'
    const source = new EventSource(url)
    const on = (e: MessageEvent<string>) => {
      try {
        handler.current(JSON.parse(e.data) as MomentEvent)
      } catch {
        // ignore a malformed event
      }
    }
    for (const type of ['snapshot', 'save', 'formed', 'stats', 'watching', 'reaction']) {
      source.addEventListener(type, on as EventListener)
    }
    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false)
    return () => source.close()
  }, [watch, enabled])
  return connected
}

/** "Right now", live: snapshot + events, plus which cards are flashing or new. */
export function useMoments(): {
  snapshot: MomentsSnapshot | null
  flashes: Map<string, Flash>
  popped: Set<string>
  connected: boolean
} {
  const [snapshot, setSnapshot] = useState<MomentsSnapshot | null>(null)
  const [flashes, setFlashes] = useState<Map<string, Flash>>(new Map())
  const [popped, setPopped] = useState<Set<string>>(new Set())
  const queued = useRef<MomentEvent[]>([])
  const timers = useRef<number[]>([])

  useEffect(() => {
    let alive = true
    fetch('/api/moments', { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<MomentsSnapshot>) : null))
      .then((data) => {
        if (!alive || !data) return
        // Events that arrived before the snapshot still apply.
        setSnapshot(queued.current.reduce(applyEvent, data))
        queued.current = []
      })
      .catch(() => {})
    const pending = timers.current
    return () => {
      alive = false
      pending.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  const connected = useMomentStream((event) => {
    setSnapshot((s) => {
      if (!s) {
        queued.current.push(event)
        return s
      }
      return applyEvent(s, event)
    })
    const flashKey =
      event.type === 'save' && event.item.to
        ? event.item.to.kind === 'moment'
          ? event.item.to.slug
          : event.item.to.id
        : null
    if (event.type === 'save' && flashKey) {
      setFlashes((f) => new Map(f).set(flashKey, { item: event.item }))
      later(
        () =>
          setFlashes((f) => {
            if (f.get(flashKey)?.item.id !== event.item.id) return f
            const next = new Map(f)
            next.delete(flashKey)
            return next
          }),
        FLASH_MS,
      )
    }
    if (event.type === 'formed') {
      const slug = event.moment.slug
      setPopped((p) => new Set(p).add(slug))
      later(
        () =>
          setPopped((p) => {
            const next = new Set(p)
            next.delete(slug)
            return next
          }),
        POP_MS,
      )
    }
  })

  return { snapshot, flashes, popped, connected }
}

/** One moment, live: its posts newest first, with new saves dropping in. */
export function useMoment(slug: string): {
  detail: MomentDetail | null
  missing: boolean
  fresh: string | null
  watching: number
  /** Members tuned in now (signed in only; empty for strangers). */
  watchers: Saver[]
} {
  const [detail, setDetail] = useState<MomentDetail | null>(null)
  const [missing, setMissing] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const [watching, setWatching] = useState(0)
  const [watchers, setWatchers] = useState<Saver[]>([])

  useEffect(() => {
    let alive = true
    fetch(`/api/moments/${encodeURIComponent(slug)}?limit=60`, { credentials: 'same-origin' })
      .then((r) => {
        if (r.status === 404) {
          if (alive) setMissing(true)
          return null
        }
        return r.ok ? (r.json() as Promise<MomentDetail>) : null
      })
      .then((data) => {
        if (alive && data) {
          setDetail(data)
          setWatching(data.moment.watching)
          setWatchers(data.watchers ?? [])
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [slug])

  useMomentStream((event) => {
    if (event.type === 'watching' && event.slug === slug) {
      setWatching(event.watching)
      if (event.watchers) setWatchers(event.watchers)
    }
    if (event.type === 'save' && event.item.to?.kind === 'moment' && event.item.to.slug === slug) {
      const item = event.item
      setDetail((d) => {
        if (!d) return d
        const bars = d.bars.slice()
        bars[bars.length - 1] = (bars[bars.length - 1] ?? 0) + 1
        const saver = event.saver
        return {
          ...d,
          moment: event.moment ? keepPeople(event.moment, d.moment) : d.moment,
          bars,
          items: [
            { post: item.post, savedAt: item.at, people: 1, ...(saver ? { savers: [saver] } : {}) },
            ...d.items.filter((x) => `${x.post.platform ?? 'twitter'}:${x.post.id}` !== item.key),
          ].slice(0, 120),
        }
      })
      setFresh(item.id)
    }
  }, slug)

  return { detail, missing, fresh, watching, watchers }
}
