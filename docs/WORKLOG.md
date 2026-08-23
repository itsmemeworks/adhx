# WORKLOG

Append-only context log for agents and contributors. **Newest entries first.** After any substantive piece of work, add a dated entry (≤10 lines): what was done, why, current state, follow-ups. Never rewrite or delete old entries — this file is how a fresh session inherits context that isn't in the code. See `AGENTS.md` for the full protocol.

**Voice:** new entries must not name operator GitHub logins, personal handles, or Fly bypasses. Put those in gitignored `CLAUDE.local.md`. Older entries below were written as an internal ops diary and may still contain them — they are historical, not a public contract.

---

## 2026-08-23 — Trending archive matches the ranked list

`/trending/archive` and `/trending/archive/[week]` dropped the leftover light paper/card-grid chrome. Same dark `#08070a` bar + numbered rows as live `/trending` (`TrendingListHeader`, `TrendingRankedRow`, `rankItems`). Week pages stay frozen (no poll, no filter pills); SEO list + JSON-LD unchanged. Follow-up: none.

---

## 2026-08-23 — Hidden-post tombstone is not "gone from X"

Admin hide reused `StageUnavailable`'s deleted-tweet copy, so a hidden YouTube Short (`/shorts/dQw4w9WgXcQ`) read "no longer available on X". Hide now passes `sharedUnavailableReason="hidden"`: headline "This post was removed from ADHX" plus a line that it is off preview pages and the live feed. Source-gone still names the real network (X / YouTube / Instagram / TikTok). Metadata for hides is "Post removed - ADHX". Follow-up: none.

---

## 2026-08-23 — Admin console on Settings

`/admin` (noindex) for `ADMIN_USERNAMES`. Settings shows the link when `/api/auth/me` returns `isAdmin`. Overview + analytics auto-refresh every 30s; inspect a post (URL or `platform:id`) with per-post counts and hide/restore; inspect a user and ban/unban (cannot ban self/admins); hide a playlist from the leaderboard. Hide writes `moderated_posts` so preview pages tombstone and the sitemap/pulse skip the post — bookmarks stay. Ban signs the account out and 404s their public profile/playlists. Follow-up: wire overview stats into a public `/this-week` later if wanted.

---

## 2026-08-22 — Growth analytics event log

Private `analytics_events` table + `recordAnalytic` choke point so we can count saves/views/shares/tags/archive/copy/open/auth/shortcut by platform and type without dumping those into the public pulse. Pulse actions dual-write; client POSTs are an allowlist. `GET /api/analytics?window=` returns aggregates and top posts with no userId. 90-day prune. Follow-up: wire these rollups into leaderboards.

---

## 2026-08-22 — iOS shortcut banner dismisses on tap-away

The iOS install banner is a soft nudge: any tap outside it (or the X) hides it and remembers. Settings now has an iOS-only "iOS shortcut" card with the iCloud link + the four-platform recipe, so dismissing the banner never loses the install path.

---

## 2026-08-22 — Mobile signup / collection pass

Signed up on an iPhone-14 viewport, cloned a starter playlist, tagged a post, opened Library + Tags. Fixes: hide the iOS banner on `/welcome` (it covered the chooser); Sign-in / tag picker sit above the banner (`z-80`); Continue after starters goes to `/collection` not Live; welcome card scrolls; tag input is 16px (no iOS zoom); starter Add is 44px; banner is in-flow under the header on Library/Settings so it doesn't cover Paste.

---

## 2026-08-22 — Playlist tag stays out of the mobile peek bar

Peek-bar center was `Repeat + #tag · N` — a 15-char tag collided with transport. Center is now the queue position like every other mode. Tag + count + curator sit in the expanded up-next sheet. Desktop unchanged.

---

## 2026-08-22 — Mobile theater actions are icon-only

The bottom-scrim action row on phones had no room for pill labels (Copy / Save playlist / Download / Save / Manage). Those are now the same 44px glass icon buttons as Share / Open; names live in `aria-label`. Desktop pills are unchanged.

---

## 2026-08-22 — iOS shortcut banner hangs under the logo

Mobile iOS banner is a left-aligned callout under the brand (theater: under the stage logo; `/library` etc: under the header logo), clay outline + caret. Whole card is the iCloud-shortcut link except dismiss. Copy names X, Instagram, TikTok, and YouTube — one tap, no copy and paste.

---

## 2026-08-22 — iOS shortcut banner is the tap target

The mobile iOS banner is one link (iCloud shortcut) except the dismiss X. No separate Add shortcut pill — title + subtitle take the width. Card uses the clay outline. It mounts on theater/playlist too, pinned above the peek bar (`z-70`) so it stays visible without covering nav.

---

## 2026-08-22 — iOS shortcut banner is the tap target

The mobile iOS banner is one link (iCloud shortcut) except the dismiss X. No separate Add shortcut pill — title + subtitle take the width. Card uses the clay outline.

---

## 2026-08-22 — Playlist mobile Download/Copy

`/t/{user}/{tag}` mobile swapped the whole Download/Copy + Save slot for Save playlist / Manage. Desktop already kept Download/Copy. Same row now: Download (or Copy) · Save playlist · Share · Open.

---

## 2026-08-22 — iOS shortcut banner copy + outline CTA

The mobile iOS banner now says it installs a Shortcuts.app shortcut so sharing posts to ADHX from X is one tap. Logo dropped for space. CTA uses the clay-border outline (`IosShortcutInstallButton variant="outline"`), not the filled clay-grad pill.

---

## 2026-08-22 — Mobile collection Archive + photo caption

Phone-width pass: Live / trending / leaderboard / sign-in / shorts were fine. Collection Archive still used the old Later/Delete column (`flex-col bg-done/25`) in the Live action row — now a 44px glass circle like Tag/Share/Open. Collection photos also painted the caption on the stage _and_ in the chrome; stage `photoCaption` is off, matching Live. The iOS “Add to Share” banner sat on `/collection`’s peek bar (same z-60 as TheaterShell); AppShell now treats `/` `/collection` `/t/` as theater surfaces and skips Header + PWA there.

---

## 2026-08-22 — YouTube clay bar without iframe click

YouTube withholds `currentTime` until a click inside the embed, so the progress line stayed at 0 on autoplay. While playing we now clock the bar from duration + play-start (snap when a real time / `mediaReferenceTime` arrives) and pull `getCurrentTime`/`getDuration` if starved. Interpolated time is display-only. E2E stubs the nocookie embed so the bar can be asserted without a real player.

---

## 2026-08-22 — Collection actions match Live

`/collection` action row is Download / Link / Tag / Open plus Archive. Later and Delete are gone. Keyboard matches Live (arrows skip); U still undoes Archive.

---

## 2026-08-22 — Repeat on /collection

My Collection hid the repeat control (`repeatEnabled = !isCollectionTab`) and video-end always walked off the queue. Same off → all → one switch as Live now. Playback wrap is `personalAdvanceOnEndedIndex`; All Clear offers Keep playing.

---

## 2026-08-22 — Signed-out e2e URL assertion

`/collection` and `/library` bounce signed-out visitors to `/`. Live then replaceStates to the current preview path, so `toHaveURL(/\/$/)` raced. The test now waits for theater chrome and asserts we left the authed routes.

---

## 2026-08-22 — E2E migrate before Next spawn

CI migrated and seeded `/…/data/adhdone.db` then Next queried the same path with no `activity`/`users` tables. Playwright can start `webServer` in parallel with `globalSetup`; Next opened the file, setup `rm`'d it, migrate wrote a new inode, Next kept the empty one. `/api/health` is `SELECT 1` so the suite started anyway.

Migrate/seed now runs in `e2e/serve.ts` **before** `next dev`. Next inlines `process.env.ADHX_DATABASE_PATH` (dot access). An explicit path with no `users` table throws instead of serving empty.

---

## 2026-08-22 — Inline e2e DB path for Next workers

`next.config` now inlines `ADHX_DATABASE_PATH` when `NEXT_DIST_DIR=.next-e2e`. CI also sets `DATABASE_PATH` on the e2e step. First sqlite open logs the path.

---

## 2026-08-22 — E2E CI uses the default sqlite path

