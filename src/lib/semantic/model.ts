import {
  SEMANTIC_DTYPE,
  SEMANTIC_MODEL_ID,
  SEMANTIC_MODEL_REVISION,
  VIDEO_SOFT_TOKENS,
  modelCacheDir,
} from './config'
import { normalize } from './vectors'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { semanticMemoryOptions } from './runtime'

/**
 * The one EmbeddingGemma 2 instance for this process (text + vision; speech
 * is transcribed separately, see `extract-model.ts`). Loaded lazily on first use, then kept. Every call goes through a
 * single queue. Inference blocks the calling thread, so this module is only
 * ever loaded inside the semantic child processes (`child.ts`), never by the
 * web server.
 */
type Loaded = {
  processor: (...inputs: unknown[]) => Promise<Record<string, unknown>>
  model: (
    inputs: Record<string, unknown>,
  ) => Promise<{ sentence_embedding: { tolist: () => number[][] } }>
  RawImage: { fromBlob: (blob: Blob) => Promise<unknown>; read: (path: string) => Promise<unknown> }
  RawVideo: new (frames: unknown[], duration: number) => unknown
  RawVideoFrame: new (image: unknown, timestamp: number) => unknown
}

const globalForModel = globalThis as unknown as { __adhxSemanticModel?: Promise<Loaded> }
let chain: Promise<unknown> = Promise.resolve()

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work)
  chain = run.catch(() => undefined)
  return run
}

async function cachedSource(textOnly: boolean): Promise<string | null> {
  const source = path.join(modelCacheDir(), SEMANTIC_MODEL_ID, SEMANTIC_MODEL_REVISION)
  const files = [
    'config.json',
    'preprocessor_config.json',
    'processor_config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'chat_template.jinja',
    'onnx/model_q4.onnx',
    'onnx/model_q4.onnx_data',
    ...(!textOnly
      ? ['onnx/vision_encoder_quantized.onnx', 'onnx/vision_encoder_quantized.onnx_data']
      : []),
  ]
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

async function load(): Promise<Loaded> {
  const tf = await import('@huggingface/transformers')
  tf.env.cacheDir = modelCacheDir()
  tf.env.allowLocalModels = true
  const threads = Math.max(1, Number(process.env['SEMANTIC_THREADS'] || 2))
  const memoryOptions = semanticMemoryOptions()
  const textOnly = process.env['SEMANTIC_TEXT_ONLY'] === '1'
  // Transformers' tokenizer registry probes `main` even when a revision was
  // supplied. A complete pinned cache must therefore be loaded as a local
  // directory, avoiding both an unnecessary network probe and offline failure.
  const local = await cachedSource(textOnly)
  const source = local ?? SEMANTIC_MODEL_ID
  const options = {
    revision: SEMANTIC_MODEL_REVISION,
    ...(local ? { local_files_only: true } : {}),
  }
  const config = await tf.AutoConfig.from_pretrained(source, options)
  // Do not download or allocate the audio encoder (speech is transcribed to words instead).
  // The query process is words-only and skips the vision encoder too
  // (identical text vectors, ~600MB instead of ~2GB).
  Object.assign(config, { audio_config: null, ...(textOnly ? { vision_config: null } : {}) })
  // Native workers may opt into Apple's CoreML execution provider. Containers
  // and the web server's query child retain the established CPU configuration.
  const nativeCoreML = process.env['SEMANTIC_DEVICE'] === 'coreml' && process.platform === 'darwin'
  const createModel = (accelerated: boolean) =>
    tf.AutoModel.from_pretrained(source, {
      ...options,
      config,
      device: accelerated ? 'coreml' : 'cpu',
      dtype: SEMANTIC_DTYPE,
      session_options: {
        intraOpNumThreads: threads,
        interOpNumThreads: 1,
        ...memoryOptions,
        ...(accelerated
          ? { executionProviders: [{ name: 'coreml', coreMlFlags: 0x010 }, 'cpu'] }
          : {}),
      },
    } as Parameters<typeof tf.AutoModel.from_pretrained>[1])
  let accelerated = nativeCoreML
  const modelPromise = createModel(nativeCoreML).catch((error: unknown) => {
    if (!nativeCoreML) throw error
    // Quantized operators may not compile under CoreML on every macOS/model
    // combination. Keep this fallback hot rather than retrying each job.
    console.warn('[semantic] CoreML model initialization failed; using native CPU')
    accelerated = false
    return createModel(false)
  })
  const [processor, model] = await Promise.all([
    tf.AutoProcessor.from_pretrained(source, options),
    modelPromise,
  ])
  // Some CoreML graphs compile successfully but fail on their first real input
  // (for example an absent modality's zero-length tensor). Release that session
  // before allocating a CPU replacement, then keep the replacement warm.
  let cpuFallback: Promise<typeof model> | undefined
  const infer: Loaded['model'] = async (inputs) => {
    if (cpuFallback) return (await cpuFallback)(inputs)
    try {
      return await model(inputs)
    } catch (error) {
      if (!accelerated) throw error
      accelerated = false
      console.warn('[semantic] CoreML inference failed; using native CPU')
      cpuFallback = (async () => {
        await model.dispose()
        return createModel(false)
      })()
      return (await cpuFallback)(inputs)
    }
  }
  // Video frames at 70 vision tokens instead of the default 140 (Gemma 4's
  // smallest budget): half the cost per frame, near-identical vectors.
  const frames = (
    processor as unknown as {
      video_processor?: { frame_processor?: { max_soft_tokens?: number } }
    }
  ).video_processor?.frame_processor
  if (!textOnly) {
    if (!frames || typeof frames.max_soft_tokens !== 'number') {
      throw new Error('EmbeddingGemma 2 video processor shape changed; check VIDEO_SOFT_TOKENS')
    }
    frames.max_soft_tokens = VIDEO_SOFT_TOKENS
  }
  return {
    processor: processor as unknown as Loaded['processor'],
    model: infer,
    RawImage: tf.RawImage as unknown as Loaded['RawImage'],
    RawVideo: tf.RawVideo as unknown as Loaded['RawVideo'],
    RawVideoFrame: tf.RawVideoFrame as unknown as Loaded['RawVideoFrame'],
  }
}

function loaded(): Promise<Loaded> {
  if (!globalForModel.__adhxSemanticModel) {
    globalForModel.__adhxSemanticModel = load().catch((error) => {
      globalForModel.__adhxSemanticModel = undefined
      throw error
    })
  }
  return globalForModel.__adhxSemanticModel
}

/** Embed prompts already formatted with `documentPrompt` / `queryPrompt`. */
export function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return Promise.resolve([])
  return serialize(async () => {
    const m = await loaded()
    const out = await m.model(await m.processor(texts))
    return out.sentence_embedding.tolist().map((row) => normalize(row))
  })
}

