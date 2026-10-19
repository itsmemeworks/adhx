import { captureException } from '@/lib/sentry'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { subscribe, type MomentEvent } from './engine'
import { eventForViewer, reactionForViewer } from './people'
import { joinWatch, onReaction } from './presence'

/**
 * The live "Right now" stream (Server-Sent Events) for one subscriber, shared
 * by the web (`/api/moments/stream`) and the phone (`/api/app/live/{slug}/stream`).
 *
 * - Everyone gets the engine's anonymous events; `watch` counts them as
 *   watching that moment.
 * - A signed-in member (`viewerId`) watching a moment is also counted by name
 *   (`presence.ts`), gets names on events (`eventForViewer`: savers, watchers,
 *   who just saved) and that moment's reactions. Strangers never do.
 */

const PING_MS = 20_000

export interface MomentStreamOptions {
  request: Request
  watch?: string
  viewerId: string
  /** Phone streams also stop when this exact key is revoked. */
  keyId?: string
  /** Only events about this moment (the phone's per-moment stream). */
  only?: string
  /** Change each event just before it is sent (the phone adds its post shape). */
  map?: (event: MomentEvent) => { type: string }
}

/** Whether an event is about this moment. */
export function concerns(event: MomentEvent, slug: string): boolean {
  switch (event.type) {
    case 'watching':
    case 'reaction':
      return event.slug === slug
    case 'save':
      return event.item.to?.kind === 'moment' && event.item.to.slug === slug
    case 'formed':
      return event.moment.slug === slug
    case 'snapshot':
    case 'stats':
      return false
  }
}

export function momentStreamResponse({
  request,
  watch,
  viewerId,
  keyId,
  only,
  map,
}: MomentStreamOptions): Response {
  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      // A stream may outlive its credential. Check durable authorization before
      // every event, reaction and heartbeat, including otherwise idle rooms.
      const authorized = () => {
        if (!viewerId) return true
        try {
          const active = db.get(sql`SELECT 1 FROM users u
            WHERE u.id = ${viewerId} AND u.approval = 'approved'
              AND NOT EXISTS (SELECT 1 FROM user_bans b WHERE b.user_id = u.id)
              ${keyId ? sql`AND EXISTS (SELECT 1 FROM access_keys k WHERE k.id = ${keyId} AND k.user_id = u.id AND k.scope = 'phone')` : sql``}`)
          if (active) return true
        } catch (error) {
          captureException(error, { endpoint: 'moments.stream.auth' })
        }
        cleanup()
        return false
      }
      const write = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }
      const send = (event: MomentEvent) => {
        const out: { type: string } = map ? map(event) : event
        write(`event: ${out.type}\ndata: ${JSON.stringify(out)}\n\n`)
      }
      // Runs inside the engine's emit: never let a naming failure reach it.
      const onEvent = (event: MomentEvent) => {
        if (!authorized()) return
        if (only && !concerns(event, only)) return
        let named = event
        try {
          named = eventForViewer(event, viewerId)
        } catch (error) {
          captureException(error, { endpoint: 'moments.stream.names' })
        }
        send(named)
      }
      write('retry: 3000\n\n')
      // Join by name before subscribing: subscribing announces the new count.
      const leave = viewerId && watch ? joinWatch(watch, viewerId) : () => {}
      const stopReactions =
        viewerId && watch
          ? onReaction((signal) => {
              if (signal.slug !== watch) return
              if (!authorized()) return
              try {
                const event = reactionForViewer(signal, viewerId)
                if (event) send(event)
              } catch (error) {
                captureException(error, { endpoint: 'moments.stream.reaction' })
              }
            })
          : () => {}
      let unsubscribe = () => {}
      const ping = setInterval(() => {
        if (authorized()) write(': ping\n\n')
      }, PING_MS)
      cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(ping)
        // Leave by name first, so the count that unsubscribing announces matches the names.
        leave()
        stopReactions()
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
      // subscribe() emits synchronously; cleanup must already be installed.
      if (authorized()) {
        unsubscribe = subscribe(onEvent, watch)
        if (closed) unsubscribe()
      }
      request.signal.addEventListener('abort', () => cleanup())
      if (request.signal.aborted) cleanup()
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
