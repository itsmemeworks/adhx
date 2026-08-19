# Theater-First — Implementation Spec

**Status:** approved direction, not yet built · **Date:** 2026-08-18
**Design canvas:** https://claude.ai/code/artifact/12681f33-b4d1-4a92-a841-c8714376eebb (page "Round 3 — Theater-first"; rounds 1–2 kept for reference)
**Decision record:** three design rounds against early-user feedback — mosaic wall → Digg-style ranked list → theater-first. Users said the live community stream is the most compelling feature, mosaics felt overwhelming, seen/unseen must be explicit, and the x.com video-theater full-bleed pattern is the look. Dark is the default.

## 1. Product summary

adhx.com becomes a **theater**: you land with the hottest community post already playing full-bleed on a near-black stage, and a ~400px right rail carries the whole app — brand + Connect, the now-playing post (author, text, trend count, Send / Save / Copy), and the live **"Up next"** feed. `↓`/`↑` (swipe on mobile) chain through the feed without leaving the theater. Every post viewed is marked **seen**; the rail shows "N new since your last visit" above a caught-up divider, with seen items dimmed below it.

One mental model runs everything:

| Surface                                                                                     | Same theater, different rail                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` signed-out                                                                              | Rail = brand + Connect + live Up-next feed                                                                                                                        |
| Preview pages (`/{user}/status/{id}`, `/reels/{id}`, `/@{user}/video/{id}`, `/shorts/{id}`) | Same theater seeded at the shared post; "Shared post" chip + canonical URL + copy; rail feed labeled "More being sent right now"; SEO markup unchanged underneath |
| Mobile                                                                                      | Full-bleed reel (evolution of `/trending/play`): brand on the top scrim, Send primary, Up-next bottom sheet, swipe up/down                                        |
| Signed-in Collection                                                                        | Same theater; rail = your unread queue, actions = Keep / Done / Delete / Send, tabs Collection ↔ Live                                                             |
| Browse (escape hatch)                                                                       | The Digg-style ranked list (round-2 design), dark, one click from the rail footer                                                                                 |

## 2. Non-negotiable constraints (existing invariants)

- **Anonymity**: the saver is never shown — platform + time + counts only. All feed reads go through `getTrendingItems()` (`src/lib/trending/query.ts`), which never selects `activity.userId`. No new read path may bypass it.
- **Zero per-user marginal cost**: seen-state is client-side; no new per-user server storage for signed-out visitors.
- **SEO is load-bearing**: `/` and preview pages stay `force-dynamic`, keep server-rendered crawlable content (`sr-only` item list + JSON-LD, as the trending hubs do today), and preview pages keep their `SocialMediaPosting` JSON-LD, OG tags, semantic `<article>` markup, and the `/api/share/tweet` JSON alternate. `/trending/[filter]` hubs are untouched.
- **Video source SSOT**: all playback URLs come from `src/components/feed/video-src.ts` (and `reelVideoSrc`) — extend there, never re-add per-platform branches in components (regression note in repo memory: IG fell through to the Twitter proxy repeatedly).
- **Send with files**: `navigator.share({ files, text: "via <canonical url>" })` — never `url` alongside `files` (WhatsApp concatenates). MP4 must be prefetched before the tap so the share sheet opens on a user gesture (iOS).
- **Activity write invariants** (`recordActivity()`): content is always resolved server-side; write endpoints accept identifiers only.

## 3. Architecture

New directory `src/components/theater/`:

```
TheaterShell.tsx      — full-viewport layout: <Stage/> + <Rail/>; owns current-item state,
                        keyboard (↓/↑/esc/space/m), touch swipe, history integration
Stage.tsx             — dark stage dispatcher: renders the variant for the current item
StageVideo.tsx        — <video> for twitter/tiktok/instagram; poster-first; progress bar,
                        mute state, "Tap for sound" chip
StageYouTube.tsx      — official youtube-nocookie iframe in a CONCRETE-height container
                        (aspect box collapses around absolute iframes — known gotcha)
StageArticle.tsx      — cover splash → in-stage reader (articleBlocksToMarkdown output);
                        reading-progress bar replaces the time bar
StageText.tsx         — tweet typeset large (Newsreader) on the stage; photos reuse it
                        with the image full-bleed (StagePhoto trivial variant)
Rail.tsx              — brand row / shared-post row / signed-in header + NowPlaying +
                        actions + UpNextList + footer
