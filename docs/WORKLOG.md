# WORKLOG

Append-only context log for agents and contributors. **Newest entries first.** After any substantive piece of work, add a dated entry (≤10 lines): what was done, why, current state, follow-ups. Never rewrite or delete old entries — this file is how a fresh session inherits context that isn't in the code. See `AGENTS.md` for the full protocol.

---

## 2026-08-20 — Review round 3: tag-view semantics, triage-queue filters, username chooser (PRs #341–#344)

- **Why**: Continued live staging review + a privacy call: email local-parts leak into public `/t/{username}/` URLs.
- **What**: #341 tag views ignore read state (feed forces unreadOnly=false with a tag active; toggle hides). #342 triage queue built from the CURRENT filter state instead of hard-coded unreadOnly=true; tag counts refresh via `bookmark-tags-changed` from grid toggles; **tag-from-live** (Tag on the live tab saves first, then opens TagQuickPicker); Quick save tools card deleted. #343 collection theater top bar: COLLECTION chip dropped, wordmark/tag/curator share one text baseline. #344 **one-shot username chooser**: new email accounts land on `/welcome` (prefilled suggestion, live availability, 3–15 `[a-z0-9_-]`), claim re-issues the session cookie, `users.username_chosen` guarded-ALTER + X-backfill; `/welcome` added to AppShell chrome suppression (hidden Header search was focusable under the overlay).
- **Design canvases** (await user pick before building): Tags Card Redesign (toggle/one-button/poster directions; "Share as theater" → "Make public") and Curator Profile (`/t/{username}` public page: stats + public collections as poster cards).
- **State**: all merged + on staging, Chrome-verified. Production still pending the user's call.
- **Follow-ups**: Resend 422s on reserved domains (example.com) surface as generic 503 — fine; local dev tip: run `RESEND_API_KEY= pnpm dev` to log magic links instead of sending.

## 2026-08-20 — Review round 2: copy/emoji, tag UX, nav reach, email-account share fix

- **Why**: Second live staging review — "pile" wording + native emoji read cheap; tags lacked state/subtlety; Live dead outside `/`; Share-as-theater silently dead; 3 header rows viewing a tag; Sync shown to email-only accounts.
- **What**: "All caught up" (TriagePileClear→TriageAllClear), full native-emoji sweep (lucide only), "pile"→collection copy everywhere; Tag action shows `Tag · {n}` clay state; chips = subtle white/12 badges aligned to the content column (TriageStage renders them inside the text composition); Live routes `/?live=1` off `/` (mirrors ?triage=1); Sync hidden + background resyncs gated on xConnected; tag toolbar merged into the filter row (2 rows, type pills swap out while a tag is active); /tags Share fixed (root cause: NO error handling — network/4xx failures were silent, not clipboard) + inline errors + content-preview mosaics per card.
- **Accounts bug found en route**: username lookups still read `oauth_tokens` — email-only accounts 404'd on every share action and were invisible to /t pages, sitemap, and tweet enrichment. New `src/lib/users/lookup.ts` (users-table-first, oauth fallback); joins in sitemap/share-tweet now hit `users`.
- **State**: on `fix/review-round-2`, 1612 tests green, Chrome-verified (share toggle, make-private, Live-from-/tags, previews, merged filter row).
- **Follow-ups**: article stage posts don't show tag chips (text/quote only); tag-preview mosaics fetch per tag (fine at current scale).

## 2026-08-20 — Live-review fixes + tags screen (PRs #337/#338)

