/**
 * How long a page waits for channels being built for the first time. The
 * phone gives up after 15 seconds, and naming new channels can take longer;
 * past this the page shows what it has and the build carries on, so the
 * next visit gets them.
 */
export const FIRST_BUILD_WAIT_MS = 6_000

/** The promise's answer, or `fallback` when it takes longer than `ms` (it keeps running). */
export function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  return Promise.race([promise, late]).finally(() => clearTimeout(timer))
}
