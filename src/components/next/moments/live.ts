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
      // One card per post: a second save of it moves it to the front.
      const stream = [event.item, ...snapshot.stream.filter((x) => x.key !== event.item.key)].slice(
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
  onReady?: () => void,
): boolean {
  const handler = useRef(onEvent)
  const ready = useRef(onReady)
  handler.current = onEvent
  ready.current = onReady
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return
    const url = watch
      ? `/api/moments/stream?watch=${encodeURIComponent(watch)}`
      : '/api/moments/stream'
    let source: EventSource | null = null
    const close = () => {
      source?.close()
      source = null
      setConnected(false)
    }
    const connect = () => {
      if (source || document.hidden) return
      const next = new EventSource(url)
      source = next
      const on = (e: MessageEvent<string>) => {
        if (source !== next) return
        try {
          handler.current(JSON.parse(e.data) as MomentEvent)
        } catch {
          /* Ignore malformed frames. */
        }
      }
      for (const type of ['snapshot', 'save', 'formed', 'stats', 'watching', 'reaction'])
        next.addEventListener(type, on as EventListener)
      next.onopen = () => {
        if (source === next) {
          setConnected(true)
          ready.current?.()
        }
      }
      next.onerror = () => {
        if (source === next) setConnected(false)
      }
    }
    const visibility = () => {
      if (document.hidden) close()
      else connect()
    }
    connect()
    document.addEventListener('visibilitychange', visibility)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      close()
    }
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
  const [revision, setRevision] = useState(0)
  const loading = useRef(true)
  const overflow = useRef(false)
  const timers = useRef(new Set<number>())
  const failures = useRef(0)

  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    loading.current = true
    queued.current = []
    overflow.current = false
    fetch('/api/moments', { credentials: 'same-origin', signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('snapshot unavailable')
        return r.json() as Promise<MomentsSnapshot>
      })
      .then((data) => {
        if (!alive || !data) return
        if (overflow.current) {
          setRevision((n) => n + 1)
          return
        }
        // Include events received while this authoritative snapshot was loading.
        setSnapshot(queued.current.reduce(applyEvent, data))
        loading.current = false
        failures.current = 0
        queued.current = []
      })
      .catch(() => {
        if (alive)
          retry = window.setTimeout(
            () => setRevision((n) => n + 1),
            Math.min(30_000, 1000 * 2 ** Math.min(failures.current++, 5)),
          )
      })
    let retry: number | undefined
    return () => {
      alive = false
      controller.abort()
      window.clearTimeout(retry)
    }
  }, [revision])

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer))
      pending.clear()
    }
  }, [])
  const later = useCallback((fn: () => void, ms: number) => {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      fn()
    }, ms)
    timers.current.add(timer)
  }, [])

  const connected = useMomentStream(
    (event) => {
      if (loading.current) {
        if (queued.current.length < 256) queued.current.push(event)
        else overflow.current = true
      }
      setSnapshot((s) => (s ? applyEvent(s, event) : s))
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
    },
    undefined,
    true,
    () => setRevision((n) => n + 1),
  )

  return { snapshot, flashes, popped, connected }
}

/** Replay a live detail event after a REST snapshot without double-counting a save. */
export function applyDetailEvent(
  detail: MomentDetail,
  event: MomentEvent,
  slug: string,
): MomentDetail {
  if (event.type === 'watching' && event.slug === slug)
    return {
      ...detail,
      moment: { ...detail.moment, watching: event.watching },
      ...(event.watchers ? { watchers: event.watchers } : {}),
    }
  if (event.type !== 'save' || event.item.to?.kind !== 'moment' || event.item.to.slug !== slug)
    return detail
  const item = event.item
  const previous = detail.items.find(
    (x) => `${x.post.platform ?? 'twitter'}:${x.post.id}` === item.key,
  )
  const savers = event.saver
    ? [event.saver, ...(previous?.savers ?? []).filter((s) => s.username !== event.saver!.username)]
    : previous?.savers
  const bars = detail.bars.slice()
  if (!previous) bars[bars.length - 1] = (bars[bars.length - 1] ?? 0) + 1
  return {
    ...detail,
    bars,
    moment: event.moment ? keepPeople(event.moment, detail.moment) : detail.moment,
    items: [
      {
        post: item.post,
        savedAt: item.at,
        people: Math.max(previous?.people ?? 1, savers?.length ?? 1),
        ...(savers ? { savers } : {}),
      },
      ...detail.items.filter((x) => `${x.post.platform ?? 'twitter'}:${x.post.id}` !== item.key),
    ].slice(0, 120),
  }
}

/** One moment, live: resynchronise after every transport reconnect. */
export function useMoment(slug: string): {
  detail: MomentDetail | null
  missing: boolean
  fresh: string | null
  watching: number
  watchers: Saver[]
} {
  const [detail, setDetail] = useState<MomentDetail | null>(null)
  const [missing, setMissing] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const [watching, setWatching] = useState(0)
  const [watchers, setWatchers] = useState<Saver[]>([])
  const [revision, setRevision] = useState(0)
  const loading = useRef(true)
  const pending = useRef<MomentEvent[]>([])
  const overflow = useRef(false)
  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    loading.current = true
    pending.current = []
    overflow.current = false
    fetch(`/api/moments/${encodeURIComponent(slug)}?limit=60`, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then((r) => {
        if (r.status === 404) {
          if (alive) setMissing(true)
          return null
        }
        return r.ok ? (r.json() as Promise<MomentDetail>) : null
      })
      .then((data) => {
        if (!alive || !data) return
        if (overflow.current) {
          setRevision((n) => n + 1)
          return
        }
        const next = pending.current.reduce((d, e) => applyDetailEvent(d, e, slug), data)
        setDetail(next)
        setMissing(false)
        setWatching(next.moment.watching)
        setWatchers(next.watchers ?? [])
        loading.current = false
        pending.current = []
      })
      .catch(() => {})
    return () => {
      alive = false
      controller.abort()
    }
  }, [slug, revision])
  useMomentStream(
    (event) => {
      if (loading.current) {
        if (pending.current.length < 256) pending.current.push(event)
        else overflow.current = true
      }
      if (event.type === 'watching' && event.slug === slug) {
        setWatching(event.watching)
        if (event.watchers) setWatchers(event.watchers)
      }
      setDetail((d) => (d ? applyDetailEvent(d, event, slug) : d))
      if (event.type === 'save' && event.item.to?.kind === 'moment' && event.item.to.slug === slug)
        setFresh(event.item.id)
    },
    slug,
    true,
    () => setRevision((n) => n + 1),
  )
  return { detail, missing, fresh, watching, watchers }
}