- **Why**: User tested the unified theater on staging and reported: invisible active label on the Collection/Live switcher, already-saved posts showing "Save" in the live tab, triage twitter video rendering tiny, live-saves needing a reload to appear in the collection tab, tags invisible after tagging, and no home for tag collections.
- **What (#337)**: switcher active pill hardcodes dark ink (`text-ink` flips light in dark theme); shell bulk-seeds `savedKeys` from `/api/feed?id=…` + SavePostButton cached per-post lookup; triage twitter video sized via dvh (VideoPlayer wraps `<video>` in a height-less div — % heights collapse; bug predates the port); live-saves append into the open triage queue. Plus the CI "database is locked" root fix: the sqlite busy handler is now armed BEFORE the WAL pragma (constructor `timeout`), which was killing parallel `next build` page-data workers on fresh CI dbs.
- **What (#338)**: `/tags` screen (count, PUBLIC chip, copyable share URL, View `/?tag=`, Share as theater, Open, Make private), Tags in the nav (desktop bar + avatar menu), `bookmark-tags-changed` event from TagQuickPicker → open triage queue patches + `#tag` chips in both chromes (text posts get a standalone row — no media overlay), `?tag=` deep links.
- **State**: both merged to main, deployed to staging, Chrome-verified. Production still pending the user's call.
- **Follow-ups**: `resolvePastedLink` returns null for canonical TikTok URLs (verify+widen); triage live tab briefly shows "Loading…" on first open (no SSR seed).

## 2026-08-20 — Nav simplification, theater avatar, tags create/fill, paste-first add

- **Why**: Live user review after the accounts launch — one theater UX everywhere, nav down to Collection · Live, tags as the organizing tool (spec: `docs/specs/unified-theater-triage.md`).
- **What**: Header tabs → Collection · Live (Live/Triage open the theater via `open-theater` {tab}; Trending removed from authed nav, public SEO routes untouched); `+` Add button + AddTweetModal deleted → `PasteToPreview` global paste listener; `TheaterAvatarMenu` (authed avatar in ALL theater modes: Your collection/Settings/Sign out); FilterBar `+ New tag` + "Add posts" grid selection mode (tap cards to toggle membership) + shared `TagQuickPicker` used by triage's Tag action. Integration fix: Add-posts mode drops the tag + unread-only feed filters (else the grid only shows already-tagged posts — nothing to add).
- **Verified in Chrome**: triage keyboard map (→/←/↓/U/Esc) with DB persistence, delete-undo toast, TagQuickPicker toggle, Live tab (visibility-gated poll — hidden automation tabs legitimately show empty), Add-posts whole-pile fix, paste→preview navigation (note: extension isolated-world synthetic pastes don't carry clipboardData — test from page world).
- **State**: on `feat/unified-theater-nav` with the triage-shell rebuild below. 1593 tests green, build clean.
- **Follow-ups**: canonical TikTok URLs return null from `resolvePastedLink` (only shortlinks + x.com/IG/YT resolve?) — verify + widen; live-tab first-open has a brief "Loading…" (no SSR seed).

## 2026-08-20 — Triage folded into TheaterShell (`mode="triage"`), CollectionTheater/CollectionRail deleted

- **Why**: `docs/specs/unified-theater-triage.md` §2 — one TheaterShell for every surface; the old vertical-rail `CollectionTheater`/`CollectionRail` was a second, competing UX.
- **What**: New `TheaterMode: 'triage'`. `TheaterShell` gained a self-contained triage state machine (queue/index/undo/streak, ported verbatim from `CollectionTheater`) that's entirely separate from the shell's live-feed `current`/`displayItems` — those now describe triage's own **Live** sub-tab too. Keyboard: `triageKeyAction()` reproduces the old map (→Done/←Later/↓·Backspace·Delete=Delete/U=Undo/Esc=Close) plus new `↑`=Back (pure nav, no state change). New `TriageStage.tsx` (FeedItem-aware dispatch incl. HLS `VideoPlayer` + quote cards, ported from the deleted `CollectionStage`) and `TriagePileClear.tsx` (end-of-queue state, not `StageWaiting`). `TheaterDesktopChrome`/`TheaterMobileChrome` gained one bundled `triage?: TheaterTriageChrome` prop: Collection↔Live tab switcher (desktop top bar / mobile peek-bar center), Later/Tag/Delete/Done actions replacing Save/Download, a 5s undo toast, and `TheaterAvatarMenu` now mounted in ALL modes' top bar/scrim. `AuthedHome` mounts `<TheaterShell mode="triage">` conditionally (replacing the always-mounted `CollectionTheater`), listens for Header's `open-theater {tab}` event, mounts `<PasteToPreview/>`, and wires FilterBar/FeedGrid's already-shipped `tagSelect`/`tagSelectTag` props. Deleted: `CollectionTheater.tsx`, `CollectionRail.tsx`, `src/components/feed/TriageMode.tsx` (already unmounted), `AddTweetModal.tsx` (confirmed zero remaining usage) + their dedicated tests.
- **Verified**: 442 theater/component tests green post-edit (no regressions); new `theater-triage.test.ts` covers the key map + delete-undo/advance pure logic.
- **Follow-ups**: twitter video in triage's Collection tab uses the old `VideoPlayer` (HLS-aware, preserved for fidelity) which doesn't emit the newer `theater-playing-state`/`theater-muted-state` events, so the dock's transport pause/mute buttons are inert for that one content type — pre-existing gap, not a regression. Triage's Live sub-tab seeds `/api/activity` from empty (no SSR data available in the authed shell), so its first open shows a brief "Loading…" instead of instant content.

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
