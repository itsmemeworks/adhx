# WORKLOG

Append-only context log for agents and contributors. **Newest entries first.** After any substantive piece of work, add a dated entry (≤10 lines): what was done, why, current state, follow-ups. Never rewrite or delete old entries — this file is how a fresh session inherits context that isn't in the code. See `AGENTS.md` for the full protocol.

---

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
