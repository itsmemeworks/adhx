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
 *
 * 2026-07-27 — **the 404 was never an outage: it means "not cached yet".**
 * vxinstagram's `PostCacheService.GetOrFetchAsync` populates lazily, so the
 * FIRST request for a given reel 404s while its scraper sidecar fetches the
 * post, and the same URL starts returning the MP4 ~10–20s later. Measured, one
 * reel per line, 4s between polls:
 *
 *     DYWuAmfuJ9t   404 → 404 → 404 → 200 (8.0MB) → 200 → 200
 *     DY-5H9gM3rZ   200 immediately (already warm from an earlier request)
 *
 * This resolver used to `break` on any non-429 status below 500 — i.e. it gave
 * up on precisely the status that means "come back in a moment". Net effect: the
 * first person to request any given Reel always got a failure, and it only
 * worked for reels somebody had already warmed. That, not a dead mirror, is why
 * downloads looked broken. The 07-23 pass below reached the wrong conclusion
 * because it probed each id **once**. vxinstagram now carries `retryStatuses:
 * [404]` with a backoff long enough to outlast the cold fetch.
 *
 * Still true: a 404 that persists across the full retry budget does mean the
 * post is genuinely unavailable (some reels never resolve), so callers must still
 * handle null — the download UI gates on it via `isMediaAvailable()`.
 *
 * The 07-23 pass's dead-end list is kept below, extended with the surfaces
 * checked on 07-27. Don't spend the time on these again:
 * - **Instagram's own web API**, `i.instagram.com/api/v1/media/{mediaId}/info/`
 *   with the public `X-IG-App-ID`. Reachable without a third party (the shortcode
 *   → numeric media id conversion is pure base64 math, no network), but it
 *   302s to `/accounts/login/` unauthenticated. Only cookies would fix it, and
 *   that means an IG account — ToS risk, ban risk, and a per-user cost.
 * - **Instagram's official embed**, `/reel/{id}/embed/captioned/`: 200s but is
 *   now a pure JS shell (~600KB of `rsrc.php` bundles, `<title>Instagram</title>`,
 *   zero post data). Would need a headless browser.
 * - **`og:video` on the reel page itself**: gone. The OG scrape we already do
 *   still returns `og:title` + `og:image`, so captions and posters come straight
 *   from Instagram; only the video needs a mirror at all.
 * - **imginn.com** 403 (bot-walled), **picuki.com** 403, **iganony.io** DNS
 *   failure, **dumpor.com** 200 but the HTML carries only its own site chrome,
 *   **kkinstagram.com** redirects to a `kkclip.com` "open in app" landing.
 *
 * (Those remain worth knowing about as *fallbacks*: vxinstagram is still a single
 * point of failure. But none of them is usable today, so the registry stays at
 * one entry.)
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

/**
 * Resolve a streamable Instagram video upstream `Response`, trying each mirror
 * in order and retrying per that mirror's policy.
 *
 * Retries matter for two different reasons here:
 * - the signed CDN handoff flaps (5xx) and bursts get rate-limited (429), and
 *   each attempt mints a FRESH token, so repeating usually succeeds;
 * - vxinstagram populates its cache lazily, so the first request for a Reel
 *   **404s for ~10–20s** while its backend fetches the post (see the log above).
 *   That's why 404 is retryable for it — treating it as fatal, which this
 *   resolver used to do, failed every first-ever request for a given Reel.
 *
 * Returns null once a mirror's budget is spent on a genuinely-unavailable post,
 * so the caller can 502 and the client degrades to the poster.
 */
export async function resolveInstagramVideo(
  id: string,
  opts?: { range?: string | null; attemptsPerMirror?: number },
): Promise<Response | null> {
  for (const mirror of INSTAGRAM_MIRRORS) {
    const attempts = opts?.attemptsPerMirror ?? mirror.attempts ?? 3
    const backoffMs = mirror.backoffMs ?? 400
    const url = mirror.videoUrl({ id })

    for (let i = 0; i < attempts; i++) {
      let retryable = true
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
        retryable = isRetryableStatus(res.status, mirror)
      } catch {
        // Network/timeout — always worth retrying.
      }
      // A status this mirror can't recover from won't improve with time.
      if (!retryable) break
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, backoffMs * (i + 1)))
      }
    }
  }
  return null
}

/** SSRF allowlist covering every configured Instagram-mirror host (+ subdomains). */
export const isAllowedInstagramMirrorUrl = makeHostAllowlist(
  INSTAGRAM_MIRRORS.flatMap((m) => m.hosts.flatMap((h) => [h, `.${h}`])),
)
