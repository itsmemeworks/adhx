import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  modelCacheDir,
  SCREEN_DTYPE,
  SCREEN_MODEL_ID,
  SCREEN_MODEL_REVISION,
  SPEECH_DTYPE,
  SPEECH_MODEL_ID,
  SPEECH_MODEL_REVISION,
  SPEECH_SAMPLE_RATE,
  SPEECH_WINDOW_SECONDS,
} from './config'
import { NO_SPEECH_MAX, type ScreenRead, type SpeechWindow } from './extract-clean'

/**
 * The speech (Whisper base) and on-screen text (Florence-2 base) models.
 * Inference blocks the thread and holds 1–2 GB, so this module is only loaded
 * by the short-lived extract process (`extract-child.ts`), never by the web
 * server or the jobs process itself. One model is loaded per process.
 */

/** A window quieter than this (RMS) is silence: the model is not asked. */
export const SILENCE_RMS = 0.002
/** A tail shorter than this (seconds) is skipped. */
const MIN_WINDOW_SECONDS = 0.5
const MAX_NEW_TOKENS = 224

type AnyFn = (...args: unknown[]) => Promise<unknown>
interface Seq2Seq {
  (inputs: Record<string, unknown>): Promise<{ logits: { data: Float32Array; dims: number[] } }>
  generate: (options: Record<string, unknown>) => Promise<unknown>
  generation_config: {
    decoder_start_token_id: number
    lang_to_id: Record<string, number>
  }
}
interface Tokenizer {
  batch_decode: (ids: unknown, options: Record<string, unknown>) => string[]
  convert_tokens_to_ids: (tokens: string[]) => (number | undefined)[]
}

async function cachedSource(id: string, revision: string, files: string[]): Promise<string | null> {
  const source = path.join(modelCacheDir(), id, revision)
  const ready = await Promise.all(
    files.map(async (file) => {
      try {
        const info = await stat(path.join(source, file))
        return info.isFile() && info.size > 0
      } catch {
        return false
      }
    }),
  )
  return ready.every(Boolean) ? source : null
}

const COMMON = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
]
const onnxFile = (name: string, dtype: string) =>
  `onnx/${name}${dtype === 'fp32' ? '' : dtype === 'q8' ? '_quantized' : `_${dtype}`}.onnx`

async function transformers() {
  const tf = await import('@huggingface/transformers')
  tf.env.cacheDir = modelCacheDir()
  tf.env.allowLocalModels = true
  return tf
}

function sessionOptions() {
  const threads = Math.max(1, Number(process.env['SEMANTIC_THREADS'] || 2))
  return { intraOpNumThreads: threads, interOpNumThreads: 1 }
}

async function pinned(id: string, revision: string, dtype: Record<string, string>) {
  // A complete pinned cache loads as a local directory (no network probe of
  // `main`, works offline), the same as the search model.
  const local = await cachedSource(id, revision, [
    ...COMMON,
    ...Object.entries(dtype).map(([name, d]) => onnxFile(name, d)),
  ])
  return {
    source: local ?? id,
    options: { revision, ...(local ? { local_files_only: true } : {}) },
  }
}

type SpeechModel = {
  processor: AnyFn
  model: Seq2Seq
  tokenizer: Tokenizer
  Tensor: new (type: string, data: BigInt64Array, dims: number[]) => unknown
  noSpeechId: number | undefined
}
type ScreenModel = {
  processor: AnyFn & {
    construct_prompts: (task: string) => unknown
    post_process_generation: AnyFn
  }
  model: { generate: (options: Record<string, unknown>) => Promise<unknown> }
  tokenizer: Tokenizer
  RawImage: { read: (file: string) => Promise<{ size: [number, number] }> }
}

let speech: Promise<SpeechModel> | null = null
let screen: Promise<ScreenModel> | null = null

async function loadSpeech(): Promise<SpeechModel> {
  const tf = await transformers()
  const { source, options } = await pinned(SPEECH_MODEL_ID, SPEECH_MODEL_REVISION, SPEECH_DTYPE)
  const [processor, tokenizer, model] = await Promise.all([
    tf.AutoProcessor.from_pretrained(source, options),
    tf.AutoTokenizer.from_pretrained(source, options),
    tf.WhisperForConditionalGeneration.from_pretrained(source, {
      ...options,
      device: 'cpu',
      dtype: SPEECH_DTYPE,
      session_options: sessionOptions(),
    } as Parameters<typeof tf.WhisperForConditionalGeneration.from_pretrained>[1]),
  ])
  const tokens = tokenizer as unknown as Tokenizer
  return {
    processor: processor as unknown as AnyFn,
    model: model as unknown as Seq2Seq,
    tokenizer: tokens,
    Tensor: tf.Tensor as unknown as SpeechModel['Tensor'],
    noSpeechId:
      tokens.convert_tokens_to_ids(['<|nocaptions|>'])[0] ??
      tokens.convert_tokens_to_ids(['<|nospeech|>'])[0],
  }
}

