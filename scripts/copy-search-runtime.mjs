import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { copyFileSync, mkdirSync } from 'node:fs'

const require = createRequire(import.meta.resolve('@huggingface/transformers'))
const runtime = dirname(require.resolve('onnxruntime-web'))
mkdirSync('public/search-runtime', { recursive: true })
for (const file of [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
]) {
  copyFileSync(join(runtime, file), join('public/search-runtime', file))
}
