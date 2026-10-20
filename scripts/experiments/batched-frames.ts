/** Benchmark prototype only. The deployed sampler remains the reference path. */
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { sampleNativeFrames } from '../../src/lib/processing/mac-runner'
import { segmentBounds, type VideoPlan } from '../../src/lib/processing/profiles'

const exec = promisify(execFile)

export async function sampleBatchedFrames(
  file: string,
  plan: VideoPlan,
  index: number,
  signal: AbortSignal,
  cacheDir: string,
  binary: string,
): Promise<{ files: string[]; cleanup: () => Promise<void>; fallback: boolean }> {
  const { start, end } = segmentBounds(plan, index)
  const span = end - start
  const dir = await mkdtemp(path.join(cacheDir, 'batch-'))
  const cleanup = () => rm(dir, { recursive: true, force: true })
  try {
    await exec(
      binary,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-ss',
        String(start),
        ...(process.platform === 'darwin' ? ['-hwaccel', 'videotoolbox'] : []),
        '-threads',
        '1',
        '-filter_threads',
        '1',
        '-i',
        file,
        '-t',
        String(span),
        '-map',
        '0:v:0',
        '-an',
        '-sn',
        '-vf',
        `select='gte(t,(selected_n+0.5)*${span / plan.framesPerSegment})',scale=448:-2`,
        '-fps_mode',
        'passthrough',
        '-frames:v',
        String(plan.framesPerSegment),
        '-threads:v',
        '1',
        '-q:v',
        '4',
        path.join(dir, '%03d.jpg'),
      ],
      { signal, timeout: 60_000, maxBuffer: 64 * 1024 },
    )
    const files = (await readdir(dir)).filter((name) => /^\d+\.jpg$/.test(name)).sort()
    if (files.length === plan.framesPerSegment)
      return { files: files.map((name) => path.join(dir, name)), cleanup, fallback: false }
  } catch {
    // Clean up before propagating cancellation or using the reference fallback.
  }
  await cleanup()
  signal.throwIfAborted()
  // Low-FPS endings may need the reference sampler's last-GOP fallback.
  return { ...(await sampleNativeFrames(file, plan, index, signal, cacheDir)), fallback: true }
}
