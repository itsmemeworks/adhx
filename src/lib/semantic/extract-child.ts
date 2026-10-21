/**
 * The extract process: runs the speech or on-screen text model for the jobs
 * process (`extractor.ts`) or the native Mac worker. Forked on demand with
 * `node --import tsx`, one task at a time, and it exits after a minute
 * without work (or when its parent goes away), so the 1–2 GB a model holds
 * goes back to the system instead of sitting next to the search model.
 */
import type { ExtractRequest, ExtractResponse } from './extractor'
import { runExtractTask } from './extract-task'

const IDLE_MS = Math.max(1_000, Number(process.env['ADHX_EXTRACT_IDLE_MS'] || 60_000))

function send(message: ExtractResponse): void {
  if (process.connected) process.send?.(message)
}

process.on('disconnect', () => process.exit(0))

let idle: NodeJS.Timeout | null = null
function rest(): void {
  if (idle) clearTimeout(idle)
  idle = setTimeout(() => process.exit(0), IDLE_MS)
}

async function handle(request: ExtractRequest): Promise<ExtractResponse> {
  const model = await import('./extract-model')
  return runExtractTask(request, model)
}

process.on('message', (request: ExtractRequest) => {
  if (!request || typeof request.id !== 'string' || !request.task) return
  if (idle) clearTimeout(idle)
  handle(request)
    .then(send)
    .catch((error: unknown) =>
      send({ id: request.id, error: error instanceof Error ? error.message : String(error) }),
    )
    .finally(rest)
})

rest()
