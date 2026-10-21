/**
 * `pnpm parity:compare`: put each capture next to its design board and score
 * how far apart they are.
 *
 *   .out/compare/<board>.png         reference | actual (web, 1280×800)
 *   .out/compare-mobile/<board>.png  phone board | mobile web (390×844), when
 *                                    the board names a phone analog
 *   .out/report.json                 every pair with its score and capture notes
 *   .out/report.md                   the same, worst first
 *
 * The score is the mean absolute difference of the two images shrunk to a
 * small greyscale thumbnail, 0 (same) to 100 (opposite). It catches a wrong
 * screen or a missing panel; it can't judge type, spacing or polish. Look at
 * the side-by-sides.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { PARITY_OUT, PARITY_REF_DIR } from './env'

const THUMB = { width: 160, height: 100 }
const PHONE_THUMB = { width: 78, height: 169 }
const GAP = 24
const LABEL = 36

interface CaptureNote {
  board: string
  project: string
  member: string
  url: string
  shows: string
  phone: string | null
  reached: string[]
  missed: string[]
  known: string[]
}

interface Pair {
  board: string
  kind: 'web' | 'web-mobile'
  reference: string
  actual: string
  compare: string
  score: number
  member?: string
  url?: string
  shows?: string
  missed: string[]
  known: string[]
}

async function score(
  a: string,
  b: string,
  size: { width: number; height: number },
): Promise<number> {
  const grey = (file: string) =>
    sharp(file)
      .flatten({ background: '#000' })
      .resize(size.width, size.height, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer()
  const [x, y] = await Promise.all([grey(a), grey(b)])
  let sum = 0
  for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i])
  return Math.round((sum / x.length / 255) * 1000) / 10
}

function label(text: string, width: number): Buffer {
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL}">` +
      `<text x="8" y="24" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="#f4f1ea">${safe}</text></svg>`,
  )
}

/** reference | actual, the actual scaled to the reference's size. */
async function sideBySide(reference: string, actual: string, out: string, names: [string, string]) {
  const ref = await sharp(reference).metadata()
  const width = ref.width ?? 1280
  const height = ref.height ?? 800
  const act = await sharp(actual)
    .resize(width, height, { fit: 'contain', background: '#000' })
    .png()
    .toBuffer()
  const refPng = await sharp(reference).png().toBuffer()
  fs.mkdirSync(path.dirname(out), { recursive: true })
  await sharp({
    create: {
      width: width * 2 + GAP,
      height: height + LABEL,
      channels: 3,
      background: '#1a1814',
    },
  })
    .composite([
      { input: label(names[0], width), left: 0, top: 0 },
      { input: label(names[1], width), left: width + GAP, top: 0 },
      { input: refPng, left: 0, top: LABEL },
      { input: act, left: width + GAP, top: LABEL },
    ])
    .png()
    .toFile(out)
}

function readNote(dir: string, board: string): CaptureNote | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, `${board}.json`), 'utf8')) as CaptureNote
  } catch {
    return null
  }
}

async function main() {
  if (!fs.existsSync(PARITY_REF_DIR)) {
    console.error(`[parity] no reference boards at ${PARITY_REF_DIR} (set PARITY_REF_DIR)`)
    process.exit(1)
  }
  const pairs: Pair[] = []
  const unmatched: string[] = []

  const webDir = path.join(PARITY_OUT, 'web')
  for (const file of fs.existsSync(webDir) ? fs.readdirSync(webDir).sort() : []) {
    if (!file.endsWith('.png')) continue
    const board = file.replace(/\.png$/, '')
    const reference = path.join(PARITY_REF_DIR, file)
    if (!fs.existsSync(reference)) {
      unmatched.push(`web/${file}`)
      continue
    }
    const actual = path.join(webDir, file)
    const out = path.join(PARITY_OUT, 'compare', file)
    await sideBySide(reference, actual, out, [`design · ${board}`, 'app · web'])
    const note = readNote(webDir, board)
    pairs.push({
      board,
      kind: 'web',
      reference,
      actual,
      compare: out,
      score: await score(reference, actual, THUMB),
      member: note?.member,
      url: note?.url,
      shows: note?.shows,
      missed: note?.missed ?? [],
      known: note?.known ?? [],
    })
  }

  const mobileDir = path.join(PARITY_OUT, 'web-mobile')
  for (const file of fs.existsSync(mobileDir) ? fs.readdirSync(mobileDir).sort() : []) {
    if (!file.endsWith('.png')) continue
    const board = file.replace(/\.png$/, '')
    const note = readNote(mobileDir, board)
    if (!note?.phone) continue
    const reference = path.join(PARITY_REF_DIR, `${note.phone}.png`)
    if (!fs.existsSync(reference)) {
      unmatched.push(`web-mobile/${file} (phone board ${note.phone})`)
      continue
    }
    const actual = path.join(mobileDir, file)
    const out = path.join(PARITY_OUT, 'compare-mobile', file)
    await sideBySide(reference, actual, out, [`design · ${note.phone}`, 'app · mobile web'])
    pairs.push({
      board,
      kind: 'web-mobile',
      reference,
      actual,
      compare: out,
      score: await score(reference, actual, PHONE_THUMB),
      member: note.member,
      url: note.url,
      shows: note.shows,
      missed: note.missed,
      known: note.known,
    })
  }

  pairs.sort((a, b) => b.score - a.score)
  const report = {
    generatedAt: new Date().toISOString(),
    referenceDir: PARITY_REF_DIR,
    pairs,
    unmatched,
  }
  fs.writeFileSync(path.join(PARITY_OUT, 'report.json'), JSON.stringify(report, null, 2))

  const rel = (p: string) => path.relative(PARITY_OUT, p)
  const lines = [
    '# Design parity report',
    '',
    `Generated ${report.generatedAt}. Score: mean absolute difference of small greyscale thumbnails, 0 = same, 100 = opposite. A guide only; judge the side-by-sides by eye.`,
    '',
  ]
  for (const kind of ['web', 'web-mobile'] as const) {
    const rows = pairs.filter((p) => p.kind === kind)
    if (!rows.length) continue
    lines.push(
      kind === 'web'
        ? '## Web (1280×800) vs the web boards'
        : '## Mobile web (390×844) vs the closest phone board',
      '',
      '| Score | Board | As | URL | Side by side | Not reached |',
      '| ---: | --- | --- | --- | --- | --- |',
    )
    for (const p of rows) {
      const gaps = [...p.missed, ...p.known].map((g) => g.replace(/\|/g, '/')).join('<br>')
      lines.push(
        `| ${p.score.toFixed(1)} | ${p.board} | ${p.member ?? ''} | \`${p.url ?? ''}\` | [${rel(p.compare)}](${rel(p.compare)}) | ${gaps} |`,
      )
    }
    lines.push('')
  }
  if (unmatched.length) lines.push('## No reference', '', ...unmatched.map((u) => `- ${u}`), '')
  fs.writeFileSync(path.join(PARITY_OUT, 'report.md'), lines.join('\n'))

  console.log(`[parity] ${pairs.length} pairs → ${path.join(PARITY_OUT, 'report.md')}`)
  for (const p of pairs.filter((x) => x.kind === 'web').slice(0, 5)) {
    console.log(`  ${p.score.toFixed(1).padStart(5)}  ${p.board}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
