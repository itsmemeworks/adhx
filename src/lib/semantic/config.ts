import path from 'path'

/**
 * EmbeddingGemma 2 settings for the understanding pipeline.
 *
 * Text uses the q4 text model (cosine to fp32 ≈ 0.988). Images and video
 * frames use the q8 vision encoder: on CPU it is both faster than q4 and
 * closer to full precision. Audio is intentionally not loaded (owner
 * decision 2026-10-16: video frames yes, audio later).
 */
export const SEMANTIC_MODEL_ID = 'onnx-community/embeddinggemma-2-ONNX'
export const SEMANTIC_MODEL_REVISION = 'daa72c51243991dfcaf9f9137d2c573d8f7790c0'
export const SEMANTIC_DTYPE = { model: 'q4', vision_encoder: 'q8' } as const
/** Stored on every vector so a model or preprocessing change re-queues work. */
export const SEMANTIC_MODEL_VERSION = `${SEMANTIC_MODEL_ID}@${SEMANTIC_MODEL_REVISION}:q4/q8:v1`
export const SEMANTIC_DIMS = 768

/**
 * Default video sampling: the first 32 seconds, one frame every 2s,
 * 70 vision tokens per frame. pond takes 32 frames at 140 tokens on a GPU; on
 * CPU that costs ~42s and ~3GB per video. 16 × 70 costs ~11–15s and ~2GB, and
 * its vector stays at cosine ~0.95 to the full one on real saves. Part of the
 * video content hash, so requeued videos refresh when this budget changes.
 */
export const VIDEO_MAX_SECONDS = 32
// A smaller inference budget covers the same opening window with fewer frames.
// It never changes the retained video, its resolution or download limits.
const configuredVideoFrames = Number(process.env['SEMANTIC_VIDEO_MAX_FRAMES'] || 16)
export const VIDEO_MAX_FRAMES = [4, 8, 16].includes(configuredVideoFrames)
  ? configuredVideoFrames
  : 16
export const VIDEO_FPS = VIDEO_MAX_FRAMES / VIDEO_MAX_SECONDS
export const VIDEO_SOFT_TOKENS = 70
export const VIDEO_SAMPLING = `fps${VIDEO_FPS}x${VIDEO_MAX_FRAMES}@${VIDEO_MAX_SECONDS}s/t${VIDEO_SOFT_TOKENS}`
/** Frames are downscaled before embedding; the model resizes to its own patch grid anyway. */
export const VIDEO_FRAME_WIDTH = 448

/** Queue priorities: higher runs first. */
export const PRIORITY = {
  /** Just saved / pasted, or about to play next. */
  urgent: 100,
  /** Imported by an X sync. */
  sync: 50,
  /** Startup / lazy backfill of older saves. */
  backfill: 10,
} as const

export const MAX_ATTEMPTS = 3

export type UnderstandingKind = 'text' | 'image' | 'video'
export const KINDS: readonly UnderstandingKind[] = ['text', 'image', 'video']

/** Turn the whole pipeline off (tests, CI builds, or a box without enough RAM). */
export function semanticEnabled(): boolean {
  const flag = process.env['SEMANTIC_SEARCH']
  if (flag === 'off' || flag === '0' || flag === 'false') return false
  if (process.env.NODE_ENV === 'test' || process.env['VITEST']) return false
  return true
}

/** Model weights cache: on the persistent volume in production, `./data/models` locally. */
export function modelCacheDir(): string {
  const fromEnv = process.env['SEMANTIC_CACHE_DIR']
  if (fromEnv) return path.resolve(fromEnv)
  const dbPath = process.env['DATABASE_PATH']
  if (dbPath) return path.join(path.dirname(path.resolve(dbPath)), 'models')
  return path.resolve('./data/models')
}

/** Where the worker reaches this app's own media proxies (loopback). */
export function internalOrigin(): string {
  const fromEnv = process.env['SEMANTIC_INTERNAL_ORIGIN']
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  // `pnpm dev` serves on 3001 (package.json); production listens on PORT (3000).
  const fallback = process.env.NODE_ENV === 'development' ? '3001' : '3000'
  return `http://127.0.0.1:${process.env['PORT'] || fallback}`
}
