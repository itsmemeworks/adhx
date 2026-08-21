/**
 * `fetch()` wrapper that always aborts after `timeoutMs`.
 *
 * Replaces the ~30 duplicated `fetch(url, { ..., signal: AbortSignal.timeout(N) })`
 * call sites across the codebase (server routes + a few client hooks) with one
 * shared helper. Dependency-free and isomorphic — works in both Node (API
 * routes) and the browser.
 *
 * If `init.signal` is already set, it's combined with the timeout via
 * `AbortSignal.any()` so aborting either one aborts the request — the caller's
 * signal isn't silently dropped.
 */
export function fetchWithTimeout(
  url: string | URL,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal
  return fetch(url, { ...init, signal })
}
