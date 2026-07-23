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
}

/**
 * Instagram Reel video mirrors, tried in order.
 *
 * - **vxinstagram** — `/offload/{id}/0.mp4` 302-redirects to a signed
 *   `d.rapidcdn.app` URL that streams the real Instagram CDN MP4 with Range
 *   support. (Add a fallback mirror here if/when this one degrades.)
 *
 * 2026-07-23 outage investigation (downloads reported broken again): live-probed
 * this mirror plus every deterministic-URL alternative found. Findings, in case
 * this recurs:
 * - **vxinstagram** is currently the bottleneck: the site itself is up (its docs
 *   page serves fine, and its documented route shape — `/offload/{id}/{order}.mp4`,
 *   confirmed against the upstream source at
 *   github.com/Lainmode/InstagramEmbed-vxinstagram — matches what we build here),
 *   but `OffloadPost` 404s for every reel id tried (old + brand-new/viral,
 *   several retries with backoff). Its `PostCacheService` proxies through a
 *   bundled local SnapSave scraper sidecar (`GetOrFetchAsync` → `/igdl?url=`)
 *   that is returning no media right now — an upstream outage on their side, not
 *   a URL-shape problem on ours. Left configured as-is: `resolveInstagramVideo`
 *   already retries/degrades gracefully, and this class of service is known to
 *   flap (their own tracker has an issue titled almost exactly that).
 * - **toinstagram.com / uuinstagram.com** (the old InstaFix-based pair, see
 *   `src/lib/media/instafix.ts`) confirmed still dead: both 302 straight to
 *   instagram.com, matching the documented 2026-04-02 InstaFix archival.
 * - **ddinstagram.com** — NXDOMAIN, the domain itself is gone.
 * - **kkinstagram.com** — resolves, but every path (including the vxinstagram
 *   offload shape) redirects to a `kkclip.com` "Open in App" landing page, not a
 *   streamable MP4 — no deterministic API surface.
 * - **instagramez.com** — domain parked/repurposed to an ad-CPM redirect, unrelated
 *   to Instagram.
 * - **fastdl.app** — no deterministic server-side URL to build from just an id;
 *   it's a paste-a-link UI that resolves a token per request (per their own
 *   description: browser → extraction API → yt-dlp backend → CDN URL, cache-only,
 *   nothing stable to construct ahead of time). Unsuitable for this registry.
 *
 * No replacement added — nothing found actually streams a video right now.
 * When vxinstagram's sidecar recovers this should self-heal with no code change.
 */
export const INSTAGRAM_MIRRORS: VideoMirror[] = [
  {
    name: 'vxinstagram',
    videoUrl: ({ id }) => `https://www.vxinstagram.com/offload/${encodeURIComponent(id)}/0.mp4`,
    hosts: ['vxinstagram.com', 'rapidcdn.app'],
  },
]

/** Ordered candidate stream URLs for an Instagram Reel (one per mirror). */
export function instagramVideoUrls(id: string): string[] {
  return INSTAGRAM_MIRRORS.map((m) => m.videoUrl({ id }))
}

const STREAM_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

/**
 * Resolve a streamable Instagram video upstream `Response`, trying each mirror
 * in order and retrying transient failures.
 *
 * The mirrors are flaky and rate-limit bursts (429), and the signed CDN URL
 * they hand off to can intermittently 5xx. Each request mints a FRESH token, so
 * a retry with backoff usually succeeds. Gives up on a genuine 4xx (e.g. 404 —
 * the reel isn't a video / is gone). Returns null when nothing resolves, so the
 * caller can 502 and the client degrades to the poster.
 */
export async function resolveInstagramVideo(
  id: string,
  opts?: { range?: string | null; attemptsPerMirror?: number },
): Promise<Response | null> {
  const attempts = opts?.attemptsPerMirror ?? 3
  for (const url of instagramVideoUrls(id)) {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(30_000),
          redirect: 'follow',
          headers: {
            'User-Agent': STREAM_UA,
            ...(opts?.range ? { Range: opts.range } : {}),
          },
        })
        if ((res.ok || res.status === 206) && res.body) return res
        await res.body?.cancel()
        // Retry rate-limits (429) and CDN 5xx (fresh token may work); a genuine
        // 4xx (reel gone / not a video) won't improve — move to the next mirror.
        if (res.status !== 429 && res.status < 500) break
      } catch {
        // Network/timeout — retry.
      }
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)))
      }
    }
  }
  return null
}

/** SSRF allowlist covering every configured Instagram-mirror host (+ subdomains). */
export const isAllowedInstagramMirrorUrl = makeHostAllowlist(
  INSTAGRAM_MIRRORS.flatMap((m) => m.hosts.flatMap((h) => [h, `.${h}`])),
)
