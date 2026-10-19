import { workerAuthorized, workerHeaders } from '@/lib/processing/auth'
import {
  cacheReleaseAfter,
  reconcileMediaCache,
  validateMediaCacheKeys,
  heartbeat,
  planProcessingVideo,
  completeProcessingJob,
  completeVideoSegment,
  completeExtractJob,
  failProcessingJob,
  ProcessingConflict,
  ProcessingInputError,
} from '@/lib/processing/jobs'
import type { ProcessingRequest } from '@/lib/processing/protocol'
import { readResponseBodyWithLimit } from '@/lib/media/proxy'
import { conversionHeartbeat, conversionFailure } from '@/lib/processing/conversion'
import { indexingPaused } from '@/lib/processing/config'
import { claimNextJob } from '@/lib/processing/scheduling'
import { noteWorkerSeen } from '@/lib/processing/presence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const headers = workerHeaders()
  if (!workerAuthorized(request))
    return Response.json(
      { error: 'Worker authentication required' },
      { status: 401, headers: { ...headers, 'WWW-Authenticate': 'Bearer' } },
    )
  noteWorkerSeen()
  let body: ProcessingRequest
  try {
    const raw = await readResponseBodyWithLimit(new Response(request.body), 64 * 1024)
    body = JSON.parse(new TextDecoder().decode(raw)) as ProcessingRequest
  } catch {
    return Response.json({ error: 'Invalid processing request' }, { status: 400, headers })
  }
  try {
    if (!body || typeof body !== 'object')
      throw new ProcessingInputError('Expected a request object')
    if (body.action === 'claim') {
      validateMediaCacheKeys(body.cachedMedia)
      const releaseMedia: string[] = []
      const job = await claimNextJob(body.workerId, body.model, body.protocol, body.kinds, (keys) =>
        releaseMedia.push(...keys),
      )
      releaseMedia.push(...reconcileMediaCache(body.cachedMedia))
      return Response.json(
        { job, ...(releaseMedia.length ? { releaseMedia: [...new Set(releaseMedia)] } : {}) },
        { headers },
      )
    }
    if (typeof body.id !== 'string' || typeof body.lease !== 'string')
      throw new ProcessingInputError('A job lease is required')
    if (body.action === 'heartbeat') {
      if (!(await conversionHeartbeat(body.id, body.lease))) {
        if (indexingPaused()) throw new ProcessingConflict('Background indexing paused')
        await heartbeat(body.id, body.lease)
      }
      return Response.json({ ok: true }, { headers })
    }
    if (body.action !== 'fail' && indexingPaused())
      throw new ProcessingConflict('Background indexing paused')
    if (body.action === 'plan')
      return Response.json(
        { video: await planProcessingVideo(body.id, body.lease, body.duration) },
        { headers },
      )
    if (body.action === 'complete') {
      if (!Array.isArray(body.vector)) throw new ProcessingInputError('Expected an embedding')
      const release = cacheReleaseAfter(body.id, body.lease)
      await completeProcessingJob(body.id, body.lease, body.vector)
      return Response.json({ done: true, releaseMedia: release() }, { headers })
    }
    if (body.action === 'extracted') {
      if (body.text !== null && typeof body.text !== 'string')
        throw new ProcessingInputError('Expected words or null')
      const release = cacheReleaseAfter(body.id, body.lease)
      await completeExtractJob(body.id, body.lease, body.text, body.language)
      return Response.json({ done: true, releaseMedia: release() }, { headers })
    }
    if (body.action === 'segment') {
      if (!Array.isArray(body.vector) || !Number.isInteger(body.index))
        throw new ProcessingInputError('Expected a segment embedding')
      const release = cacheReleaseAfter(body.id, body.lease)
      const done = await completeVideoSegment(body.id, body.lease, body.index, body.vector)
      return Response.json({ done, releaseMedia: release() }, { headers })
    }
    if (
      body.action === 'fail' &&
      (body.code === 'retry' || body.code === 'none') &&
      typeof body.error === 'string'
    ) {
      if (!(await conversionFailure(body.id, body.lease, body.error))) {
        if (indexingPaused()) throw new ProcessingConflict('Background indexing paused')
        const release = cacheReleaseAfter(body.id, body.lease)
        await failProcessingJob(body.id, body.lease, body.code, body.error)
        return Response.json({ ok: true, releaseMedia: release() }, { headers })
      }
      return Response.json({ ok: true }, { headers })
    }
    throw new ProcessingInputError('Unknown processing action')
  } catch (error) {
    const conflict = error instanceof ProcessingConflict
    const invalid = error instanceof ProcessingInputError
    if (!conflict && !invalid) console.error('[processing] job request failed')
    return Response.json(
      {
        error: conflict
          ? error.message
          : invalid
            ? 'Invalid processing request'
            : 'Processing temporarily unavailable',
      },
      { status: conflict ? 409 : invalid ? 400 : 503, headers },
    )
  }
}