export function embedImageBytes(bytes: Uint8Array): Promise<Float32Array> {
  return serialize(async () => {
    const m = await loaded()
    const image = await m.RawImage.fromBlob(new Blob([new Uint8Array(bytes)]))
    const out = await m.model(await m.processor(null, [[image]]))
    return normalize(out.sentence_embedding.tolist()[0])
  })
}

/** Frames are JPEG files in time order, `secondsPerFrame` apart. */
export function embedVideoFrames(
  files: string[],
  duration: number,
  secondsPerFrame: number,
  timestamps?: readonly number[],
): Promise<Float32Array> {
  if (
    timestamps &&
    (!Number.isFinite(duration) ||
      duration <= 0 ||
      timestamps.length !== files.length ||
      timestamps.some(
        (time, i) =>
          !Number.isFinite(time) ||
          time < 0 ||
          time >= duration ||
          (i > 0 && time <= timestamps[i - 1]),
      ))
  )
    throw new Error('Invalid video frame timestamps')
  return serialize(async () => {
    const m = await loaded()
    const frames = []
    for (let i = 0; i < files.length; i++) {
      frames.push(
        new m.RawVideoFrame(
          await m.RawImage.read(files[i]),
          timestamps?.[i] ?? i * secondsPerFrame,
        ),
      )
    }
    const video = new m.RawVideo(frames, duration)
    const out = await m.model(await m.processor(null, null, null, video))
    return normalize(out.sentence_embedding.tolist()[0])
  })
}
