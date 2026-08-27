import { NextRequest, NextResponse } from 'next/server'

/**
 * In-memory per-IP rate limiter for the unauthenticated media proxy routes.
 *
 * These are in-memory stores in the Node process, not a distributed store —
 * that's fine here because each ADHX deploy (staging/production) runs as a
 * single Fly machine, so there's only one process to keep counters in. If the
 * app ever scales to multiple machines this would need to move to a shared
 * store (e.g. Redis) to stay accurate across instances.
 *
 * Algorithm: fixed window per key. A key's counter resets once `windowMs` has
 * elapsed since the window started, rather than sliding continuously — simpler
 * than a token bucket and generous enough that a legitimate browsing session
 * (gallery hover previews, a handful of collection swipes) never trips it.
 */

export interface RateLimitOptions {
  /** Window length in ms. Defaults to 10 seconds. */
  windowMs?: number
  /** Max requests allowed per window. Defaults to 60. */
  max?: number
}

export interface RateLimitResult {
  limited: boolean
  remaining: number
  /** Milliseconds until the current window resets. */
  resetMs: number
}

const DEFAULT_WINDOW_MS = 10_000
const DEFAULT_MAX = 60

/** Hard cap per configured window; attacker-controlled IP keys cannot grow forever. */
const MAX_BUCKETS_PER_WINDOW = 5_000

interface RateLimitBucket {
  count: number
  expiresAt: number
}

/**
 * A limiter-specific bounded store. Unlike an LRU cache, it never evicts a
 * live counter: when all slots are live, unseen keys fail closed until the
 * earliest bucket expires. Because every bucket in one store has the same
 * window, insertion order is also expiry order, so eager expiry cleanup only
 * visits expired entries plus the first live entry.
 */
class RateLimitStore {
  private readonly buckets = new Map<string, RateLimitBucket>()

  constructor(
    private readonly windowMs: number,
    private readonly maxSize: number,
  ) {}

  get(key: string, now: number): RateLimitBucket | undefined {
    this.sweepExpired(now)
    return this.buckets.get(key)
  }

  add(key: string, now: number): { bucket: RateLimitBucket } | { resetMs: number } {
    if (this.buckets.size >= this.maxSize) {
      const earliest = this.buckets.values().next().value as RateLimitBucket | undefined
      return { resetMs: Math.max(0, (earliest?.expiresAt ?? now + this.windowMs) - now) }
    }

    const bucket = { count: 1, expiresAt: now + this.windowMs }
    this.buckets.set(key, bucket)
    return { bucket }
  }

  private sweepExpired(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt > now) break
      this.buckets.delete(key)
    }
  }
}

/**
 * Windows use independent bounded stores. Besides giving every bucket the
 * expiry it was created with, this prevents a short-window request from
 * sweeping a still-live long-window download/public-read bucket.
 *
 * Window lengths are trusted server configuration, not request input. The
 * attacker-controlled dimension is the key inside each hard-capped store.
 */
const bucketsByWindow = new Map<number, RateLimitStore>()

function bucketsForWindow(windowMs: number): RateLimitStore {
  let buckets = bucketsByWindow.get(windowMs)
  if (!buckets) {
    buckets = new RateLimitStore(windowMs, MAX_BUCKETS_PER_WINDOW)
    bucketsByWindow.set(windowMs, buckets)
  }
  return buckets
}

/**
 * Record a request for `key` and report whether it should be rate-limited.
 * Pure function of the shared in-memory stores — no I/O, safe to call per-request.
 */
export function checkRateLimit(key: string, opts?: RateLimitOptions): RateLimitResult {
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS
  const max = opts?.max ?? DEFAULT_MAX
  const now = Date.now()
  const buckets = bucketsForWindow(windowMs)

  const bucket = buckets.get(key, now)
  if (!bucket) {
    const added = buckets.add(key, now)
    if ('resetMs' in added) {
      return { limited: true, remaining: 0, resetMs: added.resetMs }
    }
    return { limited: false, remaining: max - 1, resetMs: windowMs }
  }

  bucket.count += 1
  const resetMs = Math.max(0, bucket.expiresAt - now)
  if (bucket.count > max) {
    return { limited: true, remaining: 0, resetMs }
  }
  return { limited: false, remaining: max - bucket.count, resetMs }
}