async function loadScreen(): Promise<ScreenModel> {
  const tf = await transformers()
  const { source, options } = await pinned(SCREEN_MODEL_ID, SCREEN_MODEL_REVISION, SCREEN_DTYPE)
  const [processor, tokenizer, model] = await Promise.all([
    tf.AutoProcessor.from_pretrained(source, options),
    tf.AutoTokenizer.from_pretrained(source, options),
    tf.Florence2ForConditionalGeneration.from_pretrained(source, {
      ...options,
      device: 'cpu',
      dtype: SCREEN_DTYPE,
      session_options: sessionOptions(),
    } as Parameters<typeof tf.Florence2ForConditionalGeneration.from_pretrained>[1]),
  ])
  return {
    processor: processor as unknown as ScreenModel['processor'],
    model: model as unknown as ScreenModel['model'],
    tokenizer: tokenizer as unknown as Tokenizer,
    RawImage: tf.RawImage as unknown as ScreenModel['RawImage'],
  }
}

function once<T>(
  get: () => Promise<T> | null,
  set: (p: Promise<T> | null) => void,
  load: () => Promise<T>,
) {
  let current = get()
  if (!current) {
    current = load().catch((error) => {
      set(null)
      throw error
    })
    set(current)
  }
  return current
}

/** Mono 16 kHz float samples written by `extractAudio`. */
export async function readSamples(file: string): Promise<Float32Array> {
  const bytes = await readFile(file)
  const length = Math.floor(bytes.byteLength / 4)
  const out = new Float32Array(length)
  out.set(new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + length * 4)))
  return out
}

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

function softmaxAt(row: Float32Array, index: number): number {
  let max = -Infinity
  for (let i = 0; i < row.length; i++) if (row[i] > max) max = row[i]
  let sum = 0
  for (let i = 0; i < row.length; i++) sum += Math.exp(row[i] - max)
  return Math.exp(row[index] - max) / sum
}

/**
 * What is said, window by window. Transformers.js would otherwise assume
 * English, so each window's language is read from the model's first step,
 * along with how likely the window is to hold no speech at all (music,
 * silence); those windows are not transcribed.
 */
export async function transcribeSamples(samples: Float32Array): Promise<SpeechWindow[]> {
  const m = await once(
    () => speech,
    (p) => (speech = p),
    loadSpeech,
  )
  const size = SPEECH_WINDOW_SECONDS * SPEECH_SAMPLE_RATE
  const windows: SpeechWindow[] = []
  let language: string | null = null
  for (let start = 0; start < samples.length; start += size) {
    const chunk = samples.subarray(start, start + size)
    if (chunk.length < MIN_WINDOW_SECONDS * SPEECH_SAMPLE_RATE) continue
    if (rms(chunk) < SILENCE_RMS) {
      windows.push({ text: '', language: null, noSpeech: 1 })
      continue
    }
    const { input_features } = (await m.processor(chunk)) as { input_features: unknown }
    const sot = m.model.generation_config.decoder_start_token_id
    const first = await m.model({
      input_features,
      decoder_input_ids: new m.Tensor('int64', BigInt64Array.from([BigInt(sot)]), [1, 1]),
    })
    const vocab = first.logits.dims.at(-1)!
    const row = first.logits.data.subarray(0, vocab)
    const noSpeech = m.noSpeechId === undefined ? 0 : softmaxAt(row, m.noSpeechId)
    let best: { token: string; score: number } | null = null
    for (const [token, id] of Object.entries(m.model.generation_config.lang_to_id)) {
      if (!best || row[id] > best.score) best = { token, score: row[id] }
    }
    const detected = best ? best.token.replace(/^<\|/, '').replace(/\|>$/, '') : null
    if (noSpeech > NO_SPEECH_MAX) {
      windows.push({ text: '', language: detected, noSpeech })
      continue
    }
    language = detected ?? language ?? 'en'
    const ids = await m.model.generate({
      inputs: input_features,
      language,
      task: 'transcribe',
      max_new_tokens: MAX_NEW_TOKENS,
      num_beams: 1,
      do_sample: false,
    })
    const text = m.tokenizer.batch_decode(ids, { skip_special_tokens: true })[0] ?? ''
    windows.push({ text: text.trim(), language, noSpeech })
  }
  return windows
}

/** Only a corrupt/unsupported picture can be skipped in a multi-image job.
 * Model loading and inference errors must propagate so old words survive retry. */
export class ScreenImageError extends Error {}

/** The text lines on one picture or frame, with where they sit. */
export async function readScreenFile(file: string): Promise<ScreenRead> {
  const m = await once(
    () => screen,
    (p) => (screen = p),
    loadScreen,
  )
  const task = '<OCR_WITH_REGION>'
  const image = await m.RawImage.read(file).catch(() => {
    throw new ScreenImageError('Cannot decode screen image')
  })
  const inputs = (await m.processor(image, m.processor.construct_prompts(task))) as Record<
    string,
    unknown
  >
  const ids = await m.model.generate({
    ...inputs,
    max_new_tokens: 256,
    num_beams: 1,
    do_sample: false,
  })
  const raw = m.tokenizer.batch_decode(ids, { skip_special_tokens: false })[0] ?? ''
  const parsed = (await m.processor.post_process_generation(raw, task, image.size)) as Record<
    string,
    { labels?: string[]; quad_boxes?: number[][] }
  >
  const result = parsed[task] ?? {}
  const labels = result.labels ?? []
  const boxes = result.quad_boxes ?? []
  return {
    width: image.size[0],
    height: image.size[1],
    lines: labels.map((text, i) => ({
      text: String(text)
        .replace(/<\/?s>|<pad>/g, '')
        .trim(),
      box: boxes[i] ?? [],
    })),
  }
}
