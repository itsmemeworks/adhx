import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const mocks = vi.hoisted(() => ({ conversionMedia: vi.fn(), completeConversionUpload: vi.fn() }))
vi.mock('@/lib/processing/conversion', () => mocks)
vi.mock('@/lib/db', () => ({ db: {}, runInTransaction: (fn: () => unknown) => fn() }))
import { PUT } from '@/app/api/processing/result/route'
import { ProcessingConflict } from '@/lib/processing/jobs'

let root: string
const token = 't'.repeat(43)
const id = '12345678-1234-1234-1234-123456789abc'

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'adhx-upload-'))
  vi.stubEnv('MEDIA_DIR', root)
  vi.stubEnv('PROCESSING_MODE', 'remote')
  vi.stubEnv('PROCESSING_WORKER_TOKEN', token)
  vi.stubEnv('KEEP_MIN_FREE_GB', '0')
  mocks.conversionMedia.mockResolvedValue({
    file: path.join(root, 'original.mp4'),
    mime: 'video/mp4',
    bytes: 4,
  })
  mocks.completeConversionUpload.mockResolvedValue(undefined)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  await rm(root, { recursive: true, force: true })
})

function request(
  bytes = new Uint8Array([1, 2, 3, 4]),
  declared = bytes.length,
  credential = token,
) {
  return new Request(`https://adhx.example.com/api/processing/result?id=${id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${credential}`,
      'X-ADHX-Lease': 'l'.repeat(43),
      'Content-Type': 'video/mp4',
      'Content-Length': String(declared),
    },
    body: bytes,
  })
}
const scratch = async () => readdir(path.join(root, '.worker-uploads')).catch(() => [])

describe('bounded converted-media upload', () => {
  it('authenticates and validates the lease before consuming any bytes', async () => {
    const req = request(undefined, 4, 'invalid')
    const read = vi.spyOn(req.body!, 'getReader')
    expect((await PUT(req)).status).toBe(401)
    expect(read).not.toHaveBeenCalled()
    expect(mocks.conversionMedia).not.toHaveBeenCalled()
    mocks.conversionMedia.mockRejectedValueOnce(new ProcessingConflict('Expired lease'))
    expect((await PUT(request())).status).toBe(409)
    expect(await scratch()).toEqual([])
  })
  it.each([3, 5])('rejects a length mismatch (%i) and clears partial output', async (declared) => {
    expect((await PUT(request(undefined, declared))).status).toBe(400)
    expect(mocks.completeConversionUpload).not.toHaveBeenCalled()
    expect(await scratch()).toEqual([])
  })
  it('rejects an oversized declared body without allocating disk', async () => {
    expect((await PUT(request(undefined, 4 * 1024 ** 3 + 1))).status).toBe(413)
    expect(mocks.completeConversionUpload).not.toHaveBeenCalled()
    expect(await scratch()).toEqual([])
  })
  it('acknowledges only after the validated file is handed to the atomic publisher', async () => {
    let checked = false
    mocks.completeConversionUpload.mockImplementationOnce(async (job, lease, file) => {
      expect(job).toBe(id)
      expect(lease).toBe('l'.repeat(43))
      expect(await readFile(file)).toEqual(Buffer.from([1, 2, 3, 4]))
      checked = true
    })
    const response = await PUT(request())
    expect(response.status).toBe(200)
    expect(checked).toBe(true)
    expect(await response.json()).toEqual({ done: true })
    expect(await scratch()).toEqual([])
  })
  it('revalidates after transfer and discards an output whose source was removed', async () => {
    mocks.completeConversionUpload.mockRejectedValueOnce(new ProcessingConflict('Source removed'))
    expect((await PUT(request())).status).toBe(409)
    expect(await scratch()).toEqual([])
  })
})
