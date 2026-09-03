# Theater-First — Implementation Spec

**Status:** approved direction, not yet built · **Date:** 2026-08-18
**Design canvas:** https://claude.ai/code/artifact/12681f33-b4d1-4a92-a841-c8714376eebb (page "Round 3 — Theater-first"; rounds 1–2 kept for reference)
**Decision record:** three design rounds against early-user feedback — mosaic wall → Digg-style ranked list → theater-first. Users said the live community stream is the most compelling feature, mosaics felt overwhelming, seen/unseen must be explicit, and the x.com video-theater full-bleed pattern is the look. Dark is the default.

## 1. Product summary

adhx.com becomes a **theater**: you land with the hottest community post already playing full-bleed on a near-black stage. Desktop: full-width stage owns the post + meta/caption overlays; a bottom filmstrip dock carries transport controls, a horizontal queue of upcoming posts (current ringed clay, next labeled, seen dimmed), a "Queue" panel reopening the full vertical Up-next list, and Send/Save/Link actions. ⌘V paste-to-preview navigates any supported link. Mobile: the reel variant with top/bottom scrims, Send as primary, bottom sheet Up-next, and swipe up/down navigation. `↓`/`↑` or swipe chain through the feed without leaving the theater. Every post viewed is marked **seen**; the Up-next list shows "N new since your last visit" above a caught-up divider, with seen items dimmed below it.

One mental model runs everything:

| Surface                                                                                                | Same theater, different dock / chrome                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` signed-out                                                                                         | Desktop: full-width stage + bottom filmstrip dock (queue cards, transport, Send/Save/Link) + ⌘V paste-to-preview. Mobile: full-bleed reel + bottom sheet.                                                                                                                                                         |
| Preview pages (`/{user}/status/{id}`, `/p/{id}`, `/reels/{id}`, `/@{user}/video/{id}`, `/shorts/{id}`) | Same theater seeded at the shared post; chrome paints on a URL stub while FxTwitter / a scrape / oEmbed streams in. "This post" heading in Queue, post meta pinned to stage, dock shows "More being sent right now" queue; SEO markup streams in a Suspense sibling, `generateMetadata` still awaits for crawlers |
| Mobile                                                                                                 | Full-bleed reel (evolution of `/trending/play`): brand on the top scrim, Send primary, Up-next bottom sheet, swipe up/down                                                                                                                                                                                        |
| Signed-in Collection                                                                                   | Same theater; dock = your unread queue, actions = Keep / Done / Delete / Send, tabs Collection ↔ Live                                                                                                                                                                                                             |
| Browse (escape hatch)                                                                                  | The Digg-style ranked list (round-2 design), dark, one click from the dock footer                                                                                                                                                                                                                                 |

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
TheaterShell.tsx         — full-viewport layout: <Stage/> flex-1 + <DesktopDock/>/<TheaterMobileChrome/>;
                           owns current-item state, keyboard (↓/↑/←/→/esc/space/m), touch swipe,
                           history integration. Saved snapshots `personalItems` at mount;
                           Archive / paste in another window arrives as `tweet-added`
                           `{ removed }` / `{ added }` via BroadcastChannel
                           (`src/lib/client-events.ts`). Paste of a type the Queue
                           filter would hide resets the filter to All.
Stage.tsx                — dark stage dispatcher: renders the variant for the current item
StageVideo.tsx           — <video> for twitter/tiktok/instagram; poster-first; progress bar,
                           mute state; sound toggle via the peek-bar audio button or stage tap
StageYouTube.tsx         — official youtube-nocookie iframe in a CONCRETE-height container
                           (aspect box collapses around absolute iframes — known gotcha)
StageArticle.tsx         — cover splash → in-stage reader (articleBlocksToMarkdown output);
                           reading-progress bar replaces the time bar; `STAGE_TEXT_SCROLL_PAD`
                           so the last lines sit above the overlay actions + mobile peek bar
StageText.tsx            — tweet typeset large (Newsreader) on the stage; photos reuse it
                           with the image full-bleed. Video/photo + quote (or a caption
                           over two lines) defaults to full-bleed parent media + a
                           2-line caption; **Read** opens this as a stacked article
                           (every photo in a multi-image tweet, not just the first;
                           a playing video album keeps its snap scroller in the
                           band; the frost-dot pill overlays the painted
                           bottom of the clip with a little inset — Watch
                           and Read, desktop and mobile).
                           A playing parent video stays in a top band so it continues
                           while you read. Never fade the clip — a stage-black
                           gradient sits in the strip below it so the essay can
                           tuck under. Typeset scroller uses the same action-row
                           clearance pad
TheaterDesktopChrome.tsx — `DesktopStageChrome` (overlays inside stage: top bar with brand + LIVE +
                           paste button (expands into the preview field; ⌘V still
                           works globally — signed-in Live / Saved add in
                           place and stay on the tab; playlist has no paste); flame chip left of paste
                           on every post type; Live / Saved type pills (All / Videos / Photos / Text /
                           Articles) live in Queue (omitted on playlists);
                           bottom-left meta overlay
                           for video/photo; bottom-right actions — Open is the source platform glyph)
                           + `DesktopDock` (in-flow bottom dock: two-row 3-col transport —
                           prev / play-pause / next over expand / repeat / mute — +
                           horizontal filmstrip queue auto-scrolled to keep current visible + "Queue" panel (`Q` toggles; ↑/↓ traverse while open; Esc / click away closes))
TheaterMobileChrome.tsx  — mobile reel chrome: top/bottom scrims, a bounded right-side thumb zone
                           with swipe up/down + subtle focus/repeat/playback/audio controls (hidden in focus mode), and a
                           control bar with contextual post actions + Queue. 70%-of-theater Up-next bottom sheet
                           (clipped; does not auto-focus a row on open).
                           Read/Watch is icon-only on the left of the action row (book / TV).
                           Tap video/photo hides chrome and starts playback; tap again restores
                           overlays without pausing (Space / peek-bar own pause).
UpNextList.tsx           — feed rows, seen divider, "next ↓" highlight
useTheaterFeed.ts        — items + polling (see §4)
useSeenSet.ts            — localStorage seen model (see §5)
usePlaybackSource.ts     — per-platform src resolution + prefetch/warm (see §6)
useClampExpand.ts        — measures whether a 2-line caption overflows (Read appears)
lib/theater/paste-preview.ts  — `resolvePastedLink(text)` for ⌘V → preview navigation
types.ts                 — shared types incl. PLATFORM_LABEL
```

