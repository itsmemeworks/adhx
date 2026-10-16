/**
 * Spherical k-means over unit vectors (cosine similarity), deterministic for
 * a given seed so a user's "Made for you" channels don't reshuffle on every
 * recompute. Pure; no I/O.
 */

export interface Cluster {
  /** Indexes into the input, closest to the centre first. */
  members: number[]
  centroid: Float32Array
  /** Mean similarity of members to the centre (how tight the group is). */
  cohesion: number
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

function normalizeInPlace(v: Float32Array): Float32Array {
  let n = 0
  for (let i = 0; i < v.length; i++) n += v[i] * v[i]
  n = Math.sqrt(n) || 1
  for (let i = 0; i < v.length; i++) v[i] /= n
  return v
}

/** Small deterministic PRNG (mulberry32). */
function random(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function seedFrom(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** How many groups to look for in `n` saves. */
export function groupCount(n: number): number {
  if (n < 12) return 0
  // ~12 posts per group; the caller keeps the best few, so a big library
  // yields tighter channels rather than a handful of catch-alls.
  return Math.min(16, Math.max(2, Math.round(n / 12)))
}

export function kmeans(
  vectors: Float32Array[],
  k: number,
  seed: number,
  iterations = 15,
): Cluster[] {
  const n = vectors.length
  if (n === 0 || k <= 0) return []
  k = Math.min(k, n)
  const rand = random(seed)
  const dims = vectors[0].length

  // k-means++ start: spread the first centres out.
  const centroids: Float32Array[] = [vectors[Math.floor(rand() * n)].slice()]
  const nearest = new Float64Array(n).fill(Infinity)
  while (centroids.length < k) {
    const last = centroids[centroids.length - 1]
    let total = 0
    for (let i = 0; i < n; i++) {
      const d = 1 - dot(vectors[i], last)
      if (d < nearest[i]) nearest[i] = d
      total += Math.max(0, nearest[i]) ** 2
    }
    let pick = rand() * total
    let chosen = n - 1
    for (let i = 0; i < n; i++) {
      pick -= Math.max(0, nearest[i]) ** 2
      if (pick <= 0) {
        chosen = i
        break
      }
    }
    centroids.push(vectors[chosen].slice())
  }

  const assign = new Int32Array(n).fill(-1)
  for (let it = 0; it < iterations; it++) {
    let moved = 0
    for (let i = 0; i < n; i++) {
      let best = 0
      let bestSim = -Infinity
      for (let c = 0; c < k; c++) {
        const s = dot(vectors[i], centroids[c])
        if (s > bestSim) {
          bestSim = s
          best = c
        }
      }
      if (assign[i] !== best) {
        assign[i] = best
        moved++
      }
    }
    for (let c = 0; c < k; c++) {
      const sum = new Float32Array(dims)
      let count = 0
      for (let i = 0; i < n; i++) {
        if (assign[i] !== c) continue
        count++
        const v = vectors[i]
        for (let d = 0; d < dims; d++) sum[d] += v[d]
      }
      if (count > 0) centroids[c] = normalizeInPlace(sum)
    }
    if (moved === 0) break
  }

  const clusters: Cluster[] = []
  for (let c = 0; c < k; c++) {
    const members: { i: number; s: number }[] = []
    for (let i = 0; i < n; i++)
      if (assign[i] === c) members.push({ i, s: dot(vectors[i], centroids[c]) })
    if (members.length === 0) continue
    members.sort((a, b) => b.s - a.s)
    clusters.push({
      members: members.map((m) => m.i),
      centroid: centroids[c],
      cohesion: members.reduce((t, m) => t + m.s, 0) / members.length,
    })
  }
  return clusters
}

/**
 * k-means, then split any group bigger than `maxSize` again (a couple of
 * levels deep). Real libraries clump: a few huge loose groups and many tiny
 * ones; splitting the big ones gives channels that are actually about
 * something.
 */
export function groupSaves(
  vectors: Float32Array[],
  seed: number,
  opts: { maxSize?: number; depth?: number } = {},
): Cluster[] {
  const maxSize = opts.maxSize ?? 36
  const depth = opts.depth ?? 2
  const split = (indexes: number[], level: number, k: number, s: number): Cluster[] => {
    const parts = kmeans(
      indexes.map((i) => vectors[i]),
      k,
      s,
    ).map((c) => ({ ...c, members: c.members.map((m) => indexes[m]) }))
    if (level >= depth) return parts
    return parts.flatMap((c) =>
      c.members.length > maxSize
        ? split(c.members, level + 1, Math.max(2, Math.round(c.members.length / 24)), s + level + 1)
        : [c],
    )
  }
  const k = groupCount(vectors.length)
  if (k === 0) return []
  return split(
    vectors.map((_, i) => i),
    0,
    k,
    seed,
  )
}