/** Test-only: clear all tracked state so tests don't leak between cases. */
export function __resetRateLimitState(): void {
  bucketsByWindow.clear()
}

/**
 * Best-effort client IP extraction for rate-limiting. Fly.io's edge sets
 * `Fly-Client-IP`, which is the production source of truth. Generic forwarding
 * headers are client-spoofable unless every request is known to traverse a
 * trusted proxy that overwrites them, so they are ignored unless the
 * server-controlled `TRUST_PROXY_IP_HEADERS=true` opt-in is set.
 *
 * Never throws — an unidentifiable client falls back to a shared `'unknown'`
 * bucket rather than being exempted from the limit.
 */
export function getClientIp(request: NextRequest | Request): string {
  const flyClientIp = request.headers.get('fly-client-ip')?.trim()
  if (flyClientIp) return flyClientIp

  if (process.env.TRUST_PROXY_IP_HEADERS === 'true') {
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded) {
      const first = forwarded.split(',')[0]?.trim()
      if (first) return first
    }

    const realIp = request.headers.get('x-real-ip')?.trim()
    if (realIp) return realIp
  }

  return 'unknown'
}

/**
 * Apply the shared media-proxy rate limit to an incoming request. Call at the
 * top of a route handler, before any external fetches:
 *
 * ```ts
 * const rateLimited = mediaRateLimit(request)
 * if (rateLimited) return rateLimited
 * ```
 *
 * Returns a 429 `NextResponse` (with `Retry-After`) when the caller's IP has
 * exceeded the window, else `null` — meaning the caller should proceed.
 */
export function mediaRateLimit(request: NextRequest, opts?: RateLimitOptions): NextResponse | null {
  const ip = getClientIp(request)
  const result = checkRateLimit(`media:${ip}`, opts)

  if (result.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': Math.ceil(result.resetMs / 1000).toString() },
      },
    )
  }

  return null
}

/**
 * Tighter, independent bucket for attachment downloads. Downloads are much
 * more expensive than range-based inline playback and must not consume (or be
 * hidden inside) the normal media-preview allowance.
 */
export function downloadRateLimit(
  request: NextRequest,
  opts: RateLimitOptions = { windowMs: 60_000, max: 10 },
): NextResponse | null {
  const ip = getClientIp(request)
  const result = checkRateLimit(`download:${ip}`, opts)

  if (result.limited) {
    return NextResponse.json(
      { error: 'Too many download requests' },
      {
        status: 429,
        headers: { 'Retry-After': Math.ceil(result.resetMs / 1000).toString() },
      },
    )
  }

  return null
}

/** Generous, independent backstop for expensive anonymous aggregate reads. */
export function publicReadRateLimit(
  request: NextRequest | Request,
  opts: RateLimitOptions = { windowMs: 60_000, max: 120 },
): NextResponse | null {
  const ip = getClientIp(request)
  const result = checkRateLimit(`public-read:${ip}`, opts)

  if (result.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': Math.ceil(result.resetMs / 1000).toString() },
      },
    )
  }

  return null
}

/**
 * Dedicated limiter for unauthenticated pulse writes. Separate from the
 * media bucket so a gallery hover session cannot starve share/preview,
 * and so we can keep the write cap tighter (15 / minute / IP).
 */
export function analyticsWriteLimit(request: NextRequest): NextResponse | null {
  const ip = getClientIp(request)
  const result = checkRateLimit(`analytics:${ip}`, { windowMs: 60_000, max: 30 })

  if (result.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': Math.ceil(result.resetMs / 1000).toString() },
      },
    )
  }

  return null
}

export function activityWriteLimit(request: NextRequest): NextResponse | null {
  const ip = getClientIp(request)
  const result = checkRateLimit(`activity:${ip}`, { windowMs: 60_000, max: 15 })

  if (result.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': Math.ceil(result.resetMs / 1000).toString() },
      },
    )
  }

  return null
}
