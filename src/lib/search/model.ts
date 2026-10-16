import type { Embed } from './engine'

export const SEARCH_MODEL = 'onnx-community/embeddinggemma-2-ONNX'
export const SEARCH_REVISION = 'daa72c51243991dfcaf9f9137d2c573d8f7790c0'
export const SEARCH_CACHE_VERSION = `${SEARCH_MODEL}:${SEARCH_REVISION}:q4:768:passages-v2`

export async function loadSearchModel(
  device: 'webgpu' | 'wasm' | 'cpu',
  onDownload: (progress: number | null) => void = () => {},
): Promise<Embed> {
  const { AutoConfig, AutoModel, AutoTokenizer, env } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  if (device !== 'cpu') {
    env.useWasmCache = false
    env.backends.onnx.wasm!.numThreads = 1
    env.backends.onnx.wasm!.wasmPaths = {
      mjs: `${self.location.origin}/search-runtime/ort-wasm-simd-threaded.asyncify.mjs`,
      wasm: `${self.location.origin}/search-runtime/ort-wasm-simd-threaded.asyncify.wasm`,
    }
  }
  const options = { revision: SEARCH_REVISION }
  const config = await AutoConfig.from_pretrained(SEARCH_MODEL, options)
  // Text search does not download or allocate unused audio/vision encoders.
  Object.assign(config, { vision_config: null, audio_config: null })
  const tokenizer = await AutoTokenizer.from_pretrained(SEARCH_MODEL, options)
  const model = await AutoModel.from_pretrained(SEARCH_MODEL, {
    ...options,
    config,
    device,
    dtype: 'q4',
    progress_callback: (event) => {
      if (event.status === 'progress') onDownload(event.progress)
      else if (event.status === 'initiate') onDownload(null)
    },
  })
  return async (texts) => {
    const unpadded = tokenizer(texts, { padding: true, truncation: true, max_length: 8192 })
    // Reuse a small set of GPU shader shapes rather than recompiling for each passage length.
    const length = unpadded.input_ids.dims[1]
    const paddedLength = length <= 512 ? 512 : Math.min(8192, Math.ceil(length / 512) * 512)
    const inputs =
      device === 'cpu'
        ? unpadded
        : tokenizer(texts, {
            padding: 'max_length',
            truncation: true,
            max_length: paddedLength,
          })
    const output = await model(inputs)
    return output.sentence_embedding.tolist() as number[][]
  }
}
