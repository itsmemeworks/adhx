import { randomUUID } from 'node:crypto'
import { mkdir, open, readdir, lstat, rm, statfs } from 'node:fs/promises'
import path from 'node:path'
import { workerAuthorized, workerHeaders } from '@/lib/processing/auth'
import { conversionMedia, completeConversionUpload } from '@/lib/processing/conversion'
import { ProcessingConflict, ProcessingInputError } from '@/lib/processing/jobs'
import { keepMinFreeBytes, mediaDir } from '@/lib/keep/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_UPLOAD = 4 * 1024 ** 3
const SCRATCH_LIMIT = 2 * MAX_UPLOAD
const DEADLINE_MS = 20 * 60_000
const IDLE_MS = 60_000
const PART = /^[a-f0-9-]{36}\.[a-f0-9-]{36}\.part$/
const state = globalThis as unknown as {
  __adhxUploads?: Map<string, { file: string; remaining: number }>
}
const active = (state.__adhxUploads ??= new Map())

async function prepareScratch(directory: string, incoming: number, id: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const busy = (file: string) => [...active.values()].some((upload) => upload.file === file)
  const files: Array<{ file: string; bytes: number; age: number }> = []
  for (const name of await readdir(directory)) {
    if (!PART.test(name)) continue
    const file = path.join(directory, name)
    let info
    try {
      info = await lstat(file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    if (!info.isFile()) continue
    if (!busy(file) && Date.now() - info.mtimeMs > 60 * 60_000) {
      await rm(file, { force: true })
    } else files.push({ file, bytes: info.size, age: info.mtimeMs })
  }
  let used = files.reduce((sum, file) => sum + file.bytes, 0)
  const reserved = [...active.entries()].reduce(
    (sum, [otherId, upload]) => sum + (otherId === id ? 0 : upload.remaining),
    0,
  )
  for (const file of files.sort((a, b) => a.age - b.age)) {
    if (used + reserved + incoming <= SCRATCH_LIMIT) break
    if (busy(file.file)) continue
    await rm(file.file, { force: true })
    used -= file.bytes
  }
  if (used + reserved + incoming > SCRATCH_LIMIT) throw new Error('Upload scratch budget exhausted')
  const disk = await statfs(directory)
  if (disk.bavail * disk.bsize < incoming + reserved + keepMinFreeBytes())
    throw new Error('Insufficient free disk space')
}

/** Stream one leased conversion. File paths and post identity come only from the lease. */
export async function PUT(request: Request): Promise<Response> {
  const headers = workerHeaders()
  if (!workerAuthorized(request))
    return Response.json({ error: 'Worker authentication required' }, { status: 401, headers })
  const id = new URL(request.url).searchParams.get('id') || ''
  const lease = request.headers.get('x-adhx-lease') || ''
  const declared = request.headers.get('content-length') || ''
  const bytes = Number(declared)
  if (!/^\d+$/.test(declared) || !Number.isSafeInteger(bytes) || bytes <= 0)
    return Response.json(
      { error: 'A positive Content-Length is required' },
      { status: 400, headers },
    )
  if (bytes > MAX_UPLOAD)
    return Response.json(
      { error: 'Conversion exceeds the 4 GiB upload limit' },
      { status: 413, headers },
    )
  if (request.headers.get('content-type') !== 'video/mp4' || !request.body)
    return Response.json({ error: 'Expected an MP4 stream' }, { status: 400, headers })

  let temporary: string | undefined
  let ownsSlot = false
  let invalidBody = false
  try {
    if (!(await conversionMedia(id, lease)))
      throw new ProcessingConflict('Invalid conversion lease')
    // Acquire before the first filesystem await, preventing concurrent use of
    // this capability and bounding outstanding disk reservations per process.
    if (active.has(id) || active.size >= 2)
      return Response.json(
        { error: 'Upload already active' },
        { status: 429, headers: { ...headers, 'Retry-After': '30' } },
      )
    active.set(id, { file: '', remaining: bytes })
    ownsSlot = true
    const directory = path.join(mediaDir(), '.worker-uploads')
    await prepareScratch(directory, bytes, id)
    temporary = path.join(directory, `${id}.${randomUUID()}.part`)
    active.set(id, { file: temporary, remaining: bytes })
    // Write-only runtime storage must never be included in the image trace.
    const file = await open(/* turbopackIgnore: true */ temporary, 'wx', 0o600)
    const reader = request.body.getReader()
    const abort = AbortSignal.any([request.signal, AbortSignal.timeout(DEADLINE_MS)])
    const cancel = () => {
      void reader.cancel().catch(() => undefined)
    }
    abort.addEventListener('abort', cancel, { once: true })
    let idle: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    const armIdle = () => {
      clearTimeout(idle)
      idle = setTimeout(() => {
        timedOut = true
        cancel()
      }, IDLE_MS)
      idle.unref?.()
    }
    let received = 0
    try {
      abort.throwIfAborted()
      armIdle()
      for (;;) {
        const chunk = await reader.read()
        abort.throwIfAborted()
        if (timedOut) throw new Error('Upload stalled')
        if (chunk.done) break
        armIdle()
        received += chunk.value.byteLength
        if (received > bytes || received > MAX_UPLOAD) {
          invalidBody = true
          throw new Error('Upload exceeded declared length')
        }
        await file.writeFile(chunk.value)
        active.get(id)!.remaining = bytes - received
      }
      if (received !== bytes) {
        invalidBody = true
        throw new Error('Incomplete upload')
      }
      await file.sync()
    } finally {
      clearTimeout(idle)
      abort.removeEventListener('abort', cancel)
      await reader.cancel().catch(() => undefined)
      await file.close()
    }
    abort.throwIfAborted()
    await completeConversionUpload(id, lease, temporary)
    return Response.json({ done: true }, { headers })
  } catch (error) {
    invalidBody ||= error instanceof ProcessingInputError
    return Response.json(
      {
        error:
          error instanceof ProcessingConflict
            ? error.message
            : invalidBody
              ? 'Invalid conversion upload'
              : 'Conversion upload deferred',
      },
      { status: error instanceof ProcessingConflict ? 409 : invalidBody ? 400 : 503, headers },
    )
  } finally {
    if (temporary) await rm(temporary, { force: true }).catch(() => undefined)
    if (ownsSlot) active.delete(id)
  }
}