UpNextList.tsx        — rail feed rows, seen divider, "next ↓" highlight
useTheaterFeed.ts     — items + polling (see §4)
useSeenSet.ts         — localStorage seen model (see §5)
usePlaybackSource.ts  — per-platform src resolution + prefetch/warm (see §6)
```

Route wiring:

- `src/app/page.tsx` signed-out branch renders `TheaterShell` (server component wrapper server-renders the crawlable list + `CollectionPage`/`ItemList` JSON-LD exactly like `TrendingStaticList`, then mounts the shell seeded with the same items — no skeleton flash, same pattern as the hubs).
- Preview pages keep their server components (metadata, JSON-LD, `recordActivity('preview')`, bot filtering) and swap the `*PreviewLanding` visual layer for `TheaterShell` seeded at the post with `mode="shared"`. The crawlable tweet `<article>` stays in the DOM (sr-only).
- `AppShell` suppresses the global Header for `/` signed-out and preview paths (extend the existing `isFullWidth` regex).
- Browse list: `/trending` becomes the dark ranked-list view (round-2 design restyled); the rail's "Browse as list" links there. Hubs `/trending/[filter]` unchanged.
- Signed-in: `/` keeps the Collection as home. The theater becomes the Collection's focus mode (replacing the current Lightbox/triage surface, keeping its keyboard map: ←→, R/U, Q/P, Keep/Delete/Done) and the **Live** tab in the rail opens the community theater. This is Phase 3; Phases 1–2 must not regress the existing authed feed.

## 4. Data

- **Feed**: reuse `getTrendingItems()` via `/api/trending` / `/api/activity` (12s poll, existing 5s SWR cache). Order: "Latest" = recency; lead item on first load = max `trendCount` among unseen items ("Top today" tab re-sorts by `trendCount`).
- **Backfill**: widen the query window until ≥ 12 items (cap 24h → 7d) so the theater never opens empty. If still short, append top saved posts from public tags (already crawlable/public).
- **New items** from the poll insert at the top of Up next with the accent treatment; never interrupt current playback.
- **Pulse**: staging a post ≥ 2s records a preview event. Add `POST /api/activity/preview` with the same contract as `/api/activity/share` — body `{ platform, id }` only, display fields copied server-side via the `recordSharePulse()` pattern, bot-filtered, fire-and-forget, 204. Never accept client display fields (stored-XSS invariant).

## 5. Seen / unseen model

- `localStorage` key `adhx-seen-v1`: JSON array of `"<platform>:<bookmarkId>"`, most-recent-last, capped at 500 (drop oldest). Marked when a post is staged ≥ 2s or acted on (Send/Save/Copy/open-original).
- `adhx-last-visit`: timestamp written on unload/hide; on load, items newer than it and not in the seen set count toward "N new since your last visit".
- Divider: unseen above, "you're caught up" line, seen (dimmed + check) below. Zero-new state: skip the divider, show "You're all caught up — Top today" and lead with the top post.
- Signed-in (Phase 3): merge with `read_status` — a saved+read post renders seen; marking seen in the theater on a saved post POSTs the existing `/api/bookmarks/[id]/read`. Public (unsaved) posts stay local-only.
- SSR: seen-state is client-only → apply after hydration (items render unseen server-side; `suppressHydrationWarning` on time text as today).

## 6. Playback (per platform)

| Platform                       | Source                                           | Notes                                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| twitter                        | `feedVideoSrc()` → `/api/media/video?quality=hd` | instant                                                                                                                                                                                                        |
| tiktok                         | `feedVideoSrc()` → `/api/media/tiktok/video`     | instant                                                                                                                                                                                                        |
| instagram                      | `reelVideoSrc()` mirror                          | **never attach `<video src>` until `probeInstagramVideo` Range-probe returns 200/206**; warm on rail-row visibility/hover (same trick as preview pages); show poster + spinner ≤ 3s, then poster + "starting…" |
| youtube                        | official `youtube-nocookie` iframe               | no MP4 exists; appears instantly, plays on its own tap; CSP already allows it                                                                                                                                  |
| photo / text / quote / article | Stage variants (no media pipeline)               | article body via `articleBlocksToMarkdown`                                                                                                                                                                     |

- **Autoplay**: first landing has no gesture → autoplay **muted** with a persistent "Tap for sound" chip; after the first user interaction, all subsequent posts play with sound. Focus-mode convention (click-to-play-with-sound) applies once a gesture exists.
- **Prefetch**: current post plays; next post's source resolves in the background (IG warms, MP4s get a Range 0-1 request). Prefetch at most 1 ahead — bandwidth restraint, no cost explosion.
- **End of video**: stop and show a replay + "↓ next" nudge. No auto-advance (fights the caught-up model); revisit after telemetry.
- All external fetches keep `AbortSignal.timeout()`.

## 7. Theme

- The stage is always near-black (`#08070a`) in both themes.
- The rail follows the theme system, but **theater surfaces default dark**: when `localStorage.theme` is unset, the FOUC script and `ThemeProvider` resolve to `dark` on theater routes (instead of `system`). An explicit user toggle wins everywhere, as today. Non-theater surfaces keep the current `system` default.

