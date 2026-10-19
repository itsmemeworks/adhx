// Runs inside the assembled image with tsx. All data and media are synthetic.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { ffmpegPath } from '../src/lib/media/ffmpeg.ts'
import { mediaDir } from '../src/lib/keep/config.ts'
import { recordKept } from '../src/lib/keep/store.ts'
import { ytdlpDownload } from '../src/lib/keep/ytdlp.ts'
import { sampleVideoFrames } from '../src/lib/semantic/media.ts'
import { rawDb } from '../src/lib/db/index.ts'
import { keywordSearch } from '../src/lib/semantic/keywords.ts'

const mode = process.argv[2]
const origin = 'http://127.0.0.1:3000'
const root = path.join(mediaDir(), 'ci-synthetic')
const movie = path.join(root, 'fixture.mp4')
const picture = path.join(root, 'fixture.jpg')

function ffmpeg(args) {
  return ffmpegPath().then((binary) =>
    execFileSync(binary, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], {
      timeout: 120_000,
      stdio: 'pipe',
    }),
  )
}

function integrity() {
  assert.equal(rawDb.pragma('integrity_check', { simple: true }), 'ok')
  assert.ok(rawDb.prepare("SELECT name FROM sqlite_master WHERE name = 'users'").get())
}

async function seed() {
  assert.equal(process.getuid(), 1001, 'Runtime must run as the documented non-root UID')
  assert.ok(
    ['x64', 'arm64'].includes(process.arch),
    'Only the advertised Linux architectures are tested',
  )
  // Resolve the transitive package from its actual pnpm parent. Importing it
  // loads the architecture-specific .node addon and its shared libraries.
  const transformerRequire = createRequire(import.meta.resolve('@huggingface/transformers'))
  const ort = transformerRequire('onnxruntime-node')
  assert.equal(typeof ort.InferenceSession.create, 'function')
  console.log(
    execFileSync(await ffmpegPath(), ['-version'], { encoding: 'utf8', timeout: 10_000 }).split(
      '\n',
    )[0],
  )
  integrity()
  await mkdir(root, { recursive: true })
  const vp9 = path.join(root, 'source.webm')
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x240:rate=12',
    '-t',
    '2',
    '-c:v',
    'libvpx-vp9',
    vp9,
  ])
  await ffmpeg([
    '-i',
    vp9,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    movie,
  ])
  await ffmpeg(['-i', movie, '-frames:v', '1', picture])

  // Exercise the application's downloader invocation, argument support and output
  // parsing without relying on a third-party social account or a changing URL.
  const bytes = await readFile(movie)
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': bytes.length })
    response.end(bytes)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  try {
    const downloaded = await ytdlpDownload(
      `http://127.0.0.1:${server.address().port}/fixture.mp4`,
      path.join(root, 'download'),
    )
    assert.equal(downloaded.length, 1)
    assert.equal((await stat(downloaded[0].file)).size, bytes.length)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
  rawDb.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run('ci-owner', 'ci-owner')
  rawDb.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run('ci-other', 'ci-other')
  rawDb
    .prepare(
      `INSERT INTO bookmarks
       (id, user_id, platform, author, text, tweet_url, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'ci-synthetic',
      'ci-owner',
      'youtube',
      'synthetic-author',
      'synthetic lunar waffles',
      'https://example.invalid/ci-synthetic',
      new Date().toISOString(),
    )
  await recordKept('youtube', 'ci-synthetic', [
    { slot: 'video-1', file: movie, mime: 'video/mp4', width: 320, height: 240, durationMs: 2000 },
    { slot: 'photo-1', file: picture, mime: 'image/jpeg', width: 320, height: 240 },
  ])
  rawDb
    .prepare('INSERT OR REPLACE INTO keep_settings (key, value) VALUES (?, ?)')
    .run('ci-persistence', 'survived')
  console.log(
    'Runtime dependencies, SQLite, VP9 to H.264 conversion and synthetic yt-dlp download passed.',
  )
}

async function httpChecks() {
  integrity()
  assert.equal(
    rawDb.prepare('SELECT value FROM keep_settings WHERE key = ?').get('ci-persistence')?.value,
    'survived',
  )
  const request = (url, options = {}) =>
    fetch(origin + url, { ...options, signal: AbortSignal.timeout(15_000) })
  const health = await request('/api/health')
  assert.equal(health.status, 200)
  assert.equal((await health.json()).checks.database.status, 'healthy')
  assert.equal((await request('/api/search?q=synthetic')).status, 401)
  assert.equal((await request('/api/auth/me')).status, 200)
  assert.equal((await (await request('/api/auth/me')).json()).authenticated, false)
  // The web startup must catch up text without any model process/embeddings.
  assert.deepEqual(
    keywordSearch('waffles', 10, 'ci-owner').map((hit) => hit.key),
    ['youtube:ci-synthetic'],
  )
  assert.deepEqual(keywordSearch('waffles', 10, 'ci-other'), [])
  assert.equal(rawDb.prepare('SELECT COUNT(*) AS n FROM post_embeddings').get().n, 0)
  const file = '/api/files/youtube/ci-synthetic/video-1'
  const ranged = await request(file, { headers: { Range: 'bytes=0-63' } })
  assert.equal(ranged.status, 206)
  assert.match(ranged.headers.get('Content-Range'), /^bytes 0-63\/[0-9]+$/)
  assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), (await readFile(movie)).subarray(0, 64))
  assert.equal((await request(file, { headers: { Range: 'bytes=999999999-' } })).status, 416)
  const frames = await sampleVideoFrames(file)
  try {
    assert.ok(frames.files.length > 0, 'Bundled FFmpeg must sample retained media')
  } finally {
    await frames.cleanup()
  }
  console.log('Health, anonymous auth boundary, media ranges and persisted data passed.')
}

async function models() {
  // Full model test is opt-in: it downloads the revision pinned by config.ts
  // (~400 MB), exercises native CPU inference, and emits observable timings.
  const { embedTexts, embedImageBytes, embedVideoFrames } =
    await import('../src/lib/semantic/model.ts')
  const { SEMANTIC_DIMS } = await import('../src/lib/semantic/config.ts')
  const validate = (vector) => {
    assert.equal(vector.length, SEMANTIC_DIMS)
    assert.ok(vector.every(Number.isFinite))
    assert.ok(Math.abs(Math.hypot(...vector) - 1) < 0.01)
  }
  const started = Date.now()
  validate(
    (await embedTexts(['A colourful synthetic video for the container readiness check.']))[0],
  )
  validate(await embedImageBytes(new Uint8Array(await readFile(picture))))
  const frames = await sampleVideoFrames('/api/files/youtube/ci-synthetic/video-1')
  try {
    validate(await embedVideoFrames(frames.files, frames.duration, 2))
  } finally {
    await frames.cleanup()
  }
  console.log(
    JSON.stringify({
      modelInference: 'passed',
      arch: process.arch,
      elapsedMs: Date.now() - started,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }),
  )
}

if (mode === 'seed') await seed()
else if (mode === 'http') await httpChecks()
else if (mode === 'models') await models()
else throw new Error('Expected seed, http or models')
rawDb.close()