GitHub Actions e2e now migrates `data/adhdone.db` (Next's fallback when Turbopack workers drop `DATABASE_PATH`). Local `pnpm test:e2e` still uses `data/e2e.db` so it cannot clobber the owner's DB. Gated on `GITHUB_ACTIONS`, not `CI`.

---

## 2026-08-22 — E2E CI opened the empty default DB

CI migrated `data/e2e.db` then Next compiled `@/lib/db` without `DATABASE_PATH` and cached an empty `adhdone.db` on `globalThis`. `/api/health` is `SELECT 1`, so Playwright started the suite anyway. DB open is now lazy and re-opens when the resolved path changes; env is read with bracket access so Turbopack cannot inline `undefined`.

---

## 2026-08-22 — Unused leftover files deleted

Deleted unused: `PreviewAnotherLink`, `Tooltip`, landing `AnimatedBackground` + barrel, `XIcon`, `usePersonalQueue` (+ its test — `sameBookmark` stays covered), leftover gestalt theme. `useSendFile` now calls `pingSharePulse` instead of a copy. Dropped unused `sharedItem` on `DesktopStageChrome`. Stale `AddTweetModal` / `CollectionMode` test mocks gone.

Kept on purpose: `YtDebugOverlay`, `tweetUrl`, HLS routes, `summary` / `rawJson`, GET/PATCH `/api/bookmarks/[id]`. Those need an owner call, not a silent drop.

---

## 2026-08-22 — Preview metadata + last dead weight

`generateMetadata` on Reels / TikTok / Shorts is DB-first via `getSavedPreviewDisplay` (same skip as the page body). Shared OG tail is `previewPageMetadata`. Deleted the orphan `TweetPreviewLanding` snapshot. Collection actions no longer branch on an identical wrapper class.

Residual: confirm the security inbox; e2e CI job on the next push. Not a code hold.

---

## 2026-08-22 — Chrome + preview residuals closed

Shared the copy-shaped chrome wiring without merging layouts. Desktop 1,443→1,126, mobile 1,102→959. New modules: `SavePostButton`, `TheaterCollectionActions` (desktop glass vs mobile 44px pills), `TheaterMetaChips`, `TheaterTagChips`, `useTheaterCopy`, `useTheaterStageEvents`, one `navigateToAppPath`. Reels / TikTok / Shorts share `SharedPreviewPage` + `getSavedPreviewDisplay` + `recordHumanPreview`; tweet page stays richer. Typecheck + 190 chrome/paste tests green.

Residual: confirm the security inbox; e2e CI job on the next push. Not a code hold.

---

## 2026-08-22 — Open-source readiness

Public repo voice: PRIVACY.md + `/privacy` (reserved segment, sitemap, landing/settings/theater-menu links). SECURITY.md prefers GitHub private advisories; email is secondary. Operator `gh` logins belong in gitignored `CLAUDE.local.md` — stripped from AGENTS.md / CLAUDE.md / always-push-pr. Historical WORKLOG entries below are not rewritten. GitHub: private vulnerability reporting, secret scanning + push protection. Repo About no longer says “triage mode”.

Residual: confirm the `security@adhx.com` inbox exists; Playwright e2e CI job greens on the next push.

---

## 2026-08-22 — Dead-weight ops routes deleted

Removed unused leftover routes: `GET/POST /api/enrich`, `GET/POST /api/repair/links`, `GET /api/sync/logs`. Nothing in the app called them — sync already enriches via FxTwitter, Settings reads `/api/sync/history`. Kept `tweetUrl`, legacy `/api/share/tag/[code]`, `/api/sentry-test`, `/api/dev/og-tags`.

---

## 2026-08-22 — Optional leftovers closed

Closed the five optional leftovers on this branch (uncommitted — owner commits).

- **Live URL**: `theaterTabNavRestore` resyncs `/` or `/collection` before `router.push` so My Collection is not stuck on a replaceState preview path.
- **inferContentType**: one priority list (`src/lib/content-type.ts`). Article beats video/photo. Wired through trending, archive, tags, authors, theater backfill, `feedItemType`, collection, `inferType`, FeedCard badge.
- **FeedItem vs TrendingItem**: adapters at the edges (`feedItemToTheaterItem`). Types stay different on purpose.
- **Pulse writes**: cross-site Origin → 403; dedicated `activityWriteLimit` (15/min/IP), not the media bucket.
- **CI**: Owner cleared GitHub billing. Actions is enabled; build/format/test already green. Playwright e2e job is in local `ci.yml` and runs on the next push.

Residual: desktop/mobile chrome still copy-shaped; operator names in WORKLOG; no PRIVACY.md.

---

## 2026-08-22 — Foundation review canvas matches the closed todos

Updated `adhx-foundation-review` canvas: all 13 work items + the six leftover todos are marked done. Residual (not a hold): five content-type inferrers, FeedItem vs TrendingItem, Live replaceState URL lag, pulse-count integrity, CI billing, operator names in WORKLOG. Owner commits.

---

## 2026-08-22 — Foundation-review leftovers closed

Finished the remaining review todos on this branch (uncommitted — owner commits).

- **Docs**: README / ARCHITECTURE / llms.txt / CONTRIBUTING match theater · playlist · library. No Triage. Local boot includes `pnpm db:migrate` + distinct `SESSION_SECRET`.
- **Cut**: dropped `filedPath` / `needsTranscript` / `extractedContent`, `collections` / `collection_tweets` / `sync_state`. Deleted unused GET `/api/bookmarks`, DiscoverCtaCard, interleave-cta. One `cloneTagToUser()` for both share clones (pair-safe).
- **Playlist HTML**: one sqlite handle via `globalThis`; PATCH/DELETE `revalidatePath` `/t/{user}/{tag}`. e2e now asserts the page is not “Private playlist”.
- **TheaterShell**: `useSharedPin`, `useTheaterLiveUrl`, `resolveTheaterChrome`.
- **e2e**: IG / TikTok / YouTube mocks (`INSTAGRAM_OG_BASE` / `TNKTOK_API_BASE` / `YOUTUBE_OEMBED_BASE`); mobile viewport spec.

---

## 2026-08-22 — Playwright covers the rest of the major surfaces

Expanded `pnpm test:e2e` beyond the first 13 theater regressions. New specs: collection Tag / Delete+Undo / Later; signed-in preview Save; clone of `e2ecurator`'s `e2e-clone` playlist; library search / tag / Show archived / Make public / list / TikTok platform filter; `/trending` `/leaderboard` `/share` paste-to-preview, `/discover` `/collections` redirects, `/api/health`; header + Collection↔Live + Manage playlist + `j`.

- Assertions go through the same Next process (`page.request` / `/api/feed` / `/api/tags`) — a second sqlite connection misses WAL writes. `expectTheaterReady` never presses Escape (that's Close on the personal theater).
- `/api/tags` PATCH/DELETE now `.run()` so visibility flips persist; `getPublicTagCollection` does not cache private/not_found. Follow-up: `/t/{user}/{tag}` can still disagree with the share API after a flip (RSC vs route db instance); mobile + IG/TikTok/YouTube mocks.

## 2026-08-22 — Playwright covers tag, delete, clone, save, library, public pages

Expanded `pnpm test:e2e` past the first 13 theater regressions. New specs: collection Tag / Delete+Undo / Later; signed-in preview Save; clone of a second curator’s public playlist; library search / tag filter / Show archived / Make public / list view; `/trending` `/leaderboard` `/share` paste-to-preview and `/discover` `/collections` redirects; header + account menu + Collection↔Live + Manage playlist + `j` on Live.

- Seed now includes a curator account (`e2ecurator` / `e2e-clone`) and a non-self `collection_events` view so the leaderboard isn’t empty. Mutating tests clean up (`e2etmp`, cloned rows, preview save, private-tag visibility).
- Isolated :3002 / `data/e2e.db` unchanged. Follow-up: mobile viewport, IG/TikTok/YouTube preview (need those mocks).

## 2026-08-22 — After-merge theater cleanup (the five follow-ups)

Did the post-merge list from the "Five before-merge theater foundations" entry, on this branch.

- **Dead custom-collections product**: deleted `/api/collections` CRUD + `/api/collections/[id]` + tweets + `collections-context.tsx` + `/api/share/[code]` (tag share stays). Feed no longer filters by `?collection=`. Kept `/api/collections/trending`, admin hide, `/collections` → `/leaderboard` redirects, and the `collections` / `collection_tweets` tables (account wipe still deletes rows).
- **Dead media**: deleted unused `MediaCard`, `PreviewShell`, `VideoPlayer`, `MediaShareOverlayButton`, `ClampedCaption` and their tests. Theater playback is `StageVideo` / `StageYouTube`.
- **Dockerfile**: COPY the whole `src/lib` tree instead of per-file migrate/script imports — the staging outage class.
- **TheaterShell decompose**: pures live in `theater-math.ts` + `useIsDesktopViewport.ts`; `TheaterShell` re-exports so existing test imports keep working.
- **Shims gone**: feed/page only read `hideArchived` (`unreadOnly` is stripped from the library URL, not honoured). `?triage=1` no longer opens `/collection` (`?collection=1` still does). `/api/stats` no longer aliases `unread`/`read`.

## 2026-08-22 — Playwright e2e for theater regressions

Owner: stop relying on manual clicks every time we add a theater feature. Added `pnpm test:e2e` (Playwright, Chromium) against an isolated Next on **:3002** + `data/e2e.db` — never the owner's `:3001` / `adhdone.db`.

- Covers signed-out routing + sign-in at save-intent, library card → `/collection` (no overlay), `(platform, id)` feed lookup, archive + Undo with no `activity.read` pulse, playlist wrap + single-item loop, preview pin (stays until you turn repeat off or advance), signed-in Live URL rewrite vs `/collection` staying put, repeat `'all'` persist.
- Preview SSR talks to a tiny FxTwitter mock via new `FXTWITTER_API_BASE` (default unchanged). Auth is a minted `adhx_session` JWT.
- Not folded into `pnpm test` / husky. CI job `e2e` added (installs Chromium). Follow-up: more coverage for tag/delete/clone once this suite is green locally.

## 2026-08-22 — Five before-merge theater foundations

PR 390 review blockers, implemented on this branch (not committed — owner commits). One personal theater, honest archive, platform-safe keys, private Done, signed-in Live URL sync.

- **One personal theater**: `/library` no longer overlays TheaterShell. Card tap / `F` / leftover `?open=` `?collection=1` `?triage=1` `?live=1` `open-theater` / `/?added=success` navigate to `/collection` or `/`. AuthedTheater fetches `limit=100`; `!ok` is an error + Retry, not CollectionAllClear.
- **Archive notifies** Header + library via `notifyCollectionChanged()` (archive, committed delete, archive-undo). Later does not.
- **`(platform, id)`**: `/api/feed` accepts paired `id`+`idPlatform` (does not overload feed-wide `platform=`); membership lookup and `usePersonalQueue` match on both.
- **Archive is private**: POST `/api/bookmarks/[id]/read` no longer writes a public `read` pulse.
- **Signed-in Live URL sync**: `history.replaceState` gated on `isCollectionTab` / playlist, not `isPersonal`.
- **Follow-ups** (post-merge): cut dead collections product, MediaCard/PreviewShell/VideoPlayer, Dockerfile directory COPY, TheaterShell decompose, drop `?triage=1` / `unreadOnly` shims.

## 2026-08-22 — Triage/streak removed, three renames, and a staging outage I caused

Owner asked for the triage concept and the gamification gone, then for the internal names too ("otherwise we'll forget"). Three renames, each its own commit: `triage` → `personal` mode (deliberately NOT `collection`, which is already one of its two TABS — `isCollectionMode && isCollectionTab` would be a riddle); `unreadOnly` → `hideArchived`; and the DB's `read_status`/`read_at` → `archived_posts`/`archived_at`, with `isRead` → `isArchived` and `stats.unread` → `stats.active`.

- **The archive control is a view switch, not a CTA** (owner: "you're either viewing your collection with archive or without"). Label names the destination view — Show archived / Hide archived — same quiet surface in both states, `aria-pressed` carrying the state.
- **Streak gone entirely**: Settings card, Header badge, dock segment, all-clear flame, the API route and its lib. Don't reintroduce it; the leaderboard is where gamification lives.
- **The DB migration is the part worth copying.** Extracted to `src/lib/db/rename-read-status.ts` as a pure function over a minimal `{prepare, exec}` interface, guarded by a `sqlite_master` existence check (not try/catch — a real failure must still exit non-zero), ordered BEFORE the index block that names the new table. Seven tests build the OLD shape by hand and assert rows preserved, composite PK intact, idempotency, fresh DB, and a half-migrated DB where both tables exist and the new one must not be clobbered. **Nothing in the existing suite would ever exercise a rename** — the harnesses create every table fresh — so a data migration is untested unless you construct the old shape yourself. Verified on real data locally (14 rows, values identical) and on staging (`[migrate] Renamed read_status → archived_posts`).
- **I took staging down.** Extracting that module for testability broke the runner image: the Dockerfile COPYs individual files, so `migrate.ts` died on `ERR_MODULE_NOT_FOUND` before the server listened — which Fly reports as "never became reachable on 0.0.0.0:3000", i.e. it looks exactly like a failed migration. Any new file `migrate.ts` imports needs its own COPY line. Local build + full suite pass regardless, since neither uses the runner image.
- **Search-and-replace was the single biggest source of self-inflicted bugs today**, and the suite caught almost none of them: a migration rewritten to `ALTER TABLE archived_posts RENAME TO archived_posts`; `?triage=1` collapsed into a duplicate check and silently dead; `/api/stats` still returning `unread` while the Header read `active`, so every header showed 0 (its own tests asserted the old field names); four test files broken by regexes that deleted an `if (…) {` line but not its body. All found by reading diffs or by review agents. **After any blanket rename: read the whole diff, grep the old name expecting only deliberate survivors, and hand it to a review agent asking specifically for collateral damage.**
- **Back-compat kept deliberately**: `?triage=1`, `unreadOnly` on both the API and the page URL, and `/api/stats`' `unread`/`read` alongside the new fields — all shipped names that live in bookmarks, shared links and browser history. Three API tests plus three page tests pin them, since compatibility shims are what a future cleanup deletes first.
- **State**: 2455 tests / 193 files green, typecheck + lint + prettier + build clean. GitHub Actions is blocked by an account billing lock (every job fails in ~2s with "account is locked due to a billing issue"), so the PR cannot show green CI until the owner clears it; staging was restored with `fly deploy --config fly.toml --app adhx`, which bypasses Actions.

## 2026-08-22 — The signed-in Live tab never marked anything seen (and two stall bugs)

Pre-merge review + a permutation matrix, run as parallel agents. The headline finding was MINE, from earlier in this same PR, and was worse than the bug that prompted the hunt.

- **`useTheaterDwell` no-oped for `isPersonal`** — both tabs. Correct while triage was an overlay over the grid; the moment authed `/` became a triage mount (the routing change in this PR) it silently meant "signed-in viewers never mark anything seen". The live queue reads that seen state to decide whether anything is left, so it always found an earlier never-marked post and redirected BACKWARD — the signed-in theater looped its own finished posts forever and could never reach the caught-up stage. Gate is `isCollectionTab` now: only that tab opts out (read state there is explicit), and the Live tab dwells exactly like the signed-out home theater it shares machinery with. This also restores the `preview` pulse for authed `/`, which it fired before the routing change.
- **`computeLiveNext` returned its rescue index verbatim.** That index comes from a ref computed in an earlier render, so after an arrival prepends and shifts positions it can equal the CURRENT index (→ caller sets the key it already has → React bails → no re-render, no waiting stage: a dead stage with a paused button, which is the owner's "it played the new video then stopped without the final screen") or point past the end (→ `items[next]` undefined). An unusable index now means "nothing to rescue to" → caught-up. Found by ENUMERATING the pure functions against the reported state, after direct reproduction attempts kept passing — with correct inputs the maths was already right, so the defect had to be in what reached them.
- **Two Tailwind classes I wrote compiled to nothing**, the second time in this PR: `clay`/`surface` are hex CSS vars and the `/NN` opacity modifier silently drops on them, so the just-pasted row in LIST view had no highlight at all (grid and bento glowed) and the paste pill had no background or border. Same family as the `shadow-[...]`-in-a-constant failure: the class is in the DOM with no rule behind it. **Rule of thumb for this repo: never build a Tailwind class from a JS constant, and never put `/NN` on a hex-var colour.**
- Smaller, all confirmed by review: a superseded feed response cleared `loading`, and the deep-link effect fires on any loading true→false edge, so a filter change racing an in-flight request could resolve `?open=`/`?collection=1` against a stale snapshot once, with no retry; desktop Download buffered a whole 1080p file behind a spinner instead of streaming (only the share sheet needs bytes in hand); the waiting-stage arrival effect could re-point `pinnedKey`, which in shared mode is the shared post itself, not a lead-pick; the desktop chrome kept a disabled "Saved" pill after the mobile one was removed.
- **Process note worth keeping**: the first end-to-end browser run was invalid because I was editing source files while it tested (243 hot-reloads in its session). Browser verification of timing-sensitive behaviour needs a quiescent server — or better, the deployed staging build, which has no HMR at all.
- **State**: 2441 tests / 191 files green, typecheck + lint + prettier clean. New: `theater-arrival-stop.test.ts` (pure-function edge cases incl. the stale-index stall) and `TheaterShell-caughtup-matrix.component.test.tsx` (21 tests over auth × seen-state × trigger × repeat × arrivals, asserting the signed-out and signed-in surfaces behave IDENTICALLY — that equivalence is exactly what broke).

## 2026-08-22 — Global-state review: seven places the UI disagreed with the database

Owner: "certain areas of the website don't update when things happen… do a full review of that." Three parallel read-only reviews (library grid / global chrome / theater internals) cross-checked each other; these are the findings that were REAL, all now fixed. The reviews also cleared several suspects — preferences context, `useSeenSet`, `mergeFeedItems`, the collection index/undo bookkeeping and the read/delete paths are all correct as written; don't "fix" them.

- **`src/lib/client-events.ts` is new**, and is the point of the exercise. Cross-component refreshes were hand-dispatched window events from a dozen call sites, so most sites fired SOME of them — that IS the owner's complaint, in one sentence. Mutations now call `notifyCollectionChanged()` / `notifyTagsChanged()`, which document who listens. **`notifyCollectionChanged({ refetchFeed: false })` matters**: the `tweet-added` event's only listener refetches the WHOLE feed, so a caller that already placed its item in the grid must not fire it or its item vanishes behind the active filter.
- **Cloning a playlist announced nothing at all** — Header counts, library grid and `/tags` all silently missed a bulk import until reload. Now `notifyCollectionChanged({ tagsChanged: true })` (a clone adds a tag too).
- **Live-tab Save** fired only `tweet-added`, which the Header doesn't listen for (counts stale) and whose listener nukes the grid's list and scroll position to refetch page 1 — for one post. It now hands the row it ALREADY fetched to the grid via the new `onCollectionAdded` prop and skips the refetch. Deferred post-sign-in save and the starter-collection clone were likewise silent; both notify now.
- **Tag pills never reached the grid.** `bookmark-tags-changed` has always carried the post's complete new tag list in `detail`; `AuthedHome`'s listener ignored it and refetched only the tag COUNTS. So a tag added in the theater showed there (the theater patches its own snapshot) and vanished when the overlay closed. Now patched in place, matched on **platform AND id** (the same numeric id exists across platforms), and a detail-less dispatch is treated as "refresh counts", never as "this post has no tags".
- **`/tags` fetched once and subscribed to nothing** — counts and even the existence of a brand-new tag were wrong until reload. Now listens for tags-changed + feed-changed.
- **Pagination drift**: the server pages by OFFSET, so every locally-removed row (a Done under unread-only, a delete) shifted the boundary and page N+1 re-sent a row already on screen → two cards with the same React key. Appends now dedupe by `(platform, id)`. A monotonic request token also drops stale responses, so a filter change racing an in-flight `loadMore` can't append the old filter's page 2 onto the new list.
- **The mute flicker the owner reported earlier has a cause**: `liveMuted` — a report about the element that WAS on stage — was not reset on `currentKey`, though its sibling `timedPaused` was. Carried over, the audio icon showed the previous post's real mute state until the next broadcast. Reset in both chromes.
- **A failed membership lookup was permanent**: ids were marked "checked" before the request (correctly, to avoid double-fetching) but never un-marked on failure, so one network blip left an already-saved live post showing "Save" all session. The catch now un-marks them.
- **State**: 2395 tests / 189 files green, typecheck + lint + prettier + `pnpm build` all clean. New: `client-events.test.ts`, `TagsClient-live.component.test.tsx`, `AuthedHome-state-freshness.component.test.tsx`.

## 2026-08-22 — Send actually sends the file (the tap now waits for it)

Owner, from a PRODUCTION preview page (so this predates this branch): the mobile Send/Download button put a URL into WhatsApp instead of attaching the video. "It needs to be smart enough that when you tap download, it keeps the spinner going until it has the file to send."

- **Cause: the tap had no wait in it.** `send()` read `blobRef.current` and, when the 2s-delayed prefetch hadn't landed, fell through to `navigator.share({ url })` — a link-only share that _looks_ like success. A 3MB MP4 on mobile data loses that race routinely. Worth stressing for future debugging: nothing was broken server-side — `curl` on the reported post's `/api/media/video` returns 200 / 3.5MB. It was purely timing.
- **An early tap now joins the in-flight prefetch and awaits it** with `sending` still true, so the spinner covers the fetch and the share carries the real file. The link path is now reachable only on a genuine fetch failure.
- **Activation loss is surfaced, not swallowed.** iOS and Chrome both consume transient activation across an `await`, so the post-fetch `share()` can be refused with `NotAllowedError`. Previously that fell through to the link share (the reported symptom, again). Now `primed` goes true, the file stays cached, and the button reads **"Send now"** for the one extra tap the sheet needs.
- **Preview pages prefetch eagerly** (`useSendFile(current, { eager: mode === 'shared' })`). The 2s delay exists so skimming the live feed doesn't pull a file per item — but a shared post is pinned, repeating, and the reason the visitor is there. With the file already cached the sheet opens inside the tap's own activation and the second tap never happens.
- **Label made honest**: "Send" + share glyph where it opens a share sheet, "Download" where it downloads. Both chromes said "Download" unconditionally, which is why a link share read as a broken download instead of the wrong action. Desktop is unchanged (always downloads, by an earlier owner decision); the desktop chrome got the same treatment because a tablet gets that chrome at lg+ with a real share sheet.
- **State**: 2370 tests / 186 files green, typecheck + lint clean. 5 new hook tests; the mobile share path needs BOTH `getPlatformType()` mocked to 'ios' and `navigator.canShare` stubbed (jsdom is 'desktop', which is why the old tests never covered this branch — they asserted the "Download" label and still pass).

## 2026-08-22 — Shared preview pages group their queue like home

Owner spotted the inconsistency from a real URL (`/WireSpy92/status/…`): the queue on a preview page had no sections at all, while the same queue on `/` showed New-since / Up-next / Watched-earlier. "We just need to be always consistent here."

- **One flag caused it**: `liveOrdering = !sharedItem && !loop`, which withheld both the unseen-first ordering AND `wasSeenOnEntry` (the headings' input) from shared mode. But the queue beneath a shared post IS the live pulse — same feed, same items, same seen state. Now `liveOrdering = !loop`: only a curated tag playlist opts out, because it alone has an authored order and no notion of "what's new".
- **The shared post is the exception inside the exception.** It leads because the visitor followed a link to it, not because it's new or unwatched. New `pinnedKey` prop on `UpNextList` puts it outside the grouping under its own **"Shared post"** heading (no count — it's one post) and excludes it from every group count. This carve-out is load-bearing, not cosmetic: without it the pinned lead consumed the first group's heading (`started` set → one heading per group) and the real unwatched run below rendered UNLABELLED, which is worse than no sections at all. `headingAt` therefore maps index → `{label, count}` rather than index → group.
- **Boundary**: a re-visited shared post is counted as pending (`wasSeenForRun` exempts `sharedItemKey`). A watched lead would otherwise make `unseenBlockLength` return 0 from index 0, which `computeLiveNext` reads as "no boundary" — silently switching stop-when-caught-up off for the entire queue behind it. Caught-up likewise ignores the pinned row: it's a fact about the live feed, not about the link you opened.
- Infrastructure that already existed and did the heavy lifting: `pinnedKey`/`pinKeyFirst` in the shell already pinned the shared post to the front of the display order, so no ordering work was needed — only letting the tail be grouped.
- **State**: 2365 tests / 186 files green, typecheck + lint clean. 6 new `UpNextList` tests (incl. the no-carve-out home case and playlist staying ungrouped) + 4 shell-level wiring tests. Verified live on the reported URL: `Shared post / Up next 9 / Watched earlier 5`.

## 2026-08-22 — Mobile's Live/Collection switch moves into the burger

Round trip worth recording, because the first answer was wrong. Owner asked for the mobile tab switcher to go "to the top, just like it is on desktop"; I mirrored the desktop pill into the mobile top scrim, and the owner immediately called the real constraint: "that is going to definitely cause overlap with the logo, the play stats, and the paste and burger menu — why not just put it in the burger menu for mobile? Theater just has two sub options: live and collection and we can just highlight which one is selected." Correct: the scrim carries logo + flame/trend chip + platform/time chip + paste + burger, and the pill wants ~190 of ~390px.

- **`TheaterTabsGroup`** in `TheaterAvatarMenu.tsx`: a THEATER heading, then Live / My Collection as indented rows, selected one marked with the bright ink + clay dot + `aria-current="page"` the other rows already use. Buttons, not anchors — `onTabChange` flips the tab locally before navigating, where a link would reload the stage mid-watch. Gated on a new opt-in `theaterTabs` prop: mobile passes it, **desktop does not** and keeps its top-bar pill, so the control is never rendered twice.
- **"Your collection" → "Library"** in the same menu. My change created the collision (a "My Collection" sub-option one row below a "Your collection" row pointing at `/library`), and Library is the repo's own word for that grid.
- **The vacated peek-bar centre** now carries the queue position in the collection theater too — closing the gap flagged the round before, where triage was the one mode with nowhere to show the boundary-aware count. `· N new` is suppressed on the Collection tab: nothing arrives into a finite backlog mid-session.
- **Harness limitation, remember this**: `resize_window` reports success but `window.innerWidth` stays pinned at 1440 in this Chrome MCP setup (`outerWidth` does change — 728 — so the OS window shrinks while the layout viewport doesn't). Tailwind breakpoints therefore never flip and a true mobile render is unavailable locally. Workaround used: both chromes are always in the DOM (`lg:hidden` is display:none, not unmounted), so force the mobile root visible with an inline `width:390px` and measure real rects. Got: logo 16→104, burger 292→332, close 338→374, dropdown 240px wide at left 92, no overflow, no stray tab buttons; switching to My Collection routed to `/collection`, moved the dot, and the peek bar read "1 / 9". That measures fit and wiring honestly but NOT media-query-dependent styling — device eyeballing still belongs to the owner.
- **State**: 2356 tests / 186 files green, typecheck + lint + prettier clean. The old mobile-chrome tab-order test became a wiring test (chrome hands `theaterTabs` to the menu, draws no tabs itself), and `TheaterAvatarMenu.component.test.tsx` gained a 6-test group for the sub-options.

## 2026-08-22 — "Caught up" now means nothing unwatched ANYWHERE (+ watched state, panel title, dead-video skip)

Four owner reports, all versions of the queue misdescribing itself.

- **A new arrival wasn't auto-playing** ("I shouldn't have to click re-watch because I haven't seen the new video yet"). A fresh arrival PREPENDS at index 0, but auto-advance only moves forward — a viewer at index 13 sailed past it, and the boundary then announced "you're all caught up" with 14 unwatched posts sitting BEHIND the cursor. `computeLiveNext` now takes `nextUnwatchedIndex` and diverts there instead of waiting; waiting means nothing unwatched anywhere, which is what the words claim. The index is recomputed each render from the LIVE seen set (not the arrival snapshot the group order uses, which is deliberately frozen so rows don't jump while you watch) and excludes the current item. `shouldRewaitAfterArrival` is also gated on it, so an arrival can't re-arm waiting while there's something to play.
- **Show-all panel title ignored the repeat selection** ("shouldn't the title be relevant to the selection?"). It was hard-coded "Up next" while the control right next to it said "Keeps playing". Both now read `REPEAT_MODE_LABEL[mode].queue` — a third phrasing per mode, added alongside `.action`/`.state`, because a panel heading wants "Keeps playing", not the button's imperative "Keep playing". Only ONE panel needed it: the mobile sheet has no title of its own (its peek bar shows the position instead), so the screenshot's ✕ panel is the desktop one at a narrow width.
- **Watched rows weren't obviously watched.** `opacity-70` + a faint check read as "slightly dimmer", not a state. Now `opacity-45`, a `grayscale` thumbnail, and a larger titled `Check` — colour drained is the strongest at-a-glance signal in a list of posters, and it doesn't depend on noticing a tint.
- **A failed video stopped the playlist dead** (owner screenshot: the proxy not streaming). It now costs the same ~10s a text post does and then advances, unless the post is deliberately repeating. The guard hangs off the element's own `error` event, NOT a rejected `play()` — that path is the tap-to-play overlay and must keep waiting for the tap.
- **State**: 2348 tests / 186 files green, typecheck + prettier clean. Verified live at localhost: panel title tracks the cycle (off → "Stops when caught up", all → "Keeps playing"), 12 greyscale thumbnails on watched rows.
- **Test gotcha worth keeping**: in a jsdom component test, `render()` wrapped in `act()` while `vi.useFakeTimers()` is already installed leaves React uncommitted and the container EMPTY (the scheduler never flushes). Install fake timers before render, but don't nest act around the render itself — only around the events and `advanceTimersByTime`.

## 2026-08-22 — The repeat control IS the auto-advance switch (named, remembered, and reflected in the count)

Owner asked whether the auto-advance boundary needed a switch of its own. It doesn't — repeat already encodes it (`off` = stop when caught up, `all` = keep going through watched posts and round again). A second toggle would be two controls for one decision, against the "one control = state + action" rule. What it needed was to LOOK like a switch:

- **Labels name the behaviour, not the mechanism.** `REPEAT_MODE_LABEL` in `types.ts` (one source, so the two chromes can't drift): "Stop when caught up" / "Keep playing" / "Repeat this post". The old "Repeat: off" said nothing about the boundary, which is the actual decision.
- **It's remembered across visits.** Moved from `sessionStorage` to `localStorage`, so someone who wants continuous play doesn't re-set it every visit — that per-visit reset is most of why it felt like a missing setting. `'one'` deliberately does NOT persist: it's about the post in front of you, and inheriting it would strand you looping something at random, so flipping to it leaves the durable off/all choice intact.
- **Offered at the moment it matters.** The caught-up stage gained "Keep playing" beside "Re-watch all N" — one-shot vs from-now-on, at the point the viewer has just run out of new posts. `keepPlaying` computes the next index itself rather than calling `goNext`, because `repeatModeRef` still says 'off' on that tick and goNext would hit the boundary and bounce straight back into waiting.
- **The count reflects it** (owner: "maybe for mobile where it shows the count and position in that count, it should be aware of that too"). `computeQueueTotal` returns the unwatched run while repeat is off and the full length once it isn't, falling back to full length in the two cases where the run doesn't describe the viewer's position (caught up, or browsed back into watched posts). Wired into the mobile peek bar's "3 / 7" and the desktop end cap's "N posts". Verified live: repeat off reads "9 posts", flipping to Keep playing reads "17 posts" — the switch visibly changes the number, which is the clearest feedback that it did something.
- **Known gap**: in TRIAGE mode (authed `/`) the mobile peek-bar centre renders the Live ⇄ My Collection tab switcher, so the "3 / 7" fraction isn't shown there at all — only the desktop end cap is. Flagged to the owner rather than crowding a tight mobile bar on a guess.
- **State**: 2340 tests / 186 files green (new `TheaterShell-repeat.component.test.tsx` mounts the shell and drives the real control to assert the persistence carve-out and the denominator change; `computeQueueTotal` + label tests in `theater-live-queue.test.ts`), typecheck + prettier clean.

## 2026-08-22 — Repeat button regression + one shared <video> for every MP4 platform

- **Repeat icon gone from the authed live theater** (owner, desktop). Regression I caused earlier the same day: the button was gated on `!isPersonal`, which was correct while triage was an overlay over the grid — but the moment authed `/` became `mode="personal"` on the Live tab, that silently removed repeat for every signed-in viewer. Now gated on `!isCollectionTab`, so only the finite Done/Later backlog hides it. Verified live: the cycle reads off → whole queue → this post → off.
- **Sound lost on X video → text → Instagram reel** (owner, after the previous round fixed video → text → X video). Same position-reconciliation cause, one level deeper: `StageInstagram` rendered its OWN `<StageVideo>` once its Range probe came back, so that element sat at a different tree path than the one `Stage` renders — a fresh element, and iOS grants unmuted playback per element. Fixed by hoisting the probe into **`useInstagramStage`** (status/slow/src/poster + both auto-advance guards) so `Stage` plays the confirmed reel through its own shared video slot. `StageInstagram` is presentational now (probing poster / embed fallback, never a player), and `CollectionStage` grew a small local wrapper that does the same pick. **One `<video>` element now serves X, TikTok AND Instagram** — one iOS unmute grant for all of them. YouTube stays a genuine ceiling (iframe, not a media element).
- **Regression the existing tests caught**, worth remembering: the hoisted hook ran for EVERY item, and its `!id` branch set status to `'failed'`, which armed the embed-fallback guard and auto-advanced any item that happened to be on stage. The YouTube stall-watchdog test in `Stage.component.test.tsx` failed immediately. The hook is now inert unless `active`, checked FIRST in every effect.
- **"It stopped before the end of the list"** — working as designed, not a bug: auto-advance stops at the end of the UNWATCHED run rather than replaying watched posts, and the dock still shows the watched ones after the current item (the previous mobile screenshot read "NOT WATCHED YET 1 / WATCHED 25"). The restored repeat button and "Re-watch all N" are the ways past it. Flagged to the owner in case they'd rather auto-advance ran to the true end of the queue.
- **State**: 2329 tests / 185 files green, typecheck + prettier clean. The Instagram stage's own test file was migrated to drive `<Stage>` (the real production path) instead of the old component contract.

## 2026-08-22 — Live-theater round: waiting-stage resume, honest group labels, and the <video> element survives non-video items

Three owner reports off staging.

- **"I click rewatch all… it wasn't auto-playing."** Root cause: auto-advance into the waiting stage leaves `currentKey` ON the last item, so when that item IS `items[0]` (the common case — the unwatched run just ended, nothing moved) `replayFromStart` set the key it already had. `src` never changed → StageVideo's `[src]` effect never re-ran → nothing called `play()` after the waiting stage's `theater-pause`. Both user-initiated exits from waiting (`replayFromStart` and the repeat-cycle `'all'` branch) now dispatch `theater-resume` explicitly.
- **A ✓ row sitting under "NOT WATCHED YET"** ("it's categorizing a video that I've not watched yet but when I watch it, it stays in that section"). The grouping is frozen at arrival ON PURPOSE — positions stay put so the position counter means something and nothing slides out from under you mid-watch — so the fix is to stop the label CLAIMING otherwise: `Not watched yet` → **`Up next`**, `Watched` → **`Watched earlier`**, and the heading count is now what's still PENDING in that group, live. Finish a row and the count drops while the row keeps its place and its ✓; hit zero and the caught-up line appears. Considered and rejected: live regrouping, because with unwatched-first ordering the current item would always land at index 0 and the "2 / 26" counter would be meaningless.
- **Sound lost passing through an image/text post.** This was the gap StageVideo's own doc comment already admitted: "swapping to a non-video item… unmounts this component entirely, an accepted gap". iOS grants unmuted playback to the ELEMENT the viewer gestured on, so that unmount silently killed sound for the rest of the session. `Stage` now keeps the last video mounted, paused and covered, underneath every non-video item (the same trick round 8 used for the waiting stage) via a new `covered` prop on StageVideo. **The subtle part**: React reconciles by POSITION, so a first attempt that wrapped only the non-video branches still destroyed the element on every switch — the component tree now has ONE shape for every item (video layer in a fixed slot, everything else an overlay above it). Verified live: a single retained `<video>` node survives 10 consecutive item changes including Instagram, YouTube, photo and text items, always paused, never audible. Whether iOS actually carries the sound through is device-only — owner's call.
- **Still not covered**: Instagram and YouTube bring their own players, so an unmute granted to a twitter/tiktok element doesn't transfer to them (or back). The retained element now survives them, which is the prerequisite for fixing that later.
- **State**: 2329 tests / 185 files green (new: Stage element-retention tests, UpNextList heading-count tests), typecheck + prettier clean.

## 2026-08-22 — User-specific timings: a playlist is timed by when you tagged the post

- **Owner**: "If somebody adds something to their own collection, we should override the time if it was added to ADHX before this user saved it… When a user creates a tag and then adds a post into the tag, we should use the time at which they added that post to the tag. Therefore the users get control over when they are creating things that are related to them."
- **Collection half was already right**: `feedItemToTheaterItem` maps `addedAt` from THIS user's `bookmarks.processedAt`, so a post someone else linked months earlier still shows the viewer's own save time in their collection and library. Three existing tests already lock it; the rule is now spelled out in the code comment so nobody "unifies" it with the community MIN later.
- **Playlist half needed a new column**: `bookmark_tags` had NO timestamp at all, so a playlist was timed by `bookmarks.processed_at` — when the curator first saved the post, which can be months before they curated it into anything. Added **`bookmark_tags.created_at`** (nullable; guarded `ALTER TABLE` + a backfill from the bookmark's own save time in `migrate.ts`, since that's the closest thing history has). All four write sites stamp it: the tag POST, the bulk tag replace, and both clone endpoints — clones stamp backwards from the clone moment in the SOURCE's tag order (`addedAtForIndex`, same trick as the bookmark stamps) so a cloned playlist reads the same way round as the one it came from.
- **Read side** (`getPublicTagCollection`): `addedAt` and the ORDER both come from `bookmark_tags.created_at`, falling back to the bookmark's save time for pre-column rows. The sort happens after matching rather than in SQL because the key lives in the other table.
- **Three surfaces, three timestamps, deliberately not unified** — documented as a table in CLAUDE.md: community feed = global first-added MIN; My Collection / `/library` = this user's save; playlist = when the curator tagged it.
- **Gotcha, four times over**: `bookmark_tags` DDL is duplicated across FOUR in-memory test harnesses (`api/setup.ts`, `api/test-utils.ts`, `db/test-db.ts`, and inline in `api/bookmarks-id.test.ts`). Missing any one produces `SqliteError: table bookmark_tags has no column named created_at` in unrelated suites. CLAUDE.md's warning about the activity-table DDL applies here too.
- **State**: 2325 tests / 185 files green, typecheck + prettier clean. New tests in `tags-query.test.ts` cover tag-time display, tag-time ordering (seeded inverted against save order so ordering by the old field would fail), and the pre-column fallback.

## 2026-08-22 — Up-next: sort by the timestamp we DISPLAY, and label the three groups

- **Owner report** (staging, screenshot): "look at these time stamps in the playlist. They're not right. They're out of order. I'm saying two hours that are after one that says one week." Plus: the panel said "You're all caught up — Top today" with unwatched rows still listed. Plus a design ask: "do we need to be clear about what's been seen, what hasn't been seen yet, and then new things that have come in as we've been watching?"
- **Out-of-order chips — root cause**: the queue was ordered by `createdAt` (the pulse EVENT time) while the rows render `addedAt` (first added to ADHX). Two different fields, so the visible sequence could never be monotonic — "14h, 14h, 2h, 2h, 4h, 4h, 1d, 2d, 1w" in the report. Fixed by sorting on the value we display (`queueSortMs` → `addedAt`, falling back to `createdAt` when it's absent or an epoch sentinel). `createdAt` is still what decides whether a polled item counts as a fresh arrival; it just no longer orders the queue.
- **The lying header**: `newCount` required BOTH unseen AND `createdAt > lastVisitAt`, and `lastVisitAt` is only written on pagehide — so with no stored last-visit it was 0 and the panel claimed "all caught up" over a list of unwatched posts. Gone; the panel now reasons about what's actually unwatched.
- **Three labelled groups** (`orderLiveQueue` + `liveQueueGroupOf`, replacing `orderUnseenFirst`): **New since you opened** → **Not watched yet** → **Watched**, each heading carrying its count, and the settled groups sorted newest-added first. Arrivals deliberately keep the order the poll merge gave them rather than being re-sorted — a resurfacing post can be weeks old and still be the thing that just landed. Ordering, the `unseenBlockLength` auto-advance boundary and the headings all read the SAME `liveQueueGroupOf`, so labels can't drift from playback order. Grouping keys off `SeenSet.seenOnEntry` (the arrival snapshot), so a post watched mid-session keeps its slot instead of jumping to the back.
- **Dropped the summary line** ("12 to watch · 1 new") once the headings carried the counts — it was the same fact twice, directly above "NOT WATCHED YET 12", which the owner's own "show a fact once" rule rules out. The caught-up line stays, since no heading says that.
- **Follow-up — the "3w" confusion was a LABELLING bug, not a semantics one.** Owner asked whether `addedAt` should stay "first added by anyone" (a post someone else linked weeks ago reads "3w" the day you first see it). Kept as-is, because it's the only reading that never moves (a MIN), renders identically on the server (the crawlable list, dock, stage and playlist pages all agree), and costs no per-user state. The real problem: everywhere else on the internet a bare relative time beside a post means the POST's age, and the chip had no `title` or `aria-label` anywhere to say otherwise. Added `formatVerboseRelativeTime` + `addedToAdhxLabel` (`src/lib/utils/format.ts`, bucket-for-bucket identical to the compact chip so the two can never contradict), wired into all five chip sites as `title`/`aria-label` → "Added to ADHX 3 weeks ago"; the Up-next rows also show an `added` prefix inline, where there's horizontal room. Rejected: the pulse event time (the moving value owner rejected in round 8) and a per-viewer first-seen (needs per-user state, can't be server-rendered, and the New/Not-watched/Watched headings already answer "is this new to me").
- **Verified live** at desktop width on the seeded staging-like data: chips now read 2h → 1d → 2d → 3d → 3w → 2mo, headings "NOT WATCHED YET 12" / "WATCHED 5", and no duplicate count line. 2319 tests / 185 files green.

---

## 2026-08-22 — "Tagged collection" → **playlist** (terminology rename)

- **Owner**: "users have no idea what a tagged collection is so let's call them playlists. The leaderboard is showing the most popular playlists and a playlist is comprised of a single tag… Instead of 'save collection' it's 'save playlist'."
- **The word meant THREE things** in this codebase, and renaming the wrong one makes the product worse. The rule now written into CLAUDE.md: **playlist** = one shared tag (`/t/{username}/{tag}`, what `/leaderboard` ranks, what you clone), **collection** = the user's own pile of saved posts (the theater's "My Collection" tab — NOT renamed), **library** = the grid over that collection (`/library`). Both senses appear in the same file — `StarterCollections` has "Start with a full collection" (→ playlist) next to "Add to my collection" (→ keep) — so every hit was classified in context rather than sed'd.
- **Renamed**: all sense-A user copy (`Save playlist · N`, Manage playlist, Make your own playlist, Private playlist, "A curated playlist on ADHX", leaderboard `WINDOW_COPY` "Top playlists this week", the `/t/{u}/{tag}` `<title>` + OG + JSON-LD `name`), plus the symbols that would otherwise contradict the UI: `SaveCollectionButton` → `SavePlaylistButton` (file too), `TheaterMode` `'collection'` → `'playlist'`, `TheaterCollectionMeta` → `TheaterPlaylistMeta`, the shell's `collection` prop → `playlist`, `isCollectionOwner` → `isPlaylistOwner`, `SaveCollectionStatus` → `SavePlaylistStatus`, `handleSaveCollection`/`onSaveCollection` → `…Playlist`. That last group also resolves a live collision: `mode="collection"` vs the new `/collection` route (My Collection) meant two different things.
- **Deliberately NOT renamed**: URLs (`/t/`, `/leaderboard`, `/collection`), API paths (`/api/collections/trending`, `/api/admin/collections/hide`, `/api/share/tag/*`), DB tables/columns (`collection_events`, `tag_shares`), and the unrelated `collections` custom-collections table. They're indexed, in sitemaps, in `llms.txt`, and in shared links — public contracts with nothing to gain from churn.
- **Four routing regressions found and fixed on the way** — all fallout from `/` becoming the theater earlier the same day, all of them links that still assumed the grid lived at `/`: "Manage playlist" (`/?tag=` → `/library?tag=`, both chromes), the avatar menu's "Your collection" (`/` → `/library`), the `/tags` poster cards (`/?tag=` → `/library?tag=`), and "Make your own playlist" (`window.location.assign('/')` → `/library`, plus its signed-out `returnTo`). `SavePlaylistButton`'s saved state pointed at `/` too — now `/library`, relabelled "View in your library" so the label matches where it lands.
- **Verified**: server-rendered HTML on `/t/weedauwl/cats`, `/leaderboard` and `/tags` contains zero "collection" and the renamed titles; "Manage playlist" screenshotted on the playlist theater. 2309 tests / 185 files green, typecheck + prettier clean. CLAUDE.md gained the terminology rule, the new route table, and a pointer to `docs/specs/translation-safety.md`.

---

## 2026-08-22 — Mobile auto-translate crash + "added to ADHX" ordering + playlist time chips

- **Owner report 1**: on mobile, `/t/hghguy/bravas` (a non-English collection) got offered auto-translate, and advancing to the next post then errored. **Cause**: browser translation replaces the text nodes React owns with its own `<font>` wrappers; the next commit that removes/inserts around one of them throws `NotFoundError` (removeChild / insertBefore) and the page falls to the `error.tsx` boundary ("Something slipped"). **Reproduced live** at mobile width by simulating a translate pass (`<font>`-swap every text node) then clicking next — the console names the failing fiber (a lucide `<Download>` icon being inserted next to a translated label).
- **Fix, take 1 (REVERTED same session)**: `translate="no"` + `notranslate` meta in `layout.tsx`. **Owner overruled it** — "we shouldn't specifically disable translation, we should just fix the bug… it would be really useful if you could apply Chrome's translation to change Spanish tweets into English". Right call, and it forced the real fix.
- **Fix, take 2**: translation stays ENABLED; the rendering constraint that makes it safe is now written down in **`docs/specs/translation-safety.md`** — never render a bare text child as the SIBLING of an element (wrap each run in a `<span>`); text-only children are safe (React uses `setTextContent`), all-element children are safe. A DOM audit (elements having both a non-whitespace text-node child and an element child) found the offenders are few and stereotyped: icon+label buttons and `TypeBadge` — 2 distinct shapes on `/` (37 instances), 7 on `/t/{user}/{tag}`. `TheaterLinkedText` was hardened first (its text runs sit between `<a>`/`<br>` siblings); the rest went through a delegated sweep. Regression-tested by simulating the translate pass (`<font>`-swap every text node) and re-rendering: throws on the pre-fix code, passes after.
- **Sweep results, per page (offending shapes before → after)**: `/` 39→0, `/trending` (+`/trending/text`) 57→0, `/tags` 11→0, `/settings` 10→0, `/t/{user}/{tag}` 7→0, preview pages and `/leaderboard` were already 0. Two catches worth remembering: (1) **`toBionicText()`** (`src/components/feed/text-rendering.tsx`) rendered `<strong>{bold}</strong>{rest}` — a bare run beside an element, once **per word of every caption** whenever Bionic Reading is on, easily the highest-frequency exposure in the app; (2) the live tab's Save button (`TriageLiveSaveButton`) was missed on the first pass of the dock and **threw during the simulation** (`<Bookmark>`), which is why the sweep then fixed same-shape siblings in each file rather than only the sites the audit happened to hit. The error/not-found screens got the same treatment — they render on the recovery path, already translated.
- **Audit criterion has a grey area** (documented in the spec): an element with SEVERAL bare text children and no elements (`#{tag}`, `· {count} posts ·`) is only safe while the child count is FIXED — updating one is a lost `nodeValue` write (stale text, no crash), but removing/inserting one throws. Six such fixed-arity sites were left alone deliberately; a _conditional_ text child among text siblings must be wrapped.
- **Verified live**: 4 advances with a fresh translate pass between each (469 accumulated `<font>` nodes), zero console errors, stage genuinely advancing text → video → article. Note the tool's console buffer persists per domain, so stale pre-fix errors reappear unless cleared — clear it before believing a repro.
- **Owner report 2**: My Collection should rank by the date the post was added to ADHX, newest first. The API already defaulted to that (`sort=added` → `processedAt desc`) — the **stamps** were wrong: X returns bookmarks newest-bookmarked first and the sync stamped `Date.now()` per row as it walked that list, so the LAST row saved (the oldest bookmark) got the newest "added" time and the Collection opened upside down. Confirmed on prod: 615 items all stamped within the same few seconds of one sync, descending against X's order.
- **Fix**: `addedAtForIndex(batchStartMs, i)` (`src/lib/sync/added-at.ts`) counts the batch backwards from the sync start (1ms/row, index-based so skipped duplicates don't shift anything); the sync route passes it. Both clone endpoints got the same treatment — the by-name clone was spreading the source row's `processedAt`, so a just-cloned collection landed in the middle of the cloner's feed instead of the top.
- **Existing rows**: `scripts/repair-added-order.ts` (dry-run by default, `--apply`, per-user `user_preferences` marker) reverses each import batch onto its own stamps via the pure `planAddedOrderRepair`. Idempotent, **not** an undo — snapshot the DB first. Verified end-to-end on a copy of the local DB (108/117 rows reordered, re-run a no-op). **Not yet run on staging or prod — owner's call.**
- **Owner report 3** (playlist chips showing "3w / 5m / 4mo / 11m" — "looks like the social network's post time or the last played"): checked the live prod data behind that exact screenshot. The chips DO render `addedAt`, and the old values are real first-added-to-ADHX times, NOT post dates — e.g. KoroushAK/2059621877211881699 chip 2026-07-26 vs snowflake post date 2026-05-27; support_huihui/2039289919508746492 chip 2026-04-06 vs posted 2026-04-01. So round 8's semantic is in place; a post someone first linked months ago legitimately reads "4mo" when it re-surfaces in the pulse today. Open question for the owner: keep global-first-linked (min across ALL savers) or switch to something playlist-local.
- **Real bug found while checking it**: `getTheaterFeed`'s public-tag backfill (`src/lib/theater/feed.ts`) set `createdAt: row.createdAt || row.processedAt` — the X **publish date** — and no `addedAt` at all. Backfilled cards therefore showed NO time chip (`hasKnownTimestamp` reads `addedAt`) and their publish date drove `mergeFeedItems`' freshness comparison. Both are `row.processedAt` now (regression test in `api/theater-feed.test.ts`, fails on the old mapping). Two chips for the SAME post can still disagree by a minute or two (the owner's "9m" header vs "11m" card) — relative-time strings are computed at render and never tick; unfixed, would need a shared clock.
- **Live mode = the last 24 hours, unwatched first** (owner: "you can see and watch all of the newly previewed and saved posts in the last 24 hours… videos we haven't seen today should always be prioritized… if you refresh it would just start at the next video you hadn't played yet… to re-watch them all you'd click the re-watch button or hit repeat"). Three parts: (1) `getTrendingItems({ withinHours })` + `LIVE_WINDOW_HOURS = 24`, passed by `/api/activity` and `getTheaterFeed` — `/trending` deliberately keeps its unbounded window so a quiet day can't empty an SEO page, and the cache key carries the window or the two would share an entry. (2) `orderUnseenFirst` sorts the queue off `SeenSet.seenOnEntry` — a NEW arrival-time snapshot, because ordering off live seen state yanks the post you're watching to the back the moment its dwell timer fires. Index 0 is therefore "the next post you haven't watched", which is what makes a refresh resume with nothing persisted. (3) `computeLiveNext` stops an AUTO advance at the end of the unseen block (`unseenBlockLength`); user nav, repeat 'all', and the waiting stage's "Re-watch all N" (which sets `rewatching` for the session) are the three ways past it. Replaced the old "highest trendCount among unseen" lead pick + its `pinnedKey` hack.
- **Authed `/` is now the theater** (owner: "most people, when logged in, will want to keep the live view of the theater on, so that should be the default route"). Each side of the Live ⇄ My Collection switch is a real route — `/` = Live, `/collection` = My Collection (new `AuthedTheater` client component; `TheaterShell` gained `onPersonalTabChange` so the switch flips locally then navigates), and the grid + FilterBar + search moved to **`/library`** (owner picked this over keeping the grid on `/collection`). Header nav is now four plain links: Library · Theater · Tags · Leaderboard; the Collection entry goes to `/collection`; `openLive`/`openPersonal`'s `open-theater` + `?live=1`/`?collection=1` hand-offs are gone from the Header (the grid still listens for the events for its own in-page triage). **Gotcha found live**: `AuthedHome` hardcoded `'/'` as the "no query string" fallback in five `router.replace` URL syncs, so `/library` bounced straight back to `/` — they take `usePathname()` now.
- **Generated avatars** (owner: use github.com/HenryLok0/profile-icon-generator, persistent per user). That project is a p5.js/canvas static web app, MIT, NOT on npm — unusable under the no-new-runtime-dep / strict-CSP / inline-SVG rules, so the _concept_ was ported into `src/lib/avatar/generated-avatar.ts`: FNV-1a hash → mulberry32 PRNG → curated palette + three clipped circles → inline SVG data URI, zero dependencies, identical on server and client, and the raw seed is never interpolated into the markup (only numbers derived from it). Seeded off the stable handle/username, so an account keeps its icon forever; a known-output test locks the algorithm so a refactor can't silently rerender everyone. Wired into `AuthorAvatar` (feed/theater/Discover/RelatedSaves), `TheaterAvatarMenu`, the Header's two avatar slots, and the two server-rendered profile pages via a new `AvatarImage` client wrapper (a server component can't carry `onError`). A broken remote avatar now falls back too — several of those slots had no error handling at all. **Also**: X's own grey silhouette (`.../default_profile*.png`) is a real, successfully-loading image, so neither a null check nor `onError` caught it and those accounts kept showing an anonymous blob — `usableAvatarUrl()`/`isPlaceholderAvatarUrl()` treat it as absent (found on the owner's own profile during the live check).
- **Prod auth crash fixed** (Sentry WHITE-SUN-6317-17, `SqliteError: UNIQUE constraint failed: users.id` on `GET /api/auth/twitter/callback`, first seen 2026-08-22 08:47 on v1.55.0, signed-out iOS Safari). `unlinkX()` deletes the `user_identities` row but deliberately KEEPS the `users` row — whose `id` still equals the old X user id, per the X-first `userId == X id` convention. `findOrCreateUserForX()` only looked for conflicts in `user_identities`, so that same X account logging back in with no session found no identity, took the "brand new user" branch, and blind-inserted a `users` row with a colliding id. Fix: also check for an existing `users.id === xUserId` (different session → the documented `conflict: 'linked_elsewhere'` redirect, session untouched; no session → relink X to that account), and wrap every insert branch in a `SQLITE_CONSTRAINT_PRIMARYKEY`/`UNIQUE` catch that re-resolves (bounded 3 attempts) so a concurrent-callback race recovers instead of 500ing. The callback route needed no change — it already handled `conflict`, it just never received one for this gap. Settings already had the `x_already_linked` copy.
- **State**: PR #390, 2309 tests (185 files) green, typecheck/lint (0 errors)/prettier clean, CI green. Follow-ups: the sync route's stamp wiring has no route-level test (no sync harness exists) — covered only by the pure helper's tests; the queue shows no divider between the unwatched and watched blocks (the per-card ✓ and the re-watch count are the only clarity signals so far); `?live=1`/`?collection=1` deep links into `/library` still work but nothing links to them any more.

## 2026-08-22 — Mobile round 8: repeat modes, waiting-stage fixes, YT autoplay progress, chrome polish (10 owner items)

- **Spotify-style repeat** (`RepeatMode` in types.ts, owned by TheaterShell, sessionStorage `adhx-theater-repeat`): one button (dock transport + peek-bar left group, home/shared only) cycles off → all → one. 'all' reuses the collection-mode wrap (`computeLoopedNext/Prev` loop arg); 'one' rides the shared-pin machinery (`repeatCurrentActive` = pin OR 'one' → Stage `repeat`, progress-pin demotion, 'timed'-advance guard). `effectiveRepeatMode` neutralizes a session-carried value in collection/triage (no visible control there).
- **Waiting-stage fixes** (owner: finishing the one new vid dumped them back into the old playlist): a fresh arrival auto-played from waiting now RE-WAITS when it ends (`stagedFromWaitingKeyRef` + `shouldRewaitAfterArrival`, baseline accumulates staged keys so a second arrival mid-play still stages); user nav clears the hold. StageWaiting grew a "Start from the beginning" button (`onReplay`). The "went back muted" half is the documented iOS platform ceiling (fresh iframe, no gesture) — not a code change.
- **YT progress bar dead on plain autoplay (iOS)**: evidence = bar appears only after an in-iframe tap → iOS starves `infoDelivery` of `currentTime` until a gesture. Fix: parse `initialDelivery` like `infoDelivery`, and while playing+starved (>1.5s without a time payload) re-send the `listening` handshake every 750ms to pull an `initialDelivery` snapshot (the official API's own boot mechanism). Desktop's healthy stream never trips it. Needs owner on-device confirm.
- **Sticky "selected" buttons after tap**: tailwind `future.hoverOnlyWhenSupported` — all `hover:` variants now compile inside `@media (hover:hover) and (pointer:fine)`; touch never retains hover.
- **Chrome polish**: Save-post buttons → Bookmark glyph on glass with clay border (`PILL_SAVE`/`SAVE_OUTLINE`; solid clay-grad stays only on true conversion CTAs); text-like posts get a Copy-post-text pill in the Download slot; flame badge now same 32px pill geometry as the platform/time chip; author avatar+name links to their platform profile (`authorProfileUrl` in preview-path.ts); burger/avatar menu marks the current screen (clay dot + aria-current, "front page = Theater"); /leaderboard's signed-out header gained the burger (new `LeaderboardMenu` client wrapper = TheaterAvatarMenu + SignInModal).
- **Verification round caught 2 real issues** (live Chrome, mobile width): (1) `border-clay/70` silently compiles to NOTHING — Matter colors are hex CSS vars, so Tailwind v3 can't do `/NN` opacity modifiers on them; the Save border rendered as default hairline. Fixed to full `border-clay`. ⚠ Pre-existing `clay/NN` classes elsewhere (`border-clay/50` tag buttons, `hover:bg-clay/10` chevrons, `bg-clay/[0.07]` is fine — arbitrary values work) are likely equally dead — follow-up. (2) Shared pages said "On repeat" while the new button said "Repeat: off" — the pin now surfaces THROUGH the button (`displayRepeatMode`: pin ⇒ shows 'one'; tapping releases the pin to 'off'). Bonus quirk: the mobile repeat button painted ink-3 even carrying ONLY `text-clay` + an inline style (verified at the node; the hidden desktop twin rendered clay from the same class — cause never isolated). Fixed by `key`ing the button on the mode (fresh node per state, born in its final color, no transition-colors) + the inline `var(--m-accent)`; live-verified clay on two hard reloads.
- **Owner staging-test follow-ups (same branch)**: peek-bar "Up next" → queue position ("3 / 17", + "· k new"); Theater menu entry now marked current via explicit `theaterActive` from the chromes — pathname can't be trusted, the theater's URL-sync replaceStates to per-post paths and usePathname follows (that was why the dot never showed); collection theater (`/t/...`) now SHOWS the repeat button, opens on 'all' (looping is its resting state), cycles all ⇄ one only (`nextRepeatMode` wrapOnly — no 'off'/waiting in a collection), sessionStorage skipped there so the toggle never bleeds into the home theater's persisted preference; Save-collection CTA moved to the same clay-outline style (PRIMARY now = triage Done only); dock end cap stacked vertically ("Show all" over "N posts · k new", loops-divider hidden while repeat-one).
- **Waiting-stage arrival triple-bug (owner screenshot)**: (1) fresh arrival started MUTED — the waiting screen unmounted the whole Stage; iOS grants unmuted playback to the ELEMENT the user gestured on, so the arrival was a cold `<video>`. Stage now stays MOUNTED (paused via `theater-pause`) under an opaque waiting OVERLAY; the arrival's src-swap reuses the granted element. Space is guarded (`isPlaybackHidden` in useTheaterKeyboard) so it can't resume the hidden video. (2) arrival showed "2/21" — the session's lead-pick was still pinned first; arrivals now `setPinnedKey(arrived)`. (3) peek bar floated ~6px with list content peeking under it — the collapse transform reveals exactly 4.25rem but the peek content was shorter; wrapper pinned to `h-[4.25rem] overflow-hidden`.
- **Display time, FINAL (three owner iterations)**: chips show `addedAt` — when the post was FIRST added/linked to ADHX (min of earliest save `processedAt` / earliest activity event; stable MINs) — NEVER the source platform's publish date and never the moving pulse event time (`createdAt`, still load-bearing for ordering/freshness, no longer displayed). Shared preview pages backfill the lead's addedAt from the pulse copy (the page's own preview event establishes first-linked for brand-new posts). `tiktokCreatedAtFromId` (Snowflake id → post date, extracted to `src/lib/media/tiktok-id.ts`) survives as add-flow data enrichment + shared-seed ordering only. `hasKnownTimestamp` guards epoch sentinels ("56y" bug).
- **Verification-agent bonus catch**: mobile shared-page Save opened the SIGN-IN modal for signed-in viewers (the mobile chrome never had desktop's `(shared && authed) → SavePostButton` branch) — fixed, SavePostButton now shared by both chromes. Also dock end cap: "N new" stacked under "N posts" (owner: narrower).
- **State**: 2257 tests green (179 files; first-ever end-to-end TheaterShell mount test covers the waiting flow), typecheck/lint/format clean; live-verified incl. a simulated device-B arrival (visibility-override + DB insert since the sandbox tab is never focused). Owner device test still the true gate for iOS sound-carry. Follow-ups: owner re-test on device (YT progress on autoplay; whether non-YT items also lose sound after the waiting stage — if so capture `?avdebug=1`); audit pre-existing `clay/NN` opacity-modifier classes; signed-out checks for the menu current-dot on `/` + leaderboard burger ran only as component tests (env browser was signed in).

- **Why**: same branch as round 7's gesture-unmute fix. The owner's on-device `?ytdebug=1` screenshot (iOS Chrome) gave the FULL trace: `state playing(1) -> requestUnmute(catchup) -> unMute -> infoDelivery confirms unmute (muted:false) -> state paused(2)`, all within ~1s, then nothing (video sits paused with the tap-to-play overlay forever).
- **Decoded**: muted autoplay works fine. The automatic catch-up unmute (no gesture) genuinely gets APPLIED — the `muted:false` heartbeat is real — and iOS then enforces its no-gesture-audio policy by PAUSING the now-unmuted video moments later. Round 4/6 treated that `muted:false` confirmation as final proof and cleared `unmuteAwaitingConfirmRef` immediately, so the enforcement pause that followed had nothing armed to attribute it to and was read as an ordinary pause — `fallBackToMuted()` never ran. Explains the "almost always"/flaky reports: only sessions that reach a YouTube item already wanting sound (carried over from a prior unmuted item) hit the catch-up path at all.
- **Fix** (`StageYouTube.tsx`): new `unmuteConfirmSourceRef` distinguishes `user` (real gesture, iOS doesn't police it — round 4/6 semantics unchanged) from `catchup`. A catch-up unmute now needs SUSTAINED evidence: neither the `muted:false`/`volume>0` confirmation nor a bare state-1 heartbeat clears it (closed a second instance of the same premature-clear bug in `applyPlayerState`'s own state-1 branch) — only `infoDelivery`'s `currentTime` advancing >1.5s past the value at unmute-request time (`catchupUnmuteBaselineTimeRef`, defaults to 0 if no heartbeat arrived yet) does. Payload-derived, no wall-clock timer (standing rule). A pause inside that window now correctly falls back to muted + `playVideo`; the pulsing audio button + the round-7 synchronous `theater-set-muted` gesture path is how the user then unmutes for real.
- **State**: 2126 tests green (rewrote 1 outdated test whose premise the device trace overturned, added 3 new: device-trace repro w/ effectiveMuted assertion, sustained-progress-clears-attribution, stray-state-1-does-not-clear). typecheck/lint/prettier clean. Composes with round 7's synchronous-unmute fix in the same PR/branch (`fix/gesture-unmute`).

## 2026-08-21 — Mobile round 7: gesture-context unmute fix (Twitter/TikTok, not YouTube) + widened debug overlay

- **Root cause found in code, exactly as hypothesized**: the chrome's audio button (`TheaterMobileChrome`/`DesktopDock`) called only `onToggleMute()` — a React state flip (`setMuted(m => !m)`) that reaches `StageVideo`'s `[muted]` **passive effect** one render later, in a separate browser task, OUTSIDE the tap's call stack. WebKit gates un-muting a _playing_ `<video>` on the mutation happening synchronously inside a user-gesture handler; pause/play already worked because they go through synchronous `theater-toggle-play`/`theater-pause`/`theater-resume` window events dispatched straight from the click handler. Mute was the only stage control still on the async path. `onToggleMute` also blindly flipped shell state rather than the DISPLAYED (`displayMuted`) value, so a divergence between the two could send the toggle the wrong direction.
- **Fix**: new synchronous `theater-set-muted` window event. The audio button now computes `next = !displayMuted` and, in the SAME click handler, (1) `window.dispatchEvent`s it and (2) calls a new explicit `onSetMuted(next)` (replaced the blind-toggle `onToggleMute`) for shell persistence. `StageVideo` and `StageYouTube` both added synchronous listeners (`StageYouTube`'s routes through the existing `requestUnmute`/`mute` command gate via a new shared `applyMuted` helper) — the `[muted]` prop-reconcile effect stays as an idempotent late-mount fallback. Live-browser verified on Chrome desktop: `video.muted` flips before `dispatchEvent` returns, no re-render wait.
- **Debug overlay widened**: `YtDebugOverlay.tsx`'s gate now accepts `?avdebug=1` too (keeps `?ytdebug=1`); new `logSV`/`logAV` write into the SAME ring buffer prefixed `[sv]`/`[av]` (YouTube's stayed `[yt]`, renamed from `[stage-yt]`). The overlay is mounted ONCE at `TheaterShell` level (removed from StageYouTube's 3 branches) so it now shows every stage's breadcrumbs, not just YouTube's.
- **State**: 2124 tests green (171 files, +16 new), typecheck/lint/prettier clean. Live-browser confirmed the full `[av] audio tap -> [sv] theater-set-muted applied synchronously -> [sv] [muted] prop reconcile` sequence in this env's Chrome; the actual WebKit gesture-gate behavior still needs the owner's iOS retest (this env can't reproduce WebKit's policy).

## 2026-08-21 — Mobile round 6: bisected round-5 YouTube regressions (fixed 1 of 3, ruled out code cause for 2)

- **Why**: owner's iPhone reported 3 YT regressions vs. round 4 (#383): (a) no auto-start, (b) no progress bar after manual play, (c) audio icon needs two presses to unmute. Diffed #383→#385 line-by-line across every touched file (StageVideo/StageYouTube/TheaterMobileChrome/TheaterProgressLine/TheaterShell/CollectionStage) before writing any fix, per the standing no-speculative-timers rule.
- **(c) FIXED, culprit found**: `StageYouTube.tsx`'s `infoDelivery` handler called `setEffectiveMuted(info.muted)` unconditionally on every heartbeat (pre-existing since round 2, unchanged by round 5) — a heartbeat reflecting the state from _before_ our most recent `mute`/`unMute` command routinely arrives right after we send it, flipping the dock/peek-bar audio icon back for one render and reading as the tap having failed. New `lastCommandedMutedRef` gates it: only trust a heartbeat's `muted` field when it agrees with what we last commanded; a contradicting one is logged (`?ytdebug=1`) and ignored — real rejection is still only ever an OBSERVED pause (unchanged). 5 new tests, 2 proven to fail against the pre-fix code (git-stash verified).
- **(a)/(b) NOT reproduced in code**: exhaustively reviewed every production line changed in #385 (the complete file list) — none touch the startup handshake, retry ladder, stall watchdog, or mute-prop reconciliation for the general live/home queue; `Stage.tsx`/`usePlaybackSource.ts` are untouched; `progressKindFor`/`collectionTabProgressKind` produce identical results for a video item in every mode (home, live, collection tab) both before and after round 5. Could not construct a mechanism or failing test proving a specific line breaks autostart or the progress bar. Best-supported theory: pre-existing iOS cross-origin-iframe autoplay fragility (documented across rounds 2–4) newly exercised via round 5's non-gesture Collection-tab auto-advance — unproven, device-only.
- **On-screen `?ytdebug=1` overlay** (owner: reading iOS Safari's console needs a Mac tether — too much friction to reach for on every retest): new `YtDebugOverlay.tsx` mirrors the console breadcrumbs into a tiny fixed panel (bottom-left, above the mobile peek bar, monospace, last 8 lines, second-precision timestamps, immediate repeats collapse into one line with a count) so a phone screenshot is enough. `logStage` now writes to both console and the on-screen ring buffer; a new `logStageVerbose` stays console-only for the high-volume per-message entry log (`infoDelivery` heartbeats), so the 8-line window isn't consumed by noise — curated moments (onLoad nudge, onReady, each retry rung, every playerState transition, mute confirmations/rejections incl. the round-6 stale-echo guard, stall/error branches) still land on-screen. Renders `null` with zero footprint unless `?ytdebug=1` is present.
- **Follow-up for the owner**: re-test on staging after this fix — if (a)/(b) still reproduce, screenshot the on-screen overlay (or capture full `?ytdebug=1` console output) and hand it to the next round; this env's Chrome cannot play YouTube embeds to verify directly.
- **State**: 2108 tests green (171 files), typecheck/lint/prettier clean on touched files.

## 2026-08-21 — Mobile round 5: collection playlist, IG catch-up unmute, YT progress bar, deleted-tweet tombstone

- **My Collection = real playlist** (owner decision, reverses "triage never auto-advances"): collection-tab VIDEOS get the clay progress line (`collectionTabProgressKind` — 'timed' still demoted, photos/text still wait for actions) and auto-advance on ended via new `personalAdvanceOnEnded` (pure `setPersonalIndex` — deliberately NOT deferCurrent, which records streaks + pops a false "Later" undo toast). End-of-queue lands on CollectionAllClear for free.
- **IG catch-up unmute** (owner: IG stayed muted while X had sound): every IG item is a FRESH StageVideo mount (X/TikTok reuse one instance) → initial unmuted play rejected → fell back muted forever. Now: one evidence-gated catch-up on confirmed `playing` (unmute if shell wants sound; observed non-ended pause reverts; deliberate pauses clear the pending flag). No timers.
- **YT progress bar**: StageYouTube dispatches the same `theater-video-progress` event StageVideo does, from infoDelivery currentTime/duration; progress:1 on ended (bar snaps full before loop/advance); receiver already clamps + handles backward jumps.
- **Deleted-tweet tombstone** (owner: legacy purple "Connect with X to save" dead-end): unresolvable tweets now render the shared theater with a never-pinned `StageUnavailable` lead ("This post is no longer available on X", @author, zero CTAs) that auto-advances via the existing 10s timed dwell + clay countdown; `robots noindex`, title "Post unavailable - ADHX". `QuickAddLanding` DELETED. Reels/tiktok/shorts verified unaffected (they never had the legacy branch).
- **Verified before deploy** (the gate): 2097 tests green (170 files) + live-browser pass on all four (tombstone renders+advances, collection video flows toast-free, IG unmutes after playing, progress event contract incl. backward jumps). Timing caveat from automation (backgrounded-tab timers) checked against code: dwell is exactly 10_000ms.

## 2026-08-21 — Mobile round 4: unmute trust, desktop Repeat tag, theater nav menu

- **Unmute kept reverting (owner, BOTH platforms)**: the 1.5s post-unmute settle timer treated signal-silence as rejection — but successful unmutes produce no state event, so it re-muted working sound everywhere. Timer REMOVED entirely for both user and catch-up unmutes: only an OBSERVED pause (state 2) reverts; infoDelivery muted:false/volume>0 clears pending so later unrelated pauses can't be misattributed. The never-starts case stays covered by the round-1 confirmed-playing gate + 8s watchdog. Lesson logged: three self-inflicted bugs from speculative timeouts — evidence-based signals only.
- **Desktop filmstrip repeat cue** (owner: "MOWN"): pinned current card's tag is now ONE cohesive Repeat-glyph+"Repeat" tag replacing NOW (mutually exclusive by ternary); redundant end-cap "On repeat" chip removed (facts shown once).
- **Theater avatar menu nav gap** (owner): signed-in menu was Collection/Settings/Sign-out only — now matches the Header: Your collection · Theater (close-if-home) · Tags · Leaderboard · Settings · Sign out; markup deduped with the signed-out burger (shared MenuLink/TheaterMenuEntry).
- **Expected-behavior note**: each new YouTube item starts silent then self-unmutes once playing confirms (fresh cross-origin iframe = no gesture history) — by design, not a bug.
- **Process note**: mid-edit verification race caused a false "corrupted file" alarm — when an agent is actively editing, verify only after its report lands.
- **State**: 2064 tests green (168 files), typecheck/format clean.

## 2026-08-21 — Mobile round 3: verified-before-deploy (new gate) — paste ritual, repeat cue, autoplay round 2

- **New process gate (owner mandate after regressions reached their phone)**: mobile UI changes are now verified in LIVE Chrome at 390px against local dev BEFORE deploying — memory `feedback-mobile-ui-verification`. The gate immediately caught a real bug (flick override defeating the sheet's drag hysteresis) pre-deploy.
- **Paste round 3 (iOS input ritual)**: iOS never calls readText (each read = a disconnected system callout — round 2's retry button made TWO). Tap → overlay with the input deliberately autofocused → iOS's one familiar Paste callout on the field → paste event navigates synchronously. Retry button now non-iOS only; input `text-base sm:` for the 16px zoom rule.
- **Repeat cue**: peek bar swaps "Up next"→Repeat glyph "On repeat" + clay next chevron while pinned; desktop dock chip + accent; "repeat" tag on the current queue row. Play/pause transport now starts a needsGesture video (the guard no-op'd it; one shared start path). Instagram mobile autoplay: `<video>` muted declaratively at first commit (was imperative-only post-mount — fresh async IG mounts started unmuted → iOS blocked).
- **Sheet**: drag starts from the REAL computed transform (not height estimates), window-level pointerup backstop (lost capture froze the sheet off-position — the owner's collapse regression), classes own rest; flicks need velocity AND ≥24px travel (10px accidental moves snap back).
- **YouTube round 2**: startup never trusts URL params — explicit mute→playVideo at load/ready + 1s/2.5s/5s retry ladder while unstarted; pinned+never-started shows tap-to-play (in-gesture iframe remount) instead of a blank stage; live queue keeps the 8s skip. `?ytdebug=1` logs `[stage-yt]` state breadcrumbs. Double-advance report investigated: stall-timer leak RULED OUT by regression tests on both reconciliation paths; hardening added; if it recurs, capture ytdebug output.
- **State**: 2052 tests green (168 files), typecheck/format clean, 9-point live-browser pass (1 fail → fixed → re-covered by tests). Device-only items for the owner: iOS paste callout feel, YT autoplay, IG autoplay.

## 2026-08-21 — Mobile theater round 2: shared repeat, sheet drag, logo home, paste rework, autoplay continuity

- **Why**: owner's live phone testing of staging surfaced 5 issues in quick succession; fixed by 4 parallel agents on one tree (disjoint-file fences held after one earlier branch-collision lesson).
- **Shared posts repeat until deliberate nav**: `sharedPinned` in TheaterShell (cleared only by user-intent goNext/goPrev/onSelect wrappers, never by auto-advance); videos loop natively (`repeat` prop → `<video loop>`), YouTube seekTo(0)-replays on ended, timed items' 10s advance suppressed via `progressKindForPin` (both viewports). A 5s pasted meme no longer escapes before Save/Tag/Copy.
- **Up-next sheet drags for real**: new `useSheetDrag` (pointer events on the handle only; 8px tap threshold, 28% travel hysteresis, 0.5px/ms flick override, ghost-click swallow, touch-action none). Tap still toggles.
- **Brand logo is ALWAYS home**: collection-mode non-owner logo was the Make-your-own trigger (couldn't leave a shared tag!) — now a plain `/` link; conversion carried by the Save-collection CTA (verified intact).
- **Paste UX reworked** (owner hit iOS "Paste|Speak" + a stuck panel): root cause = autoFocus on the fallback input. Now: in-gesture readText → instant navigate on supported link; otherwise a dismissible (outside-tap/Esc/X) helper overlay w/ platform glyphs + Paste retry + non-autofocused manual input; errors only after a real attempt.
- **Playlist never dead-ends on iOS**: StageYouTube unmutes ONLY after confirmed playing (state 1), falls back to muted+playVideo (1.5s settle timer) if iOS rejects — the unmuted-from-TikTok → YouTube-stall → watchdog-skip chain is gone. StageInstagram advances 8s after landing in the terminal IG-embed fallback and has a 20s never-started ceiling (probe budget is ~70s); both guards no-op when pinned/repeat or no onEnded.
- **State**: 2006 tests green (167 files), typecheck/format/build clean. On-device iOS verification of the autoplay chain still needed (env can't play YT embeds).

## 2026-08-21 — Starter collections onboarding + YouTube stage native-controls fix

- **Starter collections** (owner-picked activation feature pre-promo): new `StarterCollections` component — top-3 all-time public collections from `/api/collections/trending`, self-excluded, rendered as canonical `CollectionPosterCard`s with one-tap clone (existing clone endpoint) → "Added · N posts". Collapses to nothing on empty/error/all-own. Mounted: `/welcome` step 2 after username claim (modal widens 420→720px) + `EmptyAccountOnboarding` compact block. Feed refresh reuses the `tweet-added` event → useSyncListener.
- **YouTube stage** (owner mobile screenshot): `buildEmbedSrc` never set `controls=0` — native seek/CC/settings chrome fought the theater UI (persistent on touch). Now controls=0, disablekb=1, fs=0, iv_load_policy=3; postMessage transport unaffected. YT's title card on load/pause is embed-baked, stays per ToS. (PR #379)
- **State**: 1954 tests green (164 files), typecheck/build clean. Next: owner eyeball of welcome step-2 + empty-state placement on staging.

## 2026-08-21 — Mobile save: paste-link button + signed-out burger menu

- **Why**: owner wants iOS users WITHOUT the shortcut to save fast (share sheet "Copy Link" is universal) and signed-out mobile visitors to have nav (avatar slot was empty).
- **Paste link**: new `PasteLinkButton` (clipboard read on tap → resolve → preview; input fallback when clipboard denied/unavailable; ~3s self-clearing error). Mounted: AuthedHome mobile strip (sm:hidden), empty-account onboarding card (mobile variant via `actionSlot`), theater mobile top scrim iconOnly (home+shared modes). Navigation goes through new shared `navigateToPastedLink()` in parse-share-url.ts — the CodeQL-hardened shape (router.push + constant-prefix/encodeURIComponent tiktok-resolve rebuild), deduplicated out of LandingPage/PreviewAnotherLink.
- **Burger menu**: `TheaterAvatarMenu` gained `allowSignedOut` + `onRequestSignIn` — signed-out home/shared theaters (mobile AND desktop, same slot) show a burger: Theater (/ — close-only when already there), Leaderboard, Sign in (opens the shell's SignInModal). Triage/collection mounts unchanged (default false). NO Trending entry (deprecated as user nav per owner).
- **State**: 1946 tests green (+20), build clean. Owner to eyeball on staging: AuthedHome button strip placement + theater iconOnly fallback panel position.

## 2026-08-21 — Staging v1.52.0 test round: 3 fixes (undo toast, collection audio, deleted tweets)

- **Why**: 4-agent Chrome/curl sweep of staging post-#375 + live owner mobile testing. SEO checks 10/10 pass; theater/preview/authed surfaces pass. Owner found 2 bugs; Sentry surfaced a 3rd.
- **Undo toast persisted after Done/Later** (owner): only delete's commit timer expired the toast — archive/keep had NO expiry. Now a separate 5s dismiss timer (`shouldDismissUndo` identity guard, unit-tested), toast moved bottom-24→bottom-36 (was overlapping the mobile action row), `toast-in` entrance animation keyed per action.
- **No audio/pause in My Collection tab, mobile** (owner): `kind` forced 'none' in collection tab (meant for the progress line) also gated the peek-bar controls. Split: `progressKind` (line only) vs `mediaKind` (audio/pause/soundPulse). Desktop dock verified unaffected.
- **Deleted/private tweets** (Sentry WHITE-SUN-6317-16): fxtwitter returns 401 for deleted tweets (verified: HazBrown1/2090044905120751760 → 401, healthy → 200) → we 500'd + Sentry-spammed + client retry-looped. Now: fxtwitter 401/404 → **410 Gone** `{reason}` + 10-min in-memory negative cache in video/info/download routes, `mediaUnavailable` metric (no captureException), StageVideo/VideoPlayer show "no longer available on X" (poster kept, no retry) via Range-probe on element error.
- **Test-round false alarms, documented**: `/api/activity/preview` 503s = deploy rollout window; authed Live tab "never polls" = pre-existing `document.hidden` pause (test agents share one Chrome, tab was backgrounded — real foreground use fine; note: no visibilitychange listener, first poll after refocus waits ≤12s); YouTube stall auto-advance = deliberate 8s watchdog (#361).
- **State**: 1926 tests green, typecheck/format clean. Fix PR merged same day; staging redeployed.

## 2026-08-21 — v2.0 pre-launch audit: security, code quality, DX/Docker, SEO (8-agent parallel sweep)

- **Security**: ALL 22 open CodeQL alerts fixed — 4 critical request-forgery (fetch URLs now rebuilt from validated parsed components via new `buildAllowlistedUrl()` in `lib/media/proxy.ts`), 11 substring-sanitization (new `isHostOrSubdomainOf()` in `lib/utils/url-host.ts`), 4 DOM-XSS (LandingPage/PreviewAnotherLink now delegate to `parseShareUrl` + `isSafeInternalPath` guard), 3 double-escaping (shared single-pass `decodeHtmlEntities()` in `lib/utils/html-entities.ts`). PLUS an unflagged SSRF gap: tiktok/thumbnail fetched a scraped CDN URL with no allowlist — now validated + only validated URLs cached.
- **Dead code deleted**: 4 `*PreviewLanding` components, `DiscoverFeed` (`ActivityItem` → `discover/types.ts`), `ReelPlayer`, collections Chip/Modal/Picker + barrel, `src/hooks/useSyncFlow`, `dayjs` dep; sync-loop console.log + 6 stale `as any` removed from `twitter/client.ts` (lib types caught up).
- **Modularity**: shared `fetchWithTimeout()` (25 call sites); `feed/utils.tsx` → device/media-actions/text-rendering + facade; AuthedHome → `useSyncListener`/`usePersonalQueue`; TheaterShell (1483→1335) → `useTheaterKeyboard`/`useTheaterPrefetch`/`useTheaterDwell` + `stage-primitives.tsx` (StageIconButton/Headline/CTA/Frame); `saveBookmark`→`lib/sync/save-bookmark.ts`, `buildFeedItem`→`lib/feed/build-item.ts`; Sentry-visible `handleRouteError` in preferences/collections/sync-logs/auth-status routes.
- **DX**: Dockerfile `DATABASE_PATH=/data/adhx.db` default (bare `docker run` crash-looped EACCES — fixed + live-verified, boots with ZERO X keys); `.nvmrc` 20→24 (was contradicting engines/CI/Dockerfile); `.dockerignore` now excludes `.claude` (11GB!) etc.; new `docker-compose.yml`.
- **SEO**: `/t/{user}` curator profiles added to sitemap; `RESERVED_TOP_LEVEL_SEGMENTS` guard stops `@trending`-style handles shadowing real routes; `PUBLIC_BASE_URL` constant (4 preview pages had `localhost:3000` fallbacks in canonicals/OG); fabricated `aggregateRating` removed from JSON-LD (manual-action risk); `/dev/*` gated out of prod + robots; noindex on /tags //welcome //share; `WebSite` JSON-LD added; llms.txt lens drift fixed; `/trending/latest` → 308.
- **Tests**: ~90 new (token-encryption round-trip/tamper, email validator, users-lookup fallback regression, with-auth/response, useSendFile dedupe proof, SSRF/URL-helper malicious cases). Also fixed a broken `next/image` test mock that had never been exercised.
- **State**: 1904 tests green (162 files), typecheck clean, build clean, lint 0 errors (warnings 45→38). Follow-ups: `docker compose up` needs a live re-verify (Docker Desktop VM crashed locally mid-test — config verified statically, mirrors the proven `docker run`); deferred: `noUncheckedIndexedAccess`, barrel normalization, SettingsClient/MediaCard splits, BreadcrumbList schema.

## 2026-08-21 — README overhaul + review round 5 (toolbar toggle, blur seam, stage speaker)

- **README rewritten** (~375→~140 lines): reframed for what ADHX is now (4-platform save → preview mirror → ONE theater → tagged collections → curator profiles → /leaderboard), keys-optional local dev FIRST (magic link logs to console — no X app needed to try it), condensed Docker/Fly, public API table, agent-skill install kept short. Fixed a real doc bug: local OAuth callback + NEXT_PUBLIC_APP_URL said :3000 but `pnpm dev` runs :3001 (README + .env.example corrected). Cut: versus-competitors section, star history, project-structure dump (ARCHITECTURE.md covers it), most gag lines.
- **FilterBar selected-tag toolbar de-dup** (owner): PUBLIC chip + always-"Make public" clay button → ONE state-aware toggle (green dot + Globe "Public" ↔ Lock "Private", styled like the sibling Add-posts button) + a copy-link icon button when public (make-public still auto-copies the share URL).
- **Theater blur seam** (owner): glass action pills' backdrop-blur sampled the Save button's glow → vertical seam on Open. Blur dropped from the 10 glow-adjacent pills (both chromes), bg bumped to white/[0.14].
- **Stage speaker hint removed** (owner): StageVideo's faint bottom-left Volume2 indicator duplicated the dock/peek-bar audio button.
- **State**: 1865 tests green. All shipped with the README PR.

## 2026-08-21 — Review round 4: ONE theater player, glow radius, standardized toggle

- **Legacy player OUT of the theater** (owner: "My Collection is just a different playlist in that same theater"): CollectionStage's twitter-video branch now uses the SAME StageVideo as live/tag theaters (merged with the tiktok branch) — the round-2 VideoPlayer bolt-on (controlled muted/onUserUnmute props, transport-event wrapper) is fully REVERTED from VideoPlayer.tsx (which stays the feed/lightbox/preview player only). Fixes native controls leaking into fullscreen + the mute-icon desync. Accepted trade-off (commented in CollectionStage): >5min twitter videos stream plain MP4 proxy, identical to the live theater's existing behavior for the same post — the HLS path only ever existed in the legacy player.
- **#1 podium glow**: the shadow-glow wrapper div lacked border-radius → square glow corners past the 14px card. Wrapper now rounded-[14px].
- **/tags visibility toggle standardized**: both states use the cards' glass-button recipe (bg-white/10 border-white/14, same size as copy/open); state = Globe/Lock icon + green live-dot when Public — no more one-off green pill.
- **State**: 1865 tests green. Follow-up consideration: if long-video MP4 stalls surface in My Collection, teach StageVideo HLS rather than resurrecting VideoPlayer there.

## 2026-08-21 — Review rounds 2–3: /leaderboard, theater controls, card de-dup, make-your-own journey (PRs #369 + this)

- **#369 (merged)**: theater My-Collection tab Twitter videos obey shared mute/pause (controlled `muted` on VideoPlayer + transport events, event-time element resolution — HLS untouched); tabs = Live · My Collection (Live default); leaderboard page moved /collections→**/leaderboard** (all old URLs 308; /api/collections/* machine endpoints unchanged); Header renders nothing on leaderboard routes until auth resolves (kills signed-out flash).
- **This PR — /tags card de-dup**: ONE top-right visibility toggle pill (Globe "Public"/Lock "Private", click toggles) replaces PUBLIC badge + Make-private link + footer Private badge + the overlapping clay Make-public pill; rank = top-left medallion (footer flame chip gone — rank shows once everywhere); `privateStatsNote` prop deleted.
- **Podium card**: curator = top-right User-icon badge on the card (below-card text row deleted); featured spacing pulled into family (p-5, 26/32px title).
- **Make-your-own journey**: CTA opens SignInModal IN PLACE (title "Make your own collection", returnTo /) — theater chromes use the shell's single modal w/ intent variant; profile uses new MakeYourOwnButton. Profile CTAs auth-aware: signed-out=modal, owner="Manage collections"→/tags, other-authed=nothing. `?start=1`/StartOverlay DELETED (no producers left; also fixed latent bug: mobile brand logo sent owners to /?start=1).
- **De-clutter icons un-inverted** (Maximize2=enter, Minimize2=exit); desktop close-X moved into the tab-selector pill cluster (far right = avatar + de-clutter only).
- **Flake note**: Header.component.test "avatar menu open-theater" failed once in a full run, passes alone + on re-run — same isolation-flake family as #356.

## 2026-08-21 — Discovery polish round: card unification, nav rework, grammar fixes (live owner review)

- **Why**: Owner reviewed staging — cards inconsistent across /tags, /t/{u}, /collections; tag title shifted with stat-line presence; wordy overlays losing legibility; double header on authed /collections; nav confusion; triage drifted from "mark read"; /tags search dead; alias redirect missed their own rename.
- **Cards**: ONE CollectionPosterCard everywhere (leaderboard's bespoke CollectionCard DELETED). Adaptive mosaic (1=full, 2=columns, 3=2+span-bottom, 4+=2×2+overflow), fixed footer geometry (#tag NEVER moves — badge row always rendered), icon badges w/ bg-black/45 backing instead of words, text-shadow on all overlay text, rank medallions (clay top-3/glass), default height 240px. `subtitle` prop removed.
- **Nav**: Collection · **Theater** (renamed Live — the theater holds both tabs) · Tags · **Leaderboard** (→/collections). Authed /collections renders NO internal header ("Trending posts →" link removed everywhere). Triage REVERSED #342: always seeds the full unread queue, filters ignored (grid-tap on a read item prepends it). Header search on /tags now searches tags via `tags-search` event (+ guard: the URL-push debounce would've navigated off /tags per keystroke).
- **Grammar** (owner-specified): tags = `[a-z0-9-]`≤15 (underscore now kebabs), usernames = `[a-z0-9_]`≤15 (hyphen dropped; old names still resolve — grammar gates new claims only). Tag inputs kebab spaces LIVE while typing (`kebabTagInput`, keeps trailing hyphen mid-word).
- **Alias bug**: owner's pigeontechgovai→peteypie rename didn't redirect — first free claim skipped alias creation by design; wrong for names already public. NOW every rename aliases the old name. Staging needs a one-off backfill row for pigeontechgovai (fix isn't retroactive).
- **Also**: theater curator "@name" links to /t/{name} (desktop; mobile never shows curator).
- **State**: 1855 tests green, build clean. Follow-ups: featured-card badge sizes don't scale (visual check), rank medallion + footer rank chip are separate props (deliberate).

- **Why**: User greenlit the spec + design canvas (direction A "Podium" selected) — built by 4 parallel sonnet agents on disjoint files, 2 waves (recorder+rank, then leaderboard-page+curator-surfaces).
- **Write path**: `collection_events` (guarded CREATE in migrate.ts + test DDL); `recordCollectionEvent()` in `src/lib/discovery/record.ts` — self-view no-op, public-only, 30min signed-in / 60s anon dedupe, errors swallowed. Hooked: `/t/{u}/{tag}` page (bot-filtered, whole hook try/caught — headers() throws in direct-render tests) + clone route. Admin `/api/admin/collections/hide`.
- **Read path**: `src/lib/discovery/rank.ts` — the anonymity choke point (viewerId never selected), score = views + 5×clones, ROLLING windows (24h/7d/30d/all), RankMode plumbing (`top` live, hot/rising throw, `new` = recency), 60s cache keyed per-db (tests get fresh cache free), `getOwnerCollectionStats()`.
- **Surfaces**: `/collections` (+ `/collections/{today|month|all-time}`, week=bare path, `/collections/week` 308s) — podium top-3 + Ranks 4–N grid, sr-only list + CollectionPage JSON-LD, sitemap'd; `/api/collections/trending`; `/tags` This-week chip + rank chips + "Private · no public stats" + leaderboard promo band; profile `/t/{u}` stat strip + per-card stats.
- **Privacy catch**: profile stats sum ONLY currently-public tags — `getOwnerCollectionStats().totals` includes since-privated history (fine for the owner dashboard, leaky on a public page); regression-tested in users-profile-query.test.ts.
- **State**: 1825 tests green, build clean, e2e-verified locally (view→event→board, bot/private filtered). Spec branch merged in. Follow-ups: signed-in visitors to /trending & /collections see app Header stacked over the page's own dark header (pre-existing /trending behavior); "see full top 24" continuation dropped (grid just shows all 24).

## 2026-08-21 — Spec: Discovery — collection view stats + leaderboards (docs only)

- **Why**: User wants a Discovery feature — view tracking on public tagged collections, day/week/month/all-time leaderboards (gamification for curators, browse-first entry for new users), with plumbing reserved for future Reddit-style theater sorts (hot/rising/new).
- **What**: `docs/specs/discovery-leaderboards.md`. Key decisions: new append-only `collection_events` table keyed `(ownerUserId, tag)` (NOT bolted onto `activity` — keeps the anonymity choke point untouched); events = `view` (/t page, bot-filtered, self-views excluded, public-only) + `clone` (weight ×5); single ranking choke point `src/lib/discovery/rank.ts` with mode-aware signature (`top` implemented, hot/rising/new defined but deferred); surfaces = `/collections/{window}` leaderboard page + `/api/collections/trending` + /tags stat line; `hidden` moderation lever mirrors activity.
- **Verified en route**: collection theater, /t page, and clone endpoint currently record ZERO events (collection views are invisible today).
- **State**: spec only, nothing built. Follow-up: user to review spec, then build MVP per §10 cut-line.

## 2026-08-21 — Review round: usernames w/ redirects, Save-primary, YouTube fixed, profile + journey (PRs #356–#362)

- **Why**: Live owner review after the launch-blocker round: admin list needed real usernames, Download outweighed Save (conversion CTA), YouTube stalled the theater, /t profile looked bare, "Make your own" was a dead-end journey.
- **#359 usernames**: first claim free, then up to 2 changes; every change records `username_aliases` → `/t/{old}` 308-redirects forever (no dead links); Settings gains the chooser (shared `UsernameChooser`, /welcome refactored onto it). `ADMIN_USERNAMES=pete,tim,dan,jon` live on staging, staged on prod.
- **#360**: Save is ALWAYS the primary clay pill in theater action rows; Download demoted to glass. Image posts now downloadable/sharable too (`/api/media/image?download=1`, useSendFile kind: video|photo).
- **#361 YouTube**: StageYouTube drives the raw iframe postMessage protocol (CSP-safe, no API script): muted autoplay, ended→advance via existing onEnded, onError/8s-stall auto-skip, dock transport+audio wired. Shorts no longer stall the theater.
- **#357**: /t/{username} redesign — single collection = large centered showcase, many = centered wrap grid, whole card clickable (profile variant only; /tags keeps nested actions).
- **#362 journey**: "Make your own"/"Start your collection" → `/?start=1` → StartOverlay (signed-out only) teaching Save-to-create-account + paste-a-link (inline input via resolvePastedLink); strips param via replaceState.
- **#356/#358**: clone-append semantics pinned by regression test (already correct via onConflictDoNothing); component-test flake fixed (setup-components now awaits jest-dom/RTL imports — was racing first test).
- **State**: all merged + deploying to staging for live verification. Production untouched.
- **Follow-ups**: Tim must rename memelord→tim (spends 1 of 2 changes) for the admin list to cover him; dan/jon need accounts.

## 2026-08-21 — Sentry crash fix + five launch blockers (PRs #348–#353)

- **Why**: Staging was crashing fatally (3 Sentry RangeError issues = one bug), and a launch-readiness audit (2026-08-20) surfaced five embarrass-at-launch gaps.
- **#348**: `@sentry/node` added to `serverExternalPackages` — Turbopack was bundling TWO SDK copies (ssr + server chunk graphs) whose `http.Server.emit` Proxy wraps recursed into each other until stack overflow, killing the process. Rule: any global-patching dep must be in serverExternalPackages. Deployed + verified on staging (0 chunks contain the SDK, no new events).
- **#349**: DELETE /api/account now deletes `users`, `user_identities`, login tokens (by userId AND email), `tag_shares`, and clears the session cookie — previously the account rows survived "deletion".
- **#350**: `/api/trending` + `/api/share/tweet/*` rate-limited (120/min/IP, Retry-After) — were the only public endpoints without a limiter.
- **#351**: 404/error pages rebuilt on Matter tokens; dead `/search` link removed.
- **#352**: empty-account onboarding panel (Connect X / Sync / paste-a-link / trending) — email-only signups previously hit a dead-end "no unread bookmarks". Detects via existing `stats.total`.
- **#353**: `activity.hidden` moderation flag filtered in `getTrendingItems()` + 4 direct readers (sitemap, author hubs, RelatedSaves, archive); `POST /api/admin/activity/hide` gated by `ADMIN_USERNAMES` env (unset = 403). **Set `ADMIN_USERNAMES` on Fly (staging+prod).**
- **State**: all merged to main, deployed to staging, e2e-verified. Production still pending the user's call.
- **Follow-ups**: launch analysis (2026-08-20 session) ranked next: export (CSV/JSON), digest email via Resend, deleted-post-preservation marketing, self-host Docker path.

## 2026-08-20 — Fix fatal Sentry double-bundle stack overflow crash

- **Why**: Staging was crashing with `RangeError: Maximum call stack size exceeded` (Sentry issues 7683515836, 7681948228, 7680748280). Root cause: `next.config.js` only externalized `better-sqlite3`, so Turbopack bundled a full copy of `@sentry/node` into both the server and SSR chunk graphs. Two independent SDK instances each Proxy-wrapped `http.Server.emit` (httpServerIntegration) and recursed into each other until the stack overflowed — a process-killing uncaughtException.
- **What**: Added `'@sentry/node'` to `serverExternalPackages` in `next.config.js` (alongside `better-sqlite3`), forcing Node to load the single `node_modules` copy at runtime instead of bundling it twice.
- **Verified**: `grep -rl "Handling incoming request" .next/server/chunks` (Sentry's http-instrumentation marker string) went from present-in-multiple-chunks to `0` hits post-fix. Output tracing packages `@sentry/node` into `.next/standalone` with the same hashed-symlink pattern as the already-working `better-sqlite3`. `pnpm typecheck` and `pnpm test` (1643 tests) pass.
- **Follow-ups**: none — minimal one-line config fix, no behavior change.

## 2026-08-20 — Poster cards, curator profiles, owner view (design round shipped)

- **Why**: User picked Option C (poster) from the Tags Card Redesign canvas and approved the Curator Profile canvas; live review also caught clone-your-own-collection CTAs and a cramped mobile tag scrim.
- **What**: `/tags` cards are Option C posters via the reusable `CollectionPosterCard` (`src/components/tags/PosterCard.tsx`: mosaic-as-card, serif #tag overlay, PUBLIC/Private badges, clay "Make public" pill, glass copy/open actions; "Share as theater" → **"Make public"** everywhere incl. FilterBar). NEW public curator profile at `/t/{username}` (`src/lib/users/profile.ts` + page): monogram/serif handle, public-only stats, poster grid → looping theaters, ProfilePage JSON-LD; 404 for unknown users OR zero public collections (no thin pages / existence leaks). **Owner view**: viewing your own collection theater swaps Make-your-own + Save-collection for "Manage collection" (both chromes). Mobile tag scrim = one row (brand left, #tag right; curator/count live in the peek bar). `/t/` paths joined AppShell chrome suppression (app Header double-stacked above the profile's own bar).
- **State**: Chrome-verified (posters incl. make public/private + copy, profile 200/404, owner view booleans). Tests green.
- **Follow-ups**: profile avatar falls back oddly when a stale oauth avatar URL 404s (shows grey generic) — consider monogram-on-error; PosterCard gained optional `subtitle`/`tilesLoading` beyond the shared contract.

## 2026-08-20 — Review round 3: tag-view semantics, triage-queue filters, username chooser (PRs #341–#344)

- **Why**: Continued live staging review + a privacy call: email local-parts leak into public `/t/{username}/` URLs.
- **What**: #341 tag views ignore read state (feed forces unreadOnly=false with a tag active; toggle hides). #342 collection queue built from the CURRENT filter state instead of hard-coded unreadOnly=true; tag counts refresh via `bookmark-tags-changed` from grid toggles; **tag-from-live** (Tag on the live tab saves first, then opens TagQuickPicker); Quick save tools card deleted. #343 collection theater top bar: COLLECTION chip dropped, wordmark/tag/curator share one text baseline. #344 **one-shot username chooser**: new email accounts land on `/welcome` (prefilled suggestion, live availability, 3–15 `[a-z0-9_-]`), claim re-issues the session cookie, `users.username_chosen` guarded-ALTER + X-backfill; `/welcome` added to AppShell chrome suppression (hidden Header search was focusable under the overlay).
- **Design canvases** (await user pick before building): Tags Card Redesign (toggle/one-button/poster directions; "Share as theater" → "Make public") and Curator Profile (`/t/{username}` public page: stats + public collections as poster cards).
- **State**: all merged + on staging, Chrome-verified. Production still pending the user's call.
- **Follow-ups**: Resend 422s on reserved domains (example.com) surface as generic 503 — fine; local dev tip: run `RESEND_API_KEY= pnpm dev` to log magic links instead of sending.

## 2026-08-20 — Review round 2: copy/emoji, tag UX, nav reach, email-account share fix

- **Why**: Second live staging review — "pile" wording + native emoji read cheap; tags lacked state/subtlety; Live dead outside `/`; Share-as-theater silently dead; 3 header rows viewing a tag; Sync shown to email-only accounts.
- **What**: "All caught up" (TriagePileClear→CollectionAllClear), full native-emoji sweep (lucide only), "pile"→collection copy everywhere; Tag action shows `Tag · {n}` clay state; chips = subtle white/12 badges aligned to the content column (CollectionStage renders them inside the text composition); Live routes `/?live=1` off `/` (mirrors ?collection=1); Sync hidden + background resyncs gated on xConnected; tag toolbar merged into the filter row (2 rows, type pills swap out while a tag is active); /tags Share fixed (root cause: NO error handling — network/4xx failures were silent, not clipboard) + inline errors + content-preview mosaics per card.
- **Accounts bug found en route**: username lookups still read `oauth_tokens` — email-only accounts 404'd on every share action and were invisible to /t pages, sitemap, and tweet enrichment. New `src/lib/users/lookup.ts` (users-table-first, oauth fallback); joins in sitemap/share-tweet now hit `users`.
- **State**: on `fix/review-round-2`, 1612 tests green, Chrome-verified (share toggle, make-private, Live-from-/tags, previews, merged filter row).
- **Follow-ups**: article stage posts don't show tag chips (text/quote only); tag-preview mosaics fetch per tag (fine at current scale).

## 2026-08-20 — Live-review fixes + tags screen (PRs #337/#338)

- **Why**: User tested the unified theater on staging and reported: invisible active label on the Collection/Live switcher, already-saved posts showing "Save" in the live tab, triage twitter video rendering tiny, live-saves needing a reload to appear in the collection tab, tags invisible after tagging, and no home for tag collections.
- **What (#337)**: switcher active pill hardcodes dark ink (`text-ink` flips light in dark theme); shell bulk-seeds `savedKeys` from `/api/feed?id=…` + SavePostButton cached per-post lookup; triage twitter video sized via dvh (VideoPlayer wraps `<video>` in a height-less div — % heights collapse; bug predates the port); live-saves append into the open collection queue. Plus the CI "database is locked" root fix: the sqlite busy handler is now armed BEFORE the WAL pragma (constructor `timeout`), which was killing parallel `next build` page-data workers on fresh CI dbs.
- **What (#338)**: `/tags` screen (count, PUBLIC chip, copyable share URL, View `/?tag=`, Share as theater, Open, Make private), Tags in the nav (desktop bar + avatar menu), `bookmark-tags-changed` event from TagQuickPicker → open collection queue patches + `#tag` chips in both chromes (text posts get a standalone row — no media overlay), `?tag=` deep links.
- **State**: both merged to main, deployed to staging, Chrome-verified. Production still pending the user's call.
- **Follow-ups**: `resolvePastedLink` returns null for canonical TikTok URLs (verify+widen); triage live tab briefly shows "Loading…" on first open (no SSR seed).

## 2026-08-20 — Nav simplification, theater avatar, tags create/fill, paste-first add

- **Why**: Live user review after the accounts launch — one theater UX everywhere, nav down to Collection · Live, tags as the organizing tool (spec: `docs/specs/unified-theater-collection.md`).
- **What**: Header tabs → Collection · Live (Live/Triage open the theater via `open-theater` {tab}; Trending removed from authed nav, public SEO routes untouched); `+` Add button + AddTweetModal deleted → `PasteToPreview` global paste listener; `TheaterAvatarMenu` (authed avatar in ALL theater modes: Your collection/Settings/Sign out); FilterBar `+ New tag` + "Add posts" grid selection mode (tap cards to toggle membership) + shared `TagQuickPicker` used by triage's Tag action. Integration fix: Add-posts mode drops the tag + unread-only feed filters (else the grid only shows already-tagged posts — nothing to add).
- **Verified in Chrome**: triage keyboard map (→/←/↓/U/Esc) with DB persistence, delete-undo toast, TagQuickPicker toggle, Live tab (visibility-gated poll — hidden automation tabs legitimately show empty), Add-posts whole-pile fix, paste→preview navigation (note: extension isolated-world synthetic pastes don't carry clipboardData — test from page world).
- **State**: on `feat/unified-theater-nav` with the collection-shell rebuild below. 1593 tests green, build clean.
- **Follow-ups**: canonical TikTok URLs return null from `resolvePastedLink` (only shortlinks + x.com/IG/YT resolve?) — verify + widen; live-tab first-open has a brief "Loading…" (no SSR seed).

## 2026-08-20 — Triage folded into TheaterShell (`mode="personal"`), CollectionTheater/CollectionRail deleted

- **Why**: `docs/specs/unified-theater-collection.md` §2 — one TheaterShell for every surface; the old vertical-rail `CollectionTheater`/`CollectionRail` was a second, competing UX.
- **What**: New `TheaterMode: 'personal'`. `TheaterShell` gained a self-contained triage state machine (queue/index/undo/streak, ported verbatim from `CollectionTheater`) that's entirely separate from the shell's live-feed `current`/`displayItems` — those now describe triage's own **Live** sub-tab too. Keyboard: `personalKeyAction()` reproduces the old map (→Done/←Later/↓·Backspace·Delete=Delete/U=Undo/Esc=Close) plus new `↑`=Back (pure nav, no state change). New `CollectionStage.tsx` (FeedItem-aware dispatch incl. HLS `VideoPlayer` + quote cards, ported from the deleted `CollectionStage`) and `TriagePileClear.tsx` (end-of-queue state, not `StageWaiting`). `TheaterDesktopChrome`/`TheaterMobileChrome` gained one bundled `triage?: TheaterPersonalChrome` prop: Collection↔Live tab switcher (desktop top bar / mobile peek-bar center), Later/Tag/Delete/Done actions replacing Save/Download, a 5s undo toast, and `TheaterAvatarMenu` now mounted in ALL modes' top bar/scrim. `AuthedHome` mounts `<TheaterShell mode="personal">` conditionally (replacing the always-mounted `CollectionTheater`), listens for Header's `open-theater {tab}` event, mounts `<PasteToPreview/>`, and wires FilterBar/FeedGrid's already-shipped `tagSelect`/`tagSelectTag` props. Deleted: `CollectionTheater.tsx`, `CollectionRail.tsx`, `src/components/feed/TriageMode.tsx` (already unmounted), `AddTweetModal.tsx` (confirmed zero remaining usage) + their dedicated tests.
- **Verified**: 442 theater/component tests green post-edit (no regressions); new `theater-triage.test.ts` covers the key map + delete-undo/advance pure logic.
- **Follow-ups**: twitter video in the personal theater's Collection tab uses the old `VideoPlayer` (HLS-aware, preserved for fidelity) which doesn't emit the newer `theater-playing-state`/`theater-muted-state` events, so the dock's transport pause/mute buttons are inert for that one content type — pre-existing gap, not a regression. Triage's Live sub-tab seeds `/api/activity` from empty (no SSR data available in the authed shell), so its first open shows a brief "Loading…" instead of instant content.

## 2026-08-20 — Accounts: magic-link + X identities, Settings rebuild, collections as looping theaters

- **Why**: The tagged-collections design (canvas, 2026-08-19) needed real accounts — `userId` was the X id everywhere, so magic-link-only users couldn't exist and collections couldn't convert signed-out viewers.
- **What**: `users`/`user_identities`/`login_tokens` tables + idempotent backfill in `migrate.ts`; `src/lib/auth/account.ts` + `src/lib/email/magic-link.ts` (Resend; dev logs the link); routes `/api/auth/me|email/request|email/callback|email/change|twitter/disconnect|logout`; X callback links identities (email user connecting X joins ONE account); status route: fatal refresh now deletes tokens but KEEPS the session. `SignInModal`+`useAuthMe` (`src/components/auth/`), opened at save-intent in all theater modes. Settings rebuilt per artboard (Sign-in & connection card, X-gated sync + `/api/sync/history`). `/t/{user}/{tag}` = looping collection theater (`mode="collection"`, `tag-seed.ts`, loop divider dock, Save collection · N → clone or modal + `?save=1` auto-clone); FilterBar got Tags dropdown + Share-as-theater. Built by 4 parallel agents (disjoint file ownership), integrated + full Chrome pass (magic-link signup/change/logout, 429/409/reauth paths, share→theater→clone loop) on 2026-08-20.
- **State**: on `feat/accounts-magic-link`. 1569 tests green. `RESEND_API_KEY`+`EMAIL_FROM` must be set on Fly (staging+prod) before the email flow works in deploys.
- **Follow-ups**: X OAuth full round-trip untested live (needs real X login — covered by unit tests); legacy `DELETE /api/auth/twitter` still clears the whole session (deprecate?); LandingPage fallback in AuthedHome is now dead weight; local dev DBs created via drizzle-kit push need the journal-tag backfill (see 2026-08-20 session) before `pnpm db:migrate`.

## 2026-08-19 — Desktop theater "Filmstrip dock" redesign (direction C shipped)

- **Why**: User live review judged the rail-based desktop layout weaker than mobile's "stage owns the post" model and selected direction C.
- **What**: Rail.tsx deleted. Desktop = full-width stage (flex-1) + bottom filmstrip dock (`DesktopDock`: transport buttons + horizontal queue cards auto-scrolled to keep current visible + "Show all" panel with full `UpNextList` + savedToday line). `DesktopStageChrome`: top bar (brand + LIVE + paste-to-preview input ⌘V + de-clutter); stage overlays (meta/flame/platform pinned top-right for text/quote/article; merged avatar·name·@handle·platform·flame overlay + 2-line clamped caption with show-more for video/photo); bottom actions (Download when sendable / Link / Save / Open). New `useClampExpand.ts` module extracted, `lib/theater/paste-preview.ts` for `resolvePastedLink()`, ←/→ keyboard prev/next. Mobile chrome untouched.
- **State**: on `feat/theater-desktop-controls`, PR #322. Earlier same-day rail de-clutter entry (#322) is superseded.
- **Follow-ups**: none.

## 2026-08-19 — Desktop theater rail de-clutter per user review

- **Why**: Streamline the desktop theater rail controls and layout based on user feedback.
- **What**: Removed rail Connect CTA block; signed-out saving via Save action button → `/api/auth/twitter`. Removed desktop "Tap for sound" pill; sound affordance now the rail transport row's pulsing audio button or tapping stage. Removed "Browse as list" footer link (page `/trending` remains for SEO). Rail layout redesigned: fixed top block = brand → transport → actions, then ONE scroll container for now-playing post + collapsed Up next (Show all · N more toggle; mobile sheet unchanged).
- **State**: on `feat/theater-desktop-controls`, PR #322.
- **Follow-ups**: none noted.

## 2026-08-19 — Desktop theater controls (port of the mobile round)

- **Why**: Bring the mobile features to desktop: visible transport controls, audio toggle, de-clutter, the progress line, and the 10s timed auto-advance.
- **What**: Rail gains a TransportRow ([prev · pause/play · next · audio] + de-clutter right) mirroring the mobile event semantics exactly. The progress line mounts per-viewport via `useIsDesktopViewport()` (matchMedia) — exactly ONE live 'timed'/'video' kind at a time. De-clutter collapses the rail column (w-0 transition) into a full-bleed stage with a fixed restore button. StageVideo's internal bottom bar removed — the top line is the single progress indicator on both viewports.
- **Latent bug fixed en route**: the mobile chrome is CSS-hidden (not unmounted) at desktop widths, so its 10s timer was ALREADY running invisibly on desktop and auto-advancing text posts — display:none doesn't stop rAF. The viewport gating (`current=null` to the chrome at lg+) kills it properly.
- **State**: on `feat/theater-desktop-controls`, deploying to staging.
- **Follow-ups**: none noted.

## 2026-08-19 — Waiting stage, tappable mentions, chrome polish

- **Why**: Live review continued — the theater dead-ended at the last post while fresh pulse items prepended unseen; @mentions were plain text; the reviewer wanted stable control positions, an open-original button, fixed post meta, avatars, the sound affordance on the audio button, and a see-through peek bar.
- **What**: `StageWaiting` — advancing past the last post enters a calm "waiting for new sends…" stage; a fresh pulse arrival auto-stages and plays (baseline-snapshotted freshKeys; prev/Up-next selection exits; mid-feed prepend behavior untouched). @mentions linkify platform-aware (`splitMentionParts`/`mentionHref` — email-safe, trailing-dot-safe; all call sites pass `platform`, quote cards pinned to twitter). Chrome: [de-clutter · audio] left (de-clutter never shifts), post meta (flame + platform/time link-out) pinned to the TOP scrim right on every content type, avatar in the media author row, ExternalLink open-original button right of Share, "Tap for sound" pill desktop-only with the peek-bar audio button pulsing while muted+playing, peek bar translucent (surface/70 blur collapsed, /95 open).
- **State**: on `feat/theater-phase3` (PR #319), deploying to staging.
- **Follow-ups**: agents reported one git-stash near-miss + staleness churn on TheaterMobileChrome — diff-audited intact (sheet drag, all six changes present).

## 2026-08-19 — Peek bar mirrored, swipe removed, end-state chevrons

- **Why**: Live review — nav belongs under the right thumb; de-clutter hid the controls people still wanted; the label was off-center; swiping to the next video re-muted it (our preventDefault voided user activation, so unmuted play() was denied); testers hit the first post and couldn't tell why "back" did nothing.
- **What**: Peek bar mirrored — [audio · de-clutter] left, absolutely-centered "{N} new"/"Up next" label, [prev · pause · next] right. De-clutter hides only the scrims; the peek bar stays (button toggles in place; corner restore deleted). Swipe navigation REMOVED entirely (touch handlers, native preventDefault listener, isScrollableTarget, swipeDirection, data-theater-scroll attrs, dead tests) — buttons + auto-advance navigate, fixing the audio drop by construction; overscroll-behavior none stays for pull-to-refresh. Prev/next chevrons render disabled (opacity-35, native disabled) at the ends via canPrev/canNext.
- **State**: on `feat/theater-phase3` (PR #319), deploying to staging.
- **Follow-ups**: iOS may rubber-band slightly on aggressive drags now that preventDefault is gone (noted in code); acceptable.

## 2026-08-19 — Peek-bar controls: pause, audio, de-clutter; hold-to-pause removed

- **Why**: Live review — hold-to-pause fought text selection and felt unreliable; videos needed an explicit audio toggle; the reviewer wanted an immersive full-screen mode and suggested the sheet peek bar as the control surface.
- **What**: The mobile peek bar is now the control strip (drag handle row + a 40px button row): [prev · pause/play · next] left, "Up next · N new" center (still opens the sheet), [audio (video only) · de-clutter] right. Pause = one meaning (10s timer on timed posts, the video itself on videos; hidden on YouTube), icon synced to reality via `theater-playing-state`/`theater-muted-state` events from StageVideo. Hold-to-pause (`theater-hold`/`release`) deleted. De-clutter hides all chrome except the progress line + one restore button; persists across items; swipe/auto-advance still navigate. Floating right-edge cluster removed. PEEK_H 3.75→4.25rem (kept in hand-sync with the literal Tailwind transform class — JIT needs static text).
- **State**: on `feat/theater-phase3` (PR #319), deploying to staging.
- **Follow-ups**: none noted.

## 2026-08-19 — Stories-style auto-advance + mobile button pass

- **Why**: Live review — finished videos should flow to the next post; non-video posts need a visible dwell; Connect in the top scrim was redundant; "Send" undersold the file; copy should be a native share on phones.
- **What**: Video ended → auto-advance (all viewports; last item keeps the replay overlay). Non-video posts: 10s Instagram-style orange top line (`TheaterProgressLine`, mobile-only via the chrome mount) with hold-to-pause accumulating elapsed; completion dispatches `theater-advance`, shell advances with a stale-timer guard. YouTube excluded (iframe gives no signal — manual). StageVideo's bottom bar is desktop-only now. Buttons: orange CTA = "Download" + Download icon in both modes (behavior unchanged); mobile copy → Share2 icon opening `navigator.share({url})` with clipboard fallback; Connect removed from the mobile top scrim.
- **Perf note**: all progress ticks mutate style via refs/events — nothing re-renders per frame.
- **State**: on `feat/theater-phase3` (PR #319), deploying to staging.
- **Follow-ups**: 10s dwell may want tuning per content type (articles vs photos); consider hold-to-pause visual feedback.

## 2026-08-19 — Mobile playback: persistent video element, gesture arbitration

- **Why**: Phone testing — the next video after a swipe didn't autoplay (fresh <video> elements lack the sound permission the user's tap granted), the tap-for-sound chip was easy to miss, and swipe-down fought the browser's pull-to-refresh.
- **What**: StageVideo keeps ONE persistent <video> (no key={src}; src swapped imperatively, one play() caller, event-driven state) so the unmute carries across video→video swipes, with an in-effect fall-back-to-muted when a browser still denies. Centered pulsing "Tap for sound" pill until first unmute. TheaterShell: overscroll-behavior none while mounted + touch-action none + non-passive preventDefault on the stage kills pull-to-refresh; gestures starting in `[data-theater-scroll]`, links, buttons, or any overflow-y:auto ancestor are ignored entirely so scrolling long posts and long-press copy stay native (JS ignore-flag is authoritative; CSS touch-action is a hint).
- **State**: on `feat/theater-phase3` (PR #319), deployed to staging. Needs a real-device pass: sound continuity across swipes, pull-to-refresh gone, text copy inside posts.
- **Follow-ups**: unlock is lost crossing non-video items (text/article/YouTube) — retries unmuted and degrades to the pill; IG reels only keep the element when the mirror is pre-warmed.

## 2026-08-19 — Staging round 2: pulse carries links+quote, link-out, URL sync

- **Why**: Round-1 fixes only covered SAVED posts and the shared post's own page — preview-only pulse items still showed raw t.co and no quote in the theater (the reviewer caught it in the Up-next rows, now-playing, and show-more).
- **What**: `activity` gains `text_links` + `quote_json` (guarded ALTERs; server-resolved at preview time on the status page; share/preview pulses copy them forward; public endpoints stay identifiers-only, regression-tested). Enrichment precedence: bookmark_links → recorded links; recorded quote → saved bookmark quoteContext. List rows strip all bare t.co (`stripShortLinksForPreview`). Rail: platform-glyph+time top-right is a link-out to the ORIGINAL post; Open → source network (hidden when unbuildable); show more/less is a sticky session preference; Send labels honestly (Send w/ share sheet, Download on desktop). TheaterShell syncs the address bar to the current post via replaceState (home+shared) — / and preview URLs are one continuous surface. Preview paths join the theater-dark theme default.
- **State**: on `feat/theater-phase3` (PR #319), deploying to staging with a full theater-side test pass on the reviewer's exact posts.
- **Follow-ups**: pre-existing activity rows lack the new columns until a fresh preview re-records them (dedupe takes the newest event); CollectionRail send buttons still say "Send" unconditionally.

## 2026-08-19 — Staging review round: full text, pinned lead, shared quote cards

- **Why**: First real staging pass surfaced five issues: "Show more" expanded to a 240-char-capped string; "Copy link" wrapped on mobile; photo captions duplicated (stage overlay + rail); a shared quoting tweet showed a raw t.co with no quote; ↓ dead when the lead-pick landed at the bottom of the recency list.
- **What**: getTrendingItems serves the saved bookmark's FULL text (2000 cap; article title still wins; TEXT_CAP 240→500 for preview-only). Labels → "Link". `photoCaption={false}` from TheaterShell (rail/chrome carry the text; collection theater keeps captions). `TheaterItem.quote` (from FxTwitter's quote on preview pages) → StageText renders a quote card + strips the quote link (§6b); rail/chrome hideTweetLinks follow. `pinKeyFirst`: the lead-pick now pins its item to the top like shared mode, so keyboard order == rail order.
- **Verified live**: Elon quote-tweet preview renders the quote card with no t.co; ↓ advances 0→1→2 from the pinned lead.
- **State**: on `feat/theater-phase3` (PR #319), redeployed to staging.
- **Follow-ups**: pulse items never saved by anyone still cap at 500 chars (no fuller source exists).

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
- **Follow-ups**: the in-app `FeedCard`/`MediaCard`/`DiscoverCard` still clamp captions with no expand (acceptable there — the card links onward), but `MediaCard` in the collection theater is a full-focus surface and may deserve the same treatment.

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

- Full UI redesign to the "Matter" warm editorial system (light+dark), per-content-type cards, grid/list/bento views, full-screen collection mode with streaks.
- The public community feed moved from `/discover` (308-redirect now) to `/trending` + `/trending/[filter]` hubs with server-rendered crawlable lists + JSON-LD — the start of the SEO growth loop. All public activity reads go through `getTrendingItems()` (the anonymity choke point).
- Knowledge Graph (`/graph`, PR #262) was built but **closed unmerged** — code preserved on `feat/knowledge-graph`.

## Earlier (v1.0–v1.42) — platform foundations

- X bookmark sync (OAuth 2.0 PKCE, encrypted tokens, race-safe refresh via `getValidTokens()`), multi-user composite-key schema.
- URL-prefix previews for X / Instagram Reels / TikTok / YouTube Shorts; media proxies with SSRF allowlists + timeouts; HLS for long videos.
- Save-from-anywhere: bookmarklet, iOS Shortcut, Android PWA share target; installable PWA.
- Tag sharing at `/t/{user}/{tag}`, public tweet JSON API (`/api/share/tweet/...`), `llms.txt`, dynamic sitemap, agent skill (`skills/adhx/`).
