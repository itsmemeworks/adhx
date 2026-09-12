import { TtlLruCache } from '@/lib/cache/ttl-lru'
import { fetchFreshInstagramMetadata, fetchInstagramMetadata, isValidInstagramId } from './instafix'
import { resolveInstagramVideo as resolveMirrorVideo } from './mirrors'
import { fetchWithAllowlistedRedirects } from './proxy'

const CDN_HOSTS = ['cdninstagram.com', '.cdninstagram.com', 'fbcdn.net', '.fbcdn.net']
const RESOLVE_TIMEOUT_MS = 30_000
// A refreshed URL must survive the probe → player handoff even while Next's
// metadata cache still contains the old signed URL. Never cache response bodies.
const videoUrls = new TtlLruCache<string, string>({ maxSize: 1000, ttlMs: 30 * 60_000 })

export type InstagramVideoResult =
  | { kind: 'video'; response: Response }
  | { kind: 'photo'; photoCount: number }
  | { kind: 'unavailable' }

/** Stop waiting without cancelling a metadata request shared by Next's cache. */
function untilAborted<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
    if (signal.aborted) {
      signal.removeEventListener('abort', abort)
      abort()
    }
  })
}

function isVideo(response: Response): boolean {
  const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  return (
    (response.status === 200 || response.status === 206) &&
    !!response.body &&
    (mime === 'video/mp4' || mime === 'application/octet-stream')
  )
}

/** Direct public Instagram CDN first; bounded mirror fallback for missing media. */
export async function resolveInstagramVideo(
  id: string,
  opts?: { range?: string | null; signal?: AbortSignal },
): Promise<InstagramVideoResult> {
  if (!isValidInstagramId(id) || opts?.signal?.aborted) return { kind: 'unavailable' }
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), RESOLVE_TIMEOUT_MS)
  const signal = opts?.signal ? AbortSignal.any([opts.signal, deadline.signal]) : deadline.signal
  try {
    const metadata = await untilAborted(fetchInstagramMetadata(id), signal)
    // Only the structured payload can conclusively override an old Reel label.
    // OpenGraph alone may expose a poster without identifying the actual type.
    if (metadata?.mediaComplete && metadata.contentType === 'photo') {
      return { kind: 'photo', photoCount: metadata.media.length }
    }
    let url = videoUrls.get(id) ?? metadata?.media[0]?.videoUrl
    for (let attempt = 0; url && attempt < 2 && !signal.aborted; attempt++) {
      let expired = false
      try {
        const response = await fetchWithAllowlistedRedirects(url, {
          hosts: CDN_HOSTS,
          timeoutMs: 30_000,
          init: {
            signal,
            headers: {
              'User-Agent': 'Mozilla/5.0',
              Referer: 'https://www.instagram.com/',
              ...(opts?.range ? { Range: opts.range } : {}),
            },
          },
        })
        if (isVideo(response)) {
          videoUrls.set(id, url)
          return { kind: 'video', response }
        }
        expired = [401, 403, 404, 410].includes(response.status)
        await response.body?.cancel()
      } catch {
        // Unsafe redirects, network failures and non-video responses never
        // become a player source. The independent mirror may still work.
      }
      videoUrls.delete(id)
      if (!expired || attempt > 0 || signal.aborted) break
      const fresh = await untilAborted(fetchFreshInstagramMetadata(id), signal)
      url = fresh?.media[0]?.videoUrl
    }
    if (!signal.aborted) {
      const response = await resolveMirrorVideo(id, { range: opts?.range, signal })
      if (response && isVideo(response)) return { kind: 'video', response }
      await response?.body?.cancel()
    }
  } catch {
    // Caller cancellation or the shared resolution deadline ends all attempts.
  } finally {
    clearTimeout(timer)
  }
  return { kind: 'unavailable' }
}
