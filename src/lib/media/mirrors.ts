/**
 * Pluggable video-mirror registry.
 *
 * Short-form platforms don't expose a CORS-friendly MP4, so we resolve a
 * streamable URL through a third-party "fix"/mirror service and proxy it. These
 * mirrors die periodically (the original Instagram ones did, which is why IG was
 * degraded for a while), so they're defined here as **data**: to add, swap, or
 * reorder one, edit the arrays below — the proxy routes iterate the list in
 * order and fall back to the next mirror when one fails. No route logic changes.
 */

import { makeHostAllowlist } from '@/lib/media/proxy'

export interface VideoMirror {
  /** Identifier, for logs. */
  name: string
  /** Build a candidate streamable MP4 URL for a post id (+ optional author). */
  videoUrl(opts: { id: string; author?: string }): string
  /**
   * Hosts the stream may come from — the mirror's own host plus any CDN it
   * redirects to. Feeds the SSRF allowlist. List the base domain; both the
   * exact host and its subdomains are allowed.
   */
  hosts: string[]
  /**
   * Extra HTTP statuses worth retrying for this mirror, on top of the always-
   * retryable 429 / 5xx. Use for a mirror whose "not ready" signal is otherwise
   * indistinguishable from "gone" — see vxinstagram's cold-cache 404 below.
   */
  retryStatuses?: number[]
  /**
   * Attempts and base backoff (ms, multiplied by attempt number) for this
   * mirror. A lazily-populating mirror needs a long enough total wait for its
   * backend to finish fetching the post.
   */
  attempts?: number
  backoffMs?: number
}

/**
 * Instagram MP4 fallback when the direct crawler/CDN path cannot resolve video.
 * vxinstagram's offload route redirects to rapidcdn.app. A cold 404 can warm
 * after 10–20s, so preserve retries; repeated 5xx can also indicate an outage.
 * The public payload's video_versions is now the primary path (instagram-video.ts).
 */
export const INSTAGRAM_MIRRORS: VideoMirror[] = [
  {
    name: 'vxinstagram',
    videoUrl: ({ id }) => `https://www.vxinstagram.com/offload/${encodeURIComponent(id)}/0.mp4`,
    hosts: ['vxinstagram.com', 'rapidcdn.app'],
    // 404 = "cold cache, sidecar still fetching" (see above), so it's retryable.
    retryStatuses: [404],
    // ~1.5+3+4.5+6+7.5s = 22.5s of backoff across 6 attempts, comfortably past
    // the ~10–20s cold fetch measured above and inside Fly's 60s proxy timeout.
    attempts: 6,
    backoffMs: 1500,
  },
]

/** Ordered candidate stream URLs for an Instagram Reel (one per mirror). */
export function instagramVideoUrls(id: string): string[] {
  return INSTAGRAM_MIRRORS.map((m) => m.videoUrl({ id }))
}

/**
 * Whether a failed attempt is worth repeating against the same mirror.
 *
 * Always: 429 (burst rate-limit) and 5xx (the signed CDN handoff flaps, and each
 * attempt mints a fresh token). Plus whatever the mirror declares in
 * `retryStatuses` — for vxinstagram that's 404, its cold-cache signal.
 */
export function isRetryableStatus(status: number, mirror: VideoMirror): boolean {
  if (status === 429 || status >= 500) return true
  return mirror.retryStatuses?.includes(status) ?? false
}

const STREAM_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const INSTAGRAM_RESOLVE_TIMEOUT_MS = 50_000
const MIRROR_ATTEMPT_TIMEOUT_MS = 30_000
const MAX_MIRROR_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

class UnsafeMirrorRedirectError extends Error {}

