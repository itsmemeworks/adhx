import {
  SEMANTIC_DTYPE,
  SEMANTIC_MODEL_ID,
  SEMANTIC_MODEL_REVISION,
  VIDEO_SOFT_TOKENS,
  modelCacheDir,
} from './config'
import { normalize } from './vectors'

/**
 * The one EmbeddingGemma 2 instance for this process (text + vision; no
 * audio). Loaded lazily on first use, then kept. Every call goes through a
 * single queue: inference is CPU-heavy and sharing the box with request
 * handling means one job at a time.
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

async function load(): Promise<Loaded> {
  const tf = await import('@huggingface/transformers')
  tf.env.cacheDir = modelCacheDir()
  tf.env.allowLocalModels = true
  const threads = Math.max(1, Number(process.env['SEMANTIC_THREADS'] || 2))
  const config = await tf.AutoConfig.from_pretrained(SEMANTIC_MODEL_ID, {
    revision: SEMANTIC_MODEL_REVISION,
  })
  // Do not download or allocate the audio encoder (video frames only, for now).
  Object.assign(config, { audio_config: null })
  const [processor, model] = await Promise.all([
    tf.AutoProcessor.from_pretrained(SEMANTIC_MODEL_ID, { revision: SEMANTIC_MODEL_REVISION }),
    tf.AutoModel.from_pretrained(SEMANTIC_MODEL_ID, {
      revision: SEMANTIC_MODEL_REVISION,
      config,
      device: 'cpu',
      dtype: SEMANTIC_DTYPE,
      session_options: { intraOpNumThreads: threads, interOpNumThreads: 1 },
    } as Parameters<typeof tf.AutoModel.from_pretrained>[1]),
  ])
  // Video frames at 70 vision tokens instead of the default 140 (Gemma 4's
  // smallest budget): half the cost per frame, near-identical vectors.
  const frames = (
    processor as unknown as {
      video_processor?: { frame_processor?: { max_soft_tokens?: number } }
    }
  ).video_processor?.frame_processor
  if (!frames || typeof frames.max_soft_tokens !== 'number') {
    throw new Error('EmbeddingGemma 2 video processor shape changed; check VIDEO_SOFT_TOKENS')
  }
  frames.max_soft_tokens = VIDEO_SOFT_TOKENS
  return {
    processor: processor as unknown as Loaded['processor'],
    model: model as unknown as Loaded['model'],
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
): Promise<Float32Array> {
  return serialize(async () => {
    const m = await loaded()
    const frames = []
    for (let i = 0; i < files.length; i++) {
      frames.push(new m.RawVideoFrame(await m.RawImage.read(files[i]), i * secondsPerFrame))
    }
    const video = new m.RawVideo(frames, duration)
    const out = await m.model(await m.processor(null, null, null, video))
    return normalize(out.sentence_embedding.tolist()[0])
  })
}
