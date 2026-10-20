import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ffmpegPath } from '@/lib/media/ffmpeg'

let root: string
const binary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'adhx-ffmpeg-path-'))
  vi.stubEnv('FFMPEG_PATH', '')
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})
async function executable(directory: string) {
  await mkdir(directory, { recursive: true })
  const file = path.join(directory, binary)
  await writeFile(file, 'synthetic binary')
  await chmod(file, 0o700)
  return file
}

describe('system FFmpeg discovery', () => {
  it('passes an existing absolute file to yt-dlp instead of a bare PATH command', async () => {
    const file = await executable(path.join(root, 'bin'))
    vi.stubEnv('PATH', `${path.join(root, 'missing')}${path.delimiter}${path.dirname(file)}`)
    expect(await ffmpegPath()).toBe(file)
  })
  it('honours the configured binary and never silently substitutes another one', async () => {
    const file = await executable(path.join(root, 'custom'))
    vi.stubEnv('FFMPEG_PATH', file)
    expect(await ffmpegPath()).toBe(file)
    vi.stubEnv('FFMPEG_PATH', path.join(root, 'unavailable'))
    vi.stubEnv('PATH', path.dirname(file))
    await expect(ffmpegPath()).rejects.toThrow('FFmpeg is unavailable')
  })
  it('skips directories and files without execute permission', async () => {
    const invalid = path.join(root, 'invalid')
    const valid = await executable(path.join(root, 'valid'))
    await mkdir(path.join(invalid, binary), { recursive: true })
    vi.stubEnv('PATH', `${invalid}${path.delimiter}${path.dirname(valid)}`)
    expect(await ffmpegPath()).toBe(valid)
    if (process.platform !== 'win32') {
      await chmod(valid, 0o600)
      await expect(ffmpegPath()).rejects.toThrow('FFmpeg is unavailable')
    }
  })
})
