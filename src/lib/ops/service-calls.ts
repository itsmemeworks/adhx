/**
 * How ADHX's calls to optional outside services went, for the admin System
 * page: Jev (search refine, channel and moment names, channel pictures),
 * sign-in email and FxTwitter (X post details).
 *
 * In memory in this process, since it started. Errors are kept only as a
 * kind ("HTTP 401", "timed out", "network error"): never a message body,
 * an address, a key or anything about who the call was for.
 */

export type ServiceId = 'jev' | 'email' | 'fxtwitter'

export interface ServiceCallStats {
  service: ServiceId
  purpose: string
  ok: number
  failed: number
  lastOkAt: number | null
  lastFailedAt: number | null
  lastError: string | null
  /** Average time of the last successful calls, in ms. */
  averageMs: number | null
}

type Entry = ServiceCallStats & { times: number[] }

const g = globalThis as unknown as { __adhxServiceCalls?: Map<string, Entry> }
const TIMES_KEPT = 20

function entries(): Map<string, Entry> {
  return (g.__adhxServiceCalls ??= new Map())
}

/** "HTTP 503", "timed out", "network error": the kind of failure, nothing more. */
export function failureKind(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'timed out'
    const status = error.message.match(/\b([45]\d\d)\b/)?.[1]
    if (status) return `HTTP ${status}`
    if (/fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket|network/i.test(error.message))
      return 'network error'
  }
  return 'failed'
}

export function noteServiceCall(
  service: ServiceId,
  purpose: string,
  outcome: { ok: true; ms: number } | { ok: false; error: unknown },
  now = Date.now(),
): void {
  const key = `${service}:${purpose}`
  const map = entries()
  const e: Entry = map.get(key) ?? {
    service,
    purpose,
    ok: 0,
    failed: 0,
    lastOkAt: null,
    lastFailedAt: null,
    lastError: null,
    averageMs: null,
    times: [],
  }
  if (outcome.ok) {
    e.ok++
    e.lastOkAt = now
    e.times = [...e.times.slice(-(TIMES_KEPT - 1)), outcome.ms]
    e.averageMs = Math.round(e.times.reduce((a, b) => a + b, 0) / e.times.length)
  } else {
    e.failed++
    e.lastFailedAt = now
    e.lastError = failureKind(outcome.error)
  }
  map.set(key, e)
}

/** Run a call and note how it went; the result or error passes through untouched. */
export async function trackServiceCall<T>(
  service: ServiceId,
  purpose: string,
  call: () => Promise<T>,
): Promise<T> {
  const started = Date.now()
  try {
    const result = await call()
    noteServiceCall(service, purpose, { ok: true, ms: Date.now() - started })
    return result
  } catch (error) {
    noteServiceCall(service, purpose, { ok: false, error })
    throw error
  }
}

export function serviceCalls(): ServiceCallStats[] {
  return [...entries().values()].map(({ times: _times, ...stats }) => stats)
}

/** Tests: forget every call. */
export function __resetServiceCalls(): void {
  g.__adhxServiceCalls = undefined
}