function cancelResponseBody(response: Response): void {
  try {
    const cancellation = response.body?.cancel()
    if (cancellation) void cancellation.catch(() => undefined)
  } catch {
    // The stream may already be locked/cancelled; there is nothing else to release.
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

/** Abortable backoff with listener/timer cleanup on every settlement path. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortReason(signal))

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(abortReason(signal))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function retainTimeoutThroughBody(response: Response, cleanup: () => void): Response {
  if (!response.body) {
    cleanup()
    return response
  }

  const reader = response.body.getReader()
  let finalized = false
  const finalize = () => {
    if (finalized) return
    finalized = true
    reader.releaseLock()
    cleanup()
  }

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          finalize()
          controller.close()
        } else {
          controller.enqueue(value)
        }
      } catch (error) {
        finalize()
        controller.error(error)
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason)
      } finally {
        finalize()
      }
    },
  })

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

async function fetchMirrorAttempt(
  initialUrl: string,
  timeoutMs: number,
  signal: AbortSignal,
  range?: string | null,
): Promise<Response> {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(
    () =>
      timeoutController.abort(
        new DOMException(`Mirror attempt timed out after ${timeoutMs}ms`, 'TimeoutError'),
      ),
    timeoutMs,
  )
  const attemptSignal = AbortSignal.any([signal, timeoutController.signal])
  let timeoutHandedToBody = false

  try {
    let currentUrl = initialUrl

    for (let redirects = 0; ; redirects++) {
      if (!isAllowedInstagramMirrorUrl(currentUrl)) {
        throw new UnsafeMirrorRedirectError(`Disallowed Instagram mirror URL: ${currentUrl}`)
      }

      const response = await fetch(currentUrl, {
        redirect: 'manual',
        headers: {
          'User-Agent': STREAM_UA,
          ...(range ? { Range: range } : {}),
        },
        signal: attemptSignal,
      })

      if (!REDIRECT_STATUSES.has(response.status)) {
        timeoutHandedToBody = true
        return retainTimeoutThroughBody(response, () => clearTimeout(timeoutId))
      }

      const location = response.headers.get('location')
      if (!location) {
        timeoutHandedToBody = true
        return retainTimeoutThroughBody(response, () => clearTimeout(timeoutId))
      }

      cancelResponseBody(response)
      if (redirects >= MAX_MIRROR_REDIRECTS) {
        throw new UnsafeMirrorRedirectError('Instagram mirror exceeded redirect limit')
      }

      const nextUrl = new URL(location, currentUrl).toString()
      if (!isAllowedInstagramMirrorUrl(nextUrl)) {
        throw new UnsafeMirrorRedirectError(`Disallowed Instagram mirror redirect: ${nextUrl}`)
      }
      currentUrl = nextUrl
    }
  } finally {
    if (!timeoutHandedToBody) clearTimeout(timeoutId)
  }
}

/**
 * Resolve a streamable Instagram video upstream `Response`, trying each mirror
 * in order and retrying per that mirror's policy.
 *
 * Retries matter for two different reasons here:
 * - the signed CDN handoff flaps (5xx) and bursts get rate-limited (429), and
 *   each attempt mints a FRESH token, so repeating usually succeeds;
 * - vxinstagram populates its cache lazily, so the first request for a Reel
 *   **404s for ~10–20s** while its backend fetches the post (see the registry above).
 *   That's why 404 is retryable for it — treating it as fatal, which this
 *   resolver used to do, failed every first-ever request for a given Reel.
 *
 * Returns null once a mirror's budget is spent on a genuinely-unavailable post,
 * so the caller can 502 and the client degrades to the poster.
 */
export async function resolveInstagramVideo(
  id: string,
  opts?: {
    range?: string | null
    attemptsPerMirror?: number
    signal?: AbortSignal
    totalTimeoutMs?: number
    attemptTimeoutMs?: number
  },
): Promise<Response | null> {
  const totalTimeoutMs = opts?.totalTimeoutMs ?? INSTAGRAM_RESOLVE_TIMEOUT_MS
  if (totalTimeoutMs <= 0) return null
  if (opts?.signal?.aborted) throw abortReason(opts.signal)

  // One timer bounds redirects, attempts, and backoff together. It is cleared
  // when resolution settles, while a caller signal remains attached to a
  // successful response body so downstream cancellation still works.
  const deadline = Date.now() + totalTimeoutMs
  const deadlineController = new AbortController()
  const deadlineId = setTimeout(
    () =>
      deadlineController.abort(
        new DOMException(
          `Instagram video resolution timed out after ${totalTimeoutMs}ms`,
          'TimeoutError',
        ),
      ),
    totalTimeoutMs,
  )
  const operationSignal = opts?.signal
    ? AbortSignal.any([opts.signal, deadlineController.signal])
    : deadlineController.signal

  try {
    for (const mirror of INSTAGRAM_MIRRORS) {
      const attempts = opts?.attemptsPerMirror ?? mirror.attempts ?? 3
      const backoffMs = mirror.backoffMs ?? 400
      const url = mirror.videoUrl({ id })

      for (let i = 0; i < attempts; i++) {
        const remainingMs = deadline - Date.now()
        if (remainingMs <= 0 || deadlineController.signal.aborted) return null

        let retryable = true
        try {
          const attemptTimeoutMs = Math.min(
            opts?.attemptTimeoutMs ?? MIRROR_ATTEMPT_TIMEOUT_MS,
            remainingMs,
          )
          const res = await fetchMirrorAttempt(url, attemptTimeoutMs, operationSignal, opts?.range)
          if ((res.ok || res.status === 206) && res.body) return res
          cancelResponseBody(res)
          retryable = isRetryableStatus(res.status, mirror)
        } catch (error) {
          if (opts?.signal?.aborted) throw abortReason(opts.signal)
          if (deadlineController.signal.aborted) return null
          // Network/per-attempt timeout is retryable. An unsafe or excessive
          // redirect is a configuration/policy failure and must not be retried.
          retryable = !(error instanceof UnsafeMirrorRedirectError)
        }

        // A status this mirror can't recover from won't improve with time.
        if (!retryable) break
        if (i < attempts - 1) {
          const delayMs = backoffMs * (i + 1)
          const remainingAfterAttemptMs = deadline - Date.now()
          // A partial sleep that consumes the rest of the budget cannot lead to
          // another attempt, so stop instead of scheduling beyond the deadline.
          if (delayMs >= remainingAfterAttemptMs) return null
          try {
            await sleep(delayMs, operationSignal)
          } catch {
            if (opts?.signal?.aborted) throw abortReason(opts.signal)
            return null
          }
        }
      }
    }
    return null
  } finally {
    clearTimeout(deadlineId)
  }
}

/** SSRF allowlist covering every configured Instagram-mirror host (+ subdomains). */
export const isAllowedInstagramMirrorUrl = makeHostAllowlist(
  INSTAGRAM_MIRRORS.flatMap((m) => m.hosts.flatMap((h) => [h, `.${h}`])),
)
