/** Explicit synthetic-only API smoke test. Never reads library data or contacts a server. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { askJevImages } from '../src/lib/semantic/jev-images'
import {
  sampleMembers,
  visualQuestions,
  interpretVisualAnswers,
} from '../src/lib/channels/visual-policy'
import { CHANNEL_NAMES } from '../src/lib/channels/names'

async function main() {
  const samples = sampleMembers(Array.from({ length: 8 }, (_, i) => `synthetic:${i}`)).map(
    (sample) => ({ ...sample, canExclude: true }),
  )
  const posts = []
  for (const sample of samples) {
    const food = sample.id === 'p7'
    const art = food
      ? '<circle cx="224" cy="230" r="130" fill="white"/><path d="M160 190 Q300 120 290 260 Q180 340 155 230" stroke="orange" stroke-width="32" fill="none"/>'
      : '<path d="M100 210 L105 80 L190 150 L260 150 L345 80 L345 230" fill="#cd985e"/><ellipse cx="224" cy="250" rx="130" ry="110" fill="#cd985e"/><circle cx="175" cy="230" r="14"/><circle cx="270" cy="230" r="14"/><path d="M210 270 L240 270 L224 290 Z" fill="pink"/>'
    const label = food ? 'Pasta recipe' : 'Funny cats'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="448" height="448"><rect width="448" height="448" fill="#ddd"/>${art}<text x="224" y="414" text-anchor="middle" font-size="32">${label}</text></svg>`
    posts.push({
      id: sample.id,
      words: food ? 'Making pasta for dinner' : 'A funny cat illustration',
      jpeg: await sharp(Buffer.from(svg)).jpeg({ quality: 68 }).toBuffer(),
    })
  }
  const started = performance.now()
  const answers = await askJevImages(posts, visualQuestions(samples, [...CHANNEL_NAMES], 'Cats'))
  const result = interpretVisualAnswers(samples, [...CHANNEL_NAMES], answers)
  const report = {
    timestamp: new Date().toISOString(),
    syntheticOnly: true,
    milliseconds: performance.now() - started,
    answers,
    result,
  }
  const filename =
    process.env['ADHX_CHANNEL_SMOKE_REPORT'] ||
    path.join(os.tmpdir(), 'adhx-channel-images-smoke.json')
  await writeFile(filename, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  assert(Object.keys(answers).length > 0, 'Provider returned no answers')
  process.stdout.write(
    `${JSON.stringify({ syntheticOnly: true, milliseconds: report.milliseconds, decisions: result, report: filename })}\n`,
  )
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Synthetic image smoke failed')
  process.exitCode = 1
})
