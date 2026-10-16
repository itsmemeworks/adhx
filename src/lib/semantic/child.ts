/**
 * Entry point for the semantic child processes (see `supervisor.ts`). Run by
 * the supervisor as `node --import tsx src/lib/semantic/child.ts` with
 * `ADHX_SEMANTIC_ROLE` set to `jobs` or `query`.
 */
import type { ChildMessage, JobActivity, ParentMessage } from './supervisor'

const ACTIVITY_EVERY_MS = 1_000

function send(message: ChildMessage): void {
  if (process.connected) process.send?.(message)
}

// The supervisor is gone (crash, redeploy): never outlive it.
process.on('disconnect', () => process.exit(0))

async function runJobs(): Promise<void> {
  const { currentActivity, startUnderstandingWorker, wakeWorker } = await import('./worker')
  process.on('message', (message: ParentMessage) => {
    if (message.type === 'wake') wakeWorker()
  })
  let last = ''
  setInterval(() => {
    const current = currentActivity() as JobActivity | null
    const snapshot = JSON.stringify(current)
    if (snapshot === last) return
    last = snapshot
    send({ type: 'activity', current })
  }, ACTIVITY_EVERY_MS)
  startUnderstandingWorker()
  send({ type: 'ready' })
}

async function runQuery(): Promise<void> {
  const { embedTexts } = await import('./model')
  process.on('message', (message: ParentMessage) => {
    if (message.type !== 'embed') return
    embedTexts([message.text])
      .then(([vector]) => send({ type: 'vector', id: message.id, vector: Array.from(vector) }))
      .catch((error: unknown) =>
        send({
          type: 'error',
          id: message.id,
          message: error instanceof Error ? error.message : String(error),
        }),
      )
  })
  // Load the model now so the first search does not pay for it.
  await embedTexts(['task: search result | query: warm up'])
  send({ type: 'ready' })
}

const role = process.env['ADHX_SEMANTIC_ROLE']
const run = role === 'jobs' ? runJobs : role === 'query' ? runQuery : null
if (!run) {
  console.error(`[semantic] unknown ADHX_SEMANTIC_ROLE: ${role}`)
  process.exit(1)
}
run().catch((error: unknown) => {
  send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  console.error('[semantic] child failed to start', error)
  process.exit(1)
})
