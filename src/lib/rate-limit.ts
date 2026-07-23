import { NextRequest, NextResponse } from 'next/server'

/**
 * In-memory per-IP rate limiter for the unauthenticated media proxy routes.
 *
 * This is a single `Map` in the Node process, not a distributed store — that's
 * fine here because each ADHX deploy (staging/production) runs as a single Fly
 * machine, so there's only one process to keep counters in. If the app ever
 * scales to multiple machines this would need to move to a shared store
 * (e.g. Redis) to stay accurate across instances.
 *
 * Algorithm: fixed window per key. A key's counter resets once `windowMs` has
 * elapsed since the window started, rather than sliding continuously — simpler
 * than a token bucket and generous enough that a legitimate browsing session
 * (gallery hover previews, a handful of triage swipes) never trips it.
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

/** Above this many tracked keys, opportunistically sweep expired windows. */
const CLEANUP_THRESHOLD = 5_000

const buckets = new Map<string, { count: number; windowStart: number }>()

function cleanupStaleBuckets(now: number, windowMs: number): void {
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.windowStart >= windowMs) {
      buckets.delete(key)
    }
  }
}

/**
 * Record a request for `key` and report whether it should be rate-limited.
 * Pure function of the shared `buckets` map — no I/O, safe to call per-request.
 */
export function checkRateLimit(key: string, opts?: RateLimitOptions): RateLimitResult {
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS
  const max = opts?.max ?? DEFAULT_MAX
  const now = Date.now()

  const bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now })
    if (buckets.size > CLEANUP_THRESHOLD) cleanupStaleBuckets(now, windowMs)
    return { limited: false, remaining: max - 1, resetMs: windowMs }
  }

  bucket.count += 1
  const resetMs = Math.max(0, windowMs - (now - bucket.windowStart))
  if (bucket.count > max) {
    return { limited: true, remaining: 0, resetMs }
  }
  return { limited: false, remaining: max - bucket.count, resetMs }
}

/** Test-only: clear all tracked state so tests don't leak between cases. */
export function __resetRateLimitState(): void {
  buckets.clear()
}

/**
 * Best-effort client IP extraction for rate-limiting. Fly.io (and most
 * proxies) set `x-forwarded-for`; `x-real-ip` is a fallback some setups use
 * instead. Never throws — an unidentifiable client falls back to a shared
 * `'unknown'` bucket rather than being exempted from the limit.
 */
export function getClientIp(request: NextRequest | Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp

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
