/**
 * Instagram Reel playback: wait for our MP4 proxy before handing a URL to
 * `<video>`, and fall back to Instagram's official embed when the mirror
 * never warms.
 *
 * Why this exists: vxinstagram populates lazily, so `/api/media/instagram/video`
 * can 404-retry for ~10–20s on a cold Reel (see `mirrors.ts`). Safari and Chrome
 * media elements often abort sooner than that, which used to surface as
 * "Failed to load video" even though the proxy would have 200'd a moment later.
 * A `fetch()` with a long timeout is not bound by that media-element limit.
 */

export const INSTAGRAM_PROBE_TIMEOUT_MS = 35_000
export const INSTAGRAM_PROBE_ATTEMPTS = 2

/** Official embed — last-resort playback when the MP4 mirror never comes back. */
export function instagramEmbedUrl(id: string): string {
  return `https://www.instagram.com/reel/${encodeURIComponent(id)}/embed/`
}

export function instagramVideoSrc(id: string): string {
  return `/api/media/instagram/video?id=${encodeURIComponent(id)}`
}

/**
 * Confirm the MP4 proxy is ready (Range 0-1, so we don't download the file).
 * Returns true for video, a photo count for a confirmed image post, or false
 * when unavailable (callers then embed).
 */
export async function probeInstagramVideo(
  id: string,
  opts?: { fetch?: typeof fetch; signal?: AbortSignal },
): Promise<boolean | { photoCount: number }> {
  const doFetch = opts?.fetch ?? globalThis.fetch
  const url = instagramVideoSrc(id)

  for (let i = 0; i < INSTAGRAM_PROBE_ATTEMPTS; i++) {
    if (opts?.signal?.aborted) return false
    try {
      const timeout = AbortSignal.timeout(INSTAGRAM_PROBE_TIMEOUT_MS)
      const signal = opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
      const res = await doFetch(url, {
        headers: { Range: 'bytes=0-1' },
        signal,
      })
      if (res.status === 409) {
        const data = await res.json()
        if (
          data.contentType === 'photo' &&
          Number.isInteger(data.photoCount) &&
          data.photoCount >= 1 &&
          data.photoCount <= 20
        ) {
          return { photoCount: data.photoCount }
        }
        return false
      }
      await res.body?.cancel()
      if (res.ok || res.status === 206) return true
      // Server already spent the mirror retry budget. Don't wait another 35s.
      if (res.status === 400 || res.status === 502) return false
    } catch {
      // Timeout / network — one more try, then give up.
    }
  }
  return false
}
