import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ExtractorProcess } from '@/lib/semantic/extractor'

/**
 * The extract process is a real child here, but a stand-in that answers
 * with fixed words: no model, no download. It reports its pid so the test
 * can see one process per model kind.
 */
const FAKE = `
process.on('disconnect', () => process.exit(0))
process.on('message', (request) => {
  const { id, task } = request
  if (task.file === 'boom') return process.send({ id, error: 'model failed' })
  if (task.file === 'hang') return
  if (task.kind === 'speech')
    process.send({ id, windows: [{ text: 'pid ' + process.pid,
      language: process.env.ADHX_WORKER_TOKEN ? 'leaked' : 'en', noSpeech: 0 }] })
  else process.send({ id, reads: task.files.map(() => ({ width: 1, height: 1, lines: [{ text: String(process.pid), box: [] }] })) })
})
`

let dir: string
let extractor: ExtractorProcess

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'adhx-extractor-'))
  const entry = path.join(dir, 'fake-child.mjs')
  await writeFile(entry, FAKE)
  vi.stubEnv('ADHX_EXTRACT_CHILD_ENTRY', entry)
  vi.stubEnv('ADHX_WORKER_TOKEN', 'secret-token')
  extractor = new ExtractorProcess()
})
afterEach(async () => {
  extractor.close()
  vi.unstubAllEnvs()
  await rm(dir, { recursive: true, force: true })
})

describe('the extract process', () => {
  it('keeps one process per model kind and swaps it when the kind changes', async () => {
    const first = await extractor.run({ kind: 'speech', file: 'a.f32' })
    const again = await extractor.run({ kind: 'speech', file: 'b.f32' })
    expect(first.windows?.[0].text).toBe(again.windows?.[0].text)
    // The machine credential never reaches a model process.
    expect(first.windows?.[0].language).toBe('en')
    const speechPid = extractor.pid
    const screen = await extractor.run({ kind: 'screen', files: ['a.jpg', 'b.jpg'] })
    expect(screen.reads).toHaveLength(2)
    expect(extractor.pid).not.toBe(speechPid)
    expect(screen.reads?.[0].lines[0].text).toBe(String(extractor.pid))
  })

  it('runs one task at a time and reports model failures', async () => {
    const running = extractor.run({ kind: 'speech', file: 'a.f32' })
    await expect(extractor.run({ kind: 'speech', file: 'b.f32' })).rejects.toThrow('one extraction')
    await running
    await expect(extractor.run({ kind: 'speech', file: 'boom' })).rejects.toThrow(
      'Extraction failed: model failed',
    )
  })

  it('stops a task on cancel and starts fresh next time', async () => {
    const controller = new AbortController()
    const hung = extractor.run({ kind: 'speech', file: 'hang' }, controller.signal)
    const pid = await vi.waitFor(() => {
      if (!extractor.pid) throw new Error('not started')
      return extractor.pid
    })
    controller.abort()
    await expect(hung).rejects.toThrow('cancelled')
    expect(extractor.pid).toBeUndefined()
    await extractor.run({ kind: 'speech', file: 'a.f32' })
    expect(extractor.pid).not.toBe(pid)
  })
})
