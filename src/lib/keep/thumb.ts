import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { THUMB_WIDTHS } from './src'

/**
 * Smaller copies of kept pictures and posters, for tiles and covers. A kept
 * photo is the original (often 4000 px and several megabytes); a 200 px tile
 * needs a few kilobytes. `/api/files/…?w=640` serves one of these, made once
 * with sharp and kept beside the original (`.thumbs/`), so deleting the
 * post's folder deletes them too. A copy older than its original (a newer
 * download replaced it) is made again.
 */

/** Pictures sharp can shrink. GIFs keep their motion, so they're left whole. */
const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

/** The smallest made width at least as wide as asked for (the largest past the end). */
export function thumbWidth(param: string | null): number | null {
  if (!param || !/^\d{1,5}$/.test(param)) return null
  const asked = Number(param)
  if (asked < 1) return null
  return THUMB_WIDTHS.find((w) => w >= asked) ?? THUMB_WIDTHS[THUMB_WIDTHS.length - 1]
}

export function canShrink(mime: string): boolean {
  return RESIZABLE.has(mime)
}

export interface Thumb {
  file: string
  size: number
  modified: number
}

// One copy made at a time per file and width, and a few at once overall: a
// page of 70 tiles mustn't start 70 decodes of 12-megapixel pictures together.
const MAX_AT_ONCE = 3
const making = new Map<string, Promise<Thumb | null>>()
let running = 0
const waiting: (() => void)[] = []

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_AT_ONCE) await new Promise<void>((r) => waiting.push(r))
  running++
  try {
    return await work()
  } finally {
    running--
    waiting.shift()?.()
  }
}

async function existing(file: string, sourceModified: number): Promise<Thumb | null> {
  try {
    const stat = await fs.stat(file)
    if (stat.mtimeMs < sourceModified) return null
    return { file, size: stat.size, modified: Math.floor(stat.mtimeMs) }
  } catch {
    return null
  }
}

/**
 * A copy of `source` at most `width` px wide (WebP), made if needed. Null when
 * it can't be made; the caller serves the original instead.
 */
export async function thumbFor(
  source: string,
  sourceModified: number,
  width: number,
): Promise<Thumb | null> {
  const out = path.join(path.dirname(source), '.thumbs', `${path.basename(source)}-w${width}.webp`)
  const ready = await existing(out, sourceModified)
  if (ready) return ready
  const inFlight = making.get(out)
  if (inFlight) return inFlight
  const job = slot(async () => {
    const again = await existing(out, sourceModified)
    if (again) return again
    const tmp = `${out}.${process.pid}.${Date.now()}.tmp`
    try {
      await fs.mkdir(path.dirname(out), { recursive: true })
      await sharp(source, { failOn: 'none' })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(tmp)
      await fs.rename(tmp, out)
      return await existing(out, sourceModified)
    } catch {
      await fs.rm(tmp, { force: true }).catch(() => {})
      return null
    }
  }).finally(() => making.delete(out))
  making.set(out, job)
  return job
}
