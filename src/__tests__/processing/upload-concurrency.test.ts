import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readdir, rm, stat, utimes } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  statfs: vi.fn(),
  conversionMedia: vi.fn(),
  completeConversionUpload: vi.fn(),
}))
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  statfs: mocks.statfs,
}))
vi.mock('@/lib/processing/conversion', () => mocks)
vi.mock('@/lib/db', () => ({ db: {}, runInTransaction: (fn: () => unknown) => fn() }))
import { PUT } from '@/app/api/processing/result/route'

let root: string
const token = 't'.repeat(43)
const ids = ['12345678-1234-1234-1234-123456789abc', '12345678-1234-1234-1234-123456789def']
const disk = { bavail: 5 * 1024 ** 3, bsize: 1 }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function pendingRequest(id: string, bytes: number) {
  const abort = new AbortController()
  const stream = new ReadableStream<Uint8Array>()
  const request = new Request(`https://adhx.example.com/api/processing/result?id=${id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-ADHX-Lease': 'l'.repeat(43),
      'Content-Type': 'video/mp4',
      'Content-Length': String(bytes),
    },
    body: stream,
    signal: abort.signal,
    duplex: 'half',
  } as RequestInit)
  return { request, abort }
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'adhx-upload-concurrency-'))
  vi.stubEnv('MEDIA_DIR', root)
  vi.stubEnv('PROCESSING_MODE', 'remote')
  vi.stubEnv('PROCESSING_WORKER_TOKEN', token)
  vi.stubEnv('KEEP_MIN_FREE_GB', '0')
  mocks.statfs.mockReset().mockResolvedValue(disk)
  mocks.conversionMedia.mockResolvedValue({
    file: path.join(root, 'original'),
    mime: 'video/mp4',
    bytes: 4,
  })
  mocks.completeConversionUpload.mockResolvedValue(undefined)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  await rm(root, { recursive: true, force: true })
})

describe('conversion upload disk reservations', () => {
  it('reserves a pending 4 GiB upload across filesystem awaits before accepting another', async () => {
    const entered = deferred<void>()
    const release = deferred<void>()
    mocks.statfs.mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
      return disk
    })
    const first = pendingRequest(ids[0], 4 * 1024 ** 3)
    const second = pendingRequest(ids[1], 4 * 1024 ** 3)
    const consumed = deferred<'read'>()
    const getReader = second.request.body!.getReader.bind(second.request.body!)
    vi.spyOn(second.request.body!, 'getReader').mockImplementation(() => {
      consumed.resolve('read')
      return getReader()
    })
    const firstResult = PUT(first.request)
    let secondResult: Promise<Response> | undefined
    try {
      await entered.promise
      secondResult = PUT(second.request)
      const outcome = await Promise.race([
        secondResult.then((response) => response.status),
        consumed.promise,
      ])
      expect(outcome).toBe(503)
      expect(mocks.completeConversionUpload).not.toHaveBeenCalled()
    } finally {
      first.abort.abort()
      second.abort.abort()
      release.resolve()
      await firstResult
      await secondResult
    }
    expect(await readdir(path.join(root, '.worker-uploads'))).toEqual([])
  })

  it('does not sweep an active partial upload even when its timestamp looks abandoned', async () => {
    const first = pendingRequest(ids[0], 4)
    const firstResult = PUT(first.request)
    try {
      let partial = ''
      await vi.waitFor(async () => {
        const names = await readdir(path.join(root, '.worker-uploads'))
        expect(names).toHaveLength(1)
        partial = path.join(root, '.worker-uploads', names[0])
      })
      const old = new Date(Date.now() - 2 * 60 * 60_000)
      await utimes(partial, old, old)
      const second = pendingRequest(ids[1], 4)
      const secondRequest = new Request(second.request, { body: new Uint8Array([1, 2, 3, 4]) })
      expect((await PUT(secondRequest)).status).toBe(200)
      expect((await stat(partial)).isFile()).toBe(true)
      expect(mocks.completeConversionUpload).toHaveBeenCalledTimes(1)
    } finally {
      first.abort.abort()
      await firstResult
    }
    expect(await readdir(path.join(root, '.worker-uploads'))).toEqual([])
  })
})
