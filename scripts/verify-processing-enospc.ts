/** Optional macOS-only rehearsal: exhaust a disposable 64 MiB image, never the host disk. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, type ReadStream } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  statfs,
  writeFile,
  type FileHandle,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'

const exec = promisify(execFile)
const MIB = 1024 ** 2
const reportPath =
  process.env['ADHX_ENOSPC_REPORT_PATH'] ||
  path.join(os.tmpdir(), 'adhx-processing-enospc-report.json')
type Entity = { 'dev-entry'?: string; 'mount-point'?: string }
type Image = { 'image-path'?: string; 'system-entities'?: Entity[] }

async function verify() {
  if (process.platform !== 'darwin')
    throw new Error(
      'This optional rehearsal requires macOS and hdiutil; it never mounts a host filesystem.',
    )
  const root = await mkdtemp(path.join(os.tmpdir(), 'adhx-enospc-'))
  const image = path.join(root, 'scratch.dmg')
  const mount = path.join(root, 'mount')
  const source = path.join(root, 'retained-original.bin')
  const report: Record<string, unknown> = {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    imageBytes: 64 * MIB,
  }
  const abort = new AbortController()
  let runner: { close(): void; runOnce(): Promise<boolean> } | undefined
  let mediaStream: ReadStream | undefined
  let filePrototype: { writeFile: FileHandle['writeFile'] } | undefined
  let originalWrite: FileHandle['writeFile'] | undefined
  let attachAttempted = false
  let canonicalImage = ''
  let failure: unknown
  const stop = () => {
    abort.abort()
    runner?.close()
    mediaStream?.destroy()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  const plistJson = async <T>(plist: string, name: string): Promise<T> => {
    const file = path.join(root, name)
    await writeFile(file, plist)
    return JSON.parse(
      (await exec('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], { timeout: 10_000 }))
        .stdout,
    ) as T
  }
  const attachedImage = async (): Promise<Image | undefined> => {
    const info = await exec('/usr/bin/hdiutil', ['info', '-plist'], { timeout: 20_000 })
    const parsed = await plistJson<{ images?: Image[] }>(info.stdout, 'info.plist')
    return parsed.images?.find(
      (entry) => entry['image-path'] === canonicalImage || entry['image-path'] === image,
    )
  }

  try {
    const hostDisk = await statfs(root)
    assert(
      hostDisk.bavail * hostDisk.bsize >= 2 * 1024 ** 3,
      'Refusing to create the bounded fixture with less than 2 GiB free on the host',
    )
    await mkdir(mount)
    await exec(
      '/usr/bin/hdiutil',
      [
        'create',
        '-size',
        '64m',
        '-fs',
        'HFS+',
        '-volname',
        'ADHX Verify ENOSPC',
        '-nospotlight',
        image,
      ],
      { timeout: 60_000, signal: abort.signal },
    )
    canonicalImage = await realpath(image)
    attachAttempted = true
    const attach = await exec(
      '/usr/bin/hdiutil',
      ['attach', '-plist', '-nobrowse', '-noautoopen', '-mountpoint', mount, image],
      { timeout: 60_000, signal: abort.signal },
    )
    const parsed = await plistJson<{ 'system-entities': Entity[] }>(attach.stdout, 'attach.plist')
    const canonicalMount = await realpath(mount)
    assert(
      parsed['system-entities'].some((entry) => entry['mount-point'] === canonicalMount),
      'Image must be mounted at the exact private fixture path',
    )
    const host = await stat(root)
    assert.notEqual(
      (await stat(mount)).dev,
      host.dev,
      'Refusing to fill a directory on the host filesystem',
    )
    const disk = await statfs(mount)
    const capacity = disk.blocks * disk.bsize
    assert(
      capacity >= 32 * MIB && capacity <= 80 * MIB,
      'Refusing to fill any filesystem larger than the bounded test image',
    )
    const fillBytes = Math.floor((disk.bavail * disk.bsize - 4 * MIB) / MIB) * MIB
    assert(fillBytes > 0 && fillBytes <= 64 * MIB)
    const filler = await open(path.join(mount, 'filler.bin'), 'wx')
    try {
      const block = Buffer.alloc(MIB, 0x55)
      for (let written = 0; written < fillBytes; written += block.length) {
        abort.signal.throwIfAborted()
        await filler.writeFile(block)
      }
      await filler.sync()
    } finally {
      await filler.close()
    }
    const available = (await statfs(mount)).bavail * disk.bsize
    assert(available >= MIB && available < 6 * MIB)
    await writeFile(source, Buffer.alloc(16 * MIB, 0x6a))
    const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
    const sourceHash = hash(await readFile(source))

    // Both explicit database selectors must point at the fixture before any
    // processing import can initialize SQLite. Never read an installed .env.
    process.env['DATABASE_PATH'] = path.join(root, 'fixture.sqlite')
    process.env['ADHX_DATABASE_PATH'] = process.env['DATABASE_PATH']
    process.env['MEDIA_DIR'] = path.join(root, 'unused-media')
    process.env['SEMANTIC_CACHE_DIR'] = path.join(root, 'unused-models')
    process.env['PROCESSING_MODE'] = 'remote'
    process.env['SEMANTIC_SEARCH'] = 'off'
    process.env['KEEP_MEDIA'] = 'off'
    process.env['SEMANTIC_SPEECH'] = 'off'
    process.env['SEMANTIC_SCREEN_TEXT'] = 'off'
    process.env['SENTRY_DSN'] = ''
    process.env['NEXT_PUBLIC_SENTRY_DSN'] = ''
    const { FULL_SCHEMA_SQL } = await import('../src/__tests__/api/setup')
    const { UNDERSTANDING_DDL } = await import('../src/lib/semantic/schema-sql')
    const fixtureDb = new Database(process.env['DATABASE_PATH'])
    try {
      fixtureDb.exec(FULL_SCHEMA_SQL)
      fixtureDb.exec(UNDERSTANDING_DDL)
    } finally {
      fixtureDb.close()
    }
    const { createMacRunner } = await import('../src/lib/processing/mac-runner')
    const { SEMANTIC_MODEL_VERSION } = await import('../src/lib/semantic/config')

    // This observer records the actual OS error; it delegates every write to
    // Node's original method and never injects or substitutes an ENOSPC result.
    const controlPath = path.join(mount, 'writable-check')
    const control = await open(controlPath, 'wx')
    try {
      await control.writeFile('writable')
      filePrototype = Object.getPrototypeOf(control) as typeof filePrototype
    } finally {
      await control.close()
      await rm(controlPath)
    }
    assert(filePrototype)
    originalWrite = filePrototype.writeFile
    let enospc = 0,
      modelCalls = 0
    filePrototype.writeFile = async function (
      this: FileHandle,
      ...args: Parameters<FileHandle['writeFile']>
    ) {
      try {
        return await originalWrite!.apply(this, args)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOSPC') enospc++
        throw error
      }
    }
    const actions: Array<{ action: string; code?: string }> = []
    const cacheDir = path.join(mount, 'worker-cache')
    const job = {
      id: randomUUID(),
      lease: 'l'.repeat(43),
      kind: 'image',
      model: SEMANTIC_MODEL_VERSION,
      contentHash: sourceHash,
      profile: 'normal',
      media: { path: '/api/files/fixture', mime: 'image/png', bytes: 16 * MIB },
    }
    runner = createMacRunner(
      {
        serverUrl: 'https://adhx.example.com',
        token: 't'.repeat(43),
        workerId: 'bounded-enospc-check',
        cacheDir,
        maxFileBytes: 32 * MIB,
        maxCacheBytes: 64 * MIB,
        pollMs: 1000,
      },
      {
        processor: {
          async run() {
            modelCalls++
            throw new Error('The model must not run after an incomplete download')
          },
          close() {},
        },
        async fetch(input, options) {
          abort.signal.throwIfAborted()
          const url = new URL(String(input))
          if (url.pathname === '/api/processing/media') {
            mediaStream = createReadStream(source)
            return new Response(Readable.toWeb(mediaStream) as ReadableStream)
          }
          assert.equal(url.pathname, '/api/processing/jobs')
          const body = JSON.parse(String(options?.body)) as { action: string; code?: string }
          actions.push(body)
          return body.action === 'claim' ? Response.json({ job }) : Response.json({ ok: true })
        },
        log() {},
      },
    )
    assert.equal(await runner.runOnce(), true)
    runner.close()
    runner = undefined
    filePrototype.writeFile = originalWrite
    assert(enospc >= 1, 'Must observe actual OS ENOSPC from the worker download write')
    assert.equal(modelCalls, 0)
    assert(actions.some((action) => action.action === 'fail' && action.code === 'retry'))
    assert(!actions.some((action) => action.action === 'fail' && action.code === 'none'))
    assert(!actions.some((action) => ['complete', 'segment', 'extracted'].includes(action.action)))
    assert.deepEqual(await readdir(cacheDir), [])
    assert.equal(hash(await readFile(source)), sourceHash)
    Object.assign(report, {
      capacityBytes: capacity,
      availableBeforeBytes: available,
      sourceBytes: 16 * MIB,
      actualWriteError: 'ENOSPC',
      writeErrorCount: enospc,
      modelCalls,
      failedRetryAcknowledged: true,
      falseSuccess: false,
      partialFilesRemaining: 0,
      originalUnchanged: true,
      adapter:
        'synthetic claim and streamed local retained-file response; real runner and OS filesystem writes',
    })
  } catch (error) {
    failure = error
    report.error = error instanceof Error ? error.message : String(error)
  } finally {
    runner?.close()
    mediaStream?.destroy()
    if (filePrototype && originalWrite) filePrototype.writeFile = originalWrite
    try {
      if (attachAttempted) {
        const ours = await attachedImage()
        if (ours) {
          // Select only a device returned for our exact newly-created image.
          const device = ours['system-entities']?.find((entry) =>
            /^\/dev\/disk\d+$/.test(entry['dev-entry'] || ''),
          )?.['dev-entry']
          assert(
            device,
            'Unable to identify the disposable image device; leaving it for inspection',
          )
          try {
            await exec('/usr/bin/hdiutil', ['detach', device], { timeout: 30_000 })
          } catch {
            await exec('/usr/bin/hdiutil', ['detach', '-force', device], { timeout: 30_000 })
          }
          assert.equal(
            await attachedImage(),
            undefined,
            'Disposable image must be detached before deleting its directory',
          )
        }
        assert.equal(
          (await stat(mount)).dev,
          (await stat(root)).dev,
          'Refusing to recursively remove a mounted filesystem',
        )
        report.detached = true
      }
      await rm(root, { recursive: true, force: true })
      report.fixtureRemoved = true
    } catch (error) {
      failure ??= error
      report.cleanupError = error instanceof Error ? error.message : String(error)
    }
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    process.stdout.write(`ENOSPC report: ${reportPath}\n${JSON.stringify(report, null, 2)}\n`)
  }
  if (failure) throw failure
}

verify().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