Route wiring:

- `src/app/page.tsx` signed-out branch renders `TheaterShell` (server component wrapper server-renders the crawlable list + `CollectionPage`/`ItemList` JSON-LD exactly like `TrendingStaticList`, then mounts the shell seeded with the same items — no skeleton flash, same pattern as the hubs).
- Preview pages keep their server components (metadata, JSON-LD, `recordActivity('preview')`, bot filtering) and swap the `*PreviewLanding` visual layer for `TheaterShell` seeded at the post with `mode="shared"`. The crawlable tweet `<article>` stays in the DOM (sr-only).
- `AppShell` suppresses the global Header for `/` signed-out and preview paths (extend the existing `isFullWidth` regex).
- Browse list: `/trending` remains the dark ranked-list view (round-2 design restyled). Hubs `/trending/[filter]` unchanged.
- Signed-in: `/` keeps the Collection as home. The theater becomes the Collection's focus mode (replacing the old Lightbox surface) and the **Live** tab in the rail opens the community theater. This is Phase 3; Phases 1–2 must not regress the existing authed feed.

## 4. Data

- **Feed**: reuse `getTrendingItems()` via `/api/trending` / `/api/activity` (12s poll, existing 5s SWR cache). Order: "Latest" = recency; lead item on first load = max `trendCount` among unseen items ("Top today" tab re-sorts by `trendCount`).
- **Backfill**: widen the query window until ≥ 12 items (cap 24h → 7d) so the theater never opens empty. If still short, append top saved posts from public tags (already crawlable/public).
- **New items** from the poll insert at the top of Up next with the accent treatment; never interrupt current playback.
- **Pulse**: staging a post ≥ 2s records a preview event. Add `POST /api/activity/preview` with the same contract as `/api/activity/share` — body `{ platform, id }` only, display fields copied server-side via the `recordSharePulse()` pattern, bot-filtered, fire-and-forget, 204. Never accept client display fields (stored-XSS invariant).

## 5. Seen / unseen model

