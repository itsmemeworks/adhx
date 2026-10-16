# Any-site links: more platforms, proxy only

Status: study, measured 2026-10-16. No code wired yet.

## Decision (owner, 2026-10-16)

- **No yt-dlp, no gallery-dl.** linktokeep.com appears to use them: per-site extractors plus server-side download and remux, with files
  kept for an hour. ADHX won't run a downloader. It only **proxies**: a hand-written adapter per site finds a fresh
  public media URL, and the existing same-origin `/api/media/*` routes stream it. Nothing is stored.
- **Drop YouTube.** Shorts can only play through the official iframe. ADHX can't sample frames from it, so it can't
  understand Shorts the way it understands X, Instagram and TikTok. Saved Shorts are deleted too, by
  `src/lib/db/drop-youtube.ts` at migrate time.

That gives a rule for adding any site:

1. The server can resolve the post to a direct media URL with no login, from a public, preferably official, source.
2. The media is unencrypted MP4, HLS or an image, so the browser can play it through the proxy and ffmpeg can sample it.
3. It loads from London. Fly runs in `lhr`, and this test ran from a UK home connection (BT).

A site that only offers an iframe embed fails rule 2, for the same reason YouTube was dropped.

## Measured results

One real public post per site, fetched from a UK home IP with plain `curl` and a browser user agent. Frames were sampled
with the repo's bundled `ffmpeg-static` 5.3.0, using the same arguments as `sampleVideoFrames`: first 32 s,
`fps=0.5`, 512 px wide, at most 16 frames. Times are single runs, so treat them as rough.

| Site | Public source used | Official? | Resolve | Media | Audio | Frames | Sample time | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Bluesky** | `public.api.bsky.app` `resolveHandle` + `getPostThread` | Yes, public AT Protocol AppView | 1.1 s (2 calls) | HLS `video.bsky.app` (+ `video.cdn.bsky.app` segments), images `cdn.bsky.app` | none in test clip | 7 (14 s clip) | 2.5 s | **Go** |
| **Streamable** | `api.streamable.com/videos/{code}` | Yes, public JSON | 0.37 s | MP4 `cdn-cf-*.streamable.com`, signed `Expires=` (~3 days) | yes | 16 | 0.6 s | **Go** |
| **LinkedIn** | `linkedin.com/embed/feed/update/urn:li:activity:{id}` | Yes, official embed page | 0.55 s | MP4 `dms.licdn.com` (`data-sources`, `e=2147483647`, so it doesn't expire), images `media.licdn.com` | yes | 16 | 0.5 s | **Go** |
| **Pinterest** | `widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=` (+ pin page HTML) | Semi: the public widget API | 0.24 s | images `i.pinimg.com`; video HLS + `_720w.mp4` on `v1.pinimg.com`, unsigned | yes | 16 | 1.9 s | **Go** |
| **Reddit** | `vxreddit.com` OG tags → `v.redd.it/{id}/HLSPlaylist.m3u8` | No: third-party fixer, the same role fxembed plays for X | 2.7 s | HLS `v.redd.it` (video + audio renditions). The `DASH_*.mp4` files return 403. | yes | 6 (12 s clip) | 1.5 s | **Go, with fixer risk** |
| **Facebook** | `facebook.com/plugins/video.php?href=` → `hd_src`/`sd_src` | Yes, official video embed plugin (the HTML is scraped) | ~0.4 s | MP4 `video.*.fbcdn.net`, signed `oe=`, expires in ~4.5 days, 302s to a sibling fbcdn host | yes | 16 | 0.6 s | **Maybe**: fragile scrape |
| **Twitch clips** | `gql.twitch.tv` with the public web Client-Id, `clip { videoQualities, playbackAccessToken }` | No: undocumented GraphQL. The persisted-query hash had already gone stale; a raw query worked. | 0.28 s | MP4 with `sig`/`token` | yes | 16 | 1.3 s | **Maybe**: unofficial |
| **Threads** | post page with a bot user agent (OG tags) + `graph.threads.net/v1.0/oembed` (no token needed) | Yes for oEmbed; OG scrape for media | 0.45 s | image `scontent.*.fbcdn.net`, signed `oe=`, ~4.5 days. Video not found/tested. | n/a | n/a | n/a | **Maybe**: images verified only. fixthreads.net returned nothing; vxthreads.net timed out. |
| Vimeo | `vimeo.com/api/oembed.json` + `player.vimeo.com/video/{id}/config` | Yes / semi | 0.3 s | oEmbed works. Config is **403** for current staff picks. For Vimeo's own video it had no progressive files and the HLS was **DRM-encrypted**: ffmpeg frames were noise. | — | garbage | — | **No-go**: embed only, like YouTube |
| Dailymotion | `api.dailymotion.com` + `/player/metadata/video/{id}` | Yes | 0.3–0.8 s | Metadata fine. The HLS manifest returns **403** to the server, even with cookies, Referer and Origin set. | — | 0 | — | **No-go**: embed only |
| SoundCloud | `soundcloud.com/oembed` | Yes | 0.16 s | Widget iframe only. The stream needs the `client_id` scraped from SoundCloud's JS. | audio only | no picture | — | **No-go**: nothing to see; unofficial stream |
| Imgur | `api.imgur.com`, `imgur.com/gallery`, `i.imgur.com` | — | — | **403 "Content not available in your region"**. `i.imgur.com` returns a placeholder PNG. Imgur has blocked the UK since late 2025, and Fly `lhr` is in the UK. | — | — | — | **No-go** from `lhr` |

Other findings:

- **Reddit blocks unauthenticated JSON**, even from a residential IP. `www.reddit.com/…/.json` and `api.reddit.com` return 403,
  `old.reddit.com` redirects to login, and the HTML is a JS challenge page. Reddit's own oEmbed
  (`/oembed?url=`) does work and gives author and title, but no media. The official route is the OAuth Data API, which needs an
  app registration. Without that, we depend on vxreddit, exactly as we depend on fxembed for X.
- Bluesky's `searchPosts` is 403 when called without auth. Resolving one post still works.
- Signed CDN URLs expire: fbcdn `oe=` in ~4.5 days, Streamable `Expires=` in ~3 days, Twitch tokens sooner. Resolve again at play
  time and never store them, which matches what ADHX already does for X, Instagram and TikTok.
- **Not measured: datacenter IPs.** The owner chose to skip this. Expect Reddit (and vxreddit itself), Facebook, LinkedIn and
  Threads to be the first to 403 or rate-limit Fly's egress IPs. Bluesky, Streamable and Pinterest's widget API are built for
  server-side callers. Verify from a Fly machine before turning any adapter on in production.

## Recommendation

**Go, one site at a time, in this order:**

1. **Bluesky.** Official, unauthenticated, stable, and serves HLS plus images. It's the closest match to how ADHX already works.
2. **Streamable.** Official public JSON and a plain MP4. Often what people link from Reddit and X.
3. **LinkedIn.** The official embed page has non-expiring MP4s and images. Check the datacenter IP behaviour first.
4. **Pinterest.** The widget API gives images and video for pins.
5. **Reddit via vxreddit.** It works, but it adds a second fixer dependency. Consider the official OAuth API if Reddit becomes
   important.

Hold Facebook, Twitch and Threads until there's demand. They work today, but they rely on scraped or undocumented endpoints.
**Don't add** Vimeo, Dailymotion or SoundCloud: they're embed-only or audio-only, so they fail the understanding rule that
YouTube was removed under. Don't add Imgur either, while it blocks the UK.

## Integration sketch

Follow the existing per-site adapter pattern (`fxembed.ts`, `instafix.ts`, `tnktok.ts`). Don't add a generic extractor.

- **Platform ids.** Add each site as its own id in `PlatformId` (`src/lib/platform/url.ts`) and `Platform` / `PlatformFilter`
  (`src/components/feed/types.ts`), for example `'bluesky' | 'streamable'`. Don't add a catch-all `'link'`. Each site has its own URL
  pattern, host allowlist and id shape, and `detectPlatformPost` stays the single source of truth. Gate each new id behind
  an env list such as `EXTRA_SITES=bluesky,streamable`, so a site can be switched off without a deploy-time code change.
- **Adapter** `src/lib/media/<site>.ts` → `resolve(id): { text, author, thumbnail, media: [{ kind: 'video'|'hls'|'image', url }] }`
  plus that site's `*_HOSTS` allowlist, built with `makeHostAllowlist` / `buildAllowlistedUrl` (exact hosts where the set is
  small). Cache results in a short-TTL `TtlLruCache` that never outlives the CDN expiry, and add a negative "gone" cache like
  `goneTweetCache`.
