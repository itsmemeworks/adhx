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

/** Video sampling, matching pond's proven limits: 1 fps, first 32 seconds, 32 frames. */
export const VIDEO_FPS = 1
export const VIDEO_MAX_SECONDS = 32
export const VIDEO_MAX_FRAMES = 32
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