- `adhx-seen-v1` remains a readable JSON-array projection of `"<platform>:<bookmarkId>"`, most-recent-last and capped at 500. Cross-tab authority is immutable V2 per-key/batch localStorage operations: deterministic latest-writer resolution, newest 500 marks + 500 tombstones, and atomic bulk Re-watch. Storage events coalesce and rescan authority rather than merging stale snapshots. Existing arrays migrate once; tabs still running pre-V2 code must reload.
- `adhx-last-visit`: timestamp written on unload/hide; on load, items newer than it and not in the seen set count toward "N new since your last visit".
- Divider: unseen above, "you're caught up" line, seen (dimmed + check) below. Zero-new state: skip the divider, show "You're all caught up — Top today" and lead with the top post.
- Signed-in (Phase 3): merge with `read_status` — a saved+read post renders seen; marking seen in the theater on a saved post POSTs the existing `/api/bookmarks/[id]/read`. Public (unsaved) posts stay local-only.
- SSR: seen-state is client-only → apply after hydration (items render unseen server-side; `suppressHydrationWarning` on time text as today).

## 6. Playback (per platform)

| Platform                       | Source                                           | Notes                                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| twitter                        | `feedVideoSrc()` → `/api/media/video?quality=hd` | instant                                                                                                                                                                                                        |
| tiktok                         | `feedVideoSrc()` → `/api/media/tiktok/video`     | instant                                                                                                                                                                                                        |
| instagram Reel                 | `reelVideoSrc()` mirror                          | **never attach `<video src>` until `probeInstagramVideo` Range-probe returns 200/206**; warm on rail-row visibility/hover (same trick as preview pages); show poster + spinner ≤ 3s, then poster + "starting…" |
| instagram image/carousel       | `/api/media/instagram/thumbnail?id=&index=`      | render through the photo album stage; never probe or warm the Reel mirror                                                                                                                                      |
| youtube                        | official `youtube-nocookie` iframe               | no MP4 exists; appears instantly, plays on its own tap; CSP already allows it                                                                                                                                  |
| photo / text / quote / article | Stage variants (no media pipeline)               | article body via `articleBlocksToMarkdown`                                                                                                                                                                     |

- **Autoplay**: playback defaults muted. Signed-in users can enable **Sound on by default** in Settings; the account preference is server-backed and cached in `localStorage`, while a tab's latest audio-button choice in `sessionStorage` wins for that tab. Mobile browsers can still reject audible autoplay on a fresh document, so a stage tap retries the preferred unmute inside the user gesture. The rail/dock audio button remains the explicit control.
- **Prefetch**: current post plays; next post's source resolves in the background (IG warms, MP4s get a Range 0-1 request). Prefetch at most 1 ahead — bandwidth restraint, no cost explosion.
- **End of video**: stop and show a replay + "↓ next" nudge. No auto-advance (fights the caught-up model); revisit after telemetry.
- All external fetches keep `AbortSignal.timeout()`.

## 6b. Links in post text (the t.co policy)

Tweet text carries opaque `t.co` links. The theater never shows a raw `t.co` when it can do better:

