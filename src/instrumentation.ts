import type { Instrumentation } from 'next'

const MAX_PATH_LENGTH = 256
const HTTP_METHOD = /^[A-Z]{1,16}$/
const NEXT_ERROR_DIGEST = /^(?:0|[1-9][0-9]{0,9})$/

function boundedRoutePath(routePath: string): string {
  const path = routePath.split(/[?#]/, 1)[0] || '/'
  return path.slice(0, MAX_PATH_LENGTH)
}

function boundedMethod(method: string): string {
  const normalized = method.toUpperCase()
  return HTTP_METHOD.test(normalized) ? normalized : 'UNKNOWN'
}

function boundedDigest(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('digest' in error)) {
    return undefined
  }

  const digest = (error as { digest?: unknown }).digest
  if (typeof digest !== 'string' && typeof digest !== 'number') {
    return undefined
  }

  const normalized = String(digest)
  return NEXT_ERROR_DIGEST.test(normalized) ? normalized : undefined
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // Settings saved in Admin → System: lets `setting()` see them in this process.
  await import('@/lib/settings/extras')

  const { initSentry } = await import('@/lib/sentry')
  initSentry()

  // Keyword search works independently of the optional model. Catch up saves
  // made before the keyword index existed or while inference was disabled.
  const { startKeywordIndex } = await import('@/lib/semantic/keywords')
  startKeywordIndex()

  // Understanding pipeline: child processes resume the durable queue, backfill
  // older saves and embed search queries. The model never runs in this
  // process. No-op when SEMANTIC_SEARCH=off or under test.
  const { startSemanticProcesses } = await import('@/lib/semantic/supervisor')
  startSemanticProcesses()

  // Right now: understand the topic names and group recent saves once, now,
  // so the first visit doesn't wait seconds for them. Off under test.
  const { warmMoments } = await import('@/lib/moments/engine')
  warmMoments()

  // New X bookmarks arrive within the hour without pressing Sync.
  // Idle with AUTO_SYNC_EVERY_MINUTES=0; off under test.
  const { startAutoSync } = await import('@/lib/sync/auto')
  startAutoSync()

  // Download every saved post's media (best quality) so ADHX serves its own
  // copies. Idle with KEEP_MEDIA=off; off under test.
  const { startKeeping } = await import('@/lib/keep/worker')
  startKeeping()
  // The admin System page's backlog chart: queue sizes every five minutes.
  const { startBacklogSampler } = await import('@/lib/admin/boards/system')
  startBacklogSampler()
  // Links shared from the phone app, read and saved in the background.
  const { startSaveQueue } = await import('@/lib/app/save-queue')
  startSaveQueue()
  // Optional cloud image decisions: bounded background work, never page latency.
  const { startVisualChannels } = await import('@/lib/channels/visual')
  startVisualChannels()
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { captureException } = await import('@/lib/sentry')
  const routePath = boundedRoutePath(context.routePath)
  const digest = boundedDigest(error)

  captureException(error, {
    requestPath: routePath,
    requestMethod: boundedMethod(request.method),
    routePath,
    routeType: context.routeType,
    ...(digest ? { digest } : {}),
  })
}
