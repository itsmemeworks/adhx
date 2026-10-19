import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { ffmpegPath } from '@/lib/media/ffmpeg'
import {
  NoStreamError,
  extractAudio,
  readScreenText,
  sampleScreenFrames,
  screenFrameTimes,
  transcribeSource,
} from '@/lib/semantic/extract-media'

/** Real ffmpeg on generated media; the model side is a scripted stand-in. */
const run = promisify(execFile)
let dir: string
let withSound: string
let silentVideo: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'adhx-extract-media-'))
  const ffmpeg = await ffmpegPath()
  withSound = path.join(dir, 'tone.mp4')
  silentVideo = path.join(dir, 'silent.mp4')
  await run(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x240:rate=10:duration=6',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=6',
    '-shortest',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    withSound,
  ])
  await run(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=320x240:rate=10:duration=3',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    silentVideo,
  ])
}, 60_000)
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('getting media ready for the extract process', () => {
  it('writes the sound as mono 16 kHz floats', async () => {
    const out = await mkdtemp(path.join(dir, 'audio-'))
    const audio = await extractAudio(withSound, out, { localOnly: true })
    expect(audio.seconds).toBeGreaterThan(5.5)
    expect(audio.seconds).toBeLessThan(6.5)
    expect((await stat(audio.file)).size).toBe(Math.round(audio.seconds * 16_000) * 4)
    await expect(extractAudio(silentVideo, out, { localOnly: true })).rejects.toBeInstanceOf(
      NoStreamError,
    )
  })

  it('never asks the model about a video without sound, and cleans up', async () => {
    const extract = vi.fn()
    expect(await transcribeSource(silentVideo, extract, { localOnly: true, scratch: dir })).toBe(
      null,
    )
    expect(extract).not.toHaveBeenCalled()
    extract.mockResolvedValue({
      windows: [{ text: ' The cat screams at the cucumber.', language: 'en', noSpeech: 0.01 }],
    })
    expect(await transcribeSource(withSound, extract, { localOnly: true, scratch: dir })).toEqual({
      text: 'The cat screams at the cucumber.',
      language: 'en',
    })
    expect(extract.mock.calls[0][0]).toMatchObject({ kind: 'speech' })
    expect((await readdir(dir)).filter((f) => f.startsWith('adhx-speech-'))).toEqual([])
  })

  it('spreads text-reading frames over the first minute', async () => {
    expect(screenFrameTimes(8)).toEqual([1, 3, 5, 7])
    expect(screenFrameTimes(600)).toEqual([7.5, 22.5, 37.5, 52.5])
    expect(screenFrameTimes(2)).toEqual([1])
    expect(screenFrameTimes(null)).toEqual([7.5, 22.5, 37.5, 52.5])
    const out = await mkdtemp(path.join(dir, 'frames-'))
    const frames = await sampleScreenFrames(withSound, out, 6, { localOnly: true })
    expect(frames).toHaveLength(4)
  })

  it('reads pictures and frames together, and skips the model with nothing to read', async () => {
    const extract = vi.fn(async (task: { kind: string; files?: string[] }) => ({
      reads: (task.files ?? []).map((_, i) => ({
        width: 100,
        height: 100,
        lines: [{ text: i === 0 ? 'CAT VS CUCUMBER' : 'cat vs cucumber', box: [] }],
      })),
    }))
    expect(await readScreenText([], null, extract)).toBeNull()
    expect(extract).not.toHaveBeenCalled()
    const text = await readScreenText([], { source: withSound, duration: 6 }, extract, {
      localOnly: true,
      scratch: dir,
    })
    expect(text).toBe('CAT VS CUCUMBER')
    expect(extract.mock.calls[0][0].files).toHaveLength(4)
    expect((await readdir(dir)).filter((f) => f.startsWith('adhx-screen-'))).toEqual([])
  })
})
