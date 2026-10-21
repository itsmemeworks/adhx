// Actual yt-dlp + FFmpeg merging, with synthetic DASH on loopback only.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ffmpegPath } from '../src/lib/media/ffmpeg.ts'
import { ytdlpDownload } from '../src/lib/keep/ytdlp.ts'
import { probeMedia } from '../src/lib/keep/probe.ts'

const root = await mkdtemp(path.join(os.tmpdir(), 'adhx-downloader-check-'))
process.env.MEDIA_DIR = path.join(root, 'cache')
// Ignore any operator downloader config by using a fresh private test home.
process.env.HOME = root
process.env.XDG_CONFIG_HOME = root
let server
try {
  const binary = await ffmpegPath()
  assert.ok(path.isAbsolute(binary), 'yt-dlp requires an existing absolute FFmpeg location')
  execFileSync(
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
      'testsrc2=size=320x180:rate=12',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000',
      '-t',
      '2',
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-c:v',
      process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264',
      '-pix_fmt',
      'yuv420p',
      '-threads',
      '1',
      '-c:a',
      'aac',
      '-seg_duration',
      '1',
      '-use_template',
      '1',
      '-use_timeline',
      '1',
      '-f',
      'dash',
      path.join(root, 'fixture.mpd'),
    ],
    { timeout: 30_000, stdio: 'pipe' },
  )
  const files = new Map(
    await Promise.all(
      (await readdir(root)).map(async (name) => [name, await readFile(path.join(root, name))]),
    ),
  )
  server = createServer((request, response) => {
    const name = new URL(request.url, 'http://127.0.0.1').pathname.slice(1)
    const bytes = files.get(name)
    if (!bytes) {
      response.writeHead(404)
      response.end()
      return
    }
    response.writeHead(200, {
      'Content-Type': name.endsWith('.mpd') ? 'application/dash+xml' : 'video/mp4',
      'Content-Length': bytes.length,
    })
    response.end(bytes)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const downloaded = await ytdlpDownload(
    `http://127.0.0.1:${server.address().port}/fixture.mpd`,
    path.join(root, 'download'),
  )
  assert.equal(downloaded.length, 1, 'Separate DASH audio/video must produce one merged file')
  const probe = await probeMedia(downloaded[0].file)
  assert.equal(probe.videoCodec, 'h264')
  assert.equal(probe.audioCodec, 'aac')
  assert.equal(probe.width, 320)
  assert.equal(probe.height, 180)
  assert.ok(Math.abs(probe.durationMs - 2000) < 200)
  console.log(
    'Synthetic DASH download merged H.264 + AAC successfully with the discovered system FFmpeg',
  )
} finally {
  if (server) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  await rm(root, { recursive: true, force: true })
}
