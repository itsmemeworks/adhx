# WORKLOG

Append-only context log for agents and contributors. **Newest entries first.** After any substantive piece of work, add a dated entry (≤10 lines): what was done, why, current state, follow-ups. Never rewrite or delete old entries — this file is how a fresh session inherits context that isn't in the code. See `AGENTS.md` for the full protocol.

---

## 2026-07-23 — SEO growth-loop expansion (in flight) + agent context system installed

- **Why**: GSC (3 months) showed 1.56K impressions / 6 clicks (0.4% CTR, avg pos 7.6) on ~2,020 sitemap URLs. Ranking queries are the _content of saved posts_ and _author names_ — each save is a long-tail landing page. Moat: x.com is uncrawlable; ADHX previews are the indexable mirror.
- **In flight** (4 parallel workstreams, disjoint file ownership): (1) content-first titles/descriptions + server-rendered RelatedSaves footer on all 5 preview routes; (2) author hub pages at `/{username}` (ProfilePage JSON-LD); (3) permanent weekly trending archives at `/trending/archive/{yyyy}-w{ww}` (ISO week, lowercase); (4) sitemap widened to all public `activity` inventory behind a thin-content gate + `llms.txt` refresh.
- **Contracts**: author hub URL `/{username}`; archive slug like `2026-w30`; all new public queries mirror `getTrendingItems()` anonymity rules (never select `userId`); new DB-reading pages are `force-dynamic`; single dynamic sitemap (sharding was tried and reverted).
- **Also this session**: installed this context system (`AGENTS.md`, this file, CLAUDE.md protocol section); README/ARCHITECTURE refreshed (Discover → Trending).
- **Follow-ups**: link from live `/trending` to the archive; consider theme-clustered digests later; keep preview pages excerpt+attribution (don't render full X Article bodies — duplicate-content/ownership exposure).

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
