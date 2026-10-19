/**
 * Real-model smoke test for speech and on-screen text, outside the app:
 *
 *   SEMANTIC_CACHE_DIR=/tmp/adhx-models pnpm tsx scripts/smoke-extract.ts \
 *     speech clip.mp4 [more.mp4 …] | screen meme.jpg [shot.png …] [--video clip.mp4]
 *
 * Downloads the pinned weights into SEMANTIC_CACHE_DIR on first use, runs
 * them in the same extract process the worker uses, and prints the cleaned
 * words, the time taken and the extract process's peak memory.
 */
import { execFileSync } from 'node:child_process'
import { probeMedia } from '../src/lib/keep/probe'
import { readScreenText, transcribeSource } from '../src/lib/semantic/extract-media'
import { ExtractorProcess } from '../src/lib/semantic/extractor'

const [mode, ...rest] = process.argv.slice(2)
if (mode !== 'speech' && mode !== 'screen') {
  console.error('usage: smoke-extract.ts speech <files…> | screen <images…> [--video file]')
  process.exit(2)
}

const extractor = new ExtractorProcess()
let peak = 0
const sampler = setInterval(() => {
  const pid = extractor.pid
  if (!pid) return
  try {
    const kb = Number(
      execFileSync('ps', ['-o', 'rss=', '-p', String(pid)])
        .toString()
        .trim(),
    )
    peak = Math.max(peak, kb)
  } catch {
    /* exited */
  }
}, 200)

const mb = (kb: number) => `${Math.round(kb / 1024)} MB`

async function main() {
  const run = (task: Parameters<ExtractorProcess['run']>[0], signal?: AbortSignal) =>
    extractor.run(task, signal)
  if (mode === 'speech') {
    for (const file of rest) {
      const started = Date.now()
      const heard = await transcribeSource(file, run, { localOnly: true })
      const seconds = ((await probeMedia(file)).durationMs ?? 0) / 1000
      console.log(
        JSON.stringify({
          file,
          seconds,
          ms: Date.now() - started,
          language: heard?.language ?? null,
          text: heard?.text ?? null,
        }),
      )
    }
  } else {
    const at = rest.indexOf('--video')
    const video = at >= 0 ? rest[at + 1] : null
    const images = at >= 0 ? rest.slice(0, at) : rest
    for (const image of images) {
      const started = Date.now()
      const text = await readScreenText([image], null, run, { localOnly: true })
      console.log(JSON.stringify({ image, ms: Date.now() - started, text }))
    }
    if (video) {
      const started = Date.now()
      const seconds = ((await probeMedia(video)).durationMs ?? 0) / 1000
      const text = await readScreenText([], { source: video, duration: seconds }, run, {
        localOnly: true,
      })
      console.log(JSON.stringify({ video, ms: Date.now() - started, text }))
    }
  }
  console.log(`extract process peak RSS: ${mb(peak)}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    clearInterval(sampler)
    extractor.close()
  })
