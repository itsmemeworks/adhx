import path from 'path'
import { settingOff } from '../settings/value'

/**
 * EmbeddingGemma 2 settings for the understanding pipeline.
 *
 * Text uses the q4 text model (cosine to fp32 ≈ 0.988). Images and video
 * frames use the q8 vision encoder: on CPU it is both faster than q4 and
 * closer to full precision. Its audio encoder is not loaded: what's said is
 * transcribed into words by a separate speech model instead (`SPEECH_*`
 * below), which searches better than an audio vector and is shown as
 * "Said in the video".
 */
export const SEMANTIC_MODEL_ID = 'onnx-community/embeddinggemma-2-ONNX'
export const SEMANTIC_MODEL_REVISION = 'daa72c51243991dfcaf9f9137d2c573d8f7790c0'
export const SEMANTIC_DTYPE = { model: 'q4', vision_encoder: 'q8' } as const
/** Stored on every vector so a model or preprocessing change re-queues work. */
export const SEMANTIC_MODEL_VERSION = `${SEMANTIC_MODEL_ID}@${SEMANTIC_MODEL_REVISION}:q4/q8:v1`
export const SEMANTIC_DIMS = 768

/**
 * Video sampling: the first 32 seconds (pond's window), one frame every 2s,
 * 70 vision tokens per frame. pond takes 32 frames at 140 tokens on a GPU; on
 * CPU that costs ~42s and ~3GB per video. 16 × 70 costs ~11–15s and ~2GB, and
 * its vector stays at cosine ~0.95 to the full one on real saves. Part of the
 * video content hash, so changing any of these re-queues videos.
 */
export const VIDEO_FPS = 0.5
export const VIDEO_MAX_SECONDS = 32
export const VIDEO_MAX_FRAMES = 16
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

/** Kinds that produce a vector in `post_embeddings`. */
export type UnderstandingKind = 'text' | 'image' | 'video'
export const KINDS: readonly UnderstandingKind[] = ['text', 'image', 'video']

/**
 * Kinds that produce words in `post_extracted_text` instead of a vector:
 * what is said in a video or sound (`speech`) and text that appears in its
 * pictures or video frames (`screen`). Those words join the post's text
 * document, so they are searched by meaning and by keyword.
 */
export type ExtractKind = 'speech' | 'screen'
export const EXTRACT_KINDS: readonly ExtractKind[] = ['speech', 'screen']
/** Everything the understanding queue can hold. */
export type JobKind = UnderstandingKind | ExtractKind

export function isExtractKind(kind: string): kind is ExtractKind {
  return kind === 'speech' || kind === 'screen'
}

/**
 * Within one priority, cheap results land first: words, a picture, what is
 * said (a minute of speech takes a few seconds), text on screen (a couple of
 * seconds per picture or frame), then the full video pass.
 */
export const KIND_ORDER: Record<JobKind, number> = {
  text: 0,
  image: 1,
  speech: 2,
  screen: 3,
  video: 4,
}

/** `SEMANTIC_SPEECH=off` (or Admin → System) stops new transcription work (stored words stay searchable). */
export function speechEnabled(): boolean {
  return !settingOff('SEMANTIC_SPEECH')
}

/** `SEMANTIC_SCREEN_TEXT=off` (or Admin → System) stops new on-screen text reading (stored words stay searchable). */
export function screenTextEnabled(): boolean {
  return !settingOff('SEMANTIC_SCREEN_TEXT')
}

export function extractEnabled(kind: ExtractKind): boolean {
  return kind === 'speech' ? speechEnabled() : screenTextEnabled()
}

/** The kinds this server queues: every vector kind plus the extract kinds switched on. */
export function jobKinds(): JobKind[] {
  return [...KINDS, ...EXTRACT_KINDS.filter(extractEnabled)]
}

/**
 * Speech: Whisper base (multilingual, 74M parameters) through transformers.js.
 * Tiny is ~1.5× faster but makes noticeably more mistakes, especially outside
 * English; small is ~4× slower and ~4× the memory on CPU. Base transcribes a
 * minute of speech in a few seconds on two CPU threads. The encoder stays
 * full precision (8-bit encoders lose words); the decoder is 8-bit.
 */
export const SPEECH_MODEL_ID = 'onnx-community/whisper-base'
export const SPEECH_MODEL_REVISION = '1846881b6b3a3024392c1eea3ad983695bc23925'
export const SPEECH_DTYPE = { encoder_model: 'fp32', decoder_model_merged: 'q8' } as const
/** Only the first ten minutes are transcribed, in 30-second windows (Whisper's own). */
export const SPEECH_MAX_SECONDS = 600
export const SPEECH_WINDOW_SECONDS = 30
export const SPEECH_SAMPLE_RATE = 16_000
/** Stored on every speech row: changing the model or the window re-transcribes. */
export const SPEECH_VERSION = `${SPEECH_MODEL_ID}@${SPEECH_MODEL_REVISION}:fp32/q8:${SPEECH_MAX_SECONDS}s/${SPEECH_WINDOW_SECONDS}s:v1`

/**
 * On-screen text: Florence-2 base (230M parameters) with its `<OCR_WITH_REGION>`
 * task, all 8-bit. It reads meme captions, screenshots and burned-in subtitles
 * in ~1.6 s per picture on CPU; 4-bit was slower and invented text on blank
 * pictures.
 */
export const SCREEN_MODEL_ID = 'onnx-community/Florence-2-base-ft'
export const SCREEN_MODEL_REVISION = 'e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f'
export const SCREEN_DTYPE = {
  embed_tokens: 'q8',
  vision_encoder: 'q8',
  encoder_model: 'q8',
  decoder_model_merged: 'q8',
} as const
/** At most this many of a post's photos are read. */
export const SCREEN_MAX_IMAGES = 4
/** Frames read from a video, spread over its first minute. */
export const SCREEN_VIDEO_FRAMES = 4
export const SCREEN_VIDEO_SECONDS = 60
export const SCREEN_FRAME_WIDTH = 768
export const SCREEN_VERSION = `${SCREEN_MODEL_ID}@${SCREEN_MODEL_REVISION}:q8:i${SCREEN_MAX_IMAGES}/f${SCREEN_VIDEO_FRAMES}@${SCREEN_VIDEO_SECONDS}s:v1`

export function extractVersion(kind: ExtractKind): string {
  return kind === 'speech' ? SPEECH_VERSION : SCREEN_VERSION
}

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
