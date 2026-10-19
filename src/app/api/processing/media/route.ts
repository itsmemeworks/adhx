import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { workerAuthorized, workerHeaders } from '@/lib/processing/auth'
import { processingMedia, ProcessingConflict } from '@/lib/processing/jobs'
import { conversionMedia } from '@/lib/processing/conversion'
import { indexingPaused } from '@/lib/processing/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const headers: Record<string, string> = workerHeaders()
  if (!workerAuthorized(request))
    return Response.json({ error: 'Worker authentication required' }, { status: 401, headers })
  try {
    const params = new URL(request.url).searchParams
    const id = params.get('id') || ''
    const slot = params.get('slot')
    if (slot !== null && !/^(?:(?:video|photo|audio)-[1-9]\d?|poster)$/.test(slot))
      throw new ProcessingConflict('Unknown media slot')
    const lease = request.headers.get('x-adhx-lease') || ''
    const conversion = await conversionMedia(id, lease)
    if (!conversion && indexingPaused()) throw new ProcessingConflict('Background indexing paused')
    const media = conversion ?? (await processingMedia(id, lease, slot))
    const info = await stat(media.file)
    if (!info.isFile() || info.size !== media.bytes)
      throw new ProcessingConflict('Retained media changed')
    headers['Content-Type'] = media.mime
    headers['Accept-Ranges'] = 'bytes'
    let start = 0,
      end = info.size - 1,
      status = 200
    const range = request.headers.get('range')
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!m || (!m[1] && !m[2]))
        return new Response(null, {
          status: 416,
          headers: { ...headers, 'Content-Range': `bytes */${info.size}` },
        })
      if (!m[1]) {
        const suffix = Number(m[2])
        start = Math.max(0, info.size - suffix)
      } else {
        start = Number(m[1])
        if (m[2]) end = Math.min(end, Number(m[2]))
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start > end ||
        start >= info.size
      )
        return new Response(null, {
          status: 416,
          headers: { ...headers, 'Content-Range': `bytes */${info.size}` },
        })
      status = 206
      headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`
    }
    headers['Content-Length'] = String(end - start + 1)
    const stream = createReadStream(media.file, { start, end })
    const abort = () => stream.destroy()
    if (request.signal.aborted) abort()
    else request.signal.addEventListener('abort', abort, { once: true })
    stream.once('close', () => request.signal.removeEventListener('abort', abort))
    return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers })
  } catch (error) {
    return Response.json(
      { error: 'Media lease is unavailable' },
      { status: error instanceof ProcessingConflict ? 409 : 404, headers },
    )
  }
}
