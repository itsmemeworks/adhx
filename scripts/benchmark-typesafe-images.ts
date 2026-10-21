/** One opt-in cloud request containing generated colours only, never a library file. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'

async function main() {
  const token = process.env['TYPESAFE_API_KEY']
  assert(token, 'Set TYPESAFE_API_KEY for this optional synthetic-only test')
  const assets: Record<string, { type: 'image'; part: string }> = {}
  const references: Record<string, string> = {}
  const images: Array<{ part: string; data: Uint8Array }> = []
  for (const colour of ['red', 'green', 'blue']) {
    const ref = randomUUID()
    const data = await sharp({
      create: { width: 320, height: 320, channels: 3, background: colour },
    })
      .jpeg()
      .toBuffer()
    references[colour] = ref
    assets[ref] = { type: 'image', part: colour }
    images.push({ part: colour, data })
  }
  const body = new FormData()
  body.append(
    'request',
    new Blob(
      [
        JSON.stringify({
          model: 'jev-1.14.0',
          state: {
            a: references.red,
            duplicate: references.red,
            changed: references.blue,
            other: references.green,
          },
          assets,
          questions: {
            unchanged: {
              type: 'noul',
              instructions: 'Do a and duplicate have the same visual content?',
            },
            changed: {
              type: 'noul',
              instructions: 'Does changed differ substantially in colour from a?',
            },
            colour: {
              type: 'choice',
              instructions: 'What is the main colour of other?',
              criteria: { red: 'Red', green: 'Green', blue: 'Blue' },
            },
          },
        }),
      ],
      { type: 'application/json' },
    ),
  )
  for (const image of images)
    body.append(
      image.part,
      new Blob([new Uint8Array(image.data)], { type: 'image/jpeg' }),
      `${image.part}.jpg`,
    )
  const start = performance.now()
  const response = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'TypeSafe-Danger-Zone-Images': 'true' },
    body,
    signal: AbortSignal.timeout(30_000),
    redirect: 'error',
  })
  const report = {
    timestamp: new Date().toISOString(),
    status: response.status,
    milliseconds: performance.now() - start,
    syntheticOnly: true,
    response: await response.json(),
  }
  const output = process.env['ADHX_TYPESAFE_REPORT'] || '/tmp/adhx-typesafe-images-benchmark.json'
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  process.stdout.write(`${JSON.stringify(report)}\n`)
  assert(response.ok, `TypeSafe returned ${response.status}; no retry was sent`)
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
