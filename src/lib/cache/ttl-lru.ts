export interface TtlLruCacheOptions {
  maxSize: number
  ttlMs: number
}

interface CacheEntry<V> {
  value: V
  expiresAt: number
}

/**
 * Small in-process TTL/LRU cache with a hard entry cap.
 *
 * Expiry is lazy: reads remove an expired key, while writes sweep all expired
 * keys before evicting the least-recently-used live entry. This avoids global
 * timers while keeping attacker-controlled key spaces bounded.
 */
export class TtlLruCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>()
  private readonly maxSize: number
  private readonly ttlMs: number

  constructor({ maxSize, ttlMs }: TtlLruCacheOptions) {
    if (!Number.isInteger(maxSize) || maxSize <= 0) {
      throw new RangeError('maxSize must be a positive integer')
    }
    if (!Number.isFinite(ttlMs) || ttlMs < 0) {
      throw new RangeError('ttlMs must be a non-negative finite number')
    }
    this.maxSize = maxSize
    this.ttlMs = ttlMs
  }

  get size(): number {
    return this.entries.size
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }

    // Map iteration order is the LRU order. Reinsert a hit as most recent.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): this {
    const now = Date.now()
    this.entries.delete(key)
    this.sweepExpired(now)
    this.entries.set(key, { value, expiresAt: now + this.ttlMs })

    while (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
    return this
  }

  delete(key: K): boolean {
    return this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }

  private sweepExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key)
    }
  }
}