| The link resolves to                                                                                       | Data available                                        | Rendering                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Twitter content the surface ALREADY renders (the quoted tweet shown in a quote card; the post's own media) | expansion known, or the trailing-link heuristic below | **Stripped from the text** — the rendered content replaces it                                                                           |
| Twitter content the surface does NOT render (community `quote` posts on the stage carry no quote data)     | any                                                   | Kept clickable (it's the only path to that content), expanded href when known                                                           |
| An external page                                                                                           | expansion known                                       | Anchor with `href = expandedUrl`, label = cleaned expanded URL (protocol + `www.` stripped, truncated ~40 chars) — like X's own display |
| Unknown (no expansion data)                                                                                | —                                                     | Kept as a clickable `t.co` anchor                                                                                                       |

**Expansion sources** (never a new fetch — all data we already hold):

- Saved posts: `bookmark_links` (`original_url` → `expanded_url`, `link_type` `'tweet' | 'link' | 'article'`). `getTrendingItems()` attaches these as `TrendingItem.textLinks` (public columns only — the anonymity invariant is untouched).
- Collection theater: `FeedItem.links` via the converter.
- Shared preview pages: the FxTwitter tweet's `urls[]` (facets fallback) mapped at seed time.
- Pulse items never saved by anyone have no expansion — they keep the raw-but-clickable `t.co`.

**Trailing-link heuristic**: X appends the quote-tweet link as the LAST URL of a quoting post. When a surface renders the quote content and the trailing `t.co` has no known expansion, strip it anyway; never strip mid-text unresolved links.

Rendering lives in one place: `TheaterLinkedText` (`src/components/theater/TheaterText.tsx`) with `links?: TextLinkRef[]` + `hideTweetLinks?: boolean`.

## 7. Theme

- The stage is always near-black (`#08070a`) in both themes.
- The rail follows the theme system, but **theater surfaces default dark**: when `localStorage.theme` is unset, the FOUC script and `ThemeProvider` resolve to `dark` on theater routes (instead of `system`). An explicit user toggle wins everywhere, as today. Non-theater surfaces keep the current `system` default.

## 8. Mobile

- `/` signed-out on mobile = the reel: brand on the top scrim (no close button — it's home), progress bar, caption + meta on the bottom scrim, and an Up-next bottom sheet. A right-side thumb zone handles swipe up/down = next/prev without taking over article scrolling, album gestures, links, or embeds across the rest of the stage. Subtle focus, repeat, play/pause, mute/unmute, up, and down buttons live in that zone, with up = previous and down = next together below mute plus a two-column fallback for short landscape viewports. Repeat-off keeps session back-history for rewatching the post just left; every direct post landing starts at Repeat one, signed in or out, then tapping Repeat or moving to another post promotes the queue to Repeat all. Non-video playback stays visible but disabled while Repeat one is active. Focus makes hidden chrome inert while invisible swipes stay active, and tapping the zone restores it. The control bar puts Queue/count on the left and plain themed post-action icons on the right; those actions stay level with Queue and follow the row upward when the playlist expands. Evolves `/trending/play` rather than duplicating it — `/trending/play` redirects into the theater.
- Non-video posts in the mobile feed render their stage variants full-screen (text typeset large; article cover splash → reader).
- Tap targets ≥ 44px. No fake status bar or keyboard chrome.

## 9. Analytics & monitoring

Sentry metrics (existing `metrics.*` patterns): `theater.opened` (surface: home/shared/collection), `theater.advanced` (direction, input: key/swipe/click), `theater.sound_enabled`, `theater.send/save/copy`, `theater.caught_up_reached`, `feed.loaded`. `captureException` on playback failures with platform tag (never raw userId).

## 10. Phases (one PR each; staging-verified before the next)

**PR 1 — Theater shell + home (signed-out `/`)**
Shell, Stage (video: twitter + tiktok; text; photo), Rail with Up-next + seen model + divider, muted-autoplay + unmute chip, keyboard nav, 12s poll, server-rendered crawlable list + JSON-LD, dark default on theater routes, `theater.*` metrics, `/api/activity/preview`. Browse link points at existing `/trending` (light, unchanged for now).
_Acceptance_: signed-out `/` lands in the theater with a real post playing muted; →/← and J/K chain posts (↑/↓ scroll text); refresh shows the divider correctly; `curl` of `/` contains the crawlable list + JSON-LD; Lighthouse SEO unchanged on preview pages; 943 existing tests green.

**PR 2 — Full stage matrix + mobile**
Instagram probe/warm path, YouTube iframe stage, article reader stage, mobile reel + bottom sheet + swipe, Send file-prefetch flow, `/trending/play` redirect, prefetch-next.
_Acceptance_: each platform plays (IG within its warm window, YT via iframe), article renders its real body, mobile swipe marks seen, Send opens the share sheet with the file on iOS.

**PR 3 — Preview pages + Browse + signed-in**
Preview pages swap to `TheaterShell mode="shared"` (SEO markup verified byte-comparable for bots), `/trending` restyled to the dark ranked list, Collection focus mode replaced by the theater (Keep/Done/Delete + `read_status` merge), Live tab.
_Acceptance_: preview URLs keep JSON-LD/OG (diff against production snapshots), GSC-critical routes still 200 + crawlable, the authed collection keyboard map preserved, no regression in `/api/feed` tests.

## 11. Risks & mitigations

- **Autoplay policy variance** (iOS Safari low-power blocks even muted): poster + big play button fallback — the stage still looks intentional.
- **IG mirror cold cache** (10–20s): warm early, cap visible wait at 3s with poster + status; never a black stage.
- **Thin activity volume**: backfill rules in §4 keep the theater alive; the lead post can be up to 7d old.
- **SEO regression risk on `/`**: the current LandingPage copy disappears for humans; keep hero copy in the crawlable server-rendered block and monitor GSC for 2 weeks post-launch.
- **Bandwidth**: prefetch-1 only; preview-quality (360p) for prefetch, HD on play.

## 12. Out of scope (explicitly)

Comments/reactions on posts, auto-advance, algorithmic ranking beyond `trendCount`, per-user server-side seen state for signed-out visitors, and any metered-AI features (unit-economics constraint).
