/** Synthetic local-only comparison. No worker credential, media or server is used. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { sampleNativeFrames } from '../src/lib/processing/mac-runner'
import { createVideoPlan } from '../src/lib/processing/profiles'
import { sampleBatchedFrames } from './experiments/batched-frames'

const exec = promisify(execFile)
const binary = process.env['FFMPEG_PATH']
assert(binary && path.isAbsolute(binary), 'Set an absolute FFMPEG_PATH')
const root = await mkdtemp(path.join(os.tmpdir(), 'adhx-extraction-'))
const results: Record<string, unknown>[] = []
try {
  os.setPriority(10)
  for (const fixture of [
    { name: 'motion-1080p', duration: 60, rate: 24 },
    { name: 'low-fps-ending', duration: 2, rate: 0.5 },
  ]) {
    const file = path.join(root, `${fixture.name}.mp4`)
    await exec(
      binary,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `testsrc2=size=1920x1080:rate=${fixture.rate}`,
        '-t',
        String(fixture.duration),
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-threads',
        '1',
        '-pix_fmt',
        'yuv420p',
        file,
      ],
      { timeout: 120_000, maxBuffer: 64 * 1024 },
    )
    const plan = createVideoPlan(fixture.duration, 'normal')
    for (let repeat = 0; repeat < 3; repeat++) {
      // Reverse order on alternating runs so filesystem warm-up is shared.
      const modes = repeat % 2 ? ['batch', 'reference'] : ['reference', 'batch']
      const samples: Record<string, Buffer[]> = {}
      for (const mode of modes) {
        const start = performance.now()
        const signal = AbortSignal.timeout(120_000)
        const sample: { files: string[]; cleanup: () => Promise<void>; fallback: boolean } =
          mode === 'reference'
            ? { ...(await sampleNativeFrames(file, plan, 0, signal, root)), fallback: false }
            : await sampleBatchedFrames(file, plan, 0, signal, root, binary)
        const milliseconds = performance.now() - start
        try {
          samples[mode] = await Promise.all(
            sample.files.map((frame) => sharp(frame).removeAlpha().raw().toBuffer()),
          )
          assert.equal(sample.files.length, plan.framesPerSegment)
          results.push({
            fixture: fixture.name,
            repeat,
            mode,
            milliseconds,
            frames: sample.files.length,
            fallback: sample.fallback,
          })
        } finally {
          await sample.cleanup()
        }
      }
      const differences = samples.reference.map(
        (frame, index) =>
          frame.reduce((sum, value, i) => sum + Math.abs(value - samples.batch[index][i]), 0) /
          frame.length,
      )
      results.push({ fixture: fixture.name, repeat, pixelMeanAbsoluteDifference: differences })
    }
  }
} finally {
  await rm(root, { recursive: true, force: true })
  const output =
    process.env['ADHX_BENCH_REPORT'] || path.join(os.tmpdir(), 'adhx-extraction-benchmark.json')
  await writeFile(
    output,
    JSON.stringify(
      { timestamp: new Date().toISOString(), results, fixtureRemoved: true },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  )
  process.stdout.write(`Extraction benchmark report: ${output}\n`)
}
