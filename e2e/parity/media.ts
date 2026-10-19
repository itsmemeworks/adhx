/**
 * Kept files for the parity world. Real media comes from PARITY_MEDIA_SRC
 * (an ADHX MEDIA_DIR holding the boards' posts, e.g. the owner's
 * `data/media`); each file is cloned (APFS clonefile, else copied) into the
 * scratch MEDIA_DIR. Videos made from stills and grabbed frames are cached in
 * `.out/media-cache`. Without a source (CI), every slot becomes a generated
 * placeholder so the harness still runs.
 */
import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { ffmpegPath } from '../../src/lib/media/ffmpeg'
import { probeMedia } from '../../src/lib/keep/probe'
import { mimeFor, postDir, type NewKeptFile, type Slot } from '../../src/lib/keep/store'
import { PARITY_MEDIA_CACHE, PARITY_MEDIA_DIR, parityMediaSource } from './env'
import type { MediaSpec, WorldPost } from './world'

const run = promisify(execFile)

async function ffmpeg(args: string[]): Promise<void> {
  const bin = await ffmpegPath()
  await run(bin, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], {
    timeout: 300_000,
    maxBuffer: 16 * 1024 * 1024,
  })
}

function clone(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.rmSync(to, { force: true })
  fs.copyFileSync(from, to, fs.constants.COPYFILE_FICLONE)
}

function sourceFile(root: string, ref: { platform: string; id: string; file: string }): string {
  return path.join(root, postDir(ref.platform, ref.id), ref.file)
}

const SIZES = {
  portrait: { w: 720, h: 1280 },
  landscape: { w: 1280, h: 720 },
  square: { w: 640, h: 640 },
}

function colourFor(key: string): string {
  const hex = crypto.createHash('sha1').update(key).digest('hex')
  // Mid-dark tones, so white text over them stays readable like real media.
  const c = (i: number) =>
    (64 + (parseInt(hex.slice(i, i + 2), 16) % 128)).toString(16).padStart(2, '0')
  return `0x${c(0)}${c(2)}${c(4)}`
}

/** A generated stand-in for one slot (no media source, or the file is missing). */
async function placeholder(post: WorldPost, slot: string, out: string): Promise<void> {
  const { w, h } = SIZES[post.shape]
  const colour = colourFor(post.key)
  if (slot.startsWith('video-')) {
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      `testsrc2=s=${w}x${h}:d=20:r=15`,
      '-f',
      'lavfi',
      '-i',
      `color=c=${colour}:s=${w}x${h}:d=20:r=15`,
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=330:duration=20',
      '-filter_complex',
      '[0][1]blend=all_mode=overlay:all_opacity=0.6,format=yuv420p[v]',
      '-map',
      '[v]',
      '-map',
      '2:a',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-c:a',
      'aac',
      '-shortest',
      out,
    ])
  } else if (slot.startsWith('audio-')) {
    await ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=20', '-c:a', 'aac', out])
  } else {
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      `testsrc2=s=${w}x${h}:d=1`,
      '-f',
      'lavfi',
      '-i',
      `color=c=${colour}:s=${w}x${h}:d=1`,
      '-filter_complex',
      '[0][1]blend=all_mode=overlay:all_opacity=0.7',
      '-frames:v',
      '1',
      '-q:v',
      '4',
      out,
    ])
  }
}

function extFor(spec: MediaSpec): string {
  if ('copy' in spec) return path.extname(spec.copy.file).slice(1)
  if ('still' in spec) return 'mp4'
  return 'jpg'
}

function placeholderExt(slot: string): string {
  if (slot.startsWith('video-')) return 'mp4'
  if (slot.startsWith('audio-')) return 'm4a'
  return 'jpg'
}

function cacheName(...parts: (string | number)[]): string {
  return parts.join('-').replace(/[^A-Za-z0-9._-]/g, '_')
}

