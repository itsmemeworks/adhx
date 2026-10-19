import type { NextRequest } from 'next/server'
import { publicReadRateLimit } from '@/lib/rate-limit'
import { subscribe, type MomentEvent } from '@/lib/moments/engine'

/**
 * GET /api/moments/stream[?watch=slug] — live "Right now" events
 * (Server-Sent Events): `save` (a save landed in a moment or a forming
 * group), `formed` (a new moment), `snapshot` (after a regroup), `stats`,
 * `watching`. `watch` counts this viewer as watching that moment.
 */
export const dynamic = 'force-dynamic'

const SLUG = /^[a-z0-9-]{1,64}$/
const PING_MS = 20_000

export async function GET(request: NextRequest) {
  const limited = publicReadRateLimit(request)
  if (limited) return limited
  const raw = request.nextUrl.searchParams.get('watch')
  const watch = raw && SLUG.test(raw) ? raw : undefined
  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const write = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }
      const send = (event: MomentEvent) =>
        write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      write('retry: 3000\n\n')
      const unsubscribe = subscribe(send, watch)
      const ping = setInterval(() => write(': ping\n\n'), PING_MS)
      cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(ping)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
      request.signal.addEventListener('abort', () => cleanup())
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