## 8. Mobile

- `/` signed-out on mobile = the reel: brand + Connect on the top scrim (no close button — it's home), progress bar, "Tap for sound" chip, caption + meta on the bottom scrim, Send primary + Save + share-link, Up-next bottom sheet (peek → swipe up for the list with the seen divider). Swipe video up/down = next/prev. Evolves `/trending/play` rather than duplicating it — `/trending/play` redirects into the theater.
- Non-video posts in the mobile feed render their stage variants full-screen (text typeset large; article cover splash → reader).
- Tap targets ≥ 44px. No fake status bar or keyboard chrome.

## 9. Analytics & monitoring

Sentry metrics (existing `metrics.*` patterns): `theater.opened` (surface: home/shared/collection), `theater.advanced` (direction, input: key/swipe/click), `theater.sound_enabled`, `theater.send/save/copy`, `theater.caught_up_reached`, `feed.loaded`. `captureException` on playback failures with platform tag (never raw userId).

## 10. Phases (one PR each; staging-verified before the next)

**PR 1 — Theater shell + home (signed-out `/`)**
Shell, Stage (video: twitter + tiktok; text; photo), Rail with Up-next + seen model + divider, muted-autoplay + unmute chip, keyboard nav, 12s poll, server-rendered crawlable list + JSON-LD, dark default on theater routes, `theater.*` metrics, `/api/activity/preview`. Browse link points at existing `/trending` (light, unchanged for now).
_Acceptance_: signed-out `/` lands in the theater with a real post playing muted; ↓/↑ chains; refresh shows the divider correctly; `curl` of `/` contains the crawlable list + JSON-LD; Lighthouse SEO unchanged on preview pages; 943 existing tests green.

**PR 2 — Full stage matrix + mobile**
Instagram probe/warm path, YouTube iframe stage, article reader stage, mobile reel + bottom sheet + swipe, Send file-prefetch flow, `/trending/play` redirect, prefetch-next.
_Acceptance_: each platform plays (IG within its warm window, YT via iframe), article renders its real body, mobile swipe marks seen, Send opens the share sheet with the file on iOS.

**PR 3 — Preview pages + Browse + signed-in**
Preview pages swap to `TheaterShell mode="shared"` (SEO markup verified byte-comparable for bots), `/trending` restyled to the dark ranked list, Collection focus mode replaced by the theater (Keep/Done/Delete + `read_status` merge), Live tab.
_Acceptance_: preview URLs keep JSON-LD/OG (diff against production snapshots), GSC-critical routes still 200 + crawlable, authed triage keyboard map preserved, no regression in `/api/feed` tests.

## 11. Risks & mitigations

- **Autoplay policy variance** (iOS Safari low-power blocks even muted): poster + big play button fallback — the stage still looks intentional.
- **IG mirror cold cache** (10–20s): warm early, cap visible wait at 3s with poster + status; never a black stage.
- **Thin activity volume**: backfill rules in §4 keep the theater alive; the lead post can be up to 7d old.
- **SEO regression risk on `/`**: the current LandingPage copy disappears for humans; keep hero copy in the crawlable server-rendered block and monitor GSC for 2 weeks post-launch.
- **Bandwidth**: prefetch-1 only; preview-quality (360p) for prefetch, HD on play.

## 12. Out of scope (explicitly)

Comments/reactions on posts, auto-advance, algorithmic ranking beyond `trendCount`, per-user server-side seen state for signed-out visitors, and any metered-AI features (unit-economics constraint).