/** Produce one slot's file inside the post's MEDIA_DIR folder; returns its absolute path. */
async function makeSlot(
  post: WorldPost,
  spec: MediaSpec,
  folder: string,
): Promise<{ file: string; placeholder: boolean }> {
  const root = parityMediaSource()
  const fromSource = root && fs.existsSync(root)
  if (fromSource && 'copy' in spec) {
    const from = sourceFile(root!, spec.copy)
    if (fs.existsSync(from)) {
      const out = path.join(folder, `${spec.slot}.${extFor(spec)}`)
      clone(from, out)
      return { file: out, placeholder: false }
    }
  }
  if (fromSource && 'still' in spec) {
    const from = sourceFile(root!, spec.still)
    if (fs.existsSync(from)) {
      const cached = path.join(
        PARITY_MEDIA_CACHE,
        cacheName('still', spec.still.platform, spec.still.id, spec.seconds) + '.mp4',
      )
      if (!fs.existsSync(cached)) {
        fs.mkdirSync(PARITY_MEDIA_CACHE, { recursive: true })
        const tmp = `${cached}.tmp.mp4`
        await ffmpeg([
          '-loop',
          '1',
          '-framerate',
          '2',
          '-i',
          from,
          '-f',
          'lavfi',
          '-i',
          `anullsrc=r=44100:cl=stereo`,
          '-t',
          String(spec.seconds),
          '-vf',
          'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-tune',
          'stillimage',
          '-r',
          '2',
          '-c:a',
          'aac',
          '-shortest',
          tmp,
        ])
        fs.renameSync(tmp, cached)
      }
      const out = path.join(folder, `${spec.slot}.mp4`)
      clone(cached, out)
      return { file: out, placeholder: false }
    }
  }
  if (fromSource && 'frame' in spec) {
    const from = sourceFile(root!, spec.frame)
    if (fs.existsSync(from)) {
      const cached = path.join(
        PARITY_MEDIA_CACHE,
        cacheName('frame', spec.frame.platform, spec.frame.id, spec.at) + '.jpg',
      )
      if (!fs.existsSync(cached)) {
        fs.mkdirSync(PARITY_MEDIA_CACHE, { recursive: true })
        const tmp = `${cached}.tmp.jpg`
        await ffmpeg(['-ss', String(spec.at), '-i', from, '-frames:v', '1', '-q:v', '3', tmp])
        fs.renameSync(tmp, cached)
      }
      const out = path.join(folder, `${spec.slot}.jpg`)
      clone(cached, out)
      return { file: out, placeholder: false }
    }
  }
  const cached = path.join(
    PARITY_MEDIA_CACHE,
    cacheName('placeholder', post.key, spec.slot) + '.' + placeholderExt(spec.slot),
  )
  if (!fs.existsSync(cached)) {
    fs.mkdirSync(PARITY_MEDIA_CACHE, { recursive: true })
    const tmp = cached.replace(/(\.[a-z0-9]+)$/, '.tmp$1')
    await placeholder(post, spec.slot, tmp)
    fs.renameSync(tmp, cached)
  }
  const out = path.join(folder, `${spec.slot}.${placeholderExt(spec.slot)}`)
  clone(cached, out)
  return { file: out, placeholder: true }
}

export interface PreparedMedia {
  files: NewKeptFile[]
  /** Slots that fell back to a generated placeholder. */
  placeholders: string[]
}

/** Every kept file for one post, in MEDIA_DIR, described the way the keep worker records them. */
export async function prepareMedia(post: WorldPost): Promise<PreparedMedia> {
  const folder = path.join(PARITY_MEDIA_DIR, postDir(post.platform, post.id))
  fs.mkdirSync(folder, { recursive: true })
  const files: NewKeptFile[] = []
  const placeholders: string[] = []
  for (const spec of post.media) {
    const { file, placeholder: generated } = await makeSlot(post, spec, folder)
    if (generated) placeholders.push(spec.slot)
    const probed = await probeMedia(file)
    files.push({
      slot: spec.slot as Slot,
      file,
      mime: mimeFor(file),
      width: probed.width,
      height: probed.height,
      durationMs: probed.durationMs,
      videoCodec: probed.videoCodec,
      hasAudio: probed.hasAudio,
    })
  }
  return { files, placeholders }
}

/** Was a real media source used for this run? */
export function usingMediaSource(): boolean {
  const root = parityMediaSource()
  return !!root && fs.existsSync(root)
}