- **Save** (`/api/bookmarks/add`): add a branch per platform that calls the adapter once for text, author and thumbnail. Store
  ids and text, never media URLs.
- **Play**: add one route per site, `/api/media/<site>/video?id=`, that resolves again and then streams the result with
  `fetchWithAllowlistedRedirects` + `limitResponseBody` + `streamingResponse`. For HLS (Bluesky, Reddit, Pinterest), generalise
  `/api/media/video/hls` and `/segment` to take a per-site host list instead of `TWITTER_HLS_HOSTS`. The theater already
  ships `hls.js`.
- **Understanding**: no change to `sampleVideoFrames`. It already reads same-origin `/api/media/*` paths, so frames come
  through the new proxy route, and ffmpeg reads HLS over loopback. Route thumbnails through `/api/media/image`, or add
  the site's image hosts to `IMAGE_HOSTS` in `src/lib/semantic/media.ts`.
- **Docker**: no change. There's no Python and no new binary; `ffmpeg-static` is already in the image.
- **Keeping it working**: give each adapter a contract test against a recorded fixture, plus an optional live smoke test (like the
  e2e `fx-mock`). When a site changes, one adapter breaks and the others keep working.
- **Rate limits and IP blocks**: per-site concurrency cap and backoff on 429/403, the existing `mediaRateLimit` on the
  routes, and a negative cache so a dead post isn't fetched again. Watch Sentry for per-site 403 rates after launch.
- **Copyright / ToS posture**: unchanged from today. ADHX streams public posts through to the person who saved them and
  samples frames to understand them. It doesn't host, re-serve or keep copies, and it doesn't offer downloads for these
  sites. It uses official public APIs and embeds where they exist, and names the source on every post.

## How this was measured

All probes were `curl` calls plus a `check.sh` helper. The helper sends a Range request, uses `ffmpeg -i` to count audio streams,
then samples frames as described above. Test posts: Bluesky `bsky.app/post/3mxyyerrxak2m`; Streamable `dnd1`; LinkedIn
`urn:li:activity:7513319742594560000`; Pinterest pin `368450813289543786`; Reddit `r/videos/comments/6rrwyj`; Facebook
`NASA/videos/4007941182848761`; Twitch clip `BrightUglyPresidentPupper-v_5eas1RabtzXWRn`; Threads `@nasa/post/Decc755lYhC`;
Vimeo `76979871`, `1202001060`, `1205819775`; Dailymotion `xbo8goa`; SoundCloud `forss/flickermood`.
