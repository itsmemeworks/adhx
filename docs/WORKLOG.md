# WORKLOG

Append-only context log for agents and contributors. **Newest entries first.** After any substantive piece of work, add a dated entry (≤10 lines): what was done, why, current state, follow-ups. Never rewrite or delete old entries — this file is how a fresh session inherits context that isn't in the code. See `AGENTS.md` for the full protocol.

---

## 2026-08-19 — Theater t.co policy (spec §6b): expand external links, strip rendered tweet-links

- **Why**: Raw `t.co` labels are opaque; a t.co pointing at a quoted tweet is redundant once the quote card renders it.
- **What**: Spec §6b decision table added FIRST, then built: `TrendingItem.textLinks` (from `bookmark_links` original/expanded/link_type — public columns, anonymity test green), collection converter + preview-seed (FxTwitter urls/facets) plumbing, and the resolution engine in `TheaterLinkedText` (`resolveLink`/`buildRenderSegments` pure pipeline): external → anchor to expandedUrl with cleaned label; tweet-links stripped only under `hideTweetLinks` (set solely where the quote card renders, in CollectionTheater); unresolved trailing t.co stripped there too (X appends the quote link last); unresolved mid-text links never stripped. Punctuation-tail matching handled.
- **Verified live**: quote tweet's t.co gone from the stage with the quote card below; textLinks in `/api/activity` JSON with no user-derived fields. 1417 tests green.
- **State**: in-flight on `feat/theater-phase3` (part of PR #319).
- **Follow-ups**: quoted-tweet excerpt inside the quote card has no textLinks data (FeedItem shape doesn't carry the quoted post's links) — raw t.co may appear there; list rows stay plain by design.

## 2026-08-19 — Theater text: long posts readable, links clickable

- **Why**: Review caught two gaps — long tweets overflowed StageText unreadably (clamps elsewhere had no expand), and no theater surface linkified URLs (a regression vs FeedCard's `renderTextWithLinks`).
- **What**: New `TheaterLinkedText` primitive (`src/components/theater/TheaterText.tsx` — pure `splitTextParts` splitter, clay anchors, stopPropagation so links never trigger stage/swipe/row handlers, media t.co stripping). StageText: 70vh internal scroll + a 4th prose-size tier (>600 chars); photo caption gets measured tap-to-expand (45vh scroll panel). Rail now-playing + mobile caption: `useClampExpand` (ref-measured overflow, Show more/less, reset on item change). Quote card linkified. List rows stay plain (anchors in `<button>` rows are invalid HTML).
- **Verified**: 5,904-char photo caption fully readable via expand; t.co link renders as target=\_blank noopener anchor. 1383 tests green, prettier clean.
- **State**: in-flight on `feat/theater-phase3` (part of PR #319).
- **Follow-ups**: pulse TEXT_CAP stays 240 (deliberate — preview page is the full-text surface for community items).

## 2026-08-18 — Theater-first Phase 3: shared previews, dark Browse, authed collection theater

- **Why**: PR 3 of `docs/specs/theater-first.md` — one mental model everywhere: preview pages, Browse, and the signed-in Collection all run in the theater.
- **What**: The 5 preview pages render `SharedPostStatic` (sr-only semantic article) + `TheaterShell mode="shared"` (shared post pinned lead, "More being sent right now", authed Save→/api/bookmarks/add). `/trending` hubs swap the grid for the dark `TrendingRankedList` (trendCount-desc ranking, SEO untouched). `CollectionTheater`+`CollectionRail` replace `TriageMode` in AuthedHome: preserved keyboard map (→ Done / ← Later / ↓ Delete+undo / U / Esc), deferred-delete semantics, HLS `VideoPlayer` for twitter video, Collection↔Live tabs. Theme-dark default extended to /trending.
- **Verified**: SEO byte-diff of all 4 preview page types vs pre-change snapshots — JSON-LD/OG identical (only live engagement counts moved); authed flow tested with a forged local session (Done → read_status persisted, streak ticked).
- **Gotchas**: `TrendingItem.url` is the ON-ADHX path, not the source URL — saves must reconstruct via `sourceUrl()`; importing from TrendingStaticList into a client component drags better-sqlite3 into the bundle; CLAUDE.md's old Lightbox/Q/P/R/U keyboard prose was stale (that component no longer existed) — docs fixed.
- **State**: in-flight on `feat/theater-phase3` (stacked on `feat/theater-stage-matrix`). Full suite green.
- **Follow-ups**: staging pass on real devices; TriageMode.tsx + DiscoverFeed.tsx + \*PreviewLanding now unmounted — deletion candidates for a cleanup PR once the theater sticks; mobile chrome lacks a "Shared post" indicator (parity nit).

## 2026-08-18 — Theater-first Phase 2: full stage matrix + mobile reel

- **Why**: PR 2 of `docs/specs/theater-first.md` — every platform must actually play on the stage, and phones get the reel.
- **What**: `StageInstagram` (probe-then-play via `probeInstagramVideo`, ≤3s spinner → "starting…", IG-embed fallback; reuses StageVideo chrome), `StageYouTube` (nocookie iframe, concrete-height box), `StageArticle` (splash → reader from `/api/share/tweet` `article.content`, dependency-free markdown parser in `src/lib/theater/article-markdown.ts`, reading-progress bar), mobile reel (full-viewport stage, swipe up/down via `swipeDirection`, top/bottom scrims + 70dvh Up-next sheet in `TheaterMobileChrome`), `useSendFile` (2s-delayed blob prefetch, `files` + `via <url>` never `url`+`files`, desktop = download), `/trending/play` → 307 `/`.
- **Gotchas hit**: `useSendFile` is mounted twice (Rail + mobile chrome, CSS-hidden at the other breakpoint) — needs the module-level in-flight dedupe or every MP4 downloads twice; Chrome defers media-element loading in never-interacted automated tabs (looks like a stalled `<video>`, is not a product bug).
- **State**: in-flight on `feat/theater-stage-matrix` (stacked on `feat/theater-shell`). Smoke-verified: IG probe→play with sound, YT iframe, article real-body reader, redirect. Full suite green (1330).
- **Follow-ups**: real-device mobile pass on staging (swipe/sheet/Send share sheet on iOS); Phase 3 (preview pages as shared theater, dark /trending list, authed focus mode, AppShell header still sits under the overlay).

## 2026-08-18 — Theater-first Phase 1: signed-out `/` is the theater

- **Why**: Implementing PR #316's spec (`docs/specs/theater-first.md`) — users said the live community stream is the product; theater-first won three design rounds.
- **What**: `page.tsx` → server component (authed → `AuthedHome.tsx` verbatim move; signed-out → `TheaterShell` in `src/components/theater/` + sr-only crawlable list/JSON-LD). Seen model (`adhx-seen-v1`/`adhx-last-visit`), 12s poll, muted autoplay (media-event-driven, no play()/autoPlay race), ↓↑ nav, `POST /api/activity/preview` pulse (identifiers-only, bot-filtered), `theater.*` Sentry metrics, dark default on `/` when theme unset, public-tag backfill (<12 items).
- **Gotchas hit**: seed limit must equal `/api/activity` LIMIT (30) or the first poll surfaces old items as "fresh" (merge now appends unknown-but-older quietly); a manual `play()` racing the `autoPlay` attr flags a spurious needs-gesture overlay over a playing video.
- **State**: in-flight on `feat/theater-shell`. Smoke-tested locally (SSR JSON-LD via curl, playback, seen divider across reloads, pulse increments trendCount). Full suite green.
- **Follow-ups**: Phase 2 (IG probe/warm stage, YouTube iframe, article reader, mobile reel + swipe, Send prefetch, `/trending/play` redirect); Phase 3 (preview pages, dark /trending list, authed focus mode); AppShell still mounts the Header under the theater overlay (z-60) — fold into Phase 3; client-gesture metrics (`theater.advanced`/`sound_enabled`) have no server path yet.

## 2026-08-14 — Send bar: portal to body so it actually sticks to the viewport

- **Why**: Staging iPhone showed "Send this video" mid-page over "Preview another link". `position:fixed` was inside the fadeInUp column (`transform` + `forwards`), so it behaved like `absolute` at the bottom of that column.
- **What**: `MobileSendDock` portals the bar to `document.body` below the `md` breakpoint.
- **State**: in-flight on `feat/push-ios-shortcut`.
- **Follow-ups**: none.

## 2026-08-14 — iOS promo: style the 4-platform disclosure as helper text

- **Why**: "Instagram, TikTok, YouTube too" was a left-aligned orange label (`flex` ignored the card's `text-center`). Looked like a broken heading, not a disclosure.
- **What**: `inline-flex` so it follows parent alignment; `text-ink-3` + chevron, matching "Works with X…".
- **State**: in-flight on `feat/push-ios-shortcut`.
- **Follow-ups**: none.

## 2026-08-14 — Instagram Reels: probe then play, embed if the mirror never warms

- **Why**: `<video src=/api/media/instagram/video>` starts immediately; vxinstagram cold-cache can take 10–20s. Safari/Chrome media elements abort sooner → "Failed to load video" even when the proxy would 200. Gating the player on a poster hid playback when OG scrape missed.
- **What**: Client Range-probes the proxy (35s) before attaching `<video src>`. Preview RSC warms with Range 0-1. Persistent miss → official Instagram iframe (`frame-src` updated). Player always mounts for a reel id.
- **State**: in-flight on `feat/push-ios-shortcut`.
- **Follow-ups**: Feed/lightbox gallery hover still sets `<video src>` immediately — same cold-cache trap if that surface looks dead too.

## 2026-08-14 — Preview: Send the file vs Share link

- **Why**: Three share icons on preview pages (stats footer, Send this video, Share) plus a void under More to Discover (`min-h-screen` shell, related as a sibling).
- **What**: Send = the video/photo file (sticky on mobile). Share link = this preview URL. Stats-footer share and mobile media overlay removed. Related saves slot into the shell before the tagline.
- **State**: in-flight on `feat/push-ios-shortcut`.
- **Follow-ups**: none.

## 2026-08-14 — Landing "How ADHX works" is the send loop

- **Why**: The hero still led with Connect X → triage → TTS. That's not how the product works now.
- **What**: Steps are get-it-in (Share → ADHX / swap the host) → watch → send the file → keep a pile later. Feature grid leads with send; TTS dropped from the four.
- **State**: in-flight on `feat/push-ios-shortcut`.
- **Follow-ups**: none.

## 2026-08-14 — Push the iOS Share Sheet shortcut

- **Why**: The shortcut is the easiest send path on iPhone, but it was buried behind a DIY recipe and labelled "X-only". People never installed it.
- **What**: One-tap **Add to Share Sheet** (iCloud) is now the iOS install: bottom banner (replaces Add to Home Screen), landing hero + promo, Settings, preview CTA nudge. 4-platform recipe is behind "Instagram, TikTok, YouTube too". Dismiss key `adhx-shortcut-dismissed`.
- **State**: in-flight on `feat/push-ios-shortcut`.
- **Follow-ups**: Rebuild the iCloud shortcut to `/share?url=` so the one-tap install works for Reels/TikToks/Shorts too.

## 2026-08-14 — iOS WhatsApp share: duplicate via-link + first-tap fail

- **Why**: Staging reel share to WhatsApp sent `via URL URL` (text + url both set). First tap showed our AlertCircle; second tap worked — iOS drops user-activation across `await fetch(mp4)`.
- **What**: File shares send `files` + `via <canonical url>` only (no `url` field). Prefetch the MP4 on mount so `navigator.share` runs in the tap. Reject JSON error bodies. Link-only share uses canonical URL once.
- **State**: in-flight on `fix/ios-whatsapp-share`.
- **Follow-ups**: Re-test Send on iOS WhatsApp for a Reel after staging deploy.

## 2026-08-14 — Send the video as the product (file + ADHX link)

- **Why**: The real loop is preview → download → WhatsApp. File-only share leaked growth (no adhx.com URL); Connect-with-X was the front door; trending scored saves/previews not sends; iOS shortcut is still X-only.
- **What**: Native share sends the MP4 plus `via https://adhx.com/…`. Unauth preview CTAs lead with Send/Download; login is "keep a pile, later". `og:video` on Reel/TikTok/X video pages (proxy URLs). SERP closers: "Watch and send it — no [app]". Anonymous `share` pulse via `POST /api/activity/share` `{platform,id}` only (`recordSharePulse` copies server-stored fields). Trending score includes sends. iOS copy: URL-prefix + `/share?url=` recipe; published iCloud shortcut stays X-only.
- **State**: in-flight on `feat/send-video-as-product` (this PR also carries the leftover 402-is-credits follow-up from #304). YouTube stays link-only (no MP4).
- **Follow-ups**: Rebuild the iCloud shortcut to open `/share?url=` (manual, not in repo); GSC video indexing after `og:video` ships.

## 2026-08-14 — 402 is X API credits, not a stale login (reconnect loop)

- **Why**: Staging after #304: even a fresh OAuth still showed "Reconnect your X account". 402 survived login because it is **Payment Required** — the developer app has no pay-per-use credits (`Your enrolled account does not have any credits to fulfill this request`). Sending users back through Connect with X loops.
- **What**: 402 is now `code: 'unavailable'` ("Your login is fine — try again later") with Retry, not Connect with X. No force-refresh on 402. `?firstLogin=` is stripped on sync error so refresh doesn't re-fire. Sentry warning includes X's response body. 401/403 still reconnect.
- **State**: in-flight on `feat/send-video-as-product`.
- **Follow-ups**: Top up X API credits; then Retry should sync.

## 2026-08-14 — Agents always push and keep a PR

- **Why**: Owner does not want to commit/push/open PRs by hand in this repo; they only merge.
- **What**: Always-on Cursor rule `.cursor/rules/always-push-pr.mdc`, plus the same instruction in `AGENTS.md` / `CLAUDE.md`. Commit on a feature branch, push, `gh pr create` (or push to update an existing PR). Never merge. Never force-push unless asked.
- **State**: shipped in #309.
- **Follow-ups**: None.

## 2026-08-14 — GHA production deploy was unauthorized

- **Why**: `workflow_dispatch` production failed immediately (`unauthorized`). `FLY_API_TOKEN` is an app-scoped deploy token for staging `adhx` and cannot touch `adhx-prod`.
- **What**: New GitHub secret `FLY_API_TOKEN_PROD` (Fly deploy token for `adhx-prod`). `deploy.yml` selects it when environment=production, passes `--app` explicitly, and fails with a setup hint if the secret is missing. Staging still uses `FLY_API_TOKEN`.
- **State**: shipped in #307.
- **Follow-ups**: `gh workflow run deploy.yml -f environment=production` (or Fly CLI).

## 2026-08-14 — GSC "Thumbnail blocked by robots.txt" (video indexing)

- **Why**: Search Console: video pages aren't indexed because the poster is blocked. Reel/TikTok `VideoObject` JSON-LD (and OG images) point at `/api/media/instagram/thumbnail` and `/api/media/tiktok/thumbnail`; `Disallow: /api/` won over those URLs.
- **What**: `Allow: /api/media/` in `public/robots.txt` (longest-match beats `Disallow: /api/`). Also unblocks the MP4 `contentUrl` streams so the next GSC complaint isn't "video file blocked". Session routes (`/api/feed`, `/api/sync`, auth, bookmarks) stay disallowed. Covered by `src/__tests__/robots-txt.test.ts`.
- **State**: in-flight, uncommitted. Google needs to recrawl `robots.txt` then the preview pages — not instant.
- **Follow-ups**: After deploy, GSC → Video indexing → validate the fix; thumbnails can take days to clear.

## 2026-08-14 — Sync 402 is a reconnect prompt; auto-sync after a day away

- **Why**: Manual sync showed "Request failed with code 402" with Retry — nobody knows what 402 is, and Retry can't fix a rejected X user token. Also, coming back after a long gap required remembering to hit Sync.
- **What**: Classify Twitter bookmarks failures (`src/lib/twitter/errors.ts`) — 401/402/403 force-refresh once, then `code: 'reauth'` with human copy (402 → "X needs a fresh login…"). SSE sends `{ message, code }`. `SyncProgress` hides the empty 0% stats, swaps Retry for **Connect with X**. Missing tokens now emit that SSE error instead of a JSON 401 (EventSource was showing "Connection lost"). Background resume sync when last focus (fallback: last successful sync) is ≥24h (`src/lib/sync/resume.ts`); silent unless it needs reconnect. 402 volume is a Sentry warning (plan-lapse signal) but not a user-facing status code.
- **State**: in-flight, uncommitted.
- **Follow-ups**: If reconnect still 402s for everyone, the X API app plan/credits are the real cause — check Sentry `X bookmarks returned 402`.

## 2026-07-30 — Preview captions: clipped text with no way to expand (all 4 surfaces)

- **Why**: reported on `adhx.com/AMAZlNGNATURE/status/2082734821009490153` — text cut off with no "Show more". Nothing was missing from the data (FxTwitter returns the whole 179-char post, `is_note_tweet: false`); the loss was purely in rendering.
- **Root cause — two conditions that disagreed.** In `TweetPreviewLanding`, the clamp was gated on `hasMedia` but the toggle on `text.length > 180`. At 179 chars the post got clamped with **no** affordance. No character threshold can work here: wrapping depends on viewport width, font metrics, newlines and long URLs. Worse, **TikTok / Instagram / YouTube previews clamped with no toggle at all** — every caption over 3 lines was permanently unreadable on those surfaces.
- **Fix**: new `src/components/previews/ClampedCaption.tsx` **measures** `scrollHeight > clientHeight` (re-checked on `ResizeObserver` + after `document.fonts.ready`, since a font swap re-wraps) and renders Show more/less only when genuinely clipped. Wired into all four preview components; `hasMedia`/`imageUrl`/`hasVideo` now just feed its `clamp` prop.
- **Second bug found while verifying in-browser**: `renderTextWithLinks` emits real `<br>`s, so a paragraph break burned one of the 3 preview lines and the post previewed as a **lone "…"**. Collapsed state now suppresses the empty line (`[&_span:empty]:hidden [&_span:empty+br]:hidden`); expanding restores spacing via `whitespace-pre-wrap`.
- **Verified in a real browser** (jsdom can't test this — no layout): tweet 176px→88px box, toggle present, expands to full text; IG 253-char caption 118px→71px, now expandable. 24 snapshots updated (class change + button no longer rendering under jsdom, which has no layout to measure).
- **State**: 1,181 tests passing (7 new), typecheck + format clean. **Uncommitted** — no PR opened yet.
- **Gotcha worth knowing**: `author-hub-route`, `tag-collection-route` and `url-prefix-route` metadata tests **fail if `pnpm dev` is running** during `pnpm test` (shared `./data/adhdone.db`). Pre-existing, not caused by this change — stop the dev server before trusting a full-suite run.
- **Follow-ups**: the in-app `FeedCard`/`MediaCard`/`DiscoverCard` still clamp captions with no expand (acceptable there — the card links onward), but `MediaCard` in triage is a full-focus surface and may deserve the same treatment.

## 2026-07-27 — SERP descriptions stop restating the title; Instagram video fixed (cold-cache 404)

- **Why**: GSC (3 months) at 1.89K impressions / 9 clicks — 0.5% CTR at avg position 7.7. Impressions are compounding (+330 in the 4 days since W1) but the corpus is being _seen and not chosen_. Every top query has 0 clicks, and they're exact-phrase tweet searches — max intent, and we're the only crawlable mirror.
- **Root cause of the snippet half**: title and description were the same opening text cut at different lengths, so the SERP snippet added nothing past the headline and read like a scraper mirror. `buildSnippetDescription()` (`src/lib/utils/content-metadata.ts`) now **continues where the title stopped** (leading `…`), then appends what the page holds (`Video`, `2 photos`, `Article`, engagement) and a closer stating the differentiator. `attributionFact()` suppresses the handle when the title already shows it. Budget dropped 160 → **155** (Google truncates on pixel width; the closer is what gets cut). Wired into all 4 preview routes. For a post short enough that the title showed all of it, the continuation is dropped rather than repeated.
- **Instagram video/downloads — the 404 was never an outage.** vxinstagram populates its cache lazily: the **first** request for any Reel 404s for ~10–20s while its scraper sidecar fetches, then serves the MP4. `resolveInstagramVideo` used to `break` on any non-429 status < 500 — i.e. it gave up on precisely the "come back in a moment" signal, so the first person to request a given Reel always failed. 404 is now retryable per-mirror (`retryStatuses: [404]`, 6 attempts, ~22.5s backoff). Measured: 2 of 3 trending reels went **502 → 200** (5.2MB in 14.6s, 21.3MB in 3.2s); the 07-23 note concluding "everything is dead" was wrong because it probed each id **once**.
- **Downloads were also saving the error as the video.** All three download paths `.blob()`d / `<a download>`'d without checking status, so a 502 JSON body got written out as the `.mp4` — and `MediaShareOverlayButton` showed a **success checkmark** for it. New `isMediaAvailable()` (HEAD probe) gates them; failures now show "Blocked by source" / an alert icon.
- **Trade-off accepted**: a genuinely-unavailable Reel now takes ~22s to 502 instead of failing fast. The download UI shows a "Checking…" spinner through it. The route-level 502 test uses a fatal 403 so it doesn't burn the retry budget; retry behaviour is covered directly (`media-mirrors.test.ts` + a fake-timer test in `api/instagram-download.test.ts`).
- **State**: 1,174 tests passing, typecheck + format clean. Uncommitted. Reel JSON-LD advertises `contentUrl` again.
- **Follow-ups**: (1) **inline `<video>` playback unverified** — in the automated Chrome the element never issued a request (no request, no error, no CSP violation; likely a background-tab media-preload restriction), so playback needs a manual foreground check even though both stream routes return correct 200/206 + bytes to curl. (2) vxinstagram is still a single point of failure — the dead-end mirror list in `mirrors.ts` is now long enough to be worth re-checking periodically. (3) `youtube-link` fixture shows a weak title ("link: — @handle") when a tweet's only text is a stripped URL — consider falling back to the media label. (4) Real CTR read is a 7-day-vs-previous-7-day comparison around **Aug 6–10**, not impressions.

## 2026-07-23 — Staging smoke test of W1 (v1.48.0) + README voice restoration

- **Why**: browser-verified all W1 features live on staging (adhx.fly.dev) via 4 agents, incl. a signed-out pass (user-authorized logout).
- **All W1 features PASS live**: /t/ page fully crawlable (JSON-LD + item text in raw server HTML), on-site-first links, private-flow leaks nothing (noindex stub verified), trending CTA fires exactly at card 18 signed-out / never signed-in, dismiss persists (`adhx-trending-cta-dismissed`), GitHub glyphs on all public chrome, zero console errors anywhere.
- **P0 FOUND — tag UI has no entry point**: the Matter redesign removed tagging (`FilterBar.tsx` comment "Tagging is removed…"; `TagInput.tsx` exported but rendered nowhere; `onTagUpdated` wired but never called). The whole tag→share loop (incl. today's `/t/` overhaul) is unreachable by real users; smoke test had to drive `POST /api/bookmarks/{id}/tags` + `PATCH /api/tags` directly. **Restore a tag affordance (natural home: the full-focus/triage card) + a make-public entry point.**
- **Minor**: Settings streak card flashes false "0/0/0" before data loads (needs skeleton); star-history.com embed intermittently rate-limited (README now wraps it in a link + shields stars badge); CLAUDE.md's authed-preview auto-add claim was stale (fixed this commit).
- **README voice restored** (PR #287): joke badges back, deadpan tone, mermaid URL-prefix flowchart, resilient star badges.
- **Follow-ups**: tag-UI restoration (P0), streak skeleton, hero GIF still TODO, Dependabot pass (15 alerts, 9 high).

## 2026-07-23 — Growth backlog W1: conversion-leak fixes + README rewrite (implemented)

- **Why**: a 6-scout/2-judge research pass over growth options found the existing machinery leaking — full backlog in the session artifact; top items shipped as "Week 1" (4 parallel agents, disjoint file ownership).
- **Tag pages** (`/t/{user}/{tag}`): now server-rendered + crawlable (sr-only list + CollectionPage JSON-LD, `force-dynamic`), cards link to on-ADHX preview paths (x.com demoted to a secondary icon), Matter restyle, "Made with ADHX" footer. New data layer `src/lib/tags/query.ts` enforces the same public-share gate as the API route (independent impl — keep in sync) and fixes a latent (platform, bookmarkId) collision bug the route still has. Private tags render a noindex stub with zero content (leak-tested).
- **GitHub visibility**: dead unreachable GitHub block deleted from `Header.tsx`; "View source" glyph added to `PublicNav` + `PreviewShell` chrome (hidden < sm; TweetPreviewLanding snapshots updated for the new anchor only).
- **/trending**: signed-out visitors get a dismissible Matter CTA card every 18 items (`DiscoverCtaCard`, pure helper in `src/lib/discover/interleave-cta.ts`, localStorage `adhx-trending-cta-dismissed`); items/dedupe/polling untouched.
- **README**: rewritten for 15-second conversion — open-source + 4-platform positioning, verified Docker self-host section, star-history embed. Hero GIF still TODO (no current Matter-UI screenshot exists; placeholder comment marks the slot).
- **State**: 1,154 tests passing (34 new), typecheck/format/build clean. Uncommitted in working tree.
- **Follow-ups**: capture hero GIF; consider consolidating the 3× duplicated tiktok-thumbnail-URL pattern (trending/query, trending/archive, tags/query) and the tag-page item cap (60, unpaginated); W2 = directory submissions + comparison pages.

## 2026-07-23 — SEO growth-loop expansion (implemented) + agent context system installed

- **Why**: GSC (3 months) showed 1.56K impressions / 6 clicks (0.4% CTR, avg pos 7.6) on ~2,020 sitemap URLs. Ranking queries are the _content of saved posts_ and _author names_ — each save is a long-tail landing page. Moat: x.com is uncrawlable; ADHX previews are the indexable mirror.
- **Shipped** (4 parallel workstreams, disjoint file ownership): (1) content-first titles/descriptions (`src/lib/utils/tweet-metadata.ts` / `content-metadata.ts`; OG title now matches; the richer 500-char unfurl description is separate from the ~160-char SERP one) + server-rendered `RelatedSaves` footer on all 5 preview routes (`/reel` covered via its re-export from `/reels`); (2) author hubs at `/{username}` (`src/lib/authors/query.ts`, ProfilePage JSON-LD, 404 on empty/invalid handle); (3) weekly trending archives at `/trending/archive/{yyyy}-w{ww}` (ISO week, lowercase; current week excluded; linked from live `/trending`); (4) sitemap widened to gated `activity` inventory (gate: saved OR media OR article OR text ≥ 80 chars) + author hubs + archive weeks, `llms.txt` refreshed. Net ~+104 URLs on the dev dataset.
- **Contracts/invariants held**: all new public queries mirror `getTrendingItems()` anonymity rules (never select `userId`, regression-tested); new DB-reading pages are `force-dynamic`; single dynamic sitemap. `src/__tests__/iso-week-consistency.test.ts` pins the seam between the two independent ISO-week implementations (sitemap emitter vs archive parser) — don't consolidate them without keeping that test green.
- **Also this session**: installed this context system (`AGENTS.md`, this file, CLAUDE.md protocol section); README/ARCHITECTURE refreshed (Discover → Trending); GitHub repo description + topics widened. Full suite after integration: 1,120 tests passing (up from 943).
- **Follow-ups**: consider theme-clustered digests later; keep preview pages excerpt+attribution (don't render full X Article bodies — duplicate-content/ownership exposure); 17 Dependabot alerts (9 high) on main need a cleanup pass.

## 2026-07 (v1.43–v1.46) — OAuth fix, video source SSOT, client-direct video reverted

- **Logged-out X login fixed** (v1.43.3–4): X rewrites `x.com`→`twitter.com` inside `redirect_uri` (mangling `adhx.com`→dead `adhtwitter.com`). Fix: `TWITTER_OAUTH_REDIRECT_URI=https://adhx-prod.fly.dev/...` + callback 307-bounce to adhx.com, and authorize on `x.com/i/oauth2/authorize`. Details in CLAUDE.md.
- **Per-platform video sources centralized** in `src/components/feed/video-src.ts` — don't re-add per-platform branches in components (the IG-falls-through-to-Twitter-proxy regression bit repeatedly).
- **Client-direct video** (streaming TikTok/IG from the user's IP via mirror URLs) was explored and **reverted** (v1.46.4) — a future direction, not current architecture.

## 2026-06/07 — Matter redesign; /trending replaces /discover

- Full UI redesign to the "Matter" warm editorial system (light+dark), per-content-type cards, grid/list/bento views, full-screen triage mode with streaks.
- The public community feed moved from `/discover` (308-redirect now) to `/trending` + `/trending/[filter]` hubs with server-rendered crawlable lists + JSON-LD — the start of the SEO growth loop. All public activity reads go through `getTrendingItems()` (the anonymity choke point).
- Knowledge Graph (`/graph`, PR #262) was built but **closed unmerged** — code preserved on `feat/knowledge-graph`.

## Earlier (v1.0–v1.42) — platform foundations

- X bookmark sync (OAuth 2.0 PKCE, encrypted tokens, race-safe refresh via `getValidTokens()`), multi-user composite-key schema.
- URL-prefix previews for X / Instagram Reels / TikTok / YouTube Shorts; media proxies with SSRF allowlists + timeouts; HLS for long videos.
- Save-from-anywhere: bookmarklet, iOS Shortcut, Android PWA share target; installable PWA.
- Tag sharing at `/t/{user}/{tag}`, public tweet JSON API (`/api/share/tweet/...`), `llms.txt`, dynamic sitemap, agent skill (`skills/adhx/`).
