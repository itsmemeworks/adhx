import { SEMANTIC_DIMS } from './config'

/** L2-normalize, rejecting wrong-length or non-finite vectors (never store garbage). */
export function normalize(values: ArrayLike<number>, dims = SEMANTIC_DIMS): Float32Array {
  if (values.length !== dims) {
    throw new Error(`Embedding has ${values.length} dimensions, expected ${dims}`)
  }
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i])
    if (!Number.isFinite(v)) throw new Error('Embedding contains a non-finite value')
    sum += v * v
  }
  const norm = Math.sqrt(sum)
  if (!norm) throw new Error('Embedding is all zeros')
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) out[i] = Number(values[i]) / norm
  return out
}

export function toBlob(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)
}

export function fromBlob(blob: Buffer | Uint8Array | null | undefined): Float32Array | null {
  if (!blob || blob.byteLength % 4 !== 0) return null
  // Copy: SQLite buffers may not be 4-byte aligned.
  const copy = new Uint8Array(blob.byteLength)
  copy.set(blob)
  return new Float32Array(copy.buffer)
}

/** Dot product of two unit vectors = cosine similarity. */
export function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  for (let i = 0; i < n; i++) dot += a[i] * b[i]
  return dot
}
