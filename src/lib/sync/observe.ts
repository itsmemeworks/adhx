import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { syncLogs } from '@/lib/db/schema'
import { STALE_RUNNING_SYNC_MS, STALE_RUNNING_SYNC_MESSAGE } from './claim'
import { REAUTH_MESSAGE } from './messages'

/** A second viewer observes the durable run without starting work or owning its lease. */
export function observeSync(userId: string, syncId: string, signal: AbortSignal): Response {
  let timer: ReturnType<typeof setInterval> | undefined
  let stopped = false
  let abort: () => void = () => {}
  const cleanup = () => {
    stopped = true
    clearInterval(timer)
    signal.removeEventListener('abort', abort)
  }
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: object) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      const close = () => {
        if (stopped) return
        cleanup()
        controller.close()
      }
      abort = close
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) {
        close()
        return
      }
      const poll = () => {
        if (stopped) return
        try {
          const row = db
            .select({
              status: syncLogs.status,
              startedAt: syncLogs.startedAt,
              heartbeatAt: syncLogs.heartbeatAt,
              total: syncLogs.totalFetched,
              new: syncLogs.newBookmarks,
              duplicates: syncLogs.duplicatesSkipped,
              errorMessage: syncLogs.errorMessage,
            })
            .from(syncLogs)
            .where(and(eq(syncLogs.userId, userId), eq(syncLogs.id, syncId)))
            .get()
          if (!row) {
            send('error', {
              code: 'generic',
              message: 'This sync is no longer available. Please try again.',
            })
            close()
            return
          }
          const stats = {
            total: row.total ?? 0,
            new: row.new ?? 0,
            duplicates: row.duplicates ?? 0,
            categorized: 0,
          }
          if (row.status === 'completed') {
            send('complete', { stats })
            close()
          } else if (
            row.status !== 'running' ||
            Date.now() - Date.parse(row.heartbeatAt ?? row.startedAt) >= STALE_RUNNING_SYNC_MS
          ) {
            const message = row.errorMessage || STALE_RUNNING_SYNC_MESSAGE
            send('error', { message, code: message === REAUTH_MESSAGE ? 'reauth' : 'generic' })
            close()
          } else {
            send('progress', stats)
          }
        } catch {
          send('error', {
            code: 'generic',
            message: 'Could not read sync progress. Please try again.',
          })
          close()
        }
      }
      poll()
      if (!stopped) timer = setInterval(poll, 1000)
    },
    cancel: cleanup,
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
  })
}
