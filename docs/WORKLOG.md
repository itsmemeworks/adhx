# WORKLOG

Append-only context log for agents and contributors. **Newest entries first.** After any substantive piece of work, add a dated entry (≤10 lines): what was done, why, current state (shipped/in-flight/reverted), and follow-ups. Never rewrite or delete old entries — this file is how a fresh session inherits context that isn't in the code. See `AGENTS.md` for the full protocol.

**Voice:** new entries must not name operator GitHub logins, personal handles, or Fly bypasses. Put those in gitignored `CLAUDE.local.md`. Older entries below were written as an internal ops diary and may still contain them — they are historical, not a public contract.

---

## 2026-10-30 — Fly round 2 on 2.14.3

- Fresh install from the updated recipe (dedicated CPU, 4 GB, swap): no prompts or warnings, pages 45–970 ms while the server learned its first saves. A scripted web pass (owner setup, seed, group link, a third friend, widths, speed, admin labels, held sign-in links) passed 20 of 24; all four failures were one bug.
- **Fixed:** the owner's phone header ran 19–30 px off screen when the learning ring joined the on-their-way pill and Paste; on phones the ring now only shows where the header has no pill (`LEARNING_IN_HEADER`). A post whose download gave up told the phones "taken down or made private" even when it still plays on its network; the files route now gives Processing's reason (`keep/reason.ts`). Text posts no longer show "Listening to what's said" or count as on their way while their skipped speech and screen jobs wait.
- Phones: both joined from the group link with brand fonts and clean names, connected from a dead round-1 pairing, played, reacted, shared with a note, got a send, searched. Once each in rounds 1 and 2 the iPhone opened Home on the caught-up page right after connecting; three tries to reproduce it failed. Watch for it in round 3.

## 2026-10-30 — A fresh Fly install, walked end to end

- Installed 2.14.2 from `deploy/fly` on a new app, set up the owner, saved 11 real posts, let two friends in from a group link without email, and connected the iPhone and the Android by "Connect this phone". Full results: [phone device results](rollout/phone-device-results.md).
- **2 GB ran out:** while a new server learned its first saves, the models, a download and FFmpeg used all 2 GB with no swap, and pages stopped answering. The recipe is now 4 GB with 1 GB of swap; the volume step names its region and `--yes`, and the health check's grace fits Fly's 60 s cap.
- **Shared CPUs throttle:** the first downloads, an FFmpeg re-encode of a 4K YouTube video and the models used up the burst; steal reached 186% and pages took 0.5–6 s. A dedicated `performance-1x` answered in 55–130 ms, so the recipe now asks for one dedicated CPU (owner's call). FFmpeg re-encodes and yt-dlp also run at nice 10 like the model worker (`keep/background.ts`). Still open: whether kept video should stop at 1080p (yt-dlp sorts by resolution first, so it fetched 4K VP9 and re-encoded it).
- **Fixed:** iPhone said "Can't load Home" after a connect link moved it to a new server (Home kept the old pairing's state; `RootView` keys it on `connectionId`). Invite and sign-in link pages now load the brand fonts (`public/fonts`, `font-src 'self'`). Invite name field has `autocorrect="off"`. The shared-saves notice drops "now"; "Keep @name" hides while the box holds it; the waiting page reads plainer; Search's privacy line says what went to Jev when it sorted results, and its count is "fully learned"; Admin says "Words understood", "1 core" and "With copies" for local converting. `drive.mjs android wipe` (it was a second, unreachable `clear`).
- **Noted, not changed:** every post gets every learning job, so a text post shows "Listening to what's said" and counts as on its way until the worker skips it; members see that count over the feed. The web's red live dot is always on, unlike the apps.

## 2026-10-30 — The signed-in header fits a 360px phone

- Launch check on 2.14.1: with the on-their-way pill showing, the signed-in header on Live and Channels was 372px wide, so on 360px Androids the avatar ran off the edge and the page zoomed out. Paste is now its icon alone under 380px (still read as "Paste"), and under 340px the logo keeps the face and drops the name. Checked at 320, 360, 390 and 1440 on a production build: no page wider than the screen, avatar 16px from the edge.
- Open issue 560 (text over YouTube in My saves on phones) predates the current theater; no caption covers the video now. Check its link, then close it.

## 2026-10-30 — Pairing snapshots, revoked grants and bounded cache maintenance

- Follow-up review found a queue/client capture race, stale sign-out responses and media grants surviving account bans. iOS now captures a pairing/client before reading queued entries, checks each entry and discards late replies. Conditional sign-out is serialized with pairing across the app and extension; an atomic `connection.json` holds only the epoch/server, never the Keychain credential.
- Regression coverage drives the real iOS client/flusher through an isolated transport, including a pairing change during key capture and late success/401. Test Keychain/defaults are isolated from personal credentials. The native workflow runs the new suite.
- Private file grants require a live approved, unbanned owner and phone key in one indexed query; tests cover ban, pending/declined approval and deletion with a second private saver.
- Worker cache-key renewals write at most once per minute per generation. Expired-key cleanup removes at most 256 rows per reconciliation; expired hints are released immediately even before their rows are swept. No model, queue priority or worker protocol changes.
- Local: 4,042 Vitest tests, typecheck/format, native pairing and queued-privacy suites, and unsigned iOS app/extension build pass; lint has no errors. Hosted CI pending. No physical-phone run or deployment.

## 2026-10-30 — Launch polish, admin settings tabs, cookies from admin, device run

- Owner asked for the polish list, both phones updated, and a full web plus USB phone run. Ran a production build of this branch on the 29 October data; a sub-agent swept every page (signed out, owner, member; 1280 and 390/360); both phones were re-paired from a stopped server (iPhone as Ana, Galaxy A13 as Ben). Results: `docs/rollout/phone-device-results.md`.
- Polish: `/favicon.ico`; Share is one paper plane on web and iPhone (was a camera on videos); signed-out Right now has no member-only buttons, and signed-out Save goes straight to sign-in with no 401 POST; Just saved shows each post once and scrolls on phones; phone surfaces (theater tabs, bottom nav) say **Live**, since "Right now" pushed the theater's last control off a 360px screen (desktop keeps Right now); Android's Live dot only while something is live.
- Owner asked: Admin → System settings are tabs per group; signed-in cookies (`YTDLP_COOKIES`, kind `cookies`) can be pasted or chosen there, stored encrypted, written to yt-dlp's per-run private copy, winning over the env file.
- Sweep fixes: someone else's Just for me post now answers members exactly like an unsaved post (it used to differ: a leak); unknown profiles and the 404 titled "Not found"; your own friend channel says "That's you"; admin tiles wrap on phones; download give-ups point to Posts → Retry.
- Verified live: a removed phone's tokened file URL goes 200 → 404; Android album → Files saved all 4; iPhone Copy says Copied (paste not checked).
- Follow-ups: `/moments/{unknown}` fetches twice and answers 200; the iPhone share-sheet paths (offline share after re-pair, queued late note) still need a hand on the phone.

## 2026-10-30 — Launch review follow-ups: nine fixes

- Owner asked to fix the nine open findings from the launch code review (two new, seven carried over). All nine are in one PR.
- iPhone: shares, waiting links and notes are stamped with the pairing (`Store.connectionId`, new on every connect). Connecting again clears them, and late work from the old pairing is refused, so one account's private link can't go out with another's key. Notes added after a share went are kept on the share (`pendingNote`) and retried. Copy gives the clipboard its own file copies for an hour instead of the sheet's download folder.
- Server: `/api/files` rechecks access after a tile resize. File tokens now name the phone key and expire in 24 h (`withFileGrant` in `withPhoneKey`), so removing a phone revokes them. Mac conversion reads the saved KEEP switches. Cache hints are looked up by key (`media_cache_keys`) instead of hashing the whole queue. A replayed queued share with a note keeps it, including mid-save or after it lands.
- Android: Files saves a whole album into a picked folder. The button was already hidden for albums, so the old first-photo-only path was latent. Device hub: phone endpoints need the hub's token (`e2e/devices/.hub-token`); `/status` and `/cmd` stay local.
- Follow-up: not run on physical phones this time. Re-pair, a late note, Copy then paste after an hour, and Android album to Files are worth a device pass.

## 2026-10-29 — Release-candidate run: production build, real posts, both phones

- Owner asked for full web and USB phone testing before launch. Ran a production build of `main` (2.13.0) the way the image starts it, on an empty data folder with no email service, models on and real posts from X, YouTube, Vimeo and TikTok; owner via the setup code, a group link, two friends joining from phone browsers. iPhone 16 Pro (Ana, `DeviceDriver`) and Galaxy A13 (owner, then Ben, `adb reverse`); a sub-agent swept every page as signed out, owner and member at desktop and phone sizes. Results: `docs/rollout/phone-device-results.md`.
- Fixed: a TikTok marked kept with nothing kept (non-yt-dlp failures now retry); others' failed saves counted as "needs you"/"on its way" for everyone; a new ADHX opening on "Nothing new yet" (Play my saves on web, iPhone, Android); the owner not told their sign-in link is in the log; setup link ignoring `PORT`; shared links pointing at adhx.com (`appUrl()` per request); blank X thumbnails (site-wide `same-origin` referrer policy: X refuses another site's referrer and the browser caches the refusal); signed-out Sign in pushed off phone screens; X import offered on servers without X; Invites badge counting open links; Links table clipped; doubled brand in titles; a given-up picture failing forever.
- Not run: the iPhone share sheet (needs a hand), offline sharing, Live moments, release-signed builds. Android release builds have shrinking off, so no R8-only risk.
- Follow-ups (polish from the sweep, not done): `/favicon.ico` 404; phone tabs say Live where the bottom nav says Right now; signed-out `/` shows Play my saves/Browse channels that bounce to sign-in; signed-out Save POSTs once (401) before going to sign-in; the Share icon is a camera on videos; "JUST SAVED" repeats a post per saver.

## 2026-10-29 — Absolute links use this server's address, not adhx.com

- Every self-hosted ADHX put `https://adhx.com` in canonicals, og:url/image/video, JSON-LD, the playlist card's host line, `previewUrl`/`adhxUrl` and the layout's `metadataBase`: `PUBLIC_BASE_URL` was a build-time constant and the published image is built without `NEXT_PUBLIC_APP_URL`, so chat unfurls pointed at adhx.com and their image 404'd.
- Server code now calls `appUrl()` per request (env, then host platform, then the address remembered at `/setup`). Layout metadata and JSON-LD are built inside `generateMetadata()`/the component; the OG card's own-host allowlist is per request too.
- `base-url.ts` is client-only now: the compiled-in `NEXT_PUBLIC_APP_URL` or empty, never adhx.com (`useSiteHost` and `previewUrlForItem` already prefer `window.location`).
- Regression: `src/__tests__/public-base-url.test.ts` (no env, stored owner address → status-page metadata, layout `metadataBase`, share-tweet `previewUrl`).

## 2026-10-29 — adhx.com app screenshots recaptured with the avatars

- The ten `site/public/shots` WebPs still showed letter initials after the meme-style avatars landed; recaptured all of them from `PARITY_SHOWCASE=1 pnpm parity:serve`, same names, sizes, framing and story. No alt text changed.
- Web: Playwright at 1440 × 900, 2× (hide `nextjs-portal`, the dev badge). Home needs a click on the Offbeat row (a forming save now leads New) and a seek to 0:01.
- iPhone: an iPhone 16 Pro simulator with the debug launch arguments, driven by the `DeviceDriver` UI test (`e2e/devices`) pointed at the simulator with `TEST_RUNNER_ADHX_DRIVER_URL=http://127.0.0.1:3700/`. Retake when the Dynamic Island flickers into a capture. Live: Pete holds `/api/app/live/<slug>/stream` open and posts the "who sent this" text reaction.
- Android: the USB Galaxy A13 (matches the old status bar). The Offbeat clip moves on within about a second, so burst `adb exec-out screencap` after tapping it in Up next. The share card closes itself about two seconds after saving; share a 600p post Pete hasn't saved (joecroskey's).
- Disk filled mid-run (emulator image plus both app builds) and crashed the Turbopack dev server; check free space before booting emulators.
- Follow-up: republish the site (manual `site.yml`) after this and the avatars PR merge.

## 2026-10-29 — Meme-style avatars on adhx.com and in the demo

- Owner: use fun meme-based avatars for the people on the site and in the demo. Drawn originals in the spirit of internet animals, not copies of real memes (those are someone's photo, character or trademark): Ana a smug cat loaf, Ben a shiba in pixel "deal with it" shades, Mum a capybara with an orange on her head, Jo a raccoon in a tiny crown, Pete a goose up to something, Sam (the demo's visitor) a delighted axolotl. Each on that person's existing colour.
- `site/public/avatars/*.svg` (by username). The site's `Face` draws them; `og.png` redrawn. Showcase/demo seeding stores each as an uploaded picture (`seedShowcaseAvatars` in `e2e/parity/showcase.ts`, after `seedKept` resets the media folder); the demo image copies the folder. Parity design runs (no showcase) are unchanged.
- Checked: a local demo world (start.sh's env) shows them on Home's "Ana saved this", Channels → Your people and the account menu.
- Follow-up: the site's app screenshots (`site/public/shots`, incl. native iPhone/Android) still show initials until they're recaptured from the showcase world. The demo needs a redeploy to pick this up.

## 2026-10-29 — Fresh-install run-through and launch copy

- Owner asked for a simulated fresh install: an admin sets up, makes an invite link and onboards four friends. Ran the production build against an empty data folder (migrate, then start, as the image does; `SEMANTIC_SEARCH=off`). Setup code from the log, then owner email and name, then Admin → Invites → Make a group link. Ana, Ben and Mum (phones) and Jojo (desktop) each joined in their own browser and waited; a taken name was refused without using a place. The admin let all four in ("4 of 25 joined"), each opened straight into Home signed in, and Ana's save played on the others' Home as "ana saved this".
- Found: a waiting friend who comes back to `/` saw the public landing page with Sign in (fixed separately: home sends them to `/invite/waiting`). The Invites nav badge counts open links but reads "need you" (left as is).
- Launch copy: README leads with "a private social network", names the free on-server models, gives the 4 GB guidance, invites via a group link, says DRM posts can't be kept and that saving can break when a network changes; release and demo badges. The site's Invites feature leads with the group link.

## 2026-10-29 — Group invite links with admin approval

- Owner: the admin makes a link, sends it to friends, and approves whoever follows it. Before, an invite was one link per person and admin-made invites skipped approval.
- Admin → Invites → **Make a group link** (`POST /api/invites { group: true }`, admins only): up to 25 people (`GROUP_LINK_MAX_USES`) within 7 days, each `pending` until an admin answers under Waiting for you. One conditional write takes a place (`invites.uses` < `max_uses`); each join gets its own spent invite row (`group_id` → the link) so identity, approvals and "who invited you" reuse the one-person path. Requests say "Joined with Ana's group link".
- Stops when full ("Everyone this link was for has joined"), cancelled, expired, or its maker isn't an unbanned admin; group joins are limited to 20 an hour per address. Guarded migration adds `max_uses`, `uses`, `group_id` and an index.
- Phones: `GET /api/app/invites` now reports real `uses`; phones list the admin's group links but can't make one yet (follow-up).

## 2026-10-29 — Email sign-up is invite-only by default

- Owner: the admin shouldn't need email by default; they make a link, send it to friends, and approve who follows it. Chose invite-only email sign-up for new servers.
- `ALLOWED_EMAILS` unset (or `none`) now lets nobody new make an account by email (was: anyone); a list still works, `*` is anyone, existing accounts always sign in, invites ignore it. Strangers are told to ask for an invite link. Admin → System: "Who may sign up by email", unset reads "Only people with an invite".
- Existing installs: a one-time step (`allowed_emails_default`) saves `*` on servers that already had accounts and no env value, so their sign-up doesn't change. `verify-upgrade.mjs` lets a new one-time step's saved setting carry its own clock, as it already did for receipts.
- Follow-up: one reusable link for a group with admin approval per joiner. Today an invite is one link per person and admin-made invites skip approval.

## 2026-10-29 — A new server stays out of search engines

- Why: a privacy-skeptic review of adhx.com found a fresh ADHX was crawlable (`public/robots.txt` Allow: /, a sitemap of every shared preview) and pointed crawlers at adhx.com (hard-coded sitemap line, `PUBLIC_BASE_URL` fallback).
- New owner switch `PUBLIC_PAGES` ("Show up in search engines", Admin → System → Settings, `EXTRAS`), default off. Off: `src/app/robots.ts` disallows everything except link-preview bots (so sent links still unfurl), the sitemap is empty, the root layout's `generateMetadata` sets noindex/nofollow on every page. On: today's rules. robots.txt and the sitemap now use `appUrl()`.
- Existing installs: a one-time migration step (`public_pages_default`) saves it On when any channel was already public and `PUBLIC_PAGES` isn't in the environment, so nobody is silently de-indexed; everyone else starts Off.
- Sign-up is unchanged (open once email is set up, unless `ALLOWED_EMAILS`); whether to make it allowlist- or invite-only by default is waiting on the owner.
- Follow-ups: canonical/OG URLs and `metadataBase` still use `PUBLIC_BASE_URL` (adhx.com unless baked in at build), so an indexed self-hosted server's canonicals point at adhx.com; the site FAQ/llms change ships with the next site publish.

## 2026-10-29 — adhx.com: persona review, honest claims, proof and a path for non-techies

- Owner asked for the site to be judged for conversion, value prop and buzz by persona sub-agents (homelab self-hoster, non-technical group-chat organiser, HN/AI developer, CRO specialist, privacy skeptic), graded, fixed and shipped. Before: B− overall (path for non-technical people D, social proof D, star propensity C, honesty C+).
- Fixed claims the code contradicts: "nobody else can get into" (preview pages and /now are public), "Invite-only" (with email set up and no ALLOWED_EMAILS, sign-up is open), "watches the videos" (local default reads the first 32 s), Jev "only public post words" (thumbnails with channel pictures on), "No frame or sound leaves your server" (the Mac helper), "may not download" DRM, and the one-click list (Synology/TrueNAS/Coolify are paste-in Compose; Umbrel isn't in its store).
- Added: hero kicker "Open source · Self-hosted · Friends only", a proof strip (Star on GitHub, MIT, release from package.json, 170+ releases, amd64 + arm64, no GPU), "Not techy? Send this to the friend who is" (share sheet / copy), a phone Demo button, "Why not just the group chat?", self-host spec table, under-the-hood and Ask Claude cards, and FAQ answers for mum, requirements, joining, who sees what, downloading others' posts, updates and backups. Merged How it works into Friends; self-host now comes before the apps.
- After: the five reviewers re-graded B+ overall (non-technical path D→B−, social proof D→C+, stars C→B+, honesty C+→B+). Their last points also landed: subhead no longer opens with hosting, 4 GB memory guidance, a "when a network changes" FAQ, exact public-page and invite-approval wording, Vault and Search lead the features.
- Follow-up (app, not site): a fresh ADHX is publicly indexable (robots Allow, sitemap of previews) and sign-up opens once email is set up; consider private-by-default.

## 2026-10-29 — adhx.com: demo-first hero, friends-only story, the AI explained, SEO

- Owner: hero CTAs should be "try the demo" and "self-host"; Admin copy read oddly; the free on-box AI (EmbeddingGemma 2, Whisper, Florence-2) and optional Jev weren't evident; the site should read as a whole social network that's only your friends; meta/OG/SEO/AEO should be strong.
- Hero: kicker "The social network that's only your friends", primary **Try the live demo** (demo.adhx.com), secondary **Host your own** (#self-host); header button is Try the demo with GitHub as an icon. A closing "Bring your people. Leave the algorithm." section repeats both.
- New sections: Friends (`Friends.tsx`, replaces the networks strip: fourteen networks → your people pick → one feed, plus the social parts, minus strangers), AI (`AiSection.tsx`: what each model does, what Jev adds and sees, the four payoffs), FAQ (`Faq.tsx`). Admin is now "Is it working? No SSH required."
- SEO: keyword title + template, canonical per page, OG/X large card from a designed `public/og.png` (`app/og` → `pnpm site:og`), absolute og:video, googlebot previews, `robots.txt`, `sitemap.xml`, site `llms.txt`, and JSON-LD (WebSite, SoftwareApplication, SoftwareSourceCode, VideoObject, FAQPage built from the visible FAQ).
- Copy stays true to the code: models run on the server or its Mac helper; Jev gets only the search and public post words. "Nothing leaves your house" is gone.
- Follow-up: republish the site after merge (manual `site.yml`).

## 2026-10-29 — Admin → System: each fact once, settings changeable there

- Owner (testing v2.11.0 live): System repeated itself (services three times, workers and queues twice, settings in two cards, the server name three times, Processing's own settings and pause button again) and most configuration was still env-only.
- System is now: status + only the problems (with fixes) → map → queues → Mac helper | services and tools (FFmpeg, disk folded in) → one Settings card. The Checks, Outside services, Optional extras and This server cards are gone; map service tiles say a state word; version/uptime stay in the sidebar only. Processing drops its Settings card, duplicate Pause and week counts, and links to System. Disk sizes share `bytesLabel` (was GiB-as-GB).
- Settings (`EXTRAS`): added `KEEP_*`, `INDEXING_LEVEL`, speech, text on screen, `AUTO_SYNC_EVERY_MINUTES`, `ALLOWED_EMAILS`. Precedence flipped: a saved value wins, the environment is the starting value, Clear goes back to it. Read via `setting()` (`settings/value.ts`, no DB import, so the Mac helper stays env-only); the web process and the jobs child install the DB reader by importing `extras.ts`. Keep loop and auto-sync now always run (idle when off) so switching on needs no restart; changing the backfill switch recomputes the cutoff live.
- Fixed: "Who can invite" ignored the mode set on Invites; "Auto sync" read Off when unset (default 50 min).
- Site: Admin section copy and drawing (state words, a settings strip); a tightening pass over the rest of the site's copy. Not republished.
- Follow-ups: paths/`PROCESSING_MODE`/`SEMANTIC_SEARCH` still need a restart; a "restart ADHX" button would need the container to restart itself.

## 2026-10-29 — Admin → System: is it working, and optional extras

- Owner: see whether the queues and the optional Mac helper actually work, with this server's setup (a UGREEN NAS) and the optional services (Jev …) visualised, and let admins switch on extras they didn't know about at setup.
- `/admin/system`: checks with a fix each (queues, processes, Mac helper, outside services, disk, yt-dlp/FFmpeg, address); a map (server box with processes and queues → helper with what's waiting/held → services); per queue waiting/working/retrying/failed, oldest wait, a 5-minute backlog line (in memory since start) and finished per hour (24 h, from the DB); every setting with secrets as Set/Not set. Menu badge counts broken checks; refreshes every 15 s.
- The helper now reports why it's turned away (wrong/no token, not remote, bad server token) and why a connected helper is refused work (model/version mismatch). Jev (per purpose), email and FxTwitter calls are counted with a failure kind only.
- Optional extras (`src/lib/settings/extras.ts`): Jev key and pictures, Resend/SMTP/from, X app id/secret, `SERVER_LABEL`, saved encrypted in `server_settings`; env wins; Test Jev / Send me a test email. Audited by name only.
- README "The admin area" + "point your AI agent at the repo"; site `#admin` section (a drawing, not a screenshot) and an agent line in Self-host. Site not republished.
- Follow-ups: backlog history is lost on restart (persist samples if wanted); other env settings (keep, indexing) stay environment-only because they need a restart.

## 2026-10-29 — Make Right now and thumbnails fast

- Owner: Right now took ~15 s and every thumbnail 10 s+. Measured on a synthetic bench library (400 posts, 1,599 saves, 4–5 MB kept photos; never the owner's DB), production builds.
- Right now: the first naming pass embedded ~130 topic names through the query model and requests waited for it (6.1 s on an M-series Mac 15 s after boot; longer on a NAS). Now the engine groups at server start, answers from the last regroup while a due one runs behind (`snapshot` event), and names new groups in parallel. First visit 15 s after boot: 6.08 s → 0.016 s.
- Thumbnails were the originals: 68 covers on /now = 271 MB. `/api/files?w=` serves sharp-made WebP copies (cached in `.thumbs/`), requested via `NxImage sizes` + `srcset`. A real 4032 px picture: 1.5 MB → 4–9 KB (320/640 px), made once in 20–80 ms. A tile waiting on a running download now gives up after 4 s, not 25 s.
- Strip: the fresh pill's ring was an outer box-shadow clipped by the list's overflow; now inset.
- Paste spinner: no remount or animation restart found (one element, clock never reset, on /now and in the theater). Made it an SVG ring on its own layer; the jank measured came from decoding full-size images, which the thumbnails remove.
- Follow-ups: pre-make the common widths when a file is kept; avatars and link-card images aren't resized.

## 2026-10-29 — The small dependency majors; Tailwind 4 and TypeScript 7 wait

- Owner chose to take the small majors from Dependabot's grouped major PR (#665) and hold the migrations.
- ESLint 10, eslint-config-prettier 10, @types/better-sqlite3 9, @vitejs/plugin-react 6. Lint gives the same 102 warnings and 0 errors, and the rules still fire.
- Removed `eslint-config-next`, `@eslint/eslintrc` and `@eslint/js`: `eslint.config.mjs` loads only typescript-eslint and prettier, and Next 16 doesn't lint in the build. They were the only packages whose peers didn't allow ESLint 10, and they meant more update PRs.
- `dependabot.yml` ignores Tailwind and TypeScript majors (the extension is already on TypeScript 7). Follow-ups: plan the Tailwind 4 migration, and try the app on TypeScript 7.

## 2026-10-29 — Dependency updates in one PR

- Owner: work through the open Dependabot PRs (645–653) without nine CI runs. All applied together here, each major checked locally first.
- Minor/patch: Next 16.4.3, jose, lucide-react, nodemailer, simple-icons, twitter-api-v2, @types/qrcode, eslint-config-next; extension 4.1.35, @types/chrome 0.3.6; actions/cache 6.1.0, docker/login-action 4.7.0; OkHttp 5.5.1, Gradle 9.8.2, Android Gradle plugin 9.5.0. Pinned to Dependabot's versions, not newer ones still inside the 7-day cooldown.
- Sentry 11 removed `sendDefaultPii` and collects user info, cookies, headers, bodies, query strings, DB query data and local variables by default; `dataCollection` turns each off.
- jsdom 30: jest-dom's `background` shorthand check no longer matches, so the face test checks `backgroundColor`. Vite 8 (only Vitest uses it). TypeScript 7 for the extension: typecheck, both browser builds and manifest checks pass.

## 2026-10-28 — Fewer dependency PRs, less CI per PR

- Owner: Dependabot PRs used too much CI. Five ecosystems on weekly schedules, majors kept separate, made about nine PRs a week; each ran the whole CI (two native image builds, e2e, tests), and strict branch protection made every merge rebase and re-run the rest (one PR ran 9 times).
- `dependabot.yml`: monthly; the app and extension npm updates share one minor/patch PR and one major PR (`directories`), with a 7-day cooldown; Actions, Gradle and Docker get one grouped PR each. Security updates are unaffected.
- `ci.yml`: a `changes` job reads the PR's files; PRs only under `apps/` or `extension/` skip the image builds, e2e, tests and site build (the extension job still runs for extension changes). `build` always runs and fails if `changes` failed. CodeQL ignores `apps/**`.
- Follow-up: the skip path first runs on the next app- or extension-only PR after merge.

## 2026-10-28 — More one-click installs: any server, Portainer, CapRover, Zeabur

- Owner: more one-click installs, with provider buttons where they exist. Buttons that keep a disk need either a file in the repo (Render, done) or a template published from an account (Railway, Zeabur); Koyeb's button can't attach a volume and DigitalOcean App Platform has no disk, so they're out. sslip.io isn't on the Public Suffix List (shared Let's Encrypt limits), so no-domain installs stay plain HTTP on 3000.
- `deploy/install.sh`: one command on any Linux server. Installs Docker if missing, runs `deploy/one-click` (no domain) or `deploy/vps` (Caddy HTTPS) from `/opt/adhx`, keeps settings in `.env`, makes a setup code, waits for health and prints the setup link (or "up to date" once owned). Re-running updates; adding a domain keeps the data.
- `deploy/cloud-init.yaml`: paste into User data (Hetzner, DigitalOcean, Vultr, Linode); writes the `.env` and runs the installer.
- Portainer app-template URL, CapRover one-click template, Zeabur template (owner publishes it for a button). `appUrl()` reads `ZEABUR_WEB_URL`.
- `install-recipes.yml` (only when these change): builds the branch image, installs with no domain, claims ownership, re-runs with `ADHX_DOMAIN=localhost` and checks the owner, data and HTTPS survive; `check-install-templates.rb` checks every template's image, port and `/data`.
- Follow-ups: publish the Zeabur and Railway templates; submit Coolify/Dokploy/CasaOS/Runtipi listings. All need a release that includes the one-click setup.

## 2026-10-28 — A public read-only demo at demo.adhx.com

- Owner: a hosted example so people can try ADHX before installing, on Fly at demo.adhx.com, led by someone other than Pete.
- `deploy/demo`: the ADHX image plus the showcase world (credited posts, renamed lead Sam via `PARITY_DEMO=1`), reseeded at every start and every 24 hours by `start.sh`. `gate.ts` in front of the app refuses every non-GET and the GETs that start X sign-in or sync; network fetches point at a dead origin, so the demo can't download anyone's videos.
- `DEMO_MODE=1` (`src/lib/demo/`): visitors without a session are the demo person; `DemoBar` shows a pill and, only after your own tap, a "saving is off" note.
- Search is words only in the demo (no models); real vectors for search by meaning are a follow-up.
- Links: README top and the adhx.com hero (site not republished).

## 2026-10-28 — One-click installs: ADHX sets itself up

- Owner: make installing as quick as possible, one-click on Docker hosts and elsewhere, plus a hosted demo (the demo is a separate PR).
- A fresh install needs no settings: `serverSecret()` makes and keeps `/data/session-secret`; `appUrl()` takes the address from the env, the host (Render/Railway/Fly/Coolify) or the one the owner set up from; production without email holds sign-in links for the admin; session cookies drop Secure on plain-HTTP addresses so home servers by IP work.
- `/setup` ("Make this ADHX yours"): the setup code from the log (or `SETUP_CODE`) plus an email makes the owner and signs them in. A fresh `/` and `/start` go there.
- Installs: `docker run` one-liner (README and adhx.com), `deploy/vps` (Caddy HTTPS), `render.yaml` button, `deploy/fly`, `deploy/railway` recipe, `deploy/one-click` Compose for Portainer/Dokploy/Coolify/CasaOS/Synology/TrueNAS, Unraid template, Umbrel app folder. Container smoke now runs a nothing-configured install through setup and a restart.
- Checked: a production build on an empty folder went setup → owner → name → admin console; a wrong code was refused; setup closed afterwards.
- Follow-ups: the one-liner, buttons and site command need a release first (2.8.4 still requires `SESSION_SECRET`), so publish the site after it. The Railway template and Umbrel/Unraid store listings are owner submissions.

## 2026-10-28 — adhx.com shows the real apps

- Owner: update the site with the latest web and phone app shots and drop the "Download the 30-second tour (MP4)" link; the promo film goes in the README.
- `PARITY_SHOWCASE=1` re-skins the parity world with the site's credited posts (`e2e/parity/showcase.ts`), names channels to fit and skips the boards' in-flight jobs. Ten shots (web, iPhone 16 Pro, Galaxy A13) are in `site/public/shots`.
- The hero, every feature and the apps section now show those shots (`site/components/Shots.tsx`); the drawn feature mock-ups and unused frames are gone. Home's copy mentions the Everyone, Friends and Mine switch; the apps list, sending to a friend.
- Moment naming no longer picks prepositions ("Across") as a moment's name.
- README: the promo film (exported, re-encoded to 8.3 MB at 720p30 for GitHub's 10 MB limit) plays inline at the top as a user-attachments video; the web screenshot moved into More screenshots. The site is not published.

## 2026-10-28 — Android Connect: the button and the other ways in, both in view

- Fix 9 (PR 639) hid "Use a pairing code instead" while the keyboard was up; a fresh install opens Connect with the keyboard up, so pairing by code was hidden at first sight.
- The other ways in stay pinned again; each form's main button (Email me a code, Sign in, Connect) scrolls into view once the keyboard has slid in (`inViewAboveKeyboard`, `ConnectScreen.kt`).
- Checked on the Galaxy A13: email and type-the-code forms with the keyboard up, then a real pairing.

## 2026-10-28 — Attach a sideloadable iPhone IPA to every release

- New `.github/workflows/ios-sideload.yml`, called by Release Please (and by hand): builds `adhx-<version>.ipa` at the tag with `make-sideload-ipa.sh`, bundle id `com.adhx.share` like Android. It checks the signature, version and App Group entitlement, then attaches it with a SHA-256. No secrets.
- The script now passes extra `SETTING=value` arguments to xcodebuild. `native.yml` builds the IPA on every app PR so the script can't rot.
- The install guide, adhx.com/install, the iOS README and `docs/releasing.md` now point at the release asset. Tags up to 2.8.2 lack the script, so the first IPA comes with the next release.
- Checked locally: the job's build and checks pass and actionlint is clean. It can only be dispatched once it's on main, so the first real run is the next release.

## 2026-10-28 — Guide to installing the phone apps without a store

- New `docs/install-phone-apps.md` and adhx.com `/install/`: Android APK from Releases; iPhone via TestFlight, AltStore PAL in the EU, SideStore elsewhere; then connecting. Linked from README, both app READMEs, docs index, the site's nav and Apps section, and Settings → Phone app's fallback links.
- EU: Apple's Web Distribution needs financial-standing proof a self-hosted project usually lacks, so AltStore PAL (notarized, 5% only on sales). Rest of world: SideStore (free Apple ID, one-time computer, on-phone weekly refresh) over AltStore Classic, paid certificates and Xcode.
- SideStore/AltStore rename the App Group to `group.<prefix>.<TEAMID>`; `AppGroup.id` now falls back to the signed group (`ALTAppGroups` or the embedded profile) so the share card still sees the connection. swiftc suite added to CI; simulator build passes. Not yet tried on a phone through SideStore.
- `apps/ios/Config/make-sideload-ipa.sh` builds an ad-hoc-signed `.ipa` keeping the App Group entitlement (verified locally).
- Still missing: releases attach no `.ipa`, TestFlight secrets aren't set, and nobody has published an AltStore PAL source. The guide says so and lists the owner steps.

## 2026-10-28 — Accept the unfixable deepmerge advisory on its one path

- The dependency audit started failing every branch on GHSA-gcqx-w48m-w2h4 (low, `deepmerge` prototype poisoning). No release fixes it, and it arrives in production through `react-email` → `@react-email/render` → `html-to-text`, which `render` imports at the top, so it can't be dropped.
- `html-to-text` only merges its own options for the plain-text sign-in emails, so no request data reaches the flaw. Owner chose a narrow exception.
- `check-dependencies.mjs` now keeps its exceptions in one `EXCEPTIONS` list. The deepmerge one applies only on that exact path, only while no fix exists, and until 31 Dec 2026. Tests cover another path, no paths, a released fix and expiry.
- Follow-up: drop it when deepmerge or html-to-text ships a fix, or when react-email stops depending on it.

## 2026-10-28 — Device run, part two: the remaining journeys

- Ran the rest of the phone journeys on both devices (send, original post, Up next, whose-saves filter, invites, picture, offline share, rotation, labels, IPv6 reconnect). Rows in `docs/rollout/phone-device-results.md`.
- Fixed: no × on the Send sheet (both apps); Android saying "0 MB" for files under a megabyte (`SendSizeTest`); iPhone Connect and email fields read by VoiceOver as their placeholder.
- Driver: XCUITest's wait-for-idle is skipped (a playing video never idles); fields are found by placeholder too, and `clear`/`type` tap a field's end so the cursor follows its text.
- Then email sign-in on both (the dev server logs the code), Android rotation and Safari share passed; email sign-in found one more: Android's keyboard hid "Email me a code" (the other ways in now step aside).
- Driver can't open a share extension from the share sheet (the card needs a real tap); `drive.mjs` keeps typed values as text so 6-digit codes survive.

## 2026-10-28 — Drive real phones; first device run fixes five bugs

- Owner connected a test iPhone 16 Pro and a Galaxy A13 and asked for every journey tested on them, with bugs fixed.
- New `e2e/devices/`: a `DeviceDriver` UI test (own scheme) that takes commands from `hub.mjs`, `ios.sh` to build/run it, and `drive.mjs` for both phones (adb on Android). The parity server gains LAN mode (`PARITY_HOST`, `PARITY_PUBLIC_ORIGIN`) and `pnpm parity:pair <member>`.
- An iPhone on USB reaches the Mac over the CoreDevice tunnel (`[<tunnel>::2]`); XCUITest element queries stall on live camera/video, so the driver finds elements in snapshots and taps coordinates.
- Fixed: iOS Home playing under the welcome; iOS/Android videos skipping on while React/Send was open (Android also kept the picker over the next post); iOS IPv6 address display/round trip (`ServerAddressTests`); Android share card repeating its heading. Results: `docs/rollout/phone-device-results.md`.
- Follow-ups: the remaining acceptance rows (channels, Live, send, original, invites, picture, rotation, offline queue, accessibility).

## 2026-10-27 — Home's filters play the latest; For you stops repeating its opener

- Owner: after sharing a few things they wanted everyone's (or their own) latest posts, and Home kept opening on the same video.
- Why: Everyone, Friends and Mine were score-blended, and on web and phones Everyone was only reachable as New. Once nothing unseen was left, the lineup's For you put watched posts in a fixed taste order.
- Everyone, Friends and Mine are now the latest saves, newest first, seen or not (Mine by your own save time; no scores or variety; why lines unchanged). The Whose saves switch is New · Everyone · Friends · Mine on web, iPhone and Android ("Friends only" is now "Friends").
- For you: unwatched first by taste, then watched posts, the one last watched longest ago first. "Last watched" is the later of `post_views.seen_at` and `post_watch_counts.last_at` (`lastWatchedAt` in `src/lib/feed/views.ts`), so a replay counts.
- Checked: unit and API tests, the iOS simulator and Android builds, Android unit tests, and the web switch in Chromium on an isolated server. Not checked on a phone.

## 2026-10-26 — Waiting sign-in links open the card that holds them

- An admin's avatar menu ("1 sign-in link waiting") linked to `/admin#sign-in-links`, but the held links are on the Invites page, so the owner couldn't find a friend's link.
- The menu now opens `/admin/invites#sign-in-links`; the Sign-in links card is a labelled section with that id (`SIGN_IN_LINKS_ID` / `SIGN_IN_LINKS_HREF` in `src/lib/next-ui/routes.ts`).
- Checked in Chromium against an isolated server with `EMAIL_LINKS_TO_ADMIN=1`: the item lands on the card with the link and Copy link in view. Component tests cover the href and the card.
- The phone app's emailed 6-digit code still needs real email (Resend or SMTP); on an admin-held server, phones connect with the pairing code.

## 2026-10-25 — Refresh all shipped Brotli decoders

- The assembled ARM64 scan found fixable Debian/Python Brotli advisories in cached runtime layers.
- Pin the Node security release26.12.1, require Debian libbrotli1’s security floor and pin the downloader’s Python Brotli1.2.1.
- Both native container checks verify installed decoder versions and Python round-trip behavior; high/critical scanning stays required.
- Keep generated local Next route paths out of the patch. Image verification is CI-only; nothing deployed.

## 2026-10-25 — Remove the iOS reaction fixture’s scheduler race

- Hosted CI exposed a fixed700ms wait racing the production600ms replay delay.
- Wait for bounded transport/result conditions instead, retaining connection-isolation, failed-refresh and cancellation assertions.
- No production model behavior changed.

## 2026-10-25 — Align the in-app privacy explanation

- Match the privacy page and canonical guide to media revalidation, immediate orphan denial and watch-retry receipt retention.
- Source documentation only; no change to access policy or live deployment.

## 2026-10-25 — Close pre-launch privacy and delivery gaps

- Deny orphaned retained files; quote access follows a live, same-owner parent, including private ownership and moderation.
- Revalidate shared media with ETags and version new URLs past old long-lived cache entries; recheck access after download/poster waits.
- Bound web file prefetch to one transfer and 64 MiB; cancel abandoned speculation, preserve shared consumers, stream larger downloads with clear feedback.
- Keep Mac inference leases across note/privacy/bookkeeping edits; real public content or retained-media replacements still cancel stale work.
- Recheck approval and bans for queued shares before upstream work and commit; blocked owners cannot publish in-flight saves.
- Persist immutable watch batches on web/iOS/Android; account-scoped atomic receipts deduplicate ambiguous replies and survive restart. Older clients remain compatible and need updating for receipt protection.
- Update fast-uri locks; add privacy, resource, queue, receipt, migration and native transport regressions. Source work only, no deployment or cookie-refresh service.

## 2026-10-23 — Recover browser CI from stalled package downloads

- The hosted Ubuntu Azure mirror exhausted the browser-install timeout before tests ran; a fresh runner was also slow.
- Use Ubuntu's primary archive for this job's mirror list, retaining signature verification, the bounded setup step and all Chromium/WebKit tests.
- No application, deployment or household configuration changes in this CI adjustment.

## 2026-10-23 — Combine realtime, query and review fixes for release

- Integrate the native/web streams with current design tokens, watcher/query indexes and the nine review fixes.
- Preserve all worklog entries and both native CI regression groups; revalidate this combined release candidate.
- Release and NAS installation remain separate from this integration commit.

## 2026-10-23 — Integrate query indexes with the review fixes

- Preserve the post watcher lookup and the user/recent-view index while merging the shared design system and feature-review fixes.
- Keep both worklog histories and revalidate the combined migration, naming and native/API paths before release.
- No live migration or deployment in this commit.

## 2026-10-23 — Refresh feature-review fixes for release

- Merge current main, preserving the shared design tokens, watch counts and CI improvements alongside the nine review fixes.
- Resolve the append-only worklog conflict by retaining both sets of entries; application/native changes merge together.
- Revalidate the integrated head before the requested release; no deployment in this commit.

## 2026-10-23 — Design system, phase 1: one set of tokens on web, iOS and Android

- Owner asked for one design system for web and phones; the design system artifact (tokens, guide, components) is the reference. Phase 1 moves the foundations.
- Colour tokens now have the same names and values everywhere: web `--nx-<name>` / Tailwind `nx-<name>`, iOS `Theme.<name>`, Android `AdhxColors.<Name>`. Web renames: `nx-ink` → `nx-bg`, `nx-soft` → `nx-ink-soft`, `nx-muted` → `nx-ink-faint`, `nx-skeleton` → `nx-placeholder`, `nx-on-cream` → `nx-on-cream-soft`; `nx-ink` is now the words (#f4f1ea, replacing `text-white`). Added sheet, raised, plate, line, good, warn, live, danger, watching, paper, people, moments; bracketed hex literals with a token value became the token.
- Value fixes: Android cream #f2ead9 and faint #a89f8d, the web's #a39b8b faint, the iOS hairline split into `hairline` (#2a2620, dividers) and `line` (#4a453e, controls). Browser theme colour is `bg`.
- Small decided items shipped: selected tabs, segments and chips in cream (never yellow); one 48×28 switch on the web (`SwitchLook`), Android's large switch gone; 28-corner sheets on the web; serif floating words (20, three lines); reactions float 3.6s; Android shimmer and pulse stop under reduced motion.
- Larger migrations listed for the owner in the PR (web theater to layout C, tab renames, the cream words card, bottom nav, toasts, Gob moods, empty states).

## 2026-10-22 — Stream foreground Live across web and phones

- Replace native 5-second room polling with Foundation/official OkHttp SSE invalidations, coalesced serial snapshots, reconnect resync and legacy REST fallback.
- Web reconnects recover missed snapshots/posts; hidden tabs close streams, startup buffers are bounded and expired animation timers are removed.
- Bound server output and stream lifetimes, fail closed on mapping/visibility failures, and bridge planned reconnects with short credential-scoped presence grace.
- One shared durable-revision check catches worker-side changes for all phone subscriptions; retain existing progress, pairing, alert and worker polling.
- Added transport/lifecycle/privacy/backpressure regressions and native CI coverage. Simulator/JVM builds are not physical-phone network verification.
- In flight for review only; no deployment. Protocol, package choices and real-device follow-ups: `docs/realtime.md`.

## 2026-10-22 — Indexed shared queries and bounded feed hydration

- Audit web/phone server helpers with synthetic growth fixtures and production SQL plans.
- Batch exact owner/platform/post keys; hydrate 40 posts in 8 statements instead of 86, preserving privacy and order.
- Align recent-save, watched, sends, tags, queue and cleanup indexes; remove shorter/duplicate aliases and maintain bounded planner statistics.
- Give FTS metadata a transactional rowid lookup with guarded backfill/cleanup; bound vector refresh pages and index recent inference failures.
- Build affinity from sets, page narrow reaction identities, and make Right now ties deterministic with platform/visibility-safe naming.
- Add plan/isolation/rollback/upgrade regressions and a linked database-performance guide with measured limits.
- PR work only. No release, live database change, deployment or worker-setting change.

## 2026-10-22 — Review new player, channel and downloader features

- Record exactly which tags a group keep inserted, with their generation time; leave never guesses from a matching/generated name, and duplicate keeps are idempotent. Re-saved copies stay. Older unrecorded keeps are preserved.
- Reject late/cancelled iOS people-row replies across posts and connection sessions; test the production model in native CI. Android combines saved/watched stickers and clears stale reply identities on refresh.
- Preserve temporary yt-dlp failures for retry; never keep a private/missing post's login-page image. Keep ordinary picture fallback.
- Index watchers by post for bounded reads; test an existing library's upgrade twice. Clamp narrow Android seek tracks and expose the screen-reader seek action.
- Regression and native/server/browser checks accompany the PR. No live deployment or physical-phone verification.

## 2026-10-22 — Watch counts: who sees what

- Owner decided: members see only their own exact counts ("watched 14×", their Wrapped); totals across everyone, without names, are fine. Written into CLAUDE.md, ARCHITECTURE, the phone spec and `src/lib/people/watch-counts.ts`. No UI yet.

## 2026-10-22 — Watch counts: the data for "watched 14×" and Wrapped

- Owner wants playful counters and a year-end ADHX Wrapped; counting only starts the day this ships, so the data layer goes first, with no UI.
- New `post_watch_counts` (plays, finishes, seconds, first/last time) per member, post and **UTC year** (the year is in the key so Wrapped reads one year; one member's count sums the years). Never pruned; account guard; cleared with the account and by Clear.
- `POST /api/app/watched` (phone key) and `POST /api/watched` (web) add batches, capped, only for posts the member can see. Read helpers in `src/lib/people/watch-counts.ts`: `watchCountFor`, `postPlays` (total without names, members who can see it, banned left out, hidden posts none), `watchYear` (posts, hours, most rewatched still visible).
- One counting rule set on web (`src/lib/watch/tally.ts`), iOS (`WatchTally.swift`) and Android (`WatchTally.kt`): a play is a pass from the top that plays 1 s; resume, seeks and scrubbing back aren't plays; native loops count by wrapping round. Unsent tallies persist per server+key across restarts.
- Open question for the owner before any UI: may members see each other's exact counts, or only their own? Totals are fine either way.
- Checked: API/helper/hook tests, Swift tally suite, Android unit test + debug build, iOS simulator build. Not run on a device: counts from real playback.

## 2026-10-22 — Bound media installs and reuse CI build caches

- A reported slow test job spent over 20 minutes fetching Ubuntu FFmpeg dependencies before tests started. Use a bounded HTTPS Ubuntu install with reusable signed package downloads and fresh APT metadata.
- Native AMD64/ARM64 PR images now reuse scoped BuildKit layers and the trusted release cache; website compiler and Android Gradle caches avoid repeated setup/compilation. Android tests explicitly rerun.
- Cancel superseded PR checks; bound media/browser setup and overall test/browser jobs. Keep image scans, native smoke tests, audits and test execution on every relevant commit.
- Release triggers/publication and deployed services are unchanged. Cache scope, cold-build limits and validation policy are documented in `docs/releasing.md`.
- In flight: installer regressions and workflow lint locally; hosted cold/warm cache checks required on this PR before merge.

## 2026-10-22 — yt-dlp fallbacks, and X's copyright takedowns say so

- Owner asked for the recommendations after the TikTok fix: yt-dlp wherever a mirror fails, and every network's login wall recognised. Builds on #624 (`YTDLP_COOKIES`).
- `isSignInOnly` now also matches Instagram "login required", Facebook "registered users", "you must log in" and yt-dlp's generic `--cookies… for the authentication` suffix; messages saying "private" are excluded (they stay "It's private on …").
- X takedowns: owner report https://adhx.weedauwl.me/velesxbt/status/2078459662014263551 (54-min video, posted 2026-07-18) played as a 500 and retried forever. Every variant and the m3u8 answer 403 `{"error_code":2,"error_response":"Dmcaed"}`: X took it down after a copyright claim before the backfill kept it. `isTakenDown()` reads ≤2 KB; the video and download proxies answer 410 "X took this video down after a copyright claim.", the keep worker skips such videos, keeps photos, and stops (NothingToKeep) when nothing's left.
- X fallback: collectTwitter asks yt-dlp when fxtwitter can't read the post (sign-in errors surface; otherwise the old reason stands). Saves: X (fxtwitter down, or gone with cookies set) and Instagram (no metadata) take yt-dlp's description, 8 s budget, video posts only; media comes when kept.
- Not verified with real cookies or a live protected account.

## 2026-10-22 — Nested corners everywhere, squircles on the phones

- Owner: a button inside a card should follow the card's curve (comment on canvas board 7.3), then "all buttons" and "all curves should be squircles".
- Rule: inner radius = container radius − gap − border, minimum 8, for elements along a container's edge or corner. Free-standing buttons (rail, header pills, chips, round icon buttons) unchanged. Written up in CLAUDE.md (Rendering and the theater).
- iOS: every Capsule `.continuous` (rounded rects already were); `PillButtonStyle(cornerRadius:)`; Live card (Tune in + mosaic 16), Live rows, resume/can't-play cards, settings cards, send sheet, react picker, share extension card.
- Android: new `ui/Squircle.kt` (continuous Bézier corners, 1.28× radius, clamped; unit-tested) for every rounded rectangle; same containers as iOS; buttons take an optional `shape`.
- Web: 36 next-design files (settings, theater sheets, Right now, channels, search, start, profile, doing, invite); `--nx-nest` for shared buttons. Admin console left as is.
- Canvas: 32 boards (108 values) plus 7.3. Checked: iOS simulator, Android emulator, web Right now and Settings on a parity server; builds and tests green.

## 2026-10-22 — TikToks only signed-in accounts see now save (and can download)

- Owner report: a TikTok shared to ADHX wouldn't download. It's one TikTok marks "may not be comfortable for some audiences": yt-dlp gets "Log in for access" and the tnktok mirror "Could not find an aweme play URL", so the save answered 404 "TikTok not available" and nothing was kept.
- Saves: when the mirror can't see a TikTok, yt-dlp describes it (10 s budget); if TikTok answers "log in", it's saved bare (author + id) so it's queued, instead of refused. Gone posts still 404.
- New optional `YTDLP_COOKIES` (a signed-in browser's cookies.txt): every yt-dlp run gets a private copy (yt-dlp rewrites the file), so saves and downloads can see these posts. Documented in `.env.example`, both Compose files and the NAS guide.
- The phone/admin reason now says "TikTok only shows this one to signed-in accounts." (was "It's private on TikTok."), and such posts never keep the page's preview picture as a photo.
- Not verified end to end with real cookies (no signed-in TikTok here); covered by unit/API tests and the real yt-dlp refusal text.

## 2026-10-22 — Phones: Home, and the player's layout C

- Owner: "New" became **Home** everywhere (phones, web nav, site, docs); the web theater's feed asks for `mode=lineup`.
- Layout C (canvas page 15, boards 15.7–15.10) on iPhone and Android: rail React · Save · Share · network · More (Save to phone moved into More); one bottom row clear of the home bar with the first saver's face (+N), a tall scrub line with a handle and the queue count that opens Up next. Gone: queue pills, why chip, note bubble, saver byline. Kept: "Ana sent you this" + Reply and For you's "Like … you kept".
- Tap the face → ✕ and everyone on the post with corner stickers (saved, reaction, watched) from new `GET /api/app/who` (`src/lib/people/on-a-post.ts`). Watched is new and visible to members who can see the post. Notes float up first, in the serif, like reactions.
- A From everyone channel's name is the keep/leave toggle; leaving is new `DELETE /api/app/channels/group/{slug}/keep` (`leaveGroupChannel`, drops saves only that keep added).
- Channels "taking too long": Made for you made the request wait for a rebuild (Jev naming) whenever stale. Now stale sets are served while rebuilding, and a first build (either kind) waits at most 6 s (`src/lib/channels/wait.ts`).
- Re-took the phone screenshots (phone-new.jpg → phone-home.jpg, new phone-who.jpg); site phone mock redrawn as C.
- Follow-up: the live server needs this release for who/leave; until then the face row shows savers only and leaving says the server needs an update.

## 2026-10-22 — Fix nine lineup and phone playback review findings

- Deduplicate recent/older lineup candidates; re-read sender eligibility, names and notes on every cached page.
- Keep first-seen times intact; record a bounded per-member sitting separately so replay-only visits count.
- Acknowledge newly sent posts again in each replacement phone feed session; keep pending retries within their account.
- Scope resume history to the server/credential, discard legacy unscoped positions and clear on disconnect; ignore late old-player writes.
- Preserve Android position while its decoder is released; renew iOS loading deadlines after retry/preparation and restore the prior pause state after Reply.
- Clear the iOS reply label on fresh empty/failed refreshes. Add server, production Swift helper/model and Android regressions, including native CI coverage.
- PR work only: no release, deployment, production data or processing-setting change. Physical-device checks remain separate.

## 2026-10-22 — Phones: pick up where you left off, Up next everywhere, reply, can't play

- Owner picked boards 14.2, 14.3/14.4, 14.5–14.7 and 14.8/14.9 from page 14 of the design canvas.
- Resume: positions of long posts (≥60 s, 15 s margins) kept on the phone only (300, 30 days); a post you left part-way waits paused under "Pick up where you left off?" with Resume / Start over. Back and app stop save it; the end forgets it.
- Up next: channels and search get a pill above the byline and a one-list Up next (dots for `isNew`, dims what you've passed, search says how each matched).
- Reply: a sent post gets Reply; it's a reaction on that post, so the sender sees it float up and in Reactions. "Pete replied · 2m" when someone else reacted in the last week. Playback waits while the sheet is open.
- Can't play: 404/410 (asked with the phone key, so the server's reason shows) → "Can’t play this one here", Open on the network (link), one row of Next now (3 s countdown, only with a next post) + Remove from my saves (new `DELETE /api/app/saves`, shared `removeSave()` with the web delete). Other failures or 15 s without a frame → "Couldn’t load this one", Try again / Skip it.
- Checked on the iOS simulator and Android emulator against the parity server. Not run: the 15 s can't-load path and the gone countdown with a next post; Start over not tapped on Android.

## 2026-10-21 — New on the phones is the lineup (boards 13.3 and 13.5)

- Owner ask: opening the app should always autoplay something, predictably: newest, then what you haven't seen, then topics from what you interact with. Picked 13.3 (the lineup) and 13.5 (Up next in three parts) from the design canvas.
- Server: `mode=lineup` in the blend (`lineup()` in `src/lib/feed/blend.ts`, pure). Just saved = unseen saves/sends since you last looked (`lastLookedAt`: newest view before a 30-minute gap; ≤48 h; 24 h on a first visit), Not seen yet = the rest of the 14-day window, both newest first; For you = others' posts you didn't save (unwatched first, then watched), closest to your taste, "Like … you kept" leading. Items carry `section`; pages carry `sections`. Pool also takes 300 older saves for For you.
- iOS + Android: New asks for the lineup (falls back to `new` on 400 `bad_query`), strip under the tabs, pill above the byline, Up next sheet (dots for unwatched, Now playing, sent posts say "Ana sent you this", tap to jump), badge counts unwatched Just saved + Not seen yet, and New restarts at the top after 30 minutes away.
- Checked: unit + API tests; iOS simulator and Android emulator against the parity server (strip, pill, sheet, jump, badge).

## 2026-10-21 — A post opened from the share card loops

- Owner: viewing a post from the share card should loop it. Open in ADHX now starts the player with Repeat on (iOS `PlayerScreen(startRepeating:)` → `PlayerExtras.startRepeating`, applied once so returning from a friend's channel doesn't switch it back on; Android `PlayerScreen(startRepeating = true)` from `PostLinkScreen`). Like the web, where a shared preview starts on Repeat one.
- Checked on the iPhone over Mirroring: shared an X GIF post from X, Open in ADHX played within ~1 s, still looping 10 s later with Repeat lit; the share card showed the GIF's still and @handle. Android compiles; not run on a device.

## 2026-10-21 — Repeat switched on after the end plays the post again

- Owner: setting Repeat one on a video at the end of a 1-of-1 queue should start it looping. It didn't anywhere: iOS `Playback` and Android's `REPEAT_MODE_ONE` only loop if set before the end, and the web theater sat on "That's all".
- iOS: `Playback.repeatOne` replays when the video already ran out (a tap at the end replays too); the photo timer reruns on Repeat and a one-photo post on repeat keeps going round (its key never changed, so it stopped after one pass).
- Android: turning Repeat on in `STATE_ENDED` seeks to 0 and plays.
- Web: Repeat (All or One) chosen at "That's all" replays the current post; All then goes round the queue (the menu steps Off → All → One, so All mustn't jump away). Component test added.
- Checked: iOS simulator (Me at the zoo ran out, Repeat on → plays and keeps looping), web component test, Android compiles.

## 2026-10-21 — Align the killed-runner rehearsal with bounded lease retries

- The large-queue CI rehearsal still required immediate reclamation of an expired job, contradicting the new retry policy. It now verifies one charged attempt, a future retry deadline, completion of another due post, then safe reclamation after advancing only the fixture deadline.
- Preserve the old-token rejection, fresh-lease completion, queue responsiveness, scratch cleanup and long-video coverage checks. No production settings or deployment changes.

## 2026-10-21 — Fix nine feature-complete review findings

- Isolate and bound iOS reaction memory by connection; invalidate in-flight responses at reconnect. Web and Android Reactions visits fetch fresh answers, while ordinary playback keeps its once-per-session behavior.
- Count abandoned understanding leases against the existing three-attempt retry budget; retain successful video checkpoints and cancel obsolete generations without penalizing new work.
- Safely decode invalid numeric entities, accept every supported post ID in player start links, and page the web Reactions queue beyond 50 with retry, deduplication and stale-request guards.
- Pause the same video beneath Original/Share; resume only previously playing, unchanged posts. Keep the StageVideo instance intact.
- Gate legacy poster maintenance and lazy generation to local, unpaused hosts; remote mode defers this maintenance (no poster job in the current Mac protocol). Publish unique repaired files with video/poster generation checks and clean rejected and replaced repair-owned files. Legacy download paths remain until post cleanup.
- Add route, component, queue, real-FFmpeg/JPEG, Android and production iOS-model regressions; wire the connection suite into native CI. PR work only; no deployment.

## 2026-10-21 — Share card shows the post; Open in ADHX plays at once

- Owner report from an X share: the Saved card's poster stayed blank and it said only "X"; Open in ADHX didn't play.
- Poster: `/api/files/…/poster` for a fresh X save waited up to 25 s for the download before handing over X's own still. `standIn()` now works out the proxy or stored picture first and only waits when there's nothing to hand over. The card's poster (`PosterImage`) loads with the phone key, asks again a few times and when the copy is kept, and shows the network's mark until it arrives.
- Card: network mark + who posted it (name, else @handle; VoiceOver hears "X, Lydia Kauppi") and up to three lines of the post's words, poster or not.
- Open: SwiftUI couldn't present a second full-screen player over one already up, and a screen under a player hears no `onChange`. `AppModel.open(_:)` → `OpenPostPresenter` presents the player from the top screen (retrying while a cold start comes up); players under it pause and stay paused on return.
- Checked in the simulator: card for X and YouTube, open from Home, open over an open player, cold start. Not yet checked on the iPhone.

## 2026-10-21 — Refresh the app, deploy and processing guides

- Rewrote the iPhone, Android and extension READMEs and the NAS/UGREEN/Mac guides to open with what it is and a 3–5 step quick start, then details and a troubleshooting table; checked commands, paths, env vars and routes against the code (Gradle 9.8.1, Node 26, pnpm 10, all seven iOS `swiftc` suites run and pass).
- Reflected 2.3–2.4: email sign-in by 6-digit code, change picture, invites, Remove this phone (`DELETE /api/app/me`), reactions on every post and the Reactions feed, the original-post sheet, landscape only while watching, the Settings version line, the per-release APK and TestFlight upload.
- Mermaid diagrams (with a one-line text summary) for phone sign-in/pairing, NAS topology, the Mac worker and the release fan-out; summaries added under the existing remote-processing diagrams.
- Specs and rollout docs got a status line (shipped / living / historical — superseded by …) instead of being deleted; stale phone-spec lines (send targets, invites on the web, rail order) fixed; acceptance checklist gained P15–P22 for the new phone features.
- Follow-up: the READMEs reference `docs/images/phone-*.jpg` screenshots from the parallel docs PR; check they render once both land.

## 2026-10-21 — Contributor, agent and architecture docs rewritten for the community

- Owner ask: a full docs review, usable by open-source contributors and agents, accessible, lightly funny.
- `CLAUDE.md` went from ~1,400 lines to ~530: rules first (privacy, access, X tokens, security, data, models, rendering, product words), a "where things live" map, short subsystem notes, commands, env, testing, CI. Retired-product detail (TheaterShell, `/trending`, leaderboards, library grid) is condensed into a History section; the long form stays in git history and older worklog entries.
- `AGENTS.md` is a crisp onboarding (read order, setup, verify, non-negotiables, what not to do) consistent with `CLAUDE.md`; the merge rule now says "don't merge on your own initiative: the owner merges or asks you to arm auto-merge; never the Release Please PR".
- `ARCHITECTURE.md`: a glossary, an "In words:" summary under all nine Mermaid diagrams, phone email-code sign-in added to the pairing sequence, the Android APK and TestFlight release jobs, and a fixed contradiction (Just for me-only kept files are owner-only, per `keep/file-access.ts`).
- `CONTRIBUTING.md` (prerequisites incl. FFmpeg, five-step setup, tests/e2e/parity, commitlint rules, hooks), `SECURITY.md` (current scope and hosting advice), `CODE_OF_CONDUCT.md`, the PR template and issue forms (no emoji names, existing labels only, a "where" dropdown) refreshed.
- Not done here: README, docs index, images, specs and deploy guides (handled in parallel PRs).

## 2026-10-21 — README rewritten for newcomers; setup moved to docs/self-hosting.md

- Owner asked for a full docs review: usable by an open-source community and by agents, accessible, a bit funny, with fresh images and diagrams.
- README is now a front door: what it is, screenshots (`docs/images/`, captured from the parity harness's sample friends, never real saves), the fourteen networks, a Mermaid "how it works" with a text summary, a five-step Run your own, saving, the phone apps (email sign-in, APK on each release, TestFlight), agents, local dev with a command table, and a documentation map.
- The long setup reference (sign-in links, who can sign up, settings, disk, search models, video formats, downloads, backups, Fly.io, X sync) moved verbatim to `docs/self-hosting.md` with the same headings, plus the phone's email-code sign-in and phone invites. `docs/README.md` lists every doc by what you're trying to do.

## 2026-10-21 — Upload the iPhone app to TestFlight on release

- Add `.github/workflows/ios-testflight.yml` (workflow_dispatch + workflow_call, input `version`), called from Release Please next to the Android APK.
- macos-26 runner, newest stable Xcode; archives the `ADHX Share` scheme at `v<version>` and exports with `destination: upload` using automatic signing + an App Store Connect API key (no fastlane, no profiles). Version = release, build = `github.run_id`; `stamp-version.sh` still reads the clean tag.
- Skips with a notice until seven secrets exist; `docs/releasing.md` lists them plus the one-time Apple portal steps (App IDs, App Group, one App Store Connect record).
- Validation: actionlint, shell syntax of every step, export-options plist lint, and a local Release build proving the command-line version/build reach both Info.plists. Never run against Apple (no secrets): signing and upload are unverified.

## 2026-10-21 — adhx.com shows real posts from the owner's ADHX

- Owner ask: the product site uses real images and video from their own server instead of its illustrations (reverses the earlier "no one else's posts" rule).
- Sourced only from the owner's server's public, anonymous Right now data (`/api/moments`, `/api/moments/{slug}`) and the kept files they link; no sign-in, key or cookie. The pool is mostly music tools, design and film; anything with innuendo, politics, health claims or private faces was left out.
- `site/public/media/`: 6 muted H.264 loops (3–6 s, ≤ 0.6 MB) with posters plus stills, 2.7 MB in all; `credits.json` lists each post's network, author, link and excerpt. `Post.tsx` (`PostMedia`, `Credit`) replaces `art.tsx`; `LoopVideo` plays only on screen and keeps the poster under reduced motion. Meme captions and the meme font were removed.
- Every post shows its network mark and @handle; the footer links all of them. Mock copy that described illustrations (titles, searches, file details, the vault's "gone from Instagram") now describes the real posts truthfully.
- The showreel uses the same posts and `adhx-reel.mp4`/`.jpg` were re-recorded (Playwright + Chrome, 1.3 MB). Publishing is still the manual Site workflow.
- Follow-ups: nearly every post is from X because that's what the public snapshot held; swap in other networks' saves when Right now has them.

## 2026-10-21 — Remove this phone works without the web

- Add `DELETE /api/app/me` (phone key): revokes only the calling key with the same `deleteAccessKey` as Settings → Phone app; afterwards that key is `401 bad_key`, other phones untouched.
- iOS and Android Remove this phone call it, then forget the key whatever the answer; a 401 counts as already removed. If the server can't be reached (offline, timeout, older ADHX), Connect says plainly the phone may still show in Settings → Phone app there.
- The "remove it on the web as well" dialog copy is gone. Spec and both app READMEs updated.
- Validation: phone-app API tests (own key only, repeat answers 401, other phones and accounts unaffected), Android unit tests + debug APK, iOS simulator build. Not exercised on a device.

## 2026-10-21 — Web theater matches the phones: original-post sheet, a quieter overlay, toasts in the pill's place

- Owner ask: the website should match the phone apps (iOS #592/#594, Android #596). Over a video or photo the overlay keeps only the why chip, a friend's note and who saved it ("You and Mum saved this · 1h"); the author/network line and the caption are gone. Text and article stages still show their words.
- Rail order is the phones': React, Save, Share, Download, the network's own mark (`NetworkIcon`), More. The mark opens `OriginalSheet` (`components/next/theater/OriginalSheet.tsx`): poster's picture else the mark in a round tile, name else handle else network (one letter or the network's own name counts as none), "@handle · Posted 18 Oct 2026" with the small mark only when the picture leads, all their words (links clickable) or a kept X article in full (`articleBlocks`, now exported from ArticleReader), Open on {network} and Copy link ("Link copied"). Frosted, rounded, focus-trapped, Esc closes; a bottom sheet on phones, centred on desktop.
- Player messages (`flash`) last 3 s, replace each other, and take the stage's top row: the pills there ("Shared with your people", "Kept on your ADHX", the via note, a moment's arrivals) step aside while one is up. Copy the text now also says "Words copied". `hasFullArticle` moved to `post.ts`.
- Tests: `theater-original-sheet.component.test.tsx` (name/handle/day rules, mark once incl. a broken picture, article, focus trap), the overlay/rail/sheet path in `next-theater`, the toast/pill swap in `feed-theater`; e2e previews read the words from the sheet. Checked on a parity server at 1280×800 and 390×844. Not seen live: a poster with a picture (the parity world has none) and an article in the sheet; the browser pane blocks the clipboard, so "Link copied" was checked with a stubbed clipboard.

## 2026-10-21 — No quote marks inside speech bubbles

- Owner: a friend's note "shouldn't be in quotes — that's implied by the fact it's in a speech bubble". The player's note bubble on iOS (`NoteBubble`) and Android, and Android's Reactions-tile words chip, now show the words bare. The web bubble already did. Quote marks stay where words aren't in a bubble (a friend's note card in a channel, the why sheet's "Pete sent you this: …" line) and in Android's screen-reader description, where they say the words were said.

## 2026-10-21 — Run CI and local development on Node 26 like the image

- The container moved to Node 26 while `.nvmrc` and every workflow `node-version` stayed on 24, so tests ran on a different major than what ships.
- `.nvmrc`, `ci.yml` (all seven jobs) and `site.yml` now use 26; README and CONTRIBUTING recommend 26. The engines range is unchanged, so 22.22.1+ and 24 still work locally.
- Workflows install pnpm with `pnpm/action-setup`, so Node 26 shipping without Corepack does not affect CI.
- Follow-up: the Mac worker docs still say ARM64 Node 24 (any version the engines allow works); bump them once the worker has been measured on 26.

## 2026-10-21 — iPhone matches boards 11.1 and 11.4

- Compared the built screens on the owner's iPhone (via iPhone Mirroring, against their 2.3.0 server) with design pages 11 and 12. Two board details were missing on iOS and are now in: the React picker's footnote "Kept on the post. Your people see it when they watch." (11.1; Android already had it) and the reactions queue's "Reactions · 1 of 12" pill beside Close (11.4; `PlayerScreen.position`, using the server's `total` from `/api/app/reacted`, which `ReactedPage` now decodes; Channels' count line uses it too). The other differences (Play all as a text link, the invite sheet sharing straight away) were judged better as built; the boards were updated to match instead.

## 2026-10-21 — Posters that aren't black (the History channel's black covers)

- The owner's History channel showed four near-black cover tiles over bright canyon and forest videos. Covers are each post's kept poster, and those posters came out black: a network's own thumbnail of a black first frame, or our grab one second in, inside a fade. (Sampled the public moments snapshot: 2 of 29 posters dark, both genuinely dark screen recordings, so it's specific posts, not every poster.)
- `posterFrame` (`src/lib/keep/poster.ts`) now tries a few moments (10% in, at least 1 s and at most 20 s, then 25%, 50%, then 1 s) and keeps the first that isn't dark (`brightness()` via sharp, ≥ 45/255), else the brightest; candidates are cleaned up.
- `repairDarkPosters()` runs once per server in the background when keeping starts (`keep_settings.poster_repair_v1`): every kept poster under 30/255 whose post has a kept `video-1` is remade, and replaced only when the new one is clearly brighter.
- Kept posters are now `max-age=3600` with an ETag (size + mtime → 304) instead of 7 days, so a remade poster reaches phones within the hour. Other kept files are unchanged.

## 2026-10-21 — iPhone crop title under the Dynamic Island

- Tested on the owner's iPhone (iPhone Mirroring): the picture crop screen's title "Move and pinch" sat under the Dynamic Island (only "M … h" visible). The full-screen cover lays the crop out from the very top, and hiding the status bar drops the top safe area there. The title is now padded by the key window's own top inset, less where the view starts, so it clears the island however it's presented. Pan and pinch, the round mask and Cancel checked on the device.

## 2026-10-21 — Review the complete dependency upgrade set

- Review six dependency PRs together: Actions, the Gradle wrapper, the Node container, Node typings, lint-staged and Vitest with its coverage provider.
- Preserve current application versions and security overrides when resolving older dependency branches; frozen installs and type checks guard each combined lockfile.
- Fix the Node 26 package-manager bootstrap, verify official Gradle checksums and document the stricter local toolchain requirements.
- Require fresh CI after each merge under the existing strict branch protection; the final combination also requests pinned-model inference on both Linux architectures.
- These source upgrades do not update a running deployment; a separately verified release image remains the installation boundary.

## 2026-10-21 — Upgrade Vitest and its coverage provider together

- Resolve the old dependency branch without replacing current application packages; lock Vitest and coverage-v8 to matching 5.0.5 releases.
- Migrate 28 fixture snapshot names for Vitest 5's table-title interpolation; every stored metadata value is byte-for-byte unchanged.
- Retain Vitest 5's defaults and document supported Node majors in the package engine range; no test is disabled or assertion weakened.
- Validation: all 3,705 tests pass in CI mode, type-checking passes and the matching V8 provider covers the real formatting utility (40 tests).
- The 10,000-post rehearsal passes worker termination/lease recovery, scratch cleanup and 1080p H.264 conversion; constant vectors isolate queue behavior.

## 2026-10-21 — Review lint-staged 17 and its toolchain requirements

- Resolve the old dependency branch against current main without replacing newer application dependencies; update lint-staged to 17.6.0.
- Declare its Node 22.22.1 minimum and document Git 2.32 plus the recommended Node 24 baseline in contributor and Mac setup guides.
- Keep the existing package.json task configuration; the optional YAML loader is unnecessary here. Full checks and a real pre-commit run gate the upgrade.

## 2026-10-21 — Make the Node 26 container upgrade buildable

- Bootstrap the exact reviewed pnpm version explicitly: Node 25+ no longer bundles Corepack. Disable bootstrap lifecycle scripts and retain frozen application installs.
- Keep build and runtime on the same Node 26 image so native SQLite modules share the runtime ABI; production still excludes package-manager toolchains.
- Extend the container guards for the bootstrap and matching runtimes; both architecture smoke tests and the normal application checks gate this dependency PR.

## 2026-10-21 — Review the Gradle 9.8.1 wrapper upgrade

- Verify the distribution and wrapper JAR against Gradle's official SHA-256 files; retain Java 17 and the existing Android plugin settings.
- Normalize the Windows wrapper in Git while preserving its CRLF checkout policy and the upstream script changes.
- Refresh the dependency PR against current main; Android compilation, regression tests and dependency audit must pass before merging.

## 2026-10-21 — Android: change your picture, invites, email sign-in and the reactions feed, with nothing opening the web

- Owner ask: the apps no longer lean on the web app. Coded against the shared decouple contract (server ↔ web ↔ iOS ↔ Android); the server routes were built in parallel.
- Change picture (`main/PictureSheet.kt`, `Picture.kt`, `PictureImage.kt`): Choose a photo (Photo Picker), Take a selfie (TakePicture into the FileProvider's `camera/`, CAMERA asked first since the manifest declares it), then a square crop (drag, pinch 1–4×, round preview; `CropMath`), sent as a ≤1024px JPEG with x=0.5, y=0.5, zoom=1 to `POST /api/app/me/avatar`; plus a Gob face (four colours), my X photo (409 `no_x_picture` said plainly) and Remove (`DELETE`). The connection's picture is replaced and `/api/app/me` re-read.
- Your face everywhere: `LocalMe` (`ui/Me.kt`) from the connection and `/api/app/me`'s `avatarSource`; `Avatar` draws your own picture whenever the face is you (`isYou` or your username), so Live reactions, savers, people and Settings all agree. A letter only when `avatarSource` is `generated`.
- Invites (`main/InviteSheet.kt`): Settings → Invite someone and Channels → Invite open one sheet: make a link and share it with the system share sheet, list live links (for whom, or their code), Share again (`POST /api/app/invites/{id}/link`, a fresh link: the list never carries links), Revoke; no Make button without `canInvite`.
- Connect: Sign in with email first (address + email → "Check your email for a 6-digit code" → code with the one-time-code autofill hint, auto-submits at six digits → `POST /api/app/signin/verify`, kept exactly like pairing via `connectWith`); bad_code / expired / busy / too_many / 404, and on sending no_email (a 503 read as an answer, not offline) / send_failed / too_soon (goes on to the code) in plain words (`EmailSignIn`). The pairing code is "the other way in".
- Reactions row at the top of Channels (`feed/ReactionsRow.kt`, `FeedViewModel.loadReacted`, `Route.ReactedPlayer`): posters with the last reaction's face and emoji, "12 posts with reactions", Play all; the player replays reactions and React works as on any post.
- Gone: every `openInAdhx` (Settings, the /settings#invite hop, More's "Open in my ADHX", "Open my ADHX" on My saves and Shared lately, Shared lately's fallback to the post's ADHX page, the share card's website fallback). Kept: Share an ADHX link, links inside posts, originals on their networks.
- Tests: `WithoutWebModelsTest` (shapes, multipart, routes), `WithoutWebLogicTest` (crop math incl. agreement with the server's `cropRect`, sign-in words and resend wait, `Me` rules, invite lines, reactions copy). End to end on the emulator against the server branch (feat/apps-without-web): email sign-in as Ana (wrong code, then the logged code; the field clears and keeps the keyboard after a miss), a cropped photo upload showing at once, a coral Gob, X photo's 409, Remove back to the letter, invites (make + system share, Share again, Revoke), a reaction floating with her own picture and the Reactions row ("1 post with reactions"). Found server-side: reactions on link-network posts with `~` in the id (`soundcloud:forss~flickermood`) answer 400 `bad_post` (`POST_ID` in `src/lib/reactions/parse.ts`). `docs/specs/phone-app.md` still describes the web hop for Change picture (left to the server PR).

## 2026-10-21 — Android: the network button opens the original post; toasts take the pill's place

- The player overlay no longer shows the network/author line or the caption; it keeps the why chip, a friend's note and the savers line (or the lock). A rail button with the network's own mark (above More) opens `OriginalSheet`: the poster's picture (else the mark in a round tile), their name (else handle, else the network), "@handle · Posted 18 Oct 2026" with the small mark only when their picture leads, all their words (a kept article in full, selectable, links tappable) or "No words with this one, just the video.", then Open on {network} and Copy link. It keeps the phone upright and holds the photo timer.
- On New and My saves the player's short messages show in place of the "N on their way" pill (`toastInTopBar`, `LocalPlayerToast`, `ToastPill`); everywhere else they stay where they were. Toasts last 3 s.
- Tests in `OriginalSheetTest` (name/handle/line rules, the mark once, the posted day). Checked on the emulator against a parity server: the overlay, the rail button, the sheet for a SoundCloud post without a picture, and "Link copied" replacing the pill for 3 s. Not checked: a poster with a picture, an article in the sheet.

## 2026-10-21 — Android: landscape for watching, full articles and aligned bylines

- The app is portrait everywhere (`android:screenOrientation="portrait"`); `OrientationHost` (`ui/Orientation.kt`) is a stack like iOS's: a player on a video, sound or photo says `MayTurn(true)`, every sheet, the React picker and the reader say `KeepUpright()`, newest wins (`SCREEN_ORIENTATION_USER`: sideways, never upside down, keeps the phone's rotation lock). Words posts and the end page stay upright.
- Sideways the player hides all chrome and the system bars (re-hidden when a closing sheet gives the focus back), shows the media whole whatever Fit video says, and taps only pause/play; swiping still moves between posts; turning back restores the chrome as it was.
- Kept X articles: `PhoneArticle.body` (optional) is parsed by `ArticleBody` (headings, lists, quotes, rules, bold/italic, links; pictures left out) and replaces the description and the post's own text in the words card and the reader.
- Byline: under the savers line the network mark is centred under the first face in a column as wide as the faces, so the poster's name starts where "You saved this" starts. HTML entities in post words and article titles are decoded on the phone (`Entities`) for servers before #588.
- Tests in `LandscapeArticlesTest`. Checked on the emulator: rotation on a video (bars gone, letterboxed, tap pauses, back to portrait with chrome), Search stays upright, a More sheet holds portrait until closed, the aligned byline. Not checked: an article body on screen (the test server doesn't send one yet).

## 2026-10-21 — Android: React on every post, replayed when you watch it

- The player has its own React (smiley at the top of the rail) on every post outside Live, with Live's `ReactPicker` (prompt "Say something"). Yours floats at once with your picture (`Connection.avatarUrl`), posts to `POST /api/app/reactions`, and is taken back with "Couldn’t send that. Try again." in the picker on failure (`PostFloats`).
- When a post settles, `GET /api/app/reactions` (once per post per run, `PostReactionsMemory`) and Live's floating faces replay the newest 12, oldest first, 350 ms apart from 600 ms after settling (`replayPlan`, `replayWait`); moving on cancels them. Live keeps its own room and doesn't replay. The photo timer waits while the picker is open.
- The picker's footnote now says reactions are kept ("Kept on the post. Your people see it when they watch."), since the server stores Live's too.
- Tests in `PostReactionsTest`. Checked on the emulator against a parity server with six seeded reactions: the replay, your 😂 stored with your face, the timer held under the picker, and the failure (server stopped) taking yours back with the message.

## 2026-10-21 — iPhone without the web: your picture, invites, email sign-in, the reactions feed

- Owner: "the app shouldnt have to rely on the web app any more". iOS side of the decouple contract (server routes built in parallel, coded against their shapes): `Shared/AccountAPI.swift` (avatar, invites, `/api/app/signin`, `/api/app/reacted`, multipart bodies via a new `send(…data:contentType:)`).
- Change picture is native (`App/Settings/PictureSheet.swift`): Choose a photo (PhotosPicker), Take a selfie (front camera; camera copy now covers both), a square crop with pan/pinch and a round preview (`AvatarCrop.swift`, sent as a pre-cropped JPEG, x=y=0.5, zoom=1), four Gob faces, Use my X photo (409 explained), Remove picture.
- Your face everywhere: `YourFace` (People.swift) holds `/api/app/me`'s avatarUrl/avatarSource, refreshed on activation and after a change; `Face` draws it for any saver that is you (isYou or your username), so Live's own reactions, savers, people and Settings all agree. Letter only when there's no picture (`generated`).
- Invites: Settings, Your people and Channels' Invite open `InviteSheet` (make a link → system share sheet; your live links with Revoke). Connect gains Sign in with email (address → email → 6-digit code, `.oneTimeCode`; bad_code/expired/busy in plain words); pairing stays.
- Reactions row at the top of Channels (`App/Feed/ReactedFeed.swift`); it plays the paged queue, replaying each post's reactions every time (`PlayerExtras.replayReactions`).
- No web hops left: More's Open in my ADHX, Shared lately's and My saves' Open my ADHX, Shared lately rows (player only), the share extension's Open (`adhx://open` or the post). Share an ADHX link stays.
- Checked: simulator build, `Tests/DecoupleTests.swift` (60 checks) and the existing suites. Not checked: against a live server (routes not on a branch yet) or on screen.

## 2026-10-21 — The phone apps without the web: picture, invites, email code sign-in, a reactions feed

- Owner: the apps shouldn't rely on the web any more. Server/web side of the shared contract (iOS/Android built in parallel): `POST|DELETE /api/app/me/avatar` (one handler with `/api/account/avatar`, `src/lib/avatar/handler.ts`), `GET /api/app/me` + `avatarSource`, `/api/app/invites` (+ `/{id}`, `/{id}/link`; own only; list `url` is null, links are shown once).
- Sign in on the phone: `POST /api/app/signin` emails a 6-digit code (`login_tokens` intent `phone`, new `attempts` column via guarded ALTER, HMAC-stored, 15 min, 5 wrong tries burn it, a stand-in code for unknown/banned/waiting addresses so nothing enumerates); `/verify` returns `pair`'s `{ key, name, username }`. Servers that only hold links for an admin answer `503 no_email` (pairing code stays the way in).
- Reactions feed: `reactedPosts()` (`src/lib/reactions/reacted.ts`) → `GET /api/app/reacted` and `GET /api/posts/reacted`; web plays it at `/play?reacted=1` from a new Reactions row on `/channels`.
- Faces audit: every saver/reactor/watcher path already used `memberAvatar`; added a test covering Live reaction events, post reactions, savers, members and the feed. Uploaded/Gob pictures are members-only `/api/files/avatar/<hash>`: phones must send the key when loading them, or they fall back to the letter.
- Docs: phone-app.md (API), PRIVACY.md + /privacy (code sign-in, the Reactions row), CLAUDE.md. Not pushed. Follow-ups: the apps' side (§6 of the contract); HEIC isn't decoded (phones send JPEG).

## 2026-10-21 — Reactions kept on every post, and replayed

- Owner ask: react on any post, not just Live, and see them again when you watch it. New `post_reactions` table (account-guarded, gone with Clear data / account delete) and `src/lib/reactions/` (parse shared with Live, one rate budget). Web `GET|POST /api/posts/reactions`, phone `/api/app/reactions`, `DELETE …/{id}` own only; shapes in `docs/specs/phone-app.md` → Reactions on any post.
- Visibility follows the post (`seenBy`): a Just for me–only post keeps its reactions to its owner; banned reactors never shown; hidden posts return none; nothing signed out. Live reactions are now stored too, with the id the room saw.
- Web: the React button is on every post in `TheaterV2` (signed out → `/start`); yours floats at once; `useReactionReplay` floats the newest 12 when a post settles (600 ms, 350 ms apart, once per post per page load). PRIVACY.md and /privacy updated.
- Follow-ups: the iOS and Android players against the same contract (separate work).

## 2026-10-21 — Android: fit and dock, logo bylines, tappable links, hold to hide, photo timer

- Player (`PlayerScreen.kt`): Sound and Fit video are remembered in `SettingsPrefs` (`soundOn`, new `fitVideo`), as on iPhone. Videos now fill the screen by default (the old upright-fills/wide-fits rule is gone); Fit shows them whole. More's picture-in-picture row is now "Dock".
- Byline: the network's mark before who posted it (`bylineName`: name, else the network's name, else the handle) instead of "YouTube · name".
- Links in captions, the words card and the reader are shortened to site/path and open in the browser (`Links.spans`/`Links.short`, `ui/LinkedText.kt`).
- Hold the stage to hide the chrome; a tap brings it back, the next tap pauses/plays. Photos show 10s each (`PhotoTimer`, `afterPhoto`): next album photo, then the next save; tap pauses; Repeat loops the post; held while a sheet/picker is open. Progress uses the video line.
- Search words tiles: serif words on a surface card below the pills (no more clipped first line), author and savers at the bottom. Channels → Your people: fewer than five sit left with a 14dp gap. Send sheet: "Send via" with WhatsApp (falls back to the share sheet), Copy (the ADHX link) and More.
- Unit tests in `PlayerPolishTest`. Checked on the emulator against a parity server: mark bylines, hold/tap/tap on a video and a photo, album advance and pause, Fit and Sound kept in prefs, Dock row, send sheet (Copy, WhatsApp falls back to the share sheet), search words tiles, five people spread. Not seen there: links in post words (no linked posts in the seed) and fewer than five people.

## 2026-10-21 — iPhone: the network button opens the original post; toasts take the pill's place

- Owner: "in most cases, the user doesn't care about the original post". The overlay now has only the why chip, a friend's note and who saved it; the network line and the caption are gone. A rail button with the network's mark (above More) opens `OriginalSheet`: who posted it (picture, name, handle), when, their words in full (a kept article whole, selectable, links tappable), Open on {network} and Copy link. Default rail spacing is 10 now there's one more button.
- On New and My saves, a player message ("Words copied") takes the "on their way" pill's place for 3 s instead of stacking under it (`PlayerToastUp` preference; toasts last 3 s everywhere).

## 2026-10-21 — Landscape for watching; full articles, words and tiles on phones

- Landscape is only for watching (iOS `App/Orientation.swift`): the plist allows landscape, `AppDelegate` answers from `OrientationGate`, where each player says "may turn" while it's showing (`mayTurnToWatch()`) and anything over it says "upright" while it's up (`uprightWhile`: board sheets, More, the reader, the send sheet, a friend's channel). Newest wins; losing landscape turns the phone back. Turned sideways the player hides its chrome, fits the media whole and taps only pause; turning back restores the chrome. Debug: `-adhxTurn landscape -adhxTurnAfter 6`.
- Phones get the whole kept X article as markdown (`article.body`, from `articleContent` via `articleBlocksToMarkdown`); iOS draws it (headings, paragraphs, lists, quotes, inline bold/italic/links, pictures left out) in place of the summary. The save result and Shared lately decode entities too; iOS also decodes them itself for older servers.
- Search words tiles were drawn under the opaque surface colour (dark on dark): the cream is now the tile's base. The byline's network mark sits in a column as wide as the face above, so the poster's name lines up with "You saved this".

## 2026-10-21 — Frosted sheets on iPhone; which build is installed, in Settings

- Sheets over the player are frosted (`FrostedSheetBackground`: ultra-thin material under the surface colour at 72%), so the picture shows through softly: More and In your saves (system sheets, via `frostedSheet()`) and every board sheet. On iOS 26+ the system sheets no longer force a 28 pt radius, so their floating corners follow the screen's own curve. The two remaining non-continuous rounded rectangles are now continuous.
- Settings on both apps shows which release the build is, on its own line: "ADHX Share 2.2.0" on a tag, else "2.2.0 +3 · abc1234" (commits after the tag), " · edited" with uncommitted changes, the commit alone without tags. iOS: the "Stamp version" build phase runs `apps/ios/Config/stamp-version.sh` (git describe → `build-info.txt` in the app's resources; user-script sandboxing is off for the app target so it can read git). Android: `gitBuildName()` in `app/build.gradle.kts` sets `versionName` unless `ADHX_VERSION_NAME` is given (the release APK workflow).

## 2026-10-21 — iPhone: React on every post, replayed when you watch it

- The player has its own React button (smiley at the top of the rail) on every post outside Live, with the same picker as Live (`ReactPicker`, moved with `FloatingReactions` into `App/Library/Reactions.swift`). Yours floats at once with your picture (`Store.avatarUrl`), posts to `POST /api/app/reactions`, and is taken back with "Couldn’t send that. Try again." on failure.
- `PostReactionsModel` replays a post's stored reactions when it settles (`GET /api/app/reactions`): the newest 12, oldest first, 350 ms apart after 600 ms, once per post per run of the app. Live keeps its own room and doesn't replay (its reactions are stored by the server since #589).
- Verified in the simulator against the parity server: the replay request, the picker, and your 😂 floating with your face.

## 2026-10-21 — iPhone player polish from on-device testing

- Hold the stage to hide everything but the media; a tap brings it back; a tap with the chrome showing pauses (`tapOrHold`: the hold never also counts as a tap). Photos move on by themselves after 10 s each (`PhotoTimer`: next photo in an album, then the next post; Repeat loops), with the bottom progress line, paused while a sheet or Live's picker is open or after a tap.
- The byline is the network's mark then who posted it (just the mark when no one's named); Live's savers line no longer ends with the network's name. "Small window" is now "Dock".
- Links in post words are tappable and shown short (`LinkedText`). `toPhonePost` now sends `postBody()` (t.co swapped for where it goes, entities decoded), which moved to the plain `src/lib/feed/post-body.ts` so server code can use it.
- Search/channel tiles with no picture are the web's cream words card (chip and meter above the words, never on them).
- Send via (was "Send with"): WhatsApp (its own `net.whatsapp.*` open-in route; an album or no WhatsApp falls back to the share sheet), Copy (the file itself on the clipboard), Files, Save to Photos, More. Messages/Mail composers removed.
- Not checked on screen: search tiles (the parity server runs without the query process) and WhatsApp (not on the simulator).

## 2026-10-21 — Phones: no why chip repeating the byline; your face on your reactions

- iOS and Android hide the why chip when its only reason is `fresh`/`yours` ("Ana saved this · 1d") and the post has savers, since the byline under it already says that. This matches the web's rule in `TheaterV2`.
- `GET /api/app/me` now returns `avatarUrl` (`memberAvatar`, so it's null for the generated icon). The apps store it (iOS `Store.avatarUrl`; Android `Connection.avatarUrl`, encrypted with the rest) and use it for your own reactions' faces in Tune in. Live's `watchers` leaves you out, so those faces had always fallen back to your initial. A server without this change still shows the initial.

## 2026-10-20 — A signed Android APK on every release

- `.github/workflows/android-release.yml` builds the release tag's app with `assembleRelease`, signs it with the owner's key from four repository secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, optional `ANDROID_KEY_PASSWORD`), checks it with apksigner and attaches `adhx-<version>.apk` + `.sha256` to the GitHub release. Version code = major×10000 + minor×100 + patch.
- Release Please calls it after creating a release (explicitly, like the image publisher, since `GITHUB_TOKEN` releases fire no events); it skips with a notice until the secrets exist. Manual: `gh workflow run android-release.yml -f version=2.2.0`. Friends install from the latest release page or Obtainium. Verified locally with a throwaway key: signed, versionCode 20200 / versionName 2.2.0.

## 2026-10-20 — iPhone: sound and fit remembered, people row, 720p

- Sound: the player's sound button now sets "Sound on by default" (`Playback.setSound`), so turning sound on keeps it on for every video, every feed and after a restart, until it's turned off. Open players follow the change (`Playback.choicesChanged`), and so does Settings' toggle.
- Fit video: a new More toggle beside Sound. Off (the default) fills the screen like the boards; on shows each video whole at its own shape. Remembered in `Prefs.fitVideo`; the poster follows it too. Checked in the simulator: both choices carried to the next video and were saved.
- Channels → Your people: fewer than five sit together from the left (a lone face and Invite drifted apart before); five spread across the row as on the board; more scroll.
- The More sheet names video quality by the short side (720×1280 is 720p, not 1280p), as Android and the send sheet already do.

## 2026-10-20 — Right now: the lead card keeps its size on a busy server

- With many moments, every one stacked beside the lead, so the lead card stretched to their height and left a huge empty card (seen on real data: AI music beside six moments). Now two sit beside the lead, as on the board, and the rest wrap into a three-column row below (`SIDE_CARDS` in `RightNow.tsx`). Component test covers six moments.

## 2026-10-20 — Moment titles checked with the boards' real names

- The parity server names moments without the model ("Baby", "Dark"), so a proxy swapped in the boards' names ("Babies vs objects", "Sunday roast energy", "Kitchen synths") to check how they lay out on web, iPhone and Android. Every name fits on one line as on the boards.
- Mobile web Tuned in now has the boards' "In {moment}" chip over the byline (TheaterV2), and "Jo just saved one" moves below the top chips when LIVE and the watchers wrap onto two rows, instead of covering them.
- Live lead card, measured against j7-3 to within 0.5: iPhone's title uses `tightLines(32)` plus a small nudge. Android's uses `serifLineBox(32.sp, 30.4.sp)`, and a new `sansLineBox` trims Hanken Grotesk's taller Compose line on the meta line (22dp against CSS's 17.6). Both cards are padded 10, because the board's 2px ring sits outside its 8px padding while iOS `strokeBorder` and Compose `border` draw inside.
- Parity server limit: the babies moment drops out about 25 minutes after seeding, so capture j7 screens from a freshly started server.

## 2026-10-20 — Android Connected faces row includes you

- The j5-6 board's faces row starts with your own face. Android's left it out and listed every name. It now shows you first, then everyone else, up to 5 faces. `Copy.youAnd` stops at four names and then says "and N other(s)". Both now match the iPhone ("You, Ana, Jo, Ben and 1 other").

## 2026-10-20 — Connected screen has no header on Android either

- Android's just-paired screen (`main/ConnectedScreen.kt`) dropped its Gob + "adhx" + Search/Settings row, as iPhone and the updated j5-6 board have it: the welcome is its own moment and Start watching is the way in. The unused header Gob vector and the `onSearch`/`onSettings` parameters are gone.

## 2026-10-20 — Android: one-row header everywhere

- Caught up, Channels, a friend's channel and Live used the old two-row header (Gob + "adhx", Search and Settings/sliders, then a tabs pill). They now share the player's one row, as on iPhone: Gob (Settings), New · Channels · Live with New's 99+ badge, Search. `HomeHeader(overMedia)` is the only header: see-through pill over the player, surface (#1a1814) pill and Search on solid pages. `PageHeader` is gone.
- Tuned in shows only the LIVE row (LIVE, watching with you, Leave); New's row steps aside while the send sheet is up (`PlayerScreen(hideTopBarWhileSending)`). Content tops moved up to match (caught up, Channels, Live, a friend's channel).
- Checked at 390dp on a :3620 parity server against the iPhone captures (j2-1, j2-4, j3-3, j4-4, j6-3, j7-3, j7-4).

## 2026-10-20 — iPhone: swipe past a single photo

- In New, swiping up on a one-photo post didn't move to the next save: the photo sat in a paging `TabView`, which swallowed the vertical swipe. A single photo is now drawn without the pager (albums keep it). Checked in the simulator: the same 500 pt swipe from the middle of the photo stays put on `main` and moves on with the fix.

## 2026-10-20 — Phones keep sent posts past their own kind filter

- Both apps re-filter New by kind on the phone (for servers that ignore `types`), which dropped a sent text post #576 lets through on the server. `PhonePost.sentToYou` (a `sent` reason) now passes that filter on iOS (`FeedModel.load`) and Android (`FeedViewModel`), found by the Android parity re-check on final main.

## 2026-10-20 — Channel curation reconciled with current main

- Integrated the latest privacy, admin and phone updates without replacing their schema or documentation. Both admin counters and image-curation tables install together; account-reference regression expectations include both sets of guards.
- Image refinement now honours the admin processing pause; Clear data removes only that account’s private curation jobs. Regressions cover pause/resume without spending budget and scoped cache removal. Updated the new privacy page and policy for the separate image opt-in. No live service or private setting changed.

## 2026-10-20 — Optional image-aware generated channel curation

- In flight: `TYPESAFE_CHANNEL_IMAGES=on` plus a key enables background naming, conservative borderline checks, repeat spacing and channel cover-post selection for Made for you/From everyone. Default off; slugs, saves, files and manual/friend channels stay intact.
- One durable scoped queue/cache: one task/minute, 48 attempts/UTC day, 256 entries/7 days, max8 existing stills, 15s requests, three tries. No page waits, remote thumbnail fetch, FFmpeg or local inference for this pass.
- Upload only eligible public-source captions/posters/photos using opaque ids; private-only/quoted/hidden/banned/orphaned sources, saver details, notes, tags and extracted words stay out. Visibility/media/policy revisions and leases reject stale results; account deletion cascades private jobs.
- Known-name choices, confidence gates, a four-member floor, transitive duplicate spacing/cover diversity and collision fallback keep changes conservative. Poster-only/video posts cannot be excluded based on one still. Covers select existing posts, not new video frames; repetition checks are sampled, not exhaustive.
- Regression coverage includes opt-in, bounded transport, account/privacy races, original/path safety, budgets, restart/stale-claim recovery, uncertainty and no-loss playback ordering. A real synthetic-only eight-image request completed in ~0.5s; no real-library quality claim.
- README, architecture, environment/Compose examples and `docs/channel-image-curation.md` explain the opt-in cloud boundary and evaluation steps. No live service, private configuration or network was changed.

## 2026-10-20 — A sent post skips "What's in your feed"

- New's kind filter (videos and photos by default) hid text posts and articles someone sent you, so "Pete sent you this" never arrived for most people. A post with an unseen send now passes the filter in every mode that shows sends (`inFeed` in `src/lib/feed/blend-db.ts`); it isn't counted as "waiting". Found by the Android parity pass (#574).

## 2026-10-20 — Phone posters through kept files

- `posterFor()` (`src/lib/app/phone-app.ts`, behind Shared lately's `posterUrl` and On their way's `thumbnail`) now always returns an `/api/files/…/poster` path for Instagram, TikTok and X posts with a picture or video, so a kept poster shows instead of a network thumbnail that may be unreachable (iOS j8-5 showed placeholders).

## 2026-10-20 — iPhone: final design-parity pass

- Compared every phone board (j1-2, j1-3, j2-1–j2-4, j2-7, j3-3, j4-3, j4-4, j5-6, j6-3, j7-3, j7-4, j8-4, j8-5, the note bubble) side by side with the app in the simulator against a fresh parity server.
- Fixed: two-line serif headings now sit at the boards' 0.95 line height (caught up, Live, Connected, the share card via `tightLines`, iOS 26 only for wrapping text); the note bubble's tail is the board's 45° corner; "Saved together" in Why this one shows every saver's face; the tuned-in byline keeps the names whole and drops the network, then shortens the time; the send sheet's poster is upright 54×96 with the kind on a dark disc; the connected Gob's grin uses the board's own curves.
- Unchanged on purpose: one-row header, data-only differences (moment names, counts, order), system sheets.

## 2026-10-20 — Android: final phone-board parity pass

- Side by side of every phone board (j1-2/3, j2-1/2/3/4/7, j3-3, j4-3/4, j5-6, j6-3, j7-3/4, j8-4/5, the note bubble) at 390dp against a :3613 parity server.
- Fixed: words over the player and the search field fell back to Roboto (no `fontFamily`), now Hanken Grotesk; Instrument Serif headings set tighter than the font kept its full ascent/descent, so `serifLineBox` trims them to the CSS line box (share card title, caught-up title); the caught-up shadow is an ellipse, not a pill; Settings' Remove this phone / Decline are 36dp quiet buttons and the This phone card has the boards' padding and line heights; the share card's keep line and bar sit together at the poster's foot.
- Left as is: the one-row player header, data-only differences (moment names, counts, order), system UI.

## 2026-10-20 — Android: send text posts to your people

- Share on a text post or article now opens the send sheet too ("Sending the words"): Chat, Mail and More send its words, and "Or straight to your people" sends the post, as for videos and photos. Before, words went straight to the system share sheet, so text posts couldn't be sent to a member from the phone (board j4-4 gap).

## 2026-10-20 — Mac allocation tuning and isolated throughput experiments

- In flight: opt-in `SEMANTIC_MEMORY_PROFILE=compact` disables ONNX CPU arenas/patterns without changing the pinned model, precision, inputs or index version; standard remains the application default.
- Native M4 shared-host trials repeated a lower physical footprint (1.9–2.2 vs 2.6–2.8 GiB), with byte-identical CPU vectors; inference speed improvement did not repeat reliably.
- CoreML compiled but rejected absent-modality tensors at inference. Dispose the accelerated session before one warm CPU fallback; CPU failures still propagate. A vision-only prototype hit the memory guard and was discarded.
- Synthetic-only harnesses compare representative frames, batched FFmpeg extraction and one-batch-ahead preparation. These prototypes never enter production claims or change light/normal/deep sampling; quality/fairness/cleanup gates remain explicit.
- Optional TypeSafe image smoke test sends generated colours only; experimental typed judgments are not search vectors. No private media uploaded.
- Regression tests cover allocation options, runtime fallback, timestamp validation, representative coverage, exact batch/reference frames and abort/EOF cleanup. Setup/architecture docs link measured results and reproduction steps.
- No installed worker, server, queue, model cache, private credential or network setting changed. Release-matched rollout and real-library retrieval evaluation remain separate follow-ups.

## 2026-10-20 — Just for me privacy gaps closed

- **Send sheet** `has` counts shared saves only (`holders()` in `src/lib/sends/sends.ts`), so a Just for me save is never revealed; that person can simply be sent the post.
- **Just for me by default** now covers X sync (`saveBookmark(..., isPrivate)`, no pulse for private sync saves) and Keep this channel (`group-keep.ts`), like clones.
- **Admin-only reads**: GET `/api/activity`, `/api/trending`, `/api/analytics` go through `adminOnlyResponse()` (`src/lib/admin/only.ts`); `public/llms.txt` rewritten for a private friends server.
- **Kept files** (`src/lib/keep/file-access.ts`): a post whose only saves are Just for me is served only to an owner (session, phone key, or the post's HMAC `?k=` file token that `toPhonePost` and Shared lately add to the owner's own URLs, since AVPlayer/ExoPlayer send no headers), with `private, no-store`; anyone else gets the unsaved-post answer, and not-kept reasons are told to members only.
- **Lifecycle**: clear data and account delete drop the account's "saved" pulses and `auto_channels` (now account-guarded, 56 triggers); removing one save drops its pulse; `AFTER DELETE ON bookmarks` triggers remove a post's vectors, queue and keyword rows with its last save.
- PRIVACY.md, `/privacy`, ARCHITECTURE.md, CLAUDE.md and the NAS guide updated (on top of #567's rewrite, merged into this branch).

## 2026-10-20 — Whole-system docs brought up to the friends feed

- README: send to your people, notes, Show more / less, forming moments with "Tell me when it's live", Keep this channel, Getting it ready, `/doing`, invites with approval; phone app section matches the apps. Fixed stale setup lines (`ADMIN_USER_IDS` instead of `ADMIN_USERNAMES`, Android link default, PR wording, `INVITES` not passed by the Compose examples) and the garbled `KEEP_H264` comment in `.env.example`.
- ARCHITECTURE.md rewritten around the current product: nine Mermaid diagrams (system context, save to watch, the New blend, live moments, who sees what, phone pairing and auth, plus the kept sign-in, understanding and search diagrams with quoted labels), every table by plane checked against `schema.ts`/`migrate.ts`, sections on New, sends, moments and bells, channels, invites and approval, the phone API. `TheaterShell`, Discover and the X-first flow removed or marked legacy.
- PRIVACY.md and `/privacy` rewritten from the code: who sees what per data kind, notes, sends, viewing marks, weights, reactions, bells, invites, approvals, phone keys, avatars, kept files (unauthenticated, cached 7 days, existence visible), the Mac helper, Jev, analytics, admins, retention, clear vs delete.
- CLAUDE.md top is now a ~25-line current overview with links; legacy sections are marked (history), the dead old-Header section is gone, test count is 3,558. AGENTS.md and `docs/remote-processing.md` overview lines corrected.
- Privacy gaps found and documented, not fixed: the send sheet's `has` counts private saves; admin counts include private saves; kept files serve "Just for me" posts and reveal whether a post was saved; X sync and Keep this channel ignore Just for me by default; `GET /api/analytics` is public; Clear keeps `activity.user_id`; `auto_channels`, `post_embeddings` and `post_text_fts` outlive deletion.

## 2026-10-20 — The admin area, to the "10 · Admin" boards

- `/admin` is now nine sections plus a person page (`/admin/people/{username}`) in the new design (`components/next/admin/`, `AdminShell`: NxHeader + Admin chip, a section nav that's a chip row on phones). Server pages read `src/lib/admin/boards/*`; `GET /api/admin/boards/{board}` returns the same. The old Matter `AdminClient` is gone; every capability stayed (hide/show, ban/unban, clear notes, invites, sign-in links, playlist hide, the log). Spec: `docs/specs/admin.md`.
- Privacy: Just for me saves are counts only (lists come from `postCards`/`sharedSavers`, shared saves only; the rest say "N Just for me"); never what anyone searched or watched; Made for you/private channels never in Top channels.
- New data: `reaction_counts` (member/day/kind, never words/post/moment) from `react()`; `moment_log` (no user ids: formed, tune-ins once per member, peak, reactions, alerts sent/opened); `users.last_seen_at` (≤ 5 min, `/api/auth/me` + `phoneCaller`); `access_keys.platform`; events `app.open`, `search.found|none` (mode only), `post.finish`, `channel.play|keep`. `server_settings processing.paused` = Pause new work (keep worker, Mac helper claims, local understanding).
- Actions: make/remove admin (audited; never the last admin), remove a phone, clear a member's notes, Retry failed / retry one / link only. Every `/api/admin/*` answer is `private, no-store` (`withAdmin`).
- Parity: `seed-admin.ts` (Ana is an admin), captures `admin-1` … `admin-10`. Scores 1.5–5.3. Limits in `e2e/parity/README.md` (server name, filler save times and networks, sign-in links need `EMAIL_LINKS_TO_ADMIN`).
- Follow-ups: PRIVACY.md got an admins-and-counts section on main's text; PR #567 rewrote PRIVACY.md, so merge by hand. The funnel's third row is reactions sent (reactions carry no post); phone saves aren't split iPhone/Android; no Mac helper Remove (its token is env).

## 2026-10-20 — Android: send to your people, forming alerts, like thumbnail, Keep this channel

- Send sheet (j4-4): "Or straight to your people" from `GET /api/app/send`: 52dp faces, dimmed with "Jo already has it." when they have it, a tap posts `/api/app/send` and leaves a tick; a private save says "Just for you. Share it first to send it." The sheet expands once the row loads (M3 sheets don't grow on their own). New's `sent` reason is the why chip "Pete sent you this" with his face.
- Live (j7-3): forming rows show `people` faces and a bell (`PUT|DELETE /api/app/live/forming/{id}/alert`); the first bell asks for POST_NOTIFICATIONS. `alerts/LiveAlerts.kt` reads `/api/app/alerts` every minute while open and from a 15-minute WorkManager job, posts "X is live · Tune in" on a "Live" channel (opens `adhx://live?slug=`), then marks them seen; without permission the open app toasts instead.
- Why this one (j2-2): a `like` reason's `post.posterUrl` is a 38dp Gob thumbnail that opens that post. Group channels have Keep this channel → Kept · Open (opens your channel).
- Verified live on a :3610 parity server with the server branch merged in; JVM tests in `BoardFeaturesTest`. Text posts still skip the send sheet, so they can't be sent to people from the phone yet.

## 2026-10-20 — iPhone: send to your people, live alerts, like thumbnail, keep channel

- Send sheet (j4-4): "Or straight to your people" from `GET/POST /api/app/send`; 52 pt faces, has-it dimmed with "Jo already has it." (beside the faces up to four, else under), a yellow tick on send, "Just for you. Share it first to send it." when not `sendable`. New's `sent` reason is the why chip "Pete sent you this" with the sender's face (a paper plane in the why sheet); unknown reason kinds show as their words.
- Live (j7-3): forming rows show `people` faces and a bell (`PUT|DELETE /api/app/live/forming/{id}/alert`); the first bell asks for notifications. `App/Feed/LiveAlerts.swift` polls `/api/app/alerts` every 60 s while open and from a BGAppRefreshTask (`<prefix>.alerts`, scheduled 48 h after a bell), posts local notifications, marks them seen, remembers the last 100 shown; a tap tunes in (`-adhxTuneIn <slug>` does the same in Debug).
- Why sheet (j2-2): the `like` reason's 38 pt Gob-shaped thumbnail opens that post. Group channels play with their name and Keep this channel → Kept · Open (plays `/api/app/channels/mine/{tag}`).
- Verified live in the simulator against the merged server branch on a parity server: send to Mum/Ana with ticks, Ana's New leads with Pete's sent post, like thumbnail, bell → permission → subscription, a fired alert as a notification (the alert row was inserted by hand: the seed has no group that forms), tune in, keep. Fixture tests: `apps/ios/Tests/BoardFeaturesTests.swift`.
- Follow-ups: tapping a notification in the simulator's shade wasn't drivable, so the tap path was checked through the debug argument; "Just for you" was checked by API and fixtures, not on screen.

## 2026-10-20 — Board features: send to your people, forming bells, like thumbnail, keep group channels

- **Send** (j4-4): `post_sends` + `GET|POST /api/posts/send` and `/api/app/send` (`src/lib/sends/`): every other member with `has`/`sent`; a post only you keep privately isn't sendable, another person's private post is 404. New leads with `{ kind: 'sent', text: 'Pete sent you this', username }` until seen (`markSeen` sets `seen_at`), however old; the note rides on the sender's saver (and on the reason). Web: "Or straight to your people" in the Share sheet; the why chip shows the sender's face.
- **Forming** (j7-1/j7-3): `FormingView.people` (≤4 faces from the group's own saves) and `alert`, members only; `PUT|DELETE /api/moments/forming/{id}/alert` (+ phone), alerts at `/api/moments/alerts` (+ phone). Bells are carried by `reconcileForming` after merges/regroups and fire once when the group goes live. Forming ids now carry a per-process part. Web: faces + "Tell me when it's live" on the card, `MomentAlerts` toast + browser notification on every signed-in page.
- **Like thumbnail** (j2-2): the like reason's `post: { platform, id, posterUrl }` (`cover.ts`, shared with the phone live view); `LikeThumb` in Why this one. **Keep this channel** (j6-2): `POST /api/channels/group/{slug}/keep` (+ phone) saves what you lack (`channel_keep`, not private) and tags it `food-youll-cook`; queues carry `kept`.
- Parity: Ana sends Pete the bridge; `parity:serve` makes a forming group after Next starts; new j2-2 capture (mobile web vs the phone why sheet). Scores before → after: j6-2 9.4 → 9.0, j7-1 7.8 → 8.2 (web) and 22.3 → 22.2 (mobile), j2-2 11.4 → 11.6 (mobile); the forming card, Keep this channel and the thumbnail are now reached.
- Follow-ups: forming names stay "Something new" without the model; group keep isn't on the phone-width web side panel (same as Made for you keep).

## 2026-10-20 — Android: Show less/more, New marks, note card, live span, second parity pass

- New server fields used: Why this one has Show less/more pills (`/api/app/feed/weights`, last and first friend who saved it); channels mark `isNew` tiles, add Play the N new and the friend's `note` as a paper tile; Live says "3 saves in 10 min · names" (`recentSaves`/`windowMinutes`) and lists `forming` groups as dashed rows.
- Parity fixes from a side-by-side of every phone board at 390dp (Hanken Grotesk merged in): header shadow no longer pushes the On their way pill 240dp down; Gob drawn at the boards' size without a second −4° tilt; caught-up sliders open the filter; tighter line heights on Channels, Connected, Settings and the processing sheet (moving first, needs-you last); 68dp face rings; video quality by short side (720p); hairline outline buttons; Decline in the request row; Shared lately after This phone; Your people counts others.
- Debug only: `DebugConnectActivity --ez noSeen true` keeps a seeded server untouched.
- Gaps (no server route): "Or straight to your people" in the send sheet, faces and the bell on forming rows, "Saved together" chips on channel tiles. Kept on purpose: one-row header over the player (j2-3), wide videos fit rather than crop, the corner badge instead of "12 you haven't seen".

## 2026-10-20 — Web design parity, round two

- **Friend channel** (j3-2): `Masonry rowFirst` lays tiles out row by row into the shortest column (`placeTiles`, measured heights, DOM stays in reading order), upright `shape="tall"` tiles, the note card in the last column under its first tile; "Play the N new" on phones. Tiles of titled networks show the title only (`postTitleLine`). Friend covers prefer kept posts.
- **Theater**: a saver's note sits on its own line over the byline (it squeezed the faces in narrow stages); the arriving-save toast is one button sitting beside the stage; a moment's byline time is plain; the why panel says "Saved together" in full (`whyDetail`). Caught up on phones follows j2-4; Tonight skips a channel made of the live moment's posts; a lone side moment on Right now keeps its half height.
- **Settings/doing**: Change picture frames the crop inside the photo (thirds, yellow slider, "From @x on X"), and previews your face on one of your shares; invites list newest first and say "Made by Ana"; /doing says "Instagram Reel".
- **Harness**: remote processing with a heartbeat-only helper ("Mac helper connected"), j7-2's toast played into the page's stream, j8-2 picks the pub photo through the file input, j2-5 on phones plays the hamster, j7-1's phone line matched. Remaining limits listed in `e2e/parity/README.md`.

## 2026-10-20 — Android uses Hanken Grotesk

- The Android app's sans is now Hanken Grotesk, like the web and iOS: `res/font/hanken_grotesk.ttf` is the web's `src/app/fonts/HankenGrotesk-latin-variable.woff2` decoded to TrueType (Brotli plus the WOFF2 glyf/loca reconstruction), with nothing downloaded. Chromium renders both files pixel-identically at weights 100–900.
- `SansFamily` in `ui/Theme.kt` maps each weight to the same variable file at that point on its weight axis (API 26+). Every Material type style and the two text fields use it; licence in `assets/licenses/HankenGrotesk-OFL.txt`.

## 2026-10-20 — iPhone app: the rest of the phone boards

- Why this one: Show less / Show more from a friend (`/api/app/feed/weights`, chosen state in cream, long press for another friend); only the server's reasons are listed. Why, filter and On their way are now the boards' bottom-attached sheets (`BoardSheet.swift`), not inset system sheets.
- Channels: a friend's channel opens under Home's header with New tiles (`isNew`), Play the N new and the note as a paper card (opens the post); Your people has See all and Invite. Made for you rows say "N saves · from what you keep".
- Live: first moment big with "3 saves in 10 min" (`recentSaves`/`windowMinutes`), the rest as labelled rows, `forming` groups as dashed rows. Tuned in: byline "· 4 min ago · Reddit"; reactions that land together rise 0.7 s apart and stay solid until late in the rise.
- Share opens the send sheet (j4-4): download progress, then Messages/Mail/Files/Photos/share sheet. On their way lists movers before needs-you. Settings counts your people without you.
- Correction to the 2026-10-20 iPhone entry: face colours already match the boards (the web's FNV-1a order); that line was stale.
- Left as is: the boards disagree on the header (most show a two-row "adhx" bar with a settings button, j2-3/j2-7 the spec's one row); the apps keep the spec's one row. Gaps needing server work: "Or straight to your people" (no send-to-member route), faces and a notify bell on forming groups, the "like" reason's thumbnail. Tests: `apps/ios/Tests/FriendsParityTests.swift`.

## 2026-10-20 — Design-parity gaps closed: getting ready, new marks, note card, phone weights, live span

- **Getting it ready** (j1-4/j1-5): `GET /api/activity/processing/posts` (`processing/keep-status.ts`, `seenBy` only) says whether each post is `waiting | keeping | converting | kept | none` with step and percent; the theater (`useKeepStatus`, `GettingReadyStage`) covers the stage until the copy is kept, then plays (`POST_KEPT` reloads a failed load). Chips: "Shared with your people" (faces) while yours gets ready, "Kept on your ADHX" on a just-kept post. `keep_jobs.progress` (guarded ALTER) keeps the last written percent; `/doing` uses it too.
- **Channels**: friend/group queues (web + phone) carry `isNew` (`newKeysFor`: not saved or seen); friend queues add `note` (latest visible note). The friend page reads the marks from one request and shows the note as a paper tile.
- **Phones**: `GET|PUT /api/app/feed/weights` mirrors `/api/feed/weights` (shared `setFeedWeightFor`). `/api/moments` (members) and `/api/app/live` add `recentSaves` + `windowMinutes`; the Right now lead card says "LIVE · 3 saves in 10 min".
- **Harness**: `parity:serve` re-pins dark chocolate's keep job to running at 62% after Next starts (the worker resets running jobs) and clears `.next-parity` (a stale dev cache looped page reloads after restarts); j1-5 rewrites the status in the browser to see the real switch. Moment names stay a harness limit (the board names aren't in `MOMENT_TOPICS`).
- Follow-ups: the phone apps can now build Show less/more, New marks, the note card and the live span; the j3-2 score is about tile order (CSS columns), not missing pieces.

## 2026-10-20 — Theater controls kept reachable after the design restyle

- Four e2e specs caught controls the web theater restyle had dropped. Phones (and the dimmed rooms) get a small play/pause glyph at the start of the thin line; a moment's room shows small Previous/Next glyphs after it (the channel room's `xl` stack would sit under a moment's taller rail at 1280).
- Where the boards show no Previous/Next, the transport carries `sr-only` buttons revealed on keyboard focus; the header Paste pill is the same on wide screens (`PasteButton keyboardOnlyFrom`), next to ⌘V. ⋯ rows with a value are named "Repeat: This post".
- Specs changed only where a control moved on purpose: `preview-repeat` opens ⋯ for Repeat; desktop `paste-save-failure` focuses the pill and presses Enter. New component test covers the phone buttons.

## 2026-10-20 — Android brought to the phone design boards

- Ran the Android app on an emulator (390dp wide) against the seeded parity server and compared every phone board side by side; reads went to the server, share-card writes to a local mock so the seed stayed untouched.
- Bundled Instrument Serif with its licence, the boards' palette and line icons, one shared FNV-1a hash into the boards' five face colours, and the boards' switches.
- New keeps the one-row header with the corner badge; the rail is Save, Share (by media type), Save to phone and More, with Sound, Repeat, the original, the small window and Hide moved into More. Upright videos fill the screen; wide ones still fit.
- Byline, why chip (Saved together / Close to you), note bubble, progress line, why sheet, feed filter, caught up, channels, a friend's channel (staggered, under the Channels header), search, live, tuned in (React picker lifts the caption), settings and the share card follow their boards. Added the send sheet and a Connected welcome after pairing.
- Save notes: the share card's Add a note rides with the save, or follows it through `POST /api/app/note` (older servers get the save again); friends' notes show over the byline. Decoded loosely.
- Debug builds only: `DebugConnectActivity` stores a server and phone key from an intent. Remaining gaps (Show less/more, Play the N new, straight to your people, forming moments) need phone APIs that don't exist yet.

## 2026-10-20 — iPhone app parity with the phone design boards

- Ran the iOS app in the simulator against the seeded parity server as Pete and restyled it board by board: bundled Instrument Serif and Hanken Grotesk, the one-row header with its corner badge, full-bleed player with the boards' scrims, frosted 52 pt rail, thin progress line, why chip, why/filter/on-their-way sheets, caught up, channels, friend channel masonry, search tiles, Live cards and tuned in, settings, share card.
- The rail is the boards': Save (bookmark: saves someone else's post to your ADHX; on yours it opens "In your saves" with Just for me and your note via `/api/app/note`), Share, Save to phone, More, plus React on Live. Sound, Repeat, the small window, Hide and the original moved into More. Faces use the boards' five colours (FNV-1a of the username, like the web).
- Save notes: `Saver.note` decodes loosely (trimmed, 140 max) and shows as a speech bubble over the byline; the share card has "Add a note", sent when the card closes through `POST /api/app/note` once the save has landed, else as `note` on a repeat of the same save (same link and request id).
- New "Connected to …" screen after pairing. Debug-only launch arguments connect, avoid sending seen, and preview the welcome and share card (`apps/ios/README.md`).
- Deviations: system sheets float inset on iOS 26, the send-file sheet is still the system share sheet, a person's face colour comes from a hash (not the boards' hand-picked ones), no "Play the N new"/"See all"/"Invite" on channels.

## 2026-10-19 — Notes on saves

- `bookmarks.note` / `phone_save_queue.note` (guarded ALTERs, `schema.ts`, test DDL). `cleanNote` (`src/lib/people/note-text.ts`): whitespace collapsed, control/bidi dropped, ≤140 graphemes, empty → null.
- Every save path takes `note?: string` (`/api/bookmarks/add`, `/api/tweets/add`, `/api/app/save` sync + queue); a repeat save with `note` replaces it. Edit: `PATCH /api/bookmarks/[id]/note`, `POST /api/app/note`. Admins: `POST /api/admin/posts { clearNotes: true | username }` (audited `clear_note`).
- `Saver.note` via `saversFor`, so feed, blend, search, similar, channel queues, moment items, phone posts and the live poll carry it for members only; moment card faces strip it; a private save's note reaches only its owner; public channel clones no longer copy notes.
- Web: `SaverNote` (byline bubble in `SaversButton`, quote in Who saved it), `NoteField` in the Save sheet; TheaterV2 only keeps your note after an edit.
- Parity seed has the boards' notes (Ana on Charlie, Ben on the Rickroll, Mum on the sauce, Pete on dark chocolate).
- Follow-ups: no admin console button for clearing notes (API only); the j3-2 "Ana's note" tile on a friend's channel isn't built. iOS/Android UI is with the phone agents.

## 2026-10-19 — Design parity harness (`e2e/parity/`)

- `pnpm parity:serve` seeds a fresh DB with the friends-feed boards' world (Pete admin, Ana, Ben, Mum, Jo; the boards' posts, times, private saves, invites, a waiting join request under "Anyone, I approve", group and Made for you channels, moments, /doing states, seen rows so New shows 12) and runs Next on :3600. Kept media is cloned from `PARITY_MEDIA_SRC` (ffmpeg placeholders without it).
- `credentials.json` holds a session cookie and a phone key (real pairing flow) per member, so iOS/Android can point at the same server.
- `pnpm parity:capture` screenshots all 17 `j*-web-*` boards at 1280×800 and 390×844 in their states (⋯ menu, Who saved it, caught-up card, searches, invite made, avatar dialog, tuned in with watchers and reactions), never marking anything seen. `pnpm parity:compare` writes side-by-sides and a worst-first score report.
- Gaps: no notes in the schema; moment names come from shared words without the model; keep percent and "Mac helper connected" need live work. See `e2e/parity/README.md`.
- No UI changed.

## 2026-10-19 — Exercise release gates across platforms

- Separate the Node runtime from build tools, remove unused package managers and recommended OS extras, and expose retained scanner findings directly in CI logs.
- Refresh the pinned package manager with explicit dependency-build permissions; keep the three independent lockfiles and frozen installs.
- Reset only the isolated browser-test development cache to prevent stale Turbopack reload loops on repeat runs.
- Make load/recovery assertions follow actual video checkpoints while allowing fair interleaved queue work and bounded audio-container padding.
- Add a guarded macOS rehearsal that observes real disk-full errors inside a disposable 64 MiB image, verifies retry/cleanup and removes the image. No installed service or personal data touched.

## 2026-10-19 — Dependency maintenance and release rehearsals

- Refresh compatible app/extension packages; all three JS lockfiles and resolved Android Maven libraries now have advisory gates, with a dated dev-only exception for the unpatched braces issue.
- Move FFmpeg to maintained system packages, resolve absolute downloader paths, preflight/capture the Mac binary for launchd, exercise real DASH merging and handle FFmpeg 9 end-seek errors without losing short/final frames.
- Refresh Android's toolchain/Coil; migrate credentials atomically to direct Keystore AES-GCM, retain legacy reads only for migration, and scope history/defaults across accounts and interrupted cleanup.
- Scan existing native image builds and actual release digests for fixable high/critical advisories before tag promotion; extend dependency automation without duplicating builds or publishing on PRs.
- Rehearse actual v2.1.2 schema migration twice, queue recovery and WAL backup/restore using synthetic accounts/media; add an offline CI fixture tied to released source.
- Add a 10,000-save load/recovery harness, real pinned-model/end-of-video checks and 1080p/audio conversion; publish measured results and limitations in linked guides.
- Prepare physical phone acceptance steps at the owner's request because no spare phone was available. Validation details are recorded on the PR; no service or installed app deployed.

## 2026-10-19 — Harden friends-feed delivery, live rooms and processing

- Android shares now use durable staged delivery; both phones reuse request IDs and monotonic privacy versions, with cross-process-safe iPhone history and retryable interrupted acknowledgements.
- Native live rooms renew foreground presence leases, deduplicate accounts across devices, refresh compact saver/privacy metadata and remove only authoritative removals while preserving playback identity.
- Failed reaction drafts keep their original post and offer Retry; small-screen web rails/pickers remain reachable, with bounded native pickers and Unicode limits.
- Count the complete visible processing backlog in SQL before limiting details to 60; summary polls skip media hydration, web consumers share foreground polling, and viewed-post updates use an account-scoped acknowledged outbox.
- Pin all active OCR inputs, distinguish unreadable pictures from model failures, reuse retained originals across passes and reconcile/expire unused cache entries.
- Alternate conversion and understanding fairly, age old work, and wait for all source conversions before video-consuming learning.
- Add server/web/native regressions, a native CI workflow and a linked cross-device verification guide; simulator display failure prevented a native visual claim, while unsigned native builds and automated checks are recorded on the PR. No service or installed phone app deployed.

## 2026-10-19 — Close friends-feed review privacy gaps

- Revalidate cached blend savers/reasons/counts and moderation without shifting cursor slots; public caches check a durable SQLite visibility revision across processes.
- Revoke named streams on ban/deletion/approval changes or phone-key revocation, including idle heartbeats; clean up watchers and subscriptions.
- Stage queued new saves privately and persist editable queue intent; iPhone acknowledges the latest choice before completing its extension, with interrupted acknowledgements retained for retry.
- Channel clones respect the recipient's private default; pending approvals remain actionable after inviter deletion.
- Add regression coverage for all seven findings, stream revocation, in-flight queue updates, owner/key isolation, acknowledgement retries and idempotent legacy schema upgrades.
- Validation: 3,353 tests, typecheck, formatting, lint (87 existing warnings), and the unsigned iOS simulator build pass; browser/CI results are recorded on the PR. No service or installed app updated.

## 2026-10-19 — Android: Settings, join approvals and "On their way"

- Settings (j8-4) rebuilt: your face in Gob's shape, Waiting for you (admins: Let in / Not now / Decline via `POST /api/app/people/requests/{id}`), Your people (`GET /api/app/people`, new list screen), Invite, What's in your feed, Just for me and Sound on by default, What your ADHX is doing with its count, Shared lately, Connected to … with Remove this phone.
- On their way (j8-5): pill over the New player while `/api/app/doing` says posts are processing (5 s polls while in front, 15 s when idle, stops on 404), a sheet with thumbnail, step, thin bar and Retry (`POST /api/app/doing/retry`), and a full list screen.
- Avatars: Coil's OkHttp client adds the phone key for the connected server only (`ServerAuthInterceptor`), since `/api/files/avatar/*` is members only.
- QA fixes: Why this one lists all `whyReasons`; `nothingYet` shows "Nothing new yet. Save something for your people to find."
- No phone-key routes for avatar upload, display name, invites, removing a phone or the account's "Just for me by default": the app opens web Settings for picture and invites, and keeps its own private default (sent as `private: true` when on; off switches a new save back, never a repeat share).
- Branch base: `ff/settings` had no Android friends feed, so `apps/android` and `docs/specs/phone-app.md` were brought over from `feat/friends-feed` first (ff/settings doesn't touch them).
- Verified: `assembleDebug testDebugUnitTest` (51 tests). Not run on a device or emulator.

## 2026-10-19 — iPhone: Settings, approvals and On their way

- Branch `ff/ios-settings` (from `ff/settings`; `apps/ios` and the phone spec taken from `feat/friends-feed`, which `ff/settings` didn't have yet). Settings from Gob: you (Gob-shaped face, saves), Waiting for you (Let in / Not now / Decline via `/api/app/people/requests/[id]`), Your people list (opens a friend's channel), Invite someone, What's in your feed, Just for me by default, Sound on by default, What your ADHX is doing, Connected to … / Remove this phone, Shared lately.
- On their way: pill under New's tabs from `/api/app/doing`, polled every 5 s only while the player is on screen; sheet with thumbnail, step and thin bar per post, Retry (`/api/app/doing/retry`) on rows that need you; full list screen. Older servers keep the old `preparing` pill.
- Faces load through `AuthImage` (phone key as `Authorization: Bearer`, only to the paired server, memory cache), since `/api/files/avatar/<hash>` is members only.
- QA: Why this one lists every `whyReasons` entry; `nothingYet` shows "Nothing new yet." instead of the caught-up page.
- No phone routes yet for: changing the picture (`/api/account/avatar` is session only), invites, the `save.privateDefault` preference (kept on the phone; sends `private: true` when on), or a phone removing its own key. Picture and invites open web Settings.
- Built for the simulator with `xcodebuild`; not tried against a live server.

## 2026-10-19 — adhx.com rebuilt for the friends feed

- `site/` now follows the approved desktop and phone boards: nav (a `<details>` menu below `md`), hero ("Your friends have better taste than the algorithm." with a laptop theater and an overlapping phone), fourteen networks (real marks via `NetworkIcon`), "Three steps. No algorithm.", seven feature rows (New, saver faces + Just for me, the meme vault, search by what's said / on screen, channels, Live, invites), the apps, the "short attention spans and long friendships" band, "Yours. Not ours." with the setup command, footer.
- Responsive, not fixed boards: `max-w` containers, phone layout below `md`, desktop from `lg`. Phone and laptop mockups scale with their frame (`.nx-scale` + `--u`, `components/frames.tsx`). New: `People.tsx` (Gob-shaped faces), `Meme.tsx` (Impact-style top/bottom captions as real text, Anton/Oswald from Google Fonts as fallback), `icons.tsx`, `mocks.tsx`; `art.tsx` gains elephant, hamster, bird and grass; `CopyCommand` gains a titled, highlighted variant.
- No third-party media: the boards' real stills are replaced by the site's own illustrations; owner-requested meme captions go over them. Copy only claims what's on `feat/friends-feed`; approvals read "Approve who joins, if you like"; the apps stay build-from-source.
- README "Where it's going" is now "What's new". Metadata and OG description updated.
- Checked: `pnpm site:build`, `pnpm typecheck`, `pnpm format:check`; visual pass at 1440, 1024, 800, 390, 375 and 320 (no horizontal scroll). Follow-ups: the hero reel (`/showreel`, MP4) still shows the older feature set and should be re-recorded; the small-screen menu stays open after following a link.

## 2026-10-19 — QA of the merged friends feed (three members)

- Walked Ana (admin), Ben (from an invite, paired phone) and Jo on a scratch DB with kept media: invite → done → pairing, Just for me, New (why, seen, filter, caught up, Show them, Watch it all again), faces and the Who saved it popover, channels (group, friend, new counts), Live with names (watchers, React, reactions both ways, signed-out shapes), search scopes, the phone API, session renewal, `pnpm build` and `pnpm site:build`.
- Fixed: `/api/app/feed` also sends `waiting` as `hidden` (both apps read `hidden`); New's header said "1 you haven't seen" on the caught-up card; Right now's Just saved strip, covers and moment posts kept a save made private (or by a banned member) until the regroup, and the strip until 12 newer saves; search tiles hid the faces under "Words only"; Tune in's watching count was reset by the moment's older count.
- Noted for the apps: they read only `why` (not `whyReasons`), so Why this one shows one reason; neither reads `nothingYet`, so a quiet server says caught up instead of "Nothing new yet".
- Moment `people`/`posts` counts still catch up at the next regroup (≤5 min) after a save goes private.

## 2026-10-19 — Settings for You and Your people, join approvals, What your ADHX is doing

- **You**: Change picture dialog (upload, camera, X picture, a Gob in four colours; circular crop with zoom, live saver-faces preview). `POST /api/account/avatar` sniffs the type, caps 5 MB, and `sharp` re-encodes a clamped crop to a 512px metadata-free JPEG in `MEDIA_DIR/avatars/<userId>-<hash>.jpg`, served to members only at `/api/files/avatar/<hash>`; the old file goes on replace and all of them on account delete. Display name (`PATCH /api/account/profile`) and "Just for me by default" (`save.privateDefault`, honoured by every save path and settled when a phone share is queued).
- **Your people**: members with save counts, role chip, admin ⋯ ban/unban; pending invites by a 4-character code from the invite id (owner change mid-build), and **Copy link** on an older invite confirms, then mints a fresh token (`POST /api/invites/[id]/link`), since only hashes are stored. Who can invite (`admin | approve | anyone`) lives in a new `server_settings` table; `INVITES=members` is only the first default.
- **Approvals**: `users.approval` (+ snooze). A member's invite under "Anyone, I approve" makes a `pending` account; `getCurrentUserId()`, phone keys and access keys treat it as signed out; only `/invite/waiting` and `GET /api/auth/approval` see it. Queue: `GET /api/people/requests`, `POST /api/people/requests/[id]`, phone `/api/app/people*`. The waiting page needed `/invite/waiting` excluded from the script-free invite CSP.
- **Doing**: `GET /api/activity/processing` / `GET /api/app/doing` (7 steps, statuses, plain reasons, retry info, savers; never another member's private save), retry and keep-the-link-only (`keep_jobs.accepted_at`), Mac helper presence from worker polls. `/doing` polls every 3 s; "N on their way" pill in `NxHeader`.
- Skipped: non-allowlisted email sign-ins landing in the queue as "asked to join" (it would mean emailing links to any address that asks; refusals stay as before). An X relink still overwrites a custom display name (it no longer overwrites a picture stored here).
- Verified on a scratch DB with headless Chromium: approve moves the waiting browser on to /invite/done, upload + zoom stores and serves the JPEG (401 to strangers), 375px layouts have no sideways scroll.
- Merged with the friends-feed branch (blend, Android, Gob-shaped faces): the You picture, the dialog's crop and byline previews, Your people's members and the waiting faces use `GobShape` / `gobMask`; the channels' invite link now points at `/settings#people`.
- Follow-ups: the phone apps don't call the new routes yet; X sync imports don't follow "Just for me by default"; the doing list caps at 60 rows / 400 candidates.

## 2026-10-19 — Faces are Gob shaped

- Owner request: every person's face is Gob's shape (rounded square, 38% corners, tilted −4°) instead of a circle, on web, iPhone and Android. Photos and initials stay upright inside; rings on stacks follow the shape.
- One primitive per platform: web `GobShape` / `gobMask` / `gobContent` (`src/components/next/GobShape.tsx`, used by `NxAvatar`, `AuthorAvatar`, the Settings picture and its picker, the X picture); iOS `GobShape: InsettableShape` and Android `GobShape` (tilt baked into the path, in `Shared/People.swift` and `ui/GobShape.kt`).
- The generated web face is now a full square (the frame clips it). Status and live dots, round buttons, badges and the OG share images stay as they were.
- Follow-up: an avatar picker or crop preview from another branch should use `GobShape` / `gobMask` too.

## 2026-10-19 — New and the blended feed

- `post_views` (guarded, cleared with the account, pruned after 180 days at migrate; guard triggers now 48). `POST /api/views` / `POST /api/app/seen` (≤50, idempotent, first `seen_at` kept).
- `src/lib/feed/blend.ts` (pure: signals, `BLEND_WEIGHTS`, variety, why words, cursor) + `blend-db.ts` (candidates via `seenBy` over 14 days, minus moderated/gone; closeness from `post_views` + co-saves; taste from `post_embeddings`; per-user 5-min snapshots by seed). `GET /api/feed/blend`, `GET|PUT /api/feed/weights`, `GET /api/app/feed`.
- Web: `/play?feed=new|everyone|friends|mine` pages through the blend; why chip, why line in Up next, Why this one sheet with Show more / less; Everyone · Friends only · Mine; seen after 2s or skip (batched); `CaughtUpStage` when New runs out; "Nothing new yet" with Paste. **New** is the first tab and signed-in `/` → `/play?feed=new`.
- Refined in the spec: New and Friends only leave out posts only you saved; `nothingYet` and `total` on the response.
- What's in your feed (owner request): `types=video,photo,text,article` on both feeds (sound counts as video; default video + photo; stored as `feed.types`, `GET|PUT /api/feed/types` and `/api/app/feed/types`), `FeedTypesControl` beside the switch, and "4 text posts waiting · Show them" on the caught-up card.
- Validation: 3,149 tests, typecheck and lint pass; walked New → Why this one → Show more → caught up → Watch it all again, and the kind filter ("6 text posts waiting · Show them"), at desktop and 375px on a scratch DB.
- Merged with the friends-feed branch (Live with names, channels from everyone, speech/screen search, iOS): one seen list — `people/seen.ts` folded into `feed/views.ts` (`notSeenBy`, `newTo`), so a friend channel's "N new" drops what you watched in New.
- Follow-ups: the phone apps need to adopt `/api/app/feed`; the caught-up "Tonight on your ADHX" row from the design isn't built; closeness counts seen, not watched to the end.

## 2026-10-19 — Android: the friends feed (New · Channels · Live)

- Home is New · Channels · Live under one light row (Gob for Settings, tabs with a 99+-capped New badge, Search). New plays `/api/app/feed`, marks posts seen after 2 s or a swipe past (`SeenBatcher`, batches of up to 50 to `/api/app/seen`), shows the why chip, Why this one, What's in your feed (videos and photos by default, `types=`, `/api/app/feed/types` with a local fallback) and ends on "You're all caught up. Go touch grass."
- Channels (From everyone, Your people with new counts, Made for you with My saves) and channel grids; Live moments, Tune in polling `/api/app/live/{slug}` every 5 s with watchers, a React picker (6 emoji or 40 characters) and floating reactions with faces (fade in place with animations off).
- Saver faces and "Ana and Ben saved this" on the byline and search tiles (tap opens that friend); Just for me on the share card (sent with a queued save, or `/api/app/private`) and in More; lock on private posts; search Everyone's saves · Mine. Shared lately moved into Settings.
- Decoding is lenient (`net/Lenient.kt`); 404s fall back (no feed → My saves home, no Live → nothing live). 36 JVM tests; `assembleDebug` passes.
- Emulator run against a scratch mock of the contract: New with faces, why chip and badge; the filter sheet (`types=` sent); Channels; Live and Tune in with the watchers chip, React picker, floating reactions and `react` sent; More's Just for me (`/api/app/private` sent); seen batches sent. `adb input swipe` doesn't page the player on that emulator (the baseline build doesn't either), so the caught-up page wasn't reached there.
- Follow-ups: check against the real server once feed/channels/live/react/types land (field names for `why`, `hidden`, `reactions` are guesses); physical-device pass; "Add a note" and "send to your people" from the designs need endpoints.

## 2026-10-19 — Channels from everyone: group channels and one per friend

- `group_channels` (server-wide, no `user_id`) + `src/lib/channels/group.ts`: everyone's visible saves clustered and named with Made for you's machinery (shared `meanVectors`/`bestClusters`/`nameClusters` from `auto.ts`). Lazy, single-flight, background recompute (>12h, ±10 visible saves, model change, a counted saver gone); reads re-check each post's visible savers.
- `src/lib/channels/friends.ts` (one channel per other member, `newCount` via `people/seen.ts`, which tolerates a missing `post_views`), `overview.ts` shared by `GET /api/channels` (+`group`, `friends`, `canInvite`) and `GET /api/app/channels`. New queues: `/api/channels/group/[slug]`, `/api/channels/friend/[username]?new=1`, `/api/app/channels/{group|friend|mine}/{slug}` (phone key or session).
- Web: From everyone and Your people rows (+ Invite someone), `/channels/friend/[username]`, `/play?group=` / `/play?friend=` with back links and empty states, linked saver faces on tiles, theater "Who saved it" popover.
- Private wins: public tag collection, clone, theater backfill, curator profile, leaderboard tiles, public tweet `publicTags` and the sitemap skip the owner's private saves.
- Validation: 3,103 tests (new: 11 channels, 3 private-wins, 9 component), typecheck, lint (existing warnings only); walked the rows, friend page, queues, popover and phone width in a browser on a scratch DB.
- Follow-ups: friend page filters (Videos/Photos/Music) and "New" tile badges from the design aren't built; group naming needs real embeddings (scratch DB used hand-made rows); `auto_channels` still isn't removed on account delete (pre-existing).

## 2026-10-19 — iPhone app: New, Channels, Live, faces and Just for me

- Home is one row over the player: Gob (Settings, which now holds Shared lately), New · Channels · Live with an unseen badge on New ("99+" cap), Search. New pages `/api/app/feed`, marks posts seen (2 s on screen or swiped past, batched to `/api/app/seen`), shows the why chip and a "Why this one" sheet with Everyone · Friends only · Mine, and ends on "You're all caught up. Go touch grass."
- Media filter: New plays videos and photos by default (`types=` on the feed, filtered by kind on the phone too); tapping New again or Filter in the Why sheet opens "What's in your feed"; the choice is PUT to `/api/app/feed/types` and kept locally on a 404; the end page offers "4 text posts waiting · Show them".
- Channels (group carousels, your people with new counts → "Ana's saves", made for you) and Live (moment cards; tuned in polls every 5 s with watchers and "up next" arrivals; a React rail button opens six emoji and a 40-character line, `{emoji}`/`{text}` to `/react`; reactions from the poll float up as ringed faces with an emoji sticker or speech bubble, fade-only under Reduce Motion).
- Saver faces and lines on the player byline and search tiles (tap → friend channel); Search defaults to Everyone's saves; Just for me in the player's More and on the share card (remembered before the post lands, carried by waiting links).
- Everything new decodes loosely (`Shared/FriendsAPI.swift`); a 404 falls back to My saves or an "update your ADHX" note.
- Checked: simulator build, and a run against a sample-data stand-in for the phone API (New, header badge, media filter and its fallbacks, why sheet, modes, seen batches, More toggle, Channels, friend channel, Live, React picker, floating reactions, caught-up, search scopes). Not checked: the share extension card on a device, real feed/channels/live servers (other branches), VoiceOver by ear.

## 2026-10-19 — Live with names: watch together

- Names are added per request for members only (`src/lib/moments/people.ts`): `MomentView.savers` (≤5, from the moment's post keys via `saversFor`, window saves only, never a private save), `watchers`, item `savers`, detail `watchers`, `save.saver`. The engine and its broadcasts stay anonymous; signed-out shapes are unchanged (tested key by key).
- `presence.ts` (globalThis) counts signed-in streams by account; `watching` events get `watchers` per subscriber (no receiver, no banned accounts). Shared stream code in `stream.ts`.
- Reactions: `POST /api/moments/{slug}/react` `{ emoji | text }` (six allowlisted emoji, or ≤40 cleaned characters shown as text only; 20/min/user, words 6/min; in memory only) → `reaction` events for members watching that moment. Changed mid-build from four fixed words to this, per the owner.
- Phone: `GET /api/app/live`, `GET /api/app/live/{slug}`, `POST …/react`, `GET …/stream` (that moment's events, `PhonePost` posts).
- Web: faces and watchers on `RightNow` cards and `MomentScreen`, "Tune in with Ana"; theater watchers bar, named arrival toast, React button + picker, reactions rising with the reactor's face (`LiveTogether.tsx`; fade only under reduced motion).
- Verified with two signed-in members in the browser on a scratch DB (`MOMENT_MIN_SAVERS=1`): watchers both ways, emoji and words both ways, Jo's save toast, picker at phone width.
- Validation: 3,103 tests (with `--maxWorkers=4`; the default run timed out unrelated 5 s tests on a host at load ~60), typecheck, lint (81 existing warnings).
- Follow-ups: the phone apps don't use these routes yet; the Right now header's "3 of your people are on" and forming-card faces from the mockups aren't built; reactions aren't tied to the post on stage.

## 2026-10-19 — Search what's said in videos and the text on screen

- New `speech` / `screen` queue kinds write words (not vectors) to `post_extracted_text` (keyed by post; trigger-deleted with the last save). Whisper base (`onnx-community/whisper-base@1846881b…`, fp32 encoder/q8 decoder, per-window language + no-speech check) transcribes the first 10 min; Florence-2 base (`onnx-community/Florence-2-base-ft@e88a44ea…`, q8, `<OCR_WITH_REGION>`) reads ≤4 photos + 4 frames from the first minute. Junk filter in `extract-clean.ts`, re-applied server-side to Mac results.
- The words join the text document ("Said in the video:" / "Text on screen:") and `post_text_fts`; only posts with extracted words change text hash (no `SEMANTIC_MODEL_VERSION` bump). Search adds `speech`/`screen` signals ("Said in the video", "On screen" on tiles); Jev never receives them and treats them like visual matches.
- Models run only in `extract-child.ts` (forked by the jobs child or the Mac runner, one model per process, exits after 60 s idle): Florence-2 alone held 1.6–2 GB and `dispose()` didn't return it. Processing protocol 2 (`kinds` on claim, `extracted`, media by `slot`); v1 workers are still served and never see the new kinds. `SEMANTIC_SPEECH` / `SEMANTIC_SCREEN_TEXT=off` switches.
- Measured on an M4 (2 threads): 178 s of speech in 10–12 s, 1.6 s per picture/frame, extract process peak ~1.4–1.5 GB (speech) / ~1.8 GB (screen). Real end-to-end smoke (temp DB, real models): "the cat that screams at the cucumber" → the video (strong, speech+screen), a captionless meme by its caption, German speech by a German query.
- Copy that promised "no audio is processed" now says speech and on-screen text are read on your server and none of it leaves. 3,061 tests, typecheck, lint and production build pass.
- Follow-ups: transcripts are not shown to people (search only); no status row for speech/screen progress in the learning sheet; window boundaries can garble a word; measure on the NAS CPU before a bulk backfill.

## 2026-10-19 — Friends feed foundation: savers on posts, private saves, search everyone's saves

- `bookmarks.is_private` / `phone_save_queue.is_private` (guarded ALTERs). Every save path takes `private`; private saves write no pulse, and going private deletes the owner's `save` pulse rows. `PATCH /api/bookmarks/[id]/private`, `POST /api/app/private`.
- `src/lib/people/`: `saversFor`, `visibleSave`/`visibleSaveFilter`, `seenBy`, `withSavers`, `listMembers`. The filter now gates moments, trending counts, Everyone search, `loadSearchItems` copies, similar, sitemap, author hubs, public tweet JSON and the own-play pulse fallback (quoted-only posts drop out of these too).
- Signed-in outputs carry `savers`/`isPrivate` (feed, search, similar, channel queues, `PhonePost`, `/api/app/search?scope=`); public outputs never do.
- Web: `SaverFaces` + lock on theater and search tiles, "Just for me" in More and the Save sheet, one-time notice on `/now`, search defaults to Everyone's saves (old scope-less `/play?q=` links now mean everyone).
- Docs moved to "named to friends, never to strangers" (CLAUDE, PRIVACY, ARCHITECTURE, `/privacy`, README, phone spec).
- Follow-ups: public tag channels still list privately saved tagged posts; the moments engine keeps a just-privatised save until its next regroup (≤5 min); Live names, blend, invites and group/friend channels are other branches.

## 2026-10-19 — Invite links that pair a phone

- New `invites` table (sha256 token hash, 7-day expiry, single use, revocable, account-guarded, removed on account deletion) and `/api/invites` (make: admins or `INVITES=members`, 30/hour, 20 waiting; list without links; revoke).
- `GET /invite/<token>` is a script-free "Ana wants you in." page; only a same-origin form POST spends it in one conditional write, creating an email-less account (`'invite'` identity) with a `/welcome`-validated name. Bad/taken names leave it unused. Ignores `ALLOWED_EMAILS`; dies with a banned/deleted maker or when member invites are switched off.
- `/invite/done` shows "You're in." with the phone pairing QR/code (shared `PairCode.tsx`, also used by Settings → Phone app), configured app links and "Skip, take me to the feed". Invite cards in Settings and on the admin page.
- Email change already worked for email-less accounts; covered by a test. Docs: README invites-first sign-up, CLAUDE.md auth, spec columns (`id`, `revoked_at`).
- Validation: 3,044 tests, typecheck, production build and lint (79 existing warnings) pass; walked the flow in a browser on a scratch DB (taken name, join, done page, simulated phone pairing, used link, email add, Settings/admin cards, 375px width).
- Follow-ups: sessions aren't rolling, so an invite account that never adds an email is locked out after 30 days; `post_views` will also bump the guard-trigger count (46 here).

## 2026-10-19 — Move the app's own strings to the new voice

- Phase 1 ("say it out loud"), app half: the tagline is now "Your friends have better taste than the algorithm." in metadata titles, the OG/Twitter cards, the magic-link email, the signed-out home, `/start`, the crawler list, `manifest.json`, `robots.txt`, AGENTS.md and CLAUDE.md. README, `site/` and `brand/BRAND.md` moved in the docs/new-voice PR.
- Empty My saves is "Nothing kept yet" ("No algorithm is going to fill this for you"); Tune in's end is "You’re all caught up. Go touch grass." Copy describes only what ships: savers are still counted, not named.
- `public/og-logo.png` (also the source of `/opengraph-image` and `/twitter-image`) is a picture and still shows "save it. lose it. find it." until it is redrawn. Once both PRs land, drop BRAND.md's "app strings still say…" line.

## 2026-10-19 — Make handed-over sign-in links survive previews

- GET/HEAD now render a small script-free confirmation; only an explicit same-origin, bounded form POST consumes the link and sets the existing protected session cookie.
- Admin-held links last 60 minutes, emailed/development links retain 15 minutes; creation timestamps preserve the separate one-minute resend cooldown, including legacy SQLite UTC rows.
- Show invalid/used/expired links with a new-link action instead of silently returning home; resume username selection for unfinished accounts on a later sign-in.
- Clarify expiry versus resend timing in admin/onboarding/modal and portable setup/architecture guides; keep the callback CSP/referrer rules effective through Next’s global headers.
- Verify atomic replay/concurrency, origin rejection, body bounds, lifetime/cooldown, production cookie flags and real Chromium/mobile WebKit session persistence after repeated previews and reload.
- Validation: 3,014 tests, typecheck, production build, formatting and lint (79 existing warnings) pass; Chromium and mobile WebKit confirm previews, real form submission, reload persistence and used-link errors.
- Source proposed; deployed instances keep their existing behavior until the owner merges, cuts a release and updates the container. No production token was opened or consumed for diagnostics.

## 2026-10-19 — Explain the NAS and Mac processing pipeline

- Add a README-linked technical overview with topology, phone-save, leased-processing and conversion diagrams.
- Document server/worker responsibilities, full-duration profiles, partial-result search, retry/checkpoint semantics and temporary-file lifetimes.
- Expand the Mac connection walkthrough with matching release checkout, private environment files and the differently named shared-token settings.
- Cross-link setup, verification and architecture references; distinguish receipt acceptance, playable media and semantic readiness.
- Validation: all four Mermaid diagrams parse, local links resolve, shell examples parse and documented sampling examples match the implementation; formatting passes.
- Documentation only; household settings stay private and no running service changes are required.

## 2026-10-19 — Avoid background throttling in the native Mac worker

- Set launchd `ProcessType=Standard`, retaining `Nice=10` and the two-thread baseline; controlled sequential native inference reproduced avoidable Background throttling and completed under Standard.
- Add a portable operator checklist for release/image/source alignment, native launchd paths, private machine configuration and proxy upload limits.
- Require real claim/result acknowledgement, text/image inference, late-video search, H.264 playback and scratch cleanup evidence before increasing load.
- Explain CPU thread and optional CoreML measurements, shared-host responsiveness, durable queue migration and the difference between clearing saves and deleting accounts.
- Clarify that account clearing can reuse shared media/indices; cover verified backups, maintenance-task receipts/readback and scoped NAS import ownership repair without changing existing library permissions.
- Validation: 3,005 tests with two workers, typecheck, formatting, shell syntax and lint (existing warnings) pass; read-only review corrections cover persisted plists and retained channel caches.
- Source changes are proposed; the checklist records operator checks rather than claiming a deployment passed them. Keep deployment settings and measured household loads private.

## 2026-10-19 — Match grouped root release identities

- Set an explicit empty release-only package name: an empty component alone fell back to the Node name and rejected merged grouped PRs.
- Preserve the existing release branch/title, unprefixed version tags and actual application package name.
- Pin the action commit and its Release Please 17.6.0 test library together in an isolated, locked tool package.
- Add offline upstream config/PR/manifest-merge/release round trips to PR CI, including the original failure and feature/patch/docs policies.
- Correct legacy release/deployment notes and document exact-commit recovery. Source fix proposed; no service, tag or image publication performed here.

## 2026-10-19 — Reject an invalid processing role

- Validate `PROCESSING_MODE` before spawning either model process; a misspelled remote role must not silently start heavy indexing on the server.
- Add a no-spawn regression; both supervisor tests, typecheck and targeted lint pass. Source proposed for the native-worker PR; final CI remains required.

## 2026-10-19 — Native Mac processing and elastic video understanding

- Add optional authenticated pull-based Mac indexing; remote mode keeps only the NAS query model, with expiring leases and transactional checkpoints.
- Light/normal/deep profiles sample the whole duration in bounded sections, resume after interruptions and yield to fresh shares; search matches the best section.
- Native CoreML/CPU and VideoToolbox/software paths preserve retained NAS media; real FFmpeg regressions cover ordinary, single-frame and low-FPS endings.
- Delete section frames on success/failure and Mac originals after final acknowledgement; bound managed scratch to 8 GiB by default with startup/periodic expiry, preserving model weights.
- Add last-saver cleanup, moderation exclusion, strict result validation and account-scoped remote progress; document dedicated secrets, launchd setup and server/worker responsibilities.
- Verification: 3,004 tests, types, formatting, lint (pre-existing warnings), production/static-site builds and native offline text/image/video + hardware video smoke pass; current-head Linux CI remains required.
- Extend remote work to full-resolution VideoToolbox/software H.264 conversion with bounded streaming uploads, verified atomic promotion and source-preserving retries. Source proposed, worker not installed; current-head Linux CI remains required.

## 2026-10-19 — Bound mobile share caches and retry newly kept playback

- Give Android exports separate batches, retaining fresh recipient URIs while removing failed transfers and batches older than 24 hours on later exports.
- Check a 64 MiB free-space reserve before and during Android share downloads without adding a per-file limit; cover cache lifecycle with four file-I/O regressions.
- Give iOS exports operation-owned temporary folders, removing partial/cancelled downloads and cleaning successful files after Photos or share-sheet completion.
- Retry iOS playback once on the first kept status even when the old player failure notification arrives later; reset status on post changes and honour cancellation.
- Android debug compilation and seven JVM tests pass; unsigned iOS simulator builds pass for ARM64 and x86_64. Source only; no phone installed or service changed.

## 2026-10-19 — Reset Android post-link readiness between posts

- Key the post-link screen's remembered post, progress, readiness, errors and retries by network and post ID.
- Opening a second post in the running app now starts its own readiness polling rather than inheriting a completed post's player state.
- Android debug Kotlin compilation and queue-receipt JVM regressions pass with one worker and a 1 GiB heap; no phone or service installed.

## 2026-10-19 — Cancel queued shares when clearing an account

- Clear-account now deletes queued URLs together with saved data.
- Revalidate the queue receipt and live account before work and inside every platform's save transaction after metadata fetching.
- Keep the optional transactional guard inactive for ordinary saves; cleared/deleted queued work cannot restore bookmarks or media.
- Add deferred-metadata clear/delete regressions and stale-claim coverage; 108 focused server tests, typecheck, lint (existing warnings) and formatting pass.
- Android queue-receipt JVM tests (3) and debug APK build pass with one worker and a 1 GiB compiler heap. Source-only changes; no service or phone installed.

## 2026-10-19 — Durable phone queue receipts and feed readiness

- Review fixes for background phone saves: include queued metadata in account-scoped preparing counts and keep disabled/backfill-excluded downloads visible.
- Remove queued URLs during account deletion and exclude orphaned account jobs from claims.
- Persist Android queue receipts before polling; resume receipts after process death or follow timeout without submitting another save.
- Add server feed/account regressions and Android serialization/HTTP resume tests; source is in flight, with no running service changed.
- Typecheck and lint pass (existing warnings); focused tests hit import timeouts under host load, Android build stopped to prioritise service recovery. Full verification remains required.

## 2026-10-19 — Publish only tagged releases

- Supersede automatic main-image publication: ordinary PR merges never publish; Release Please calls the publisher only after creating a tagged release.
- Remove both push and release-event publisher triggers, eliminating duplicate automatic entry points; manual recovery requires an existing release version.
- Keep per-SHA serialization, immutable images, build caches and latest-stable guards. Retire the rolling `main` tag and document migration to releases.
- Hide docs changelog entries so docs-only commits do not initiate releases; normal PR architecture/build validation remains unchanged.
- Validation: 2,892 tests, typecheck, formatting and Actionlint pass; lint has zero errors and existing warnings. Source changes are proposed, not deployed.

## 2026-10-19 — Skip documentation images and cancel superseded main builds

- Ignore documentation/deployment-example-only main pushes; mixed runtime changes still publish regardless of PR title.
- Cancel obsolete automatic main workflows while protecting versioned release calls and manual recovery, retaining the per-SHA build lock.
- Permit a completed code image to advance main across docs-only descendants, checking actual ancestry/diffs and both sides of renames.
- Keep immutable source tags/provenance accurate; document that a package-version release commit is a distinct source build.
- Add executable file-policy and Git-history regression coverage; source changes proposed separately from installed services.

## 2026-10-19 — Shared-NAS operating guidance after a live trial

- Document optional service keys, X OAuth setup and independent automatic/manual sync timings; expose the one-minute manual override in the NAS environment example.
- Add an illustrative CPU/RAM/swap budget, effective-limit checks and concurrent search/playback validation without treating text indexing as a video-memory benchmark.
- Distinguish digest pins, numbered versions and moving image channels; separate update detection, image publication and container recreation.
- Correct shared-NAS concurrency guidance and admin sign-in log recovery; extend the optional UGOS appendix with runtime and deployment-status checks.
- Keep addresses, credentials, measured household loads and actual installed resource limits private. Documentation only; no running service or default Compose limit changed.

## 2026-10-19 — Publish every main merge and validate release metadata

- Decouple commit-image publication from Release Please and disabled legacy Fly deployment; every main push builds an immutable SHA image and advances `main` only for the current head.
- Serialize duplicate events per source commit, reuse existing digests for numbered releases, protect immutable release tags and keep stable aliases on the latest release.
- Run full CI on feature PRs once; native runner builds supply the required build result. Release PRs validate actual version/changelog contents instead of receiving unconditional success.
- Remove automatic merges, redundant release-branch rebases, ad-hoc stuck-tag creation and the custom title override; use Release Please’s normal versioning and explicit reusable image publication.
- Add executable tests for metadata attacks, check outcomes, tag planning and stale/prerelease protection; document the pipeline and manual recovery. Legacy hosting and Pages remain opt-in.
- Source changes are proposed, not deployed; recover the already-tagged release through its existing publisher while the workflow fix is reviewed.

## 2026-10-19 — UGREEN deployment guide and first-save recovery

- Add an optional UGOS Pro walkthrough while retaining the portable Docker contract, including private bind-folder initialization, GUI configuration, proxy hooks and backups.
- Correct onboarding username-change guidance and distinguish email, admin-held and development sign-in links in the save modal.
- Recover failed retained-video previews when the matching post is saved; restore account-scoped Saved state and private tags on shared-preview reload.
- Document Jev search refinement and automatic channel/moment naming, including the public-text payload and local fallback.
- Private ARM64 trial verifies persistent accounts/saves, retained 1080p video and byte ranges, and real text/image/video indexing; household configuration and credentials remain outside the repository.
- Validation and final trial follow-ups are recorded in the PR; this source change does not publish a website or update an installed image automatically.

## 2026-10-19 — Reproducible font builds and verified Linux inference

- Bundle unchanged official font files, OFL licences and pinned provenance; root and site use local fonts, avoiding Google's variable response format and an upstream Turbopack parser failure.
- Keep secure Next 16.3.8 and the existing production bundler; correct remaining site metadata quality claims.
- Root production and static-site builds and focused layout tests pass locally. Prior fix da361e3 passed every GitHub check, including native AMD64/ARM64 conversion, persistence and real text/image/video inference; require the font revision's checks too.
- No service installation, image/site publication, DNS change or household configuration committed.

## 2026-10-19 — Pre-installation fixes and native Linux validation gates

- Patch production dependencies (Next 16.3.8 and compatible transitives): local production audit now zero; retain two documented development-tool advisories rather than forcing major overrides.
- Index shared post text on save and at web startup independently of model inference; cover production disabled flags, startup recovery, privacy/moderation and no model forks.
- Add native Linux AMD64/ARM64 container checks for media/download tools, ONNX, migrations, ranges, auth and persistent-volume recreation; enable real model inference with the `validate-models` label, replacing obsolete workflow-string assertions.
- Gate PRs on static website build and production dependency audit; keep Pages publication manual.
- Persist quick-start configuration, select the checkout's image explicitly, correct phone build/signing guidance and default links, and expose public install destinations as image build arguments.
- Readiness now distinguishes merge checks from target workload/restore checks after a private trial and later phone/public-site distribution. No service installation, image publication or domain change.

## 2026-10-19 — Guide, website and release-quality audit

- Correct stale self-hosting orientation, backup/dev-secret instructions, extension setup and privacy descriptions; separate website source from live deployment.
- Website copy now describes offline queuing, native playback/search, conversion and X prerequisites accurately; its Privacy link targets the maintained policy.
- Record outstanding production dependency advisories (14, including one critical), model-off keyword indexing, Linux/physical-phone testing and domain cutover in `docs/rollout/self-hosted-release.md`.
- Verify static site build, formatting and UI lint; reproduce the model-off keyword gap with a synthetic production database. Mark legacy architecture sections explicitly.
- No dependency upgrade, backend behaviour change, website publication or service installation in this audit.

## 2026-10-19 — Retained-media recovery and portable Docker hosting

- Persist the backfill-off boundary across restarts, preserving interrupted jobs and retries.
- Reconcile downloaded file kinds/counts into every saver's playback metadata; preserve private state and article categories.
- Reuse existing retained link-network metadata when a new person saves a post whose original is gone; exclude banned savers and hidden posts.
- iOS search follows further pages in the grid/player, with cancellation, deduplication and retry.
- Replace the vendor/Funnel-specific NAS example with standard Docker proxy/storage hooks; pass media/search controls, add restart/health checks and document playback privacy and backups.
- Validation: 2,843 tests, typecheck, formatting, production build and iOS simulator build pass; lint has no errors. Fresh/upgrade migration and production retained-save/range/auth smoke checks pass. Linux container/hardware testing remains outstanding. No service installed or deployed.

## 2026-10-18 — From scratch on a production build: web, iPhone, Android, 14 networks

- **Setup:** `next build` standalone, run like the container (migrate, then `node server.js`) on an empty database with `EMAIL_LINKS_TO_ADMIN=1`, `ALLOWED_EMAILS=@friends.test` and the Jev key.
- **Passed:**
  - Owner bootstrap from the server log; the admin card's waiting links for two friends; a stranger refused.
  - Fresh pairing of three phones.
  - One post from each of 13 networks kept at best quality and indexed (picture, words, video), including a 4K YouTube video (508 MB) that the phones played as soon as it was kept.
  - Search by meaning plus the Jev refine, per user, on web and phone keys.
  - New saves reached the right phone as a pill; a cross-user save shared the kept file.
- **Fixed:**
  - Name and channel screens showed adhx.com (inlined at build time); they now use the page's own address.
  - A DRM Vimeo video was kept as its thumbnail.
  - Sounds and picture-only posts retried video frames forever.
  - "This video is unavailable" was retried instead of being treated as final.
  - A download waiting to retry gave the player no reason.
  - Returning sign-ins were shown "Save your first post".
  - `.dockerignore` now leaves out apps, site and build output.
- **Known:**
  - Imgur blocks UK addresses (403).
  - X sync needs the owner's own X developer app.
  - Web sign-ins end when `SESSION_SECRET` changes (phone keys survive), so keep it fixed in the NAS `.env`.

## 2026-10-18 — Cross-device run: who sees what, everywhere

- **Setup:** e2e server on :3020. Ana on the iPhone 18 Pro, the owner on the iPhone 16, Ben on the Android emulator (fresh install, paired by `adhx://pair` link), and all three on the desktop.
- **Passed:**
  - Ana's share from Safari (SoundCloud) reached her saves on the server, desktop and phone, and nobody else's.
  - Ana's desktop paste (Threads) showed on her phone as a "1 new save" pill that jumps to it.
  - The owner saved Ana's Reddit video: one download job, kept files shared, a pill on his phone.
  - Ben's Android share (the Threads post Ana also has) reached his phone with a pill.
  - Search stayed per person ("baby" found nothing for Ben, "space jellyfish" found the Threads post for both).
  - Ana's desktop archive removed the post from her phone feed; it still opens by id.
  - Right now's stream named nobody.
- **Fixed on the way:** a sound post's filled cover pushed the caption and buttons off-screen (iOS); new saves arriving above the post on screen now show a pill (both apps).
- **Known:** sounds are found only by their words (no audio processing). Right now forms no group from this small mixed set.

## 2026-10-18 — Phone player: design v22–23 on iPhone and Android

- **Player** (both apps, from the design artifact): swipe up/down between saves, tap to pause; right column Sound, Repeat (off by default: a video that ends plays the next save), Save (Photos / MediaStore, from `?download=1`), Share, Original (the network's logo); bottom row time, scrub line, small window, Hide. Shadows only on words over media.
- **Text posts** are full bleed: short ones centred in a large serif, long ones fade with **Read all**, which opens a scrolling reader with a reading line.
- **Small window**: picture-in-picture, also automatic when leaving the app mid-video. Android adds Previous/Next save in the window.
- **Verified:** iPhone simulator (Repeat, auto-advance, Save to Photos, toast, Hide, reader). Android emulator (column, playback, seek, Repeat, Hide, Save of a 4K video). Not verified: the iPhone small window (the Simulator has none) and the Android reader and small window on screen.
- **Notes:** each 4K Save is ~0.5 GB on the phone; the emulator crashed once when the Mac was low on disk.

## 2026-10-18 — iPhone app plays and searches your saves

- **Home is My saves** (`apps/ios/App/Library/`): a vertical paging `ScrollView` with one `AVPlayer` that follows the post on screen, loops, starts muted (speaker button), and pauses on tap. Albums swipe sideways; words read as a card; "Open original". Errors show the server's 404/410 `reason`.
- **Search** (`SearchView`): debounced at 350 ms, TRY DESCRIBING prompts, a poster grid with match strength, "Still learning…" and "Nothing close" notes; a result opens the player there.
- **Shared lately** (was `HomeView`) is behind the clock button; a row opens the post in the player (`/api/app/saves?platform&id`).
- **Posters:** Reddit/Bluesky videos had none, so tiles were blank. `src/lib/keep/poster.ts` takes a still on download, and `/api/files/…/poster` makes one once for videos kept before.
- **Verified** on the iPhone 18 Pro simulator against the e2e server: the Reddit video plays (Range 206s), the X album pages, "baby" finds and plays it.
- **Not yet:** Android (its own session), preloading the next video, background audio.

## 2026-10-18 — Phone API for playing and searching your saves

- **Owner decision:** the apps play your saves natively and search them by meaning; the server keeps doing the heavy lifting (downloads, understanding, streaming).
- `GET /api/app/saves` (newest first, no archived, `offset`/`limit`; or `?platform&id` for one) and `GET /api/app/search` (`findPosts` with `scope: 'mine'`, Jev refine on page one, 120/min) take a phone key and only read that key's own saves.
- Both answer `PhonePost` (`src/lib/app/phone-post.ts`): kind (video, audio, photo, article, text), author, text, relative `/api/files` media and poster addresses, `sourceUrl`, `openPath`, and on search `match` and `learning`.
- Spec updated (`docs/specs/phone-app.md`: API, the player and search). App READMEs and the "only sends links" copy change with the app work.
- **Next:** iOS and Android player and search screens; the design artifact gets the new boards.

## 2026-10-18 — Admins see when a sign-in link is waiting

- With `EMAIL_LINKS_TO_ADMIN`, a friend asking for a link waited until the admin happened to open the admin page. `/api/auth/me` now has `waitingSignIns` for admins (only when links are held; never for anyone else).
- The account menu shows the count on the avatar and a "N sign-in links waiting" item to `/admin#sign-in-links`; an admin's menu looks again every 30s. The card scrolls itself into view once loaded.
- **Not covered:** phones in the theater and search hide the avatar, so there's no badge there.

## 2026-10-18 — End-to-end run: owner, friends, iPhone and Android

- **Run:** fresh server with no email (links handed over), `ALLOWED_EMAILS=@friends.test`, no X app. Desktop (Playwright) for an owner and two friends; the iOS app on two simulators; the Android app on an emulator; a stranger. Pairing by typed code and by the QR link, shares from Safari and the Android share menu, already saved, not a post, offline then back, removing a phone.
- **Owner setup:** before there's an admin, held links follow `mayGetHeldLink`, so the owner gets in even off the invite list. Opening a link while nobody is admin makes you the admin (`claimOwnership`); only someone with the server log could have it. The waiting screen says the link is in the log (`setup: true`). Email delivery still needs `ADMIN_USERNAMES`.
- **No X app:** `/api/auth/me` has `xAvailable`. Start, Settings and the account menu stop offering Connect X (it was a bare 500). Start offers "Save your first post" instead.
- **Search on small libraries:** z-scores used only the library's own spread, and with n posts nothing can score over √(n−1), so a new friend's search by meaning found nothing. `background()` blends in a measured prior (465 posts, 25 queries) worth 20 posts. Filler words ("a", "the", "at") are left out of the keyword query.
- **adhx.com in the app:** username, channel links, the OG card, the email logo, privacy and admin copy now use this server's address (`PUBLIC_HOST`).
- **Unsaved link-network preview:** `/api/files` answers 404 with a reason ("Nobody here has saved this yet") and the player shows it without dropping the post. A download that gave up is 410.
- **Apps:** Android typed `10.0.2.2:3020` as https (iOS used http for local addresses, now both do). Both re-check "can't be reached" every few seconds. iOS: the share card no longer leaves an empty half-screen when iOS shows it as a card; the Connect screen scrolls instead of pushing the logo under the clock.
- **Follow-ups:** no notice to the admin that a link is waiting; Android "download" link in Settings needs a published APK; Reddit videos have no poster frame.

## 2026-10-18 — Android app builds; phone API gaps fixed

- **Android:** first real build (JDK 17 + SDK 35, wrapper jar committed) and an emulator run against a local ADHX. Fixed a crash on the first API call (body read on the main thread), new shares landing above the fold in Shared lately, and "Kept · saved" for words-only posts.
- **Gone tweets:** `fetchTweetResult` (fxembed) tells "gone" (FxTwitter 404/401) from "couldn't ask". `addTweet` now answers 404, so `/api/app/save` says `unavailable` instead of a 500 "try again".
- **Status `off` with KEEP_BACKFILL=off:** an older save nobody re-saved since the server started is never kept; `/api/app/status` said `waiting` forever (and apps polled forever). It now says `off`. `keepCutoff()` in the keep worker exposes the cut-off.
- **Re-encoding:** `percent` is null and the new `step` is `converting` while ffmpeg turns a VP9/AV1 download into H.264 (was a stuck 99% for minutes).
- **Video-only networks** (YouTube, Vimeo, Twitch, SoundCloud): when yt-dlp says the post is gone, the save is `unavailable`; when it fails for now, the post stays a video and the download retries. Before, both became a "photo" of the page's thumbnail.
- **Follow-up:** apps could show `step: converting` as words; an explicit phone re-share of an old post could queue it despite the backfill cut-off.

## 2026-10-18 — adhx.com moves to GitHub Pages

- **Owner decision:** adhx.com is only the website, served by GitHub Pages. The self-hosted app doesn't serve it.
- **What moved:** the product site, reel, art and video are now in `site/`, a static Next.js export built with webpack. Turbopack picks up the app's `src/instrumentation.ts` through the shared lockfile. Gob, NetworkIcon and the network list are copied in `site/components/`.
- **Deploy:** `.github/workflows/site.yml` deploys `site/out`. `CNAME` is `adhx.com`. Pages must be enabled with source "GitHub Actions".
- **Removed from the app:** `ADHX_PRODUCT_SITE`, `/showreel`, the old iCloud shortcut (it opened adhx.com) and the adhx.com share-target defaults.
- **Skill:** now requires `ADHX_URL`.

## 2026-10-18 — Gob is back; adhx.com becomes the product site

- **Gob** (`src/components/next/Gob.tsx`, CSS `.gob` in globals.css) replaces the yellow square with dots, per brand/BRAND.md. The serif "adhx" wordmark stays.
  - Moods: `idle` (blinks, glances), `busy` (bob, look around, "o" mouth), `shut` (eyes closed).
  - Inside `.gob-host`, hover or focus makes Gob look around.
  - `AdhxFace` now renders Gob.
  - The header Gob goes busy through `logo-busy.ts` (`useBusyLogo`) while the player loads, search runs, a paste is grabbed or X syncs.
- **Product site** (`src/components/site/`), shown at "/" to signed-out visitors when `ADHX_PRODUCT_SITE=1` (set in fly.production.toml).
  - **Hero:** `HeroReel`, a ~31 s scripted reel as live markup at 1280×720, scaled to fit.
  - **Sections:** networks, search (EmbeddingGemma 2), kept originals, player, Right now, channels, X sync, phone apps, Claude, self-hosting.
  - **Illustrations:** illustrated posts (`art.tsx`) instead of anyone's real content.
  - **Video:** `/showreel` shows the reel alone. `public/site/adhx-reel.mp4` (1.9 MB) and `.jpg` were recorded from it with Playwright and encoded with ffmpeg. Re-record after changing the reel.

## 2026-10-18 — ADHX Share apps (iOS + Android)

- **iOS** (`apps/ios`): hand-written Xcode project (objectVersion 77, synced folders), SwiftUI host app (QR/typed pairing, `adhx://pair` link, Shared lately, Settings) + Share Extension running saving → saved / already / not a post / offline / not connected. Address, history and queue in the App Group; key in the Keychain. Bundle prefix and team in `Config/Base.xcconfig`. Builds with `xcodebuild … CODE_SIGNING_ALLOWED=NO`; paired against a real local server in the simulator. iOS 27 shows share extensions inside the system card, so there is no see-through backdrop.
- **Android** (`apps/android`): Kotlin + Compose, translucent `ShareActivity` bottom sheet, ZXing scanner (no Google services), WorkManager offline queue, EncryptedSharedPreferences. **Never compiled** (no JDK/SDK on the build Mac), and `gradle-wrapper.jar` is missing: run `gradle wrapper --gradle-version 8.11.1` once and commit it.
- Both use Gob (from `src/components/next/Gob.tsx`) and `public/icon-512.png` for the icons. README → Phone app covers installing.
- Follow-ups: compile and test Android, CI builds/releases for the APK, TestFlight, and channels from the sheet.

## 2026-10-18 — Phone app server side (ADHX Share)

- **Phone keys**: `access_keys.scope` (`search` | `phone`, migration adds it, old rows are `search`). Phone keys work only on `/api/app/save|status|me`; search keys only on `/api/agent/search`. Up to 10 phones.
- **Pairing** (`src/lib/auth/phone-pairing.ts`, table `app_pair_codes`): Settings → Phone app (`PhoneAppCard`) makes an 8-character code, single use, 10 minutes, shown as a QR code holding `adhx://pair?server=<origin>&code=…`. `POST /api/app/pair` spends it for a key; the card polls `/api/app/phones` and lists/removes phones.
- **Save** (`POST /api/app/save`): the add logic moved out of the routes into `src/lib/bookmarks/add.ts` (`addBookmark`) and `add-tweet.ts` (`addTweet`), so the X branch no longer loops back over HTTP with the cookie. Answers `{ platform, network, id, author, text, posterUrl, openPath, alreadySaved, savedAt }`, 422 `not_a_post`, 404 `unavailable`.
- **Status** (`GET /api/app/status`): keep job state plus a live percent from yt-dlp's progress lines (`src/lib/keep/progress.ts`, in memory, never goes backwards).
- Contract for the apps: `docs/specs/phone-app.md`. Apps live in `apps/ios` and `apps/android`.
- Follow-up: "Add to a channel" from the sheet needs a channel scope for phone keys.

## 2026-10-18 — Sign-in without Resend

- **Three ways to deliver links** (`src/lib/email/magic-link.ts`, `signInDelivery()`): Resend; your own mail server (`SMTP_URL`, nodemailer, `smtpOptions` parses `smtp://`/`smtps://`); or `EMAIL_LINKS_TO_ADMIN=1`.
- **Admin hand-over**: links wait in `admin_sign_in_links` (raw link, lives as long as the 15-minute token; hidden once used) and show on the admin page's "Sign-in links" card (`/api/admin/sign-in-links`).
- **Who gets a held link** (`mayGetHeldLink`): invited emails, existing accounts, or anyone while no admin exists. The owner's first link (and admins' own) also prints to the server log.
- **UI**: the start screen says "Ask whoever runs it for the sign-in link".
- **Compose**: no longer requires Resend.

## 2026-10-18 — Self-hosted: kept media and fourteen networks

- **Decision (owner)**: ADHX is for self-hosting with friends, never commercial. Save each post's media locally in the best quality and serve it; support linktokeep.com's networks. Reverses the 2026-10-16 "proxy only, no yt-dlp, drop YouTube" call (`docs/specs/any-site-links.md` marked superseded).
- **Kept media** (`src/lib/keep`, tables `keep_jobs` + `kept_files`):
  - in-process queue, newest save first, with backoff
  - downloads from fxtwitter for X, otherwise yt-dlp plus og:image
  - non-H.264 video is re-encoded to H.264 at the same size
  - served by `/api/files/...` with Range support, and a relative 307 to the old proxies until kept
  - hourly orphan clean-up
  - the understanding worker reads kept files from disk; its hash gains `:kept`
  - Docker installs Python and a pinned yt-dlp in `/opt/yt-dlp`
- **Link networks**: YouTube, Facebook, Reddit, LinkedIn, Vimeo, SoundCloud, Pinterest, Twitch, Threads, Imgur and Bluesky.
  - Code: `networks.ts`, `describeNetworkPost`, `/s/{network}/{id}`, `/api/links/resolve`, plus paste-after-the-address support in `proxy.ts`.
  - Measured live: all ten saved and downloaded in 1–4 s each.
  - Facebook and Twitch kept at 1080p, X at 4K.
  - Vimeo's own videos are DRM (picture only); Threads gives a preview-sized picture only; Imgur is blocked in the UK.
- **Self-hosting**: `ALLOWED_EMAILS` sign-up allowlist; iOS Settings card explains making your own Shortcut for a non-adhx.com origin; skill takes `ADHX_URL`; README rewritten for self-hosters.
- **Disk safety** (found when a test backfill filled this Mac's disk): downloads pause below `KEEP_MIN_FREE_GB` (default 2) free, and `KEEP_BACKFILL=off` now also skips older jobs that were already queued.
- **Not verified**: the Docker image build (no Docker here), any server outside the UK, and a full-library backfill.

## 2026-10-18 — Hourly X bookmark sync; search your saves from the adhx skill

- **Hourly sync**: `src/lib/sync/auto.ts`, started from `instrumentation.ts`. Every 5 minutes it syncs people with X connected, at least one finished sync, `autoSync` not `'false'` in `user_preferences`, not banned, and no sync started in the last `AUTO_SYNC_EVERY_MINUTES` (default 50, so the gap stays under an hour). Mode `'new'`: 100 per page, stops after the first page holding a post already saved (X serves the newest 800 at most). Pauses 6h on X 402 (no credits), 15m on 429. Rows carry `trigger_type='auto'`; only manual rows count toward the Sync button's hour wait. The sync loop moved from the route to `src/lib/sync/run.ts` (`runBookmarkSync`), shared by both.
- **Access keys**: `access_keys` table (hash only, last four, last used), `src/lib/auth/access-keys.ts`, `/api/access-keys`, Settings → Search from Claude (`AccessKeysCard`), max 5. Only `/api/agent/search` accepts them (`Bearer adhx_…`, ban fails closed); it searches the key owner's own saves via `findPosts` (`src/lib/semantic/find.ts`, now shared with `/api/search`, Jev refine included) and returns a compact shape: kind, original and ADHX URLs, text, links, media, match strength. Deleted with the account.
- **Skill**: `skills/adhx/SKILL.md` now covers searching saves (setup, turning a request into `q` + `type`, response, errors) as well as reading X posts. Plugin 1.1.0.
- **Not verified**: a real X account (no X OAuth locally); auto sync tested with mocked X and the claim lock. X bills per post read, so each connected account costs up to ~100 posts an hour.

## 2026-10-18 — Production-readiness audit (production build, real engines, live data)

Ran the Docker layout locally (standalone `server.js`, full node_modules, `src/lib` for the tsx workers, migrate first) behind HTTPS, and a scripted audit of every journey on Chrome desktop, Safari desktop (WebKit), Android Chrome and iPhone (WebKit): 30–31 steps each, all passing at the end; plus a two-engine live test (save → other browser 0.5–2.6s; Tune in plays a new save on the iPhone 1.2s after it lands; watching counts correct) and the e2e suite on Chrome + iPhone WebKit.
Fixed along the way: `next build` failed (Turbopack resolving the `fork()` path; `turbopackIgnore`); sign-up dead end (16-char suggested names cut onto taken ones; now ≤15, older accounts get a claimable suggestion); moment stopwords were a Set of letters (`'a' + 'b'.split()`), hence names like "For"/"Get"; header search and home paste field lost text typed before hydration (now plain GET forms, uncontrolled); signed-out pages fetched learning status (401); channel tiles showed "Everyone"; `/now` was noindex while in the sitemap; site description still said playlists; `/now` and `/start` lacked an h1; theater load errors now offer Try again (and say when rate-limited); `mobile-webkit.spec` rewritten for the new theater.
Not covered here: Firefox (headless launch crashes in this sandbox), real email (prod refuses to send without RESEND_API_KEY — set it on Fly), X OAuth/sync with real credentials, load testing. Note: public reads are 120/min per client IP (Fly-Client-IP); carrier-NAT users share one. State: local, not pushed.

## 2026-10-17 — Retired Live, Trending and Leaderboard; profiles, privacy and errors in the new design

Owner: remove `/live`, `/trending`, `/leaderboard`; redesign profiles, privacy and the share error. Old URLs 308 via `next.config.js` (`/live`, `/trending/*`, `/discover` → `/now`; `/leaderboard/*`, `/collections/*` → `/channels`); sitemap now lists home, `/now`, `/privacy` plus content. A reachability script (routes + middleware + semantic workers + scripts as roots) found and removed ~70 dead files: the whole old `TheaterShell` and its chrome, the old `Header`, `PWAInstallPrompt`, trending/leaderboard lists, poster cards, old sync widget; their tests went too (unit count 3601 → 2691; e2e specs for Live removed). AppShell renders pages bare; every page has `NxHeader`. New: `ProfileParts` (hero + post grid) for `/{handle}` and `/t/{username}` (channel cards, "channels" wording), new-look `/privacy` (+ `PRIVACY.md` facts updated: Right now, channels, Top channels — owner to review), `/share` error, `error.tsx`. Paste failure toast offers "Watch it anyway". Fixed: server page calling a client-module function (`channelTitle` → `channels/title.ts`). State: local, not pushed.

## 2026-10-17 — Signed-out home and shared post pages in the new design

Signed-out `/` is `PublicHome`: hero ("Save it. Lose it. Find it."), paste-a-link-to-watch (no account needed), Start saving, Right now live underneath; the sr-only static list stays for crawlers; `?auth_error=x_link_only` shows a hint. Post previews (`/{user}/status/{id}`, `/reels/{id}`, `/reel/{id}`, `/p/{id}`, `/@{user}/video/{id}`) render `PreviewTheater` → `TheaterV2` (`source.shared`, `lead`) instead of `TheaterShell`; server side unchanged (metadata, streamed resolve, JSON-LD, pulse). The post loops until you move on, then everyone's similar posts follow (`/api/search/similar` now answers `scope=everyone` signed out). Auto-save rules kept; signed-out Save anywhere returns to that post's page with `?save=1`. Unavailable posts offer the original. New `theaterItemToFeedItem`; `SearchResultItem.stage` keeps the exact media item. Desktop theater sheets start below the header bar.
e2e: rewritten for the new pages (previews, signed-out, public-pages, save-clone, preview-repeat, theater-sound, paste-save-failure); removed specs for the old public Live theater and old preview chrome (desktop-filter-layout, launch-ux, live-queue-filter, mobile, queue-count, theater-read, theater-shortcuts, theater-tap-declutter). Not carried over: Read/Watch for a quoted video, the shortcuts help, tap-to-declutter.
Still old-look: `/live`, `/trending` (+archive), `/leaderboard`, `/{user}`, `/t/{user}`, `/admin`, `/privacy`, `/share`'s error page — owner to decide redesign or remove. State: local, not pushed.

## 2026-10-17 — Full two-browser pass: live data, journeys, edge cases

Second browser driven by a Playwright script signing in other local accounts. Live data verified both ways in ~2-3s: Right now counters, strip, card people +1, watching 1→2, Tune in auto-plays the next save when caught up. Fixed:

- Signed-out `/channels`, `/search`, Tune in went to the old public theater (AppShell redirect): now `/start?returnTo=` and public `/play?moment|channel`. Sign in button, no Paste when signed out.
- Making a channel private didn't reach the page for up to 30s (per-module caches; JSON-LD listed its posts). Owners can now switch Public/Private; Keep is private by default.
- New accounts: one-step new-look `/welcome`; no starter-playlist dead end; old header hidden on `/start`; "Maybe later" → Right now.
- More like this in My saves split into many "More like…" headings (`fromSource`).
- Tune in note folds into a chip after 8s; caught-up dims only the post; moment page has Paste; clear empty/error screens with the header; new 404.
- "1 saves today", blank text covers on moment cards, "@x · saved" toast, Top channels crash on a missing `items`.
  State: local, not pushed.

## 2026-10-17 — Right now is home; one nav everywhere

Owner: Channels and Tune in felt hidden behind the theater and search. Right now moved off `/channels` to its own page, `/now`, which signed-in `/` now opens (live, changes as people save, and every Tune in starts there). `PrimaryNav.tsx` gives every new-design screen the same four places: Right now · Channels · My saves · Search. Desktop gets header tabs (also over the theater at xl+); phones get a bottom tab bar. The moment page uses `NxHeader`. The Right now quiet state links to Channels and My saves. `e2e/right-now.spec.ts` watches `/now` (2/2 pass).
Also: search result views renamed Best first / By match / Play order; video tiles play muted on hover or focus (not with reduced motion). State: local, not pushed.

## 2026-10-16 — Settings redesigned; /play follows its reading settings

Settings (`src/components/next/settings/`) is in the new design, full-width with `NxHeader`. Your X bookmarks is the first card, with live sync via `useXSync`. `?sync=1` starts a sync; the account menu's Sync X bookmarks now points there. Sign out is on the Account card.
Theater v2 now honors Watching and reading. Sound comes from `useTheaterSoundPreference`, shared with the old theater, so the latest mute choice wins across tabs. In `next/stages`, Bionic Reading applies to post, quote and article-summary text. The reading font applies only to reading-sized text (>200 chars, quotes, summary), so short posts keep the poster serif. The exception: with Bionic Reading on they switch too, because Instrument Serif has a single weight and its synthesized bold is invisible (owner chose "reading text only").
Note: the TheaterV2 sound change landed inside 32c269b (another session's commit swept the file); d37cb50 has the stages and tests. State: local, not pushed.

## 2026-10-16 — YouTube removed; saved Shorts deleted; any-site study

Owner decision: ADHX only proxies public media it can understand, and YouTube Shorts play only through YouTube's iframe (no frames to sample), so YouTube is gone: no `youtube` platform, no StageYouTube/oEmbed adapter, no `youtube.com/shorts` detection in paste/share/prefix/extension/bookmarklet, no YouTube CSP frame-src. `/shorts/{id}` redirects home and stays reserved. `YtDebugOverlay` became `AvDebugOverlay` (`?avdebug=1` only).
Data: `src/lib/db/drop-youtube.ts` (called from migrate.ts) deletes every `platform = 'youtube'` row from bookmarks and its children, activity, moderation, analytics, understanding tables and FTS, plus auto channels that held a Short. Idempotent, one transaction, **irreversible on deploy**. Tested on the full test schema.
e2e: `theater-sound.spec.ts` now drives a TikTok preview with a local WebM (`e2e/fixtures/sound.webm`) instead of the faked YouTube player; the iOS reject-second-unmute case went with it.
Also: `docs/specs/any-site-links.md` measures proxy-only support for 12 more sites (yt-dlp rejected). Go: Bluesky, Streamable, LinkedIn, Pinterest, Reddit via vxreddit.
Follow-ups: the published iCloud shortcut may still offer YouTube (it now lands on "not supported"). State: local, not pushed.

## 2026-10-16 — Right now: Playwright spec across two accounts

`e2e/right-now.spec.ts`: one account watches `/channels` while another saves a frog post through `POST /api/bookmarks/add`; without a reload the watcher sees the strip chip "→ Frog", the card's people count +1 and its "Just saved" overlay. Second test: Tune in skipped to "You’re all caught up", watching 1→2 when the saver opens `/moments/{slug}`, then the next save auto-plays with "Just saved · just now".
E2E has no model, so `e2e/seed.ts` writes synthetic 768-dim `text` vectors into `post_embeddings` (6 frog posts on one axis saved by two seeded people, 40 background posts, two unsaved frog posts the spec saves) and `MOMENT_MIN_SAVERS=2` is set in `e2e/env.ts`. Naming falls back to the shared word, hence "Frog".
The engine keeps its state for the server's lifetime, so each attempt saves as a fresh account and asserts the count relative to before (passes with `--repeat-each=4`). Pre-existing, unrelated failures in the full Chromium run: `nav.spec.ts` (j advances Live) and `theater-tap-declutter.spec.ts` (desktop), both failing on the base commit too. State: local, not pushed.

## 2026-10-17 — Post words in the new theater: paragraphs, links, link cards, full articles

The owner's links were /author/status/id addresses copied from the new theater ("Copy link"), so their reports were about `/play`, not the older preview pages (which already rendered these). Fixed in the new theater: paragraphs run together (`postText` collapsed blank lines) → `postBody` + `RichText`; links/@mentions/#hashtags not clickable; no card or picture for linked pages → `LinkCard`; a tweet linking to a blog showed as an empty "Article by @…" → `isRealArticle`; X articles needed "Read it here" → shown in full on the stage; video/photo captions stuck at two lines → tap/More opens them; controls were a centred box for posts but full width for video → one full-width bar.

## 2026-10-16 — Full articles in the theater; second two-browser pass

Owner asked for a full re-test once Settings landed. Articles: the new theater only showed the title and six lines ("Read it here" went to X); added `ArticleReader`, the whole body in the reading font with Bionic Reading. Settings (new design) saves sound, Bionic Reading and font, and the theater and reader follow them (checked, then restored). Right now and Tune in re-tested with five more local accounts: saves land in under 3 s, watching 1→2→1, "1 new save just landed" then Play now with "Just saved".
Fixed: four frog saves split into forming groups of 3 and 1 (pairs of same-topic posts can sit ~0.3 apart) → `FORM_SIMILARITY` 0.33 and close forming groups merge; the name fallback ignored 3-letter words ("cat"); in dev the engine timer kept running pre-reload code (now rebinds per module copy); Settings had a generic tab title and sent signed-out visitors to `/`.
The built-in browser pane drops its cookie whenever the local server stops; sessions themselves survive restarts (an hours-old curl session kept working).

## 2026-10-16 — Right now: live moments and Tune in

What people are saving, grouped by meaning, live: `/channels` gets Right now (Just saved strip, moment cards that glow when a save lands, forming groups that pop into new moments), `/moments/{slug}` is a live page, and `/play?moment=slug` is Tune in (new saves play next, caught-up waits for the next one, Stay close / Wander, LIVE · N watching). Engine in `src/lib/moments/`, SSE at `/api/moments/stream`.
Tested end to end with two browsers as two accounts (the second via Playwright pasting real links): saves appeared on the other screen within ~1 s, people counts rose, a forming "Frogs?" filled 2→3→4 and became a moment, watching went 1→2→1, a brand-new post was understood and sorted in ~2 s, Tune in auto-played a save while caught up.
Tuning: similarities are centred (raw cosines ~0.72 for any pair). Fixed while testing: quoted posts counted as saves, first start re-streamed the last minute, label widened needlessly, strip thumbnails' shimmer covered the heading.
Prod: `MOMENT_MIN_SAVERS` (default 3). Follow-ups: a Playwright spec seeding vectors (e2e runs with understanding off), signed-out landing using Right now. State: local, not pushed.

## 2026-10-16 — Previous look removed; theater says when it leaves your results

Owner: "remove everything to do with the old design". The `next_ui` flag, `NEXT_UI_FORCE`, `/api/next-ui` and "Use the previous look" are gone; the library grid (`AuthedHome`, `FeedGrid`, `FilterBar`), Tags page and playlist theater were deleted. `/saved`, `/collection`, `/library`, `/tags` are now redirects; `/t/{user}/{tag}` always renders `ChannelPage` (private → owner only). No runtime rollback any more: runbook rewritten (rollback = redeploy previous release).
Still on the previous look, awaiting the owner's call: signed-out `/`, `/live`, `/trending`, `/leaderboard`, `/settings`, `/admin`, previews, `/welcome`. Their nav now points at Search/Channels/`/play?recent=1`.
Same day: posts added after a search's results (stick to this vibe / more like this) are labelled "More like @x’s video · Not from “q”" and don't change the "n of N" count; "couldn't be learned" is never shown; posts deleted upstream are hidden everywhere; X articles whose content never loaded are re-fetched at worker start; account menu (Sync X / Settings / Sign out) in the new headers.
State: local, not pushed.

## 2026-10-16 — Match strength in search, plus fixes from a full local sweep

Search results now say how close they are: a three-bar meter on every tile (Strong match / Good match / Related), strong first, and the rest under "Related to “frog”" explaining they're close in meaning but not what you described — so the chameleon and the seal under "frog" make sense.
Strength comes from the fused score; words-only matches take Jev's grade, which may lower them one level at most, and Jev drops words-only items it rates unrelated (< 0.5). Posts with no words of their own no longer get a words vector (they matched everything weakly).
Sweep fixes: deleted media (404/410) is "nothing to learn", not a failure (local pill went 14 → 2); signed-out sign-in returns to the exact search; channel pages say "channel" in their title and share card.
Eval unchanged: fused hit@5 0.81 / MRR 0.70, refined 0.90 / 0.83. State: local, not pushed.

## 2026-10-16 — Cutover (phase 7 of the redesign)

`next_ui` is on by default. Signed-in `/` and `/saved` open `/play?recent=1` (keeping `open=`), `/library` → `/search`, `/tags` → `/channels`; with it off the new routes bounce to the old ones. Signed-out `/`, `/live`, trending, leaderboard and settings are unchanged.
Rollback without a rebuild: runtime `NEXT_UI_FORCE=off` beats every browser choice. `/api/next-ui?value=0|1` persists a per-browser choice server-side ("Use the previous look" links on search and channels).
The supervisor now starts the query child first and jobs once it's ready (both would race the same model download on an empty volume). Privacy page updated for search by meaning, Everyone search and TypeSafe/Hugging Face (it claimed "no metered AI") — needs owner review.
Runbook with staged production rollout: `docs/rollout/next-ui-cutover.md`. State: local, not pushed; production unchanged.

## 2026-10-16 — Onboarding (phase 6 of the redesign)

`/start`: email link sign up/in (same box), "Check your inbox" that signs the tab in by itself once the link is opened, then Connect X and import with live counts (existing `/api/sync` stream) plus a "making them searchable" bar.
Paste a post link anywhere (or the Paste pill) to save it with the grabbing-it toast; it plays in a new recent-saves queue (`/play?recent=1`), or next in the theater. Learning ring + sheet on search, theater and channels; search badges "Words only" results.
Verified locally end to end, including a real magic-link sign-up with a throwaway test address (link from the dev log). Copy from the design was corrected: no audio is heard, and Jev sees text, so "nothing goes to outside AI companies" became "pictures and videos are understood on ADHX's own servers".
Fixed while verifying: "Nearest 0 matches" headline, a recent-queue start post older than the newest 100 now plays first, the ring stays reachable when only failures remain.
Search eval re-run now that every picture and video is understood: fused hit@5 0.81 / MRR 0.70, with Jev 0.90 / 0.83 (unchanged) — phase 2 tuning holds.
State: local, not pushed. Next: cutover (phase 7).

## 2026-10-16 — Channels (phase 5 of the redesign)

Channels are tags: theater Save opens "add to a channel" (tick, find or create; new channels are public), `/channels` shows Made for you, yours and Top channels, and `/t/{user}/{tag}` renders the new channel page under `next_ui`.
Made for you: saves grouped by meaning (k-means, big groups split) and named from `CHANNEL_NAMES` via Jev `choice` among the closest names; stored in `auto_channels`, recomputed only when stale; Keep makes it a public tag channel.
On 448 local saves: 8 groups of 24–51 posts (Memes, Reaction memes, Automation, Dev tools, Prompts and tricks, Coding with AI, Internet lore, AI agents); first compute ~2–8 s. Removed "Cringe" from the names (judgy). Plain k-means gave catch-alls of 78–95 posts, hence the splitting.
New public `GET /api/channels/by/{user}/{tag}` lets anyone play a public channel; the tag visibility logic moved to `src/lib/tags/visibility.ts`; Jev calls share `src/lib/semantic/jev.ts`.
State: local, not pushed. Next: onboarding (phase 6). Top channels is empty locally (no public views in this DB).

## 2026-10-16 — Theater v2 (phase 4 of the redesign)

`/play` behind `next_ui` plays a search's results as the queue (Play all, Play this group, any tile). It reuses the current `Stage` for media and adds the approved chrome: rail, seek, transport, volume, repeat, PiP, full screen, Up next and ⋯ sheets, keys and swipes.
New `GET /api/search/similar` (a post's own vectors per kind, same fusion and scope rules) powers More like this and Stick to this vibe, which carries on past the end of the queue.
Fixes found while verifying: an extension flag read back from a state updater was always false (ended instead of continuing), cream text posts sat under the rail, the install banner hid the header, long links overflowed the text stage.
Verified on 448 local saves at 1280px and 375px. State: local, not pushed. Next: channels (phase 5); Save currently saves only (adding to a channel comes with it).

## 2026-10-16 — Search screen (phase 3 of the redesign)

Merged phase 0 (`feat/next-ui-foundations`) into `feat/find-by-context`. Added `/search` behind `next_ui`: search bar with My saves / Everyone, type pills, Words only, Bento / Groups / Queue, Play all.
Bento autoplays the best match muted (own media proxies; off under reduced motion) beside a masonry; Groups split results by how they matched; Queue explains "Why this one".
The API now reports `close` (best hit ≥ 2.2) so a far-off query reads "Nearest …" instead of claiming matches. URL sync uses `history.replaceState` (router.replace re-rendered the server page per keystroke and lost the flag).
Verified on 448 local saves at desktop and 375px. State: local, not pushed. Next: theater v2 (phase 4) takes the result list as its queue; Play opens the first result in today's theater until then.

## 2026-10-16 — Search API by meaning (phase 2 of the redesign)

`GET /api/search`: words/picture/video vectors plus FTS5 keywords, `mine`/`everyone` scope, feed type filters, words only, optional Jev rerank (`refine=1`).
Fusion standardises each vector list per query (z-scores); RRF scored hit@5 0.35 because every query gets a weak picture list. Fused hit@5 0.84 / MRR 0.68 on 31 labelled local queries; with Jev hit@1 0.77, hit@5 0.90, MRR 0.83 (~250ms). Weights were tuned while only ~60 posts had visuals: re-run `scripts/eval-search.ts` once backfill finishes.
Everyone results are post keys filtered by bans and moderation; other savers' copies are anonymised in `items.ts`.
Also fixed: inference blocked the web event loop (see phase 1 entry), Jev 400s from half emoji (`toWellFormed`).
State: local on `feat/find-by-context`, not pushed. Next: search UI (phase 3), which needs phase 0's `feat/next-ui-foundations` merged in.

## 2026-10-16 — Understanding pipeline for search by meaning (phase 1 of the redesign)

Owner approved a phased rebuild around search by meaning, a content-first theater, and channels (design canvas linked in the PR).
Added `src/lib/semantic/`: EmbeddingGemma 2 on the server (text q4, vision q8, no audio) understands words, one picture, and video frames.
Results are keyed by post (no user id, no tags) in `post_embeddings`; a durable `understanding_queue` puts fresh saves and Up next first.
The model runs only in two child processes forked at startup: a niced jobs worker and a words-only query embedder (in-process inference froze every request for up to 12.5 s). ffmpeg-static samples 16 frames over the first 32 s at 70 vision tokens each (pond's 32 × 140 took ~42s and ~3GB per video on CPU; 16 × 70 takes ~11–15s and ~2GB with cosine ~0.95 to the full vector).
New `/api/understanding/{status,retry,prioritize}`; saves, sync and clone enqueue. Fly VMs raised to 4GB.
State: implemented locally on `feat/find-by-context`, not pushed (GitHub account setup pending). Next: search API (phase 2).

## 2026-10-16 — Redesign phase 0: next_ui flag, tokens and visual primitives

Started the find-by-meaning redesign as a strangler rebuild behind `next_ui` (env `NEXT_PUBLIC_NEXT_UI`, `?next_ui=1` persisted per browser).
Added nx- tokens (warm black, cream, yellow #ffd23f) and Instrument Serif + Hanken Grotesk alongside Matter, not replacing it.
New `src/components/next`: five tiles, four stages, the AdhxFace loader, shimmer skeleton and paste toast, all from `FeedItem`.
Text over media always gets the black scrim plus text-shadow; controls get a dark translucent backplate; motion respects reduced-motion.
`/dev/next-ui` previews everything with real saves; verified at 390px and 1440px. Tests cover the flag, rendering and translation safety.
State: committed locally on `feat/next-ui-foundations`, not pushed. No schema or backend changes (phase 1 runs in parallel).
Follow-ups: theater v2 should wire stages to real players via the `media` slot; GIF tiles still show a still cover, not a loop.

## 2026-09-15 — Move mobile PiP into bottom playback controls

Moved picture-in-picture from the right post-action rail to the bottom playback group, beside expand.
Preserved 44px playback targets; the filter becomes icon-only when its group has little space.
Kept PiP failure feedback visible above the dock and removed the old rail ordering from its wrapper.
Verified 360px/430px layouts, 3,686 unit tests, and 12 mobile/playlist browser regressions.
State: implemented for review; requires merge and deployment.

## 2026-09-15 — Center playlist identity and add picture-in-picture

Centered the desktop logo, tag, and curator/count line; removed the logo link's inline baseline gap.
Added a PiP button beside desktop transport and in the mobile action rail for direct video playback.
The stage owns standard/Safari PiP requests, readiness, native close events, and retryable failures.
Consecutive video sources retain their element; covered/unmounted stages exit and late requests clean up.
Verified native Chrome PiP, mobile/header geometry, 3,686 unit tests, and 17 browser regressions.
State: implemented for review; requires merge and deployment. Embedded-player PiP remains browser-owned.

## 2026-09-13 — Sync all X bookmark pages by default

The normal dialog used all=false, repeatedly fetching only the latest 50 bookmarks.
Every sync now follows X pagination to exhaustion, including short/empty/duplicate-only pages.
Removed the silent 20-page cutoff and ignore legacy truncation flags from cached clients.
Repeated cursors fail visibly rather than loop or report an incomplete scan as completed.
Settings and docs describe importing all bookmarks X exposes, with its availability limits.
Validated 3,677 unit tests plus desktop/mobile sync progress browser checks.
State: implemented for review; requires deployment and a new sync to backfill older saves.

## 2026-09-13 — Stabilize the combined release's remote-add browser check

The Live-after-Next scenario could navigate from Preview onto the quote-video fixture.
Its caption assertion also matched upcoming queue cards, masking the wrong active post.
Filter to text, select Alpha, then verify the advertised next row stays active after the remote add.
This retains the playback/remaining-count checks and strengthens the no-stage-stealing assertion.
State: in the launch PR; combined release CI must pass before merge and production deployment.

## 2026-09-13 — Compact desktop filters and unobstructed playlist controls

Desktop Filter opens a small counted post-type menu; Queue continues to open the playlist.
Both use 32px desktop pills, while mobile keeps its 44px touch targets.
Open desktop panels sit above stage shading and hide the underlying post actions until closed.
Counts use the full type-filter source so choosing a type does not erase other type counts.
Keyboard regression coverage retains Shift+Q, arrows, Enter, Escape, and focus restoration.
State: implemented for review in the launch UX PR; not deployed.

## 2026-09-13 — Make the launch theater easier to understand

Discover defaults to Videos + Hide watched; Saved defaults to All posts with history visible.
Each destination remembers its filters independently; shared targets and authored playlists stay intact.
Replaced the watch pills with one switch, labelled the content filter, and separated Repeat from watch exclusion.
Added first-visit and empty-account paste/watch/send guidance plus direct verified media actions.
Theater Paste link uses an orange outline; phone media actions remain icon-only with 44px targets.
Added confirmed playback analytics and failure/cancel checks for successful file-send metrics.
Prepared a verified public clip shortlist and three playlist candidates in `docs/launch-content.md`.
State: implemented for review; launch spec records validation. Deployment and final playlist curation remain separate.

## 2026-09-13 — Reveal and follow an already-running X sync

Settings now opens the Header-owned sync dialog, revealing a silent run without starting another.
Additional SSE connections observe user-scoped durable progress and completion instead of an “already in progress” error.
Only the lease owner writes counters; observer disconnects leave that run intact.
Duplicate bookmarks now advance the displayed progress, including duplicate-only runs.
Verified desktop/mobile SSE flows, isolation and failure recovery; all 3,660 unit tests pass.
State: implemented for review; requires deployment. No schema changes.

## 2026-09-12 — Put watch history in the existing filters

Removed the floating All / Unwatched navigation-style pill from desktop and mobile.
Watch history now sits beside Post type in the desktop Queue/filter panel, mobile quick
filters, and expanded Queue. The filter icon highlights Unwatched as well as type lenses.
Playback, browser-local history, and the default All selection retain their existing behavior.
Updated desktop/mobile browser checks for the panel and active indication; all 118 browser tests pass.
State: implemented for review; requires application deployment. No schema changes.

## 2026-09-12 — Keep new arrivals directly next after selecting an older post

A stable CI queue scenario exposed a real ordering gap: repeat-off pinned the selected post
only after inserting arrivals, leaving newer unseen predecessors ahead of the new Next item.
Live arrivals now insert against the same current-first order that playback renders; repeat-all
retains its circular order. Component and queue regressions cover selecting an older unseen post.
The two race-sensitive browser scenarios explicitly select and pause known text fixtures,
avoiding external-player startup and stale transport icons during test setup.
State: implemented for review in the Instagram delivery PR; no schema changes.

## 2026-09-12 — Direct Instagram video delivery and legacy photo fallback

Relay `video_versions` now supplies allowlisted MP4 URLs before the mirror fallback.
Streaming and downloads share a 30s resolution budget, Range forwarding, redirect validation,
and one expired-signature refresh; validated refreshed URLs survive the probe/player handoff.
Structured photos mislabeled by old saves render the photo album without video retries;
stored classification is unchanged. Unavailable embeds link to Instagram above mobile controls, avoiding a preview loop.
Verified a real Reel playing and downloading locally; the original reported URL still exposes no usable post data.
State: implemented for review; requires application deployment. No schema changes.
Follow-up: verify CI (four live CDN tests later hit local TLS trust errors); monitor crawler availability after deployment.

## 2026-09-12 — Update the Discover empty-state browser regression

The full CI browser suite caught two stale Live empty-state assertions after the Discover rename.
Updated the preview-pulse test to assert the new copy while retaining its video/text filtering
and empty-to-populated queue checks. All 114 browser tests pass locally without retries.
State: implemented for review in the personal-home PR.
Follow-up: run the complete browser suite for navigation/copy changes, beyond targeted scenarios.

## 2026-09-12 — Personal videos first, with an explicit watch filter

Signed-in home now opens My videos (`/saved`); the community feed is secondary Discover (`/live`).
My videos loads every non-archived save in 100-row pages; incomplete loads show Retry.
All / Unwatched is visible on desktop and mobile and defaults to All on each visit, independent
of Repeat. Saved departures mark browser-local history without publishing activity; Unwatched
retains the active post, skips watched archive successors, and offers Show all when caught up.
Navigation, preview links, and shortcut labels agree; Library and public playlist contracts remain.
State: implemented for review; requires application deployment. No schema changes.

## 2026-09-05 — Paste opens the new post even when saving fails

Personal Live/Saved paste previously removed its loading cover on an add error, resuming the old
post. A failed save now opens the canonical preview with the old stage covered until navigation;
successful saves retain in-place playback and queue ordering. Instagram metadata failure can no
longer prevent a playable preview from opening. Component regressions cover Live/Saved API and
network failures; desktop/mobile browser regressions use the reported Reel URL.
State: implemented for review; requires application deployment. No schema changes.

## 2026-09-05 — Close playlist moderation and redirect gaps; repair literal search

Public playlist JSON and cloning now reject banned owners or unreadable moderation storage,
omit hidden platform/post pairs from content and clone counts, and disable JSON response caching.
Sign-in return paths reject control characters and verify the parsed destination stays same-origin.
Library search now declares SQLite's escape character, restoring literal underscores, percent signs,
and backslashes in author, text, and article searches. Regression tests cover all three review findings.
State: implemented for review; no schema changes or deployment required beyond the application update.

## 2026-09-04 — Mobile rail owns its complete touch target

The viewport-fixed caption scrim created a stacking context below the larger invisible swipe zone,
letting the zone steal the bottom 16px of Share even though the visible controls did not overlap.
The action rail is now a higher-z sibling, captions clear the scrub hitbox, and edge controls plus
expanded Queue/filter content honor landscape safe-area insets. Browser regressions assert actual
`elementFromPoint` ownership and a non-empty media caption under hostile geometry. A dedicated
mobile WebKit smoke project now joins Chromium in CI and the local installer. State: complete.

## 2026-09-04 — Mobile bottom chrome shares one visual viewport

Returning from Settings exposed a split coordinate system: the oversized media paint layer owned
the absolute caption and previous/next zone, while the action rail and playlist dock were viewport-
fixed. Dynamic browser chrome could therefore push text behind the dock and separate the capsule
from its action rail. Caption/scrim and the bounded swipe zone now use the visual viewport too.
Live keeps the retired Save slot in its real order, so Share stays beside the capsule without any
action jumping; the former container min-height no longer leaves a blank slot under Share.
The hostile-height browser regression checks their fixed positioning, dock clearance, and joined
rail-to-capsule spacing. Current state: complete locally.

## 2026-09-04 — Sound hotkey follows media; mobile Live rail stays anchored

Browser fallback can leave the saved sound choice on while the live element is muted; `M` used to
toggle the saved choice, so the first press did nothing visible and a second press was required.
`M` now activates the visible audio control, which derives its target from the live media state.
The mobile Live rail reserves its four-action footprint while Save retires, preventing Open/Tag/
Share from drifting down toward the playlist dock; its icon-only Save content is explicitly centered.
The bottom scrim now fades without transforming, so WebKit cannot rebase its fixed rail during Focus.
Current state: complete locally; production repro, focused tests, and local desktop/mobile browser
checks pass.

## 2026-09-04 — Expanded Queue owns the mobile control surface

The bottom transport now orders Focus, play/pause, Repeat, then sound, swapping the old outer slots.
Save/Tag/Share/Open remain a vertical rail in every viewport and leave layout as soon as Queue
opens; they return only after the closing transition settles.
This supersedes the temporary horizontal action row above the expanded sheet.
Short personal-theater landscapes place the four-action rail left of Paste/Account and swipe, with
its foot 4px above the scrub hitbox; keyboard Queue opening transfers focus to the Queue toggle.
Current state: complete locally; component and portrait/landscape browser coverage updated.

## 2026-09-04 — Short-landscape Queue clears the top chrome

Raising expanded post actions above the seek target put them under Paste/menu at 844×390.
Short viewports now center that action row while preserving its vertical scrubber clearance.
The browser regression waits for the dock's 300ms transition to finish before measuring, then checks
both landscape top-chrome separation and portrait seek separation so in-flight geometry cannot pass.
Current state: complete locally; component and portrait/landscape Chromium coverage pass.

## 2026-09-04 — Expanded mobile actions clear the scrub target

Geometry review found the expanded Queue's right-side post actions overlapping the seek hitbox by
12px, so a right-edge scrub could trigger Share/Open. The action row now sits 28px above the dock.
The mobile browser regression removes only Next's dev portal, performs real touch taps on Playlist,
asserts browser hit targets, and proves the expanded actions end above the slider.
Current state: complete locally; focused component and Chromium checks pass.

## 2026-09-04 — Mobile progress rail replaces Queue drag

The mobile dock's straight top edge is now a clearly visible 4px playback rail with a larger
invisible seek target immediately above it, keeping horizontal scrubbing away from browser chrome.
The competing drag/tap strip and `useSheetDrag` machinery are removed completely; the Playlist
button is the sole touch control for opening and closing Queue (keyboard, Escape, and backdrop
accessibility paths remain). The control row keeps the old 12px inset without owning gestures.
Current state: complete locally; component and hostile-viewport browser regressions cover visibility,
scrubbing, the absent drag target, and button-only toggling.

## 2026-09-04 — Mobile dock follows Safari and Chrome visual viewports

The oversized iOS `100lvh` layer is now paint-only: Queue/transport and its loading fallback are
fixed to the visual viewport, so Chrome cannot place the collapsed bar below its toolbar.
Playback progress moved from the OS-owned top edge to a straight full-width rail above that dock;
the queue surface stays clipped, and a narrow invisible strip preserves drag-to-expand.
Current state: complete locally; hostile +180px geometry passes CI Chromium plus manual
Chromium/WebKit phone emulation. The loading dock is component-covered; CI does not install WebKit.

## 2026-09-04 — Theater remembers sound across links and tabs

The audio button now stores the viewer's latest mute/unmute choice in browser-wide local storage,
instead of a tab-only session value, and live storage events synchronize already-open Theaters.
New links attempt the saved choice on mobile and desktop; cross-tab auto-unmutes are explicitly
classified as gesture-less so iOS can recover to muted playback and retry on the next stage tap.
Legacy tab values migrate on first load. Current state: complete locally; component and cross-tab
browser regressions cover native video and YouTube behavior.

## 2026-09-04 — iOS top controls clear the playback scrubber

Real-browser mobile emulation found the invisible top playback slider intercepting Paste/menu
after the header became fixed: the fixed header created a stacking context below the slider.
Mobile WebKit now raises the whole top chrome above that z-70 scrub target, keeping both controls
actually clickable rather than merely visible. Current state: complete; Chromium/WebKit interaction
checks cover menu, Paste, Queue scrolling, oversized-shell locking, and direct previews.

## 2026-09-04 — Theater locks document scrolling in every mode

The absolute iOS `100lvh` paint layer no longer makes shared previews vertically pan: every
Theater mode now locks both document scroll roots while mounted and restores their prior values.
Mobile WebKit applies the same lock immediately to the cold-loading shell; nested article, text,
album, and Queue scrollers remain independently scrollable. Current state: complete; regression
coverage includes shared-mode mount/unmount restoration and the iOS loading selector.

## 2026-09-04 — iOS Theater keeps top controls visible

Mobile WebKit now fixes only the Theater's top chrome to the visual viewport while the stage and
bottom surfaces retain the absolute `100lvh` paint area that removed the toolbar gap. Paste,
account-menu, playlist, and cold-loading headers therefore stay reachable after browser chrome
collapse without making Queue or transport jump. Desktop and Android behavior is unchanged.
Current state: complete; focused viewport and mobile chrome regressions pass. Real-device check remains.

## 2026-09-04 — Now playing is a queue-rendering invariant

Desktop filmstrip/Queue and the mobile sheet now normalize every list around the staged post, so
Now playing is always the first visible section and the circular successor is always Next.
Saved transport consumes that same normalized order for deep links, picks, repeat-one exits, and
already-Seen selections; Previous still reaches the circular tail and promotes Repeat all as needed.
Current state: complete; component, shell, reverse-navigation, and desktop/mobile browser coverage pass.

## 2026-09-04 — Theater queues rotate around Now playing

Live, Saved, shared, and curated queues now render and traverse one current-first circular order:
the departed post moves to the tail, and cross-tab/poll arrivals become Next without stealing the
stage. Saved inserts remote rows after its real cursor so the list and transport cannot disagree.
Previous is available whenever another row exists and wraps into Repeat all at the queue head.
Explicit pause intent now wins late dwell/video-ended races on pointer and keyboard controls.
Current state: complete; queue, arrival, repeat, Saved, playlist, and pause regressions added.

## 2026-09-04 — Paste resolving now suspends the staged post

Personal paste pauses the covered MP4 or YouTube player and blocks every timed/video advance until
resolution settles, so a failed add restores the exact post that was interrupted. Successful adds
keep the Gob resolver visible through bounded authoritative-feed retries instead of revealing stale
content; exhausted lookups show a feed-only Retry action and never repeat the committed add. The
parsed URL supplies a safe ID fallback. Current state: complete; MP4, YouTube, advancement,
serialization, and transient-feed regressions added.

## 2026-09-04 — Theater paints resolving posts immediately

Personal Live/Saved paste now stages the Gob resolver before add/enrichment returns, then swaps in
the saved row without remounting the persistent stage; failures uncover the untouched queue/cursor.
Direct X, Instagram, TikTok, and YouTube previews use the same resolving stage, and route loading
now paints a side-effect-free responsive Theater shell instead of a standalone loader. Current
state: complete; focused transitions, 3,568 tests, typecheck, lint, formatting, and build pass.

## 2026-09-04 — Desktop Theater consolidates sharing

Desktop post actions now use one Share pill instead of separate Copy/Download and Link pills.
Its expandable, type-aware menu reuses the mobile Theater behavior for text copy, media download
or native file sharing, and link sharing while leaving Save, Tag, Archive, and Open unchanged.
Current state: in flight; desktop and shared-menu regressions added.

## 2026-09-04 — Desktop Theater drops the redundant Live indicator

The generic desktop Live view now leaves only the ADHX logo in the top-left; the green-dot Live
label was redundant with the surrounding Theater context. Explicit Live/Saved tabs remain where
they communicate a real choice. Current state: in flight; component regression added.

## 2026-09-04 — Mobile Theater avoids the iOS fixed-viewport gap

Mobile WebKit now uses an absolute, large-viewport Theater shell instead of the fixed root that
iOS 26 clips when its browser toolbar settles. This keeps the stage and bottom control surface
painting through the translucent toolbar area after media loads, while desktop and Android retain
the existing fixed overlay. Current state: in flight; CSS regression coverage and full checks pass.
Real-device iOS verification remains.

## 2026-09-03 — Mobile Theater fills iOS safe areas

The root viewport now opts into `viewport-fit=cover`, so fixed Theater chrome paints through the
iOS bottom safe area instead of exposing the page background as a detached band. Shared-preview
Tag buttons now explicitly center their icon-only content and return to neutral styling at zero
tags; a real count still adds the clay outlined glyph and badge. Non-Theater sticky headers and
their loading skeleton now consume the top safe-area inset too. Current state: in flight; focused
layout and mobile-chrome regressions added. Real-device Safari validation remains.

## 2026-09-03 — Playlist and filter both have toggle shortcuts

`Q` now explicitly toggles the playlist/Queue panel and `Shift+Q` toggles the desktop type-filter
flow, focusing its current option for arrow/Space/Enter control. Both controls expose
`aria-keyshortcuts`, and the help overlay lists the pair together. Current state: in flight;
shortcut resolution, event dispatch, desktop toggling, and accessible hints have regression tests.

## 2026-09-03 — Scrubbing keeps one visible timeline

The invisible range control no longer paints an offset focus ring around the visible progress track;
that ring looked like a second orange timeline while dragging. Focus now strengthens the existing
track background without adding another line. The desktop track now paints above the stage gradient,
so its clay fill stays vivid at the filmstrip edge. Current state: in flight; component regression added.

## 2026-09-03 — Theater scrub feedback and keyboard filtering

Active timeline drags now show a centered, stable elapsed/duration badge on mobile and desktop;
desktop places it above a vivid-clay track immediately above the filmstrip and hides both with
de-clutter. Mobile Share and previous/next share the same hover/pressed treatment, including the
capsule's curved ends. Opening the desktop type filter focuses its active option: arrows move,
Space toggles in place, Enter toggles and closes, and Escape closes without driving shortcuts.
Current state: in flight.

## 2026-09-03 — Desktop timeline scrubs without auth hydration drift

Desktop now gives the top timeline a 32px seek target while keeping its chrome controls layered
above it. `useAuthMe` now uses `useSyncExternalStore` with a stable unresolved server snapshot,
so a warm browser auth cache cannot render account chrome against signed-out server HTML during
preview navigation. Current state: in flight; regression coverage added for desktop seek geometry
and warm-cache hydration.

## 2026-09-03 — Theater timeline scrubs and mobile swipe advertises itself

The clay timeline is now an accessible range control with a larger invisible hit area and visible
thumb. Dragging seeks native videos and YouTube Shorts, while photo/text/article timelines seek
within their 10-second dwell without restarting playback state. The existing bounded mobile
previous/next swipe gesture remains intact, but its ambiguous three dots are replaced by a
clean empty gap between the joined arrow buttons, with no divider or extra label.
Current state: in flight; focused tests, typecheck, lint, formatting, and a mobile browser check pass.

## 2026-09-03 — PR titles are verified before handoff

The PR workflow guidance now requires Conventional Commit syntax for pull-request titles,
prefers deriving a single-commit title from its commit subject, and verifies the final title
with `gh pr view --json title`. This prevents code-green PRs from failing the semantic-title
check because the PR title omitted its release prefix. Current state: complete.

## 2026-09-03 — Mobile captions clamp and tagged icons stay legible

Overflowing media captions now clamp on an inner element instead of the native Read button,
whose iOS Safari `flow-root` display exposed the full post over the stage. Read remains the
tap target and Watch still returns from reading mode. Tagged actions keep Lucide's outlined
tag shape, with the existing clay stroke and count badge, instead of filling into an
unrecognizable solid glyph. Current state: in flight; focused tests and mobile browser checks pass.

## 2026-09-03 — Queue E2E assertions freeze timed dwell

Queue-count coverage now pauses before and after navigation, and the cross-tab Next assertion
re-pauses after broadcasting an arrival. This keeps 10-second text dwell from changing the staged
row while slower CI assertions inspect queue ordering. Current state: complete; rerun pending.

## 2026-09-03 — Theater E2E pause helper becomes idempotent

The pause helper now returns when the transport already shows exact **Play**, while excluding the
separate **Play once** repeat control from that match. Otherwise it waits for Pause and confirms the
state change. This supports callers that intentionally pause before and after navigation.
Current state: complete; rerun pending.

## 2026-09-03 — Theater E2E pause waits for transport state

The shared browser-test pause helper now waits for the Pause control, clicks it, and confirms Play
before tests mutate the queue. The old optional click could silently miss hydration and let the
10-second dwell advance during a cross-tab add, producing alternating current/next failures.
Current state: complete; rerun pending.

## 2026-09-03 — Theater E2E selectors follow the redesigned controls

Mobile collection coverage now opens the contextual Share menu before checking Share link, and
desktop Live filtering reads the compact Queue count plus the separate active Filter control.
These replace stale selectors exposed when the repeat and theater-control branches were combined.
Current state: complete; the full component suite and prior integrated E2E run cover the behavior.

## 2026-09-03 — Desktop Queue adopts the mobile controls

The desktop filmstrip end cap now uses the same compact playlist/count and filter controls as
mobile instead of stacked Queue, count, and new-copy rows. The playlist control shows the number
that will play plus an unseen badge; the filter icon opens the existing panel and carries the
active-filter cue. Current state: in flight; typecheck, 99 focused tests, and a desktop browser
pass succeed.

## 2026-09-03 — Mobile Focus closes Up next

Pressing the mobile Focus control while Up next is open now collapses the playlist and enters
clutter-free mode in the same tap. This prevents the expanded sheet from covering the stage after
the user explicitly asks to focus. Current state: in flight; focused component tests pass.

## 2026-09-03 — ADHX becomes dark-only

Dark is now the single product theme across theater, library, public pages, and Settings.
The root renders dark on the server with one dark token set and browser theme color; legacy
light/system preferences are ignored. Theme controls were removed from public navigation,
account/theater dropdowns, profile and playlist pages, and the Settings Appearance card.
Current state: in flight; 3,513 tests, typecheck, lint, format, and a local browser pass succeed.

## 2026-09-02 — Mobile Share confirms completed actions

The mobile rail Share glyph now becomes a green tick after Copy, Download, media Share, or
Share link completes successfully. Cancelled or failed native shares keep the Share glyph, and
the confirmation clears after 1.6 seconds or immediately when the staged post changes.
Current state: in flight; typecheck and 118 focused theater/send tests pass.

## 2026-09-02 — Collapsed mobile Queue stops filter bleed

The expanded mobile Queue content is now invisible, inert, and absent from the accessibility tree
whenever the sheet is fully collapsed. This prevents selected filter-pill shadows from leaking
through as one-pixel clay lines after the transform settles, while real drag gestures still reveal
the list as they move. Current state: in flight; focused tests and a collapse visual pass passed.

## 2026-09-02 — Theater text filter includes articles

Theater filters now present three content choices: Videos, Photos, and Text. Text controls both
plain text posts and articles, and its mobile quick-filter count combines both types. The grouped
control supports old partial selections as a mixed state and completes them on tap. The stored
content types remain separate, so playback and existing preferences keep their current data model.
Current state: in flight; focused mobile, desktop, and filter-math tests pass.

## 2026-09-02 — Mobile playlist status and filtering separate

The collapsed mobile playlist button now shows the number of posts that will play and a distinct
unseen badge instead of combining List and Filter glyphs. Filter is a separate control that opens
a compact, counted All/Videos/Photos/Text/Articles picker without expanding Up next; the full
sheet keeps its existing multi-select pills. Counts come from the unfiltered queue while playback
continues to honor the active lens. Current state: in flight; focused tests and a 390px visual
pass.

## 2026-09-02 — Mobile Queue and Filter become one control

The collapsed mobile bottom bar now presents Queue count and content-type Filter as one compact
button because both open the same Up-next sheet. The active filter keeps its clay cue, while
removing the redundant adjacent tap target. Current state: in flight; focused tests pass.

## 2026-09-02 — Mobile Share becomes post-aware

The mobile action rail now sits immediately above the joined swipe capsule and keeps only the
primary Save/Tag/Archive, Share, and Open controls visible. Share opens a focused menu derived
from the staged post: Copy text/article when present, Download and native file Share for
sendable video/photo media, and Share link for every post. Explicit downloads use attachment
endpoints so iOS saves rather than opening inline playback. The menu roves focus, restores its
trigger, and blocks theater shortcuts while open. Current state: in flight; focused tests pass.

## 2026-09-02 — Mobile Theater gets a stable control hierarchy

Mobile prev/next are now joined into one swipeable right-side capsule; post actions form a
frosted rail above it. Queue and a dedicated type Filter sit left in the bottom bar, while
mute, prominent play/pause, repeat, and focus stay grouped right. Tapping a paused video now
plays it and enters focus without making a playing-video tap pause. Short viewports reflow
actions to two columns. Current state: in flight; focused component and gesture tests pass.

## 2026-09-02 — Theater captions become the only Read affordance

Desktop and mobile no longer render a separate Read button beside expandable media captions;
tapping the caption already opens the same reading view. Read mode still keeps the TV-shaped
Watch control so viewers can return to full-bleed playback. Focused chrome tests cover both
states. Current state: in flight.

## 2026-09-02 — Stage author rows drop redundant platform chip

Text, quote, and article stages no longer repeat the source-platform glyph beside the author.
The existing Open action remains the platform affordance, while removing the right-edge chip
prevents overlap with mobile theater controls. Focused author-row tests cover the simpler layout.

## 2026-09-02 — Theater sound preference persists across sessions

Settings now offers **Sound on by default**. Account users persist it through `/api/preferences`;
the browser caches the default in `localStorage`, and a tab's explicit mute/unmute remains the
session override. Theater waits for account preferences without a hydration mismatch, starts
audible playback when allowed, and retries unmuting on the next stage tap when mobile autoplay
policy blocks the fresh page. The saved preference is never downgraded by that browser fallback.
Focused component tests cover server load, browser fallback, session precedence, and tap retry.
Current state: in flight.

## 2026-09-02 — Theater author row drops redundant platform chip

Text, quote, and article stages no longer repeat the source-platform glyph beside the author.
The linked author identity already makes the destination clear, so the row now stays focused on
the avatar, name, and handle. Current state: complete.

## 2026-09-02 — Direct previews hand off from Repeat one to Repeat all

Every resolvable direct/shared preview now starts by looping its lead post, including signed-in
visitors. A repeat-button tap or deliberate move to another post promotes playback to Repeat all;
stray timed/video-ended events cannot escape the initial loop. Unavailable leads still advance
normally. Focused repeat/auth tests and typecheck pass. Current state: complete.

## 2026-08-28 — Mobile theater gains thumb-first controls

The mobile theater now has a bounded right-side gesture zone: swipe up for next and down for
previous without taking over article scrolling, albums, links, or embeds across the rest of the
stage. Subtle 48px focus, repeat, play/pause, mute/unmute, up, and down controls sit at thumb
height, with up=previous and down=next grouped below mute; direct post landings visibly start at Repeat one.
Repeat-off keeps bounded session back-history so up can rewatch a departed post. Repeated
text/photo posts retain a disabled playback button so changing repeat mode does not shift the rail.
Focus fades the rail and post actions while invisible swipes stay active, and tapping the zone
restores the chrome. Queue/count sits left in the collapsed bar; plain themed Send/Copy,
Save/Tag/Archive, Share, and Open icons align right. Gesture thresholds reject taps, horizontal
drags, and slow holds. Focused tests, typecheck, formatting, and lint pass.

## 2026-08-28 — Open-source repo adopts meme-lord positioning

The public GitHub description and README now lead with the same meme-saving and shareable-
playlist pitch as the site metadata, while the README keeps its detailed product and
self-hosting explanation. Repository topics now include memes and playlists. Current state:
complete.

## 2026-08-28 — Homepage metadata gets meme-lord copy

The default HTML, Open Graph, and Twitter descriptions now use one shared line about saving
memes, building shareable playlists, and becoming the group chat's meme lord. This replaces
the older feature-list copy and keeps every homepage preview surface in sync. Current state:
complete.

## 2026-08-27 — Article retry and logo hover layers hardened

Metadata-only article responses no longer poison the shared body cache, so a later read/copy
retries once upstream content is ready. The hover lockup now renders GOB and the ADHX wordmark
as non-overlapping layers; only GOB crossfades, eliminating the wordmark dip mid-transition.
Regression tests cover both behaviors. Current state: complete.

## 2026-08-27 — GOB lockup animates on hover

Every shared `MatterLogo` placement now swaps the static GOB mark for the matching dark/paper
loader animation on hover while keeping the supplied ADHX wordmark fixed. The same SVG
reduced-motion behavior used by loading screens applies automatically. Current state: complete.

## 2026-08-27 — X Article covers repaired across the theater

Sparse public-tag backfill items now carry the saved X Article headline and cover from
`bookmark_links`, so Live dock cards and article splashes paint correctly on first load.
Live polling also fills missing metadata on an already-mounted item without moving it, and
`StageArticle` uses the article API's title/cover as a final fallback alongside the body.
Regression coverage locks all three paths. Current state: complete.

## 2026-08-27 — GHCR release images added

Every release now publishes provenance- and SBOM-attested AMD64 and ARM64 images to
`ghcr.io/itsmemeworks/adhx`, tagged by full version, major/minor, major, and `latest`.
Release Please explicitly dispatches publication because `GITHUB_TOKEN` release events do not
chain workflows. Anonymous pulls are verified; GHCR's one-time organization-package visibility
step fails with the settings URL until an owner marks it Public. Compose and self-hosting docs
now consume the image by default. The GitHub repository description uses the current tagline.

## 2026-08-27 — GOB post-loader coverage completed

A shared theme-aware `PostLoader` now carries the supplied GOB animation across preview
resolution, Saved queue startup, Instagram probing, library/media loading, playlist posters,
landing activity, and share-target redirects. Action-level progress indicators remain compact
spinners. Repeated poster-card announcements are suppressed, and both SVGs stop animating under
`prefers-reduced-motion`. All 3,487 tests, typecheck, build, formatting, and lint (existing
warnings only) pass. Current state: complete.

## 2026-08-27 — GOB brand and playlist social cards

The GOB handoff now lives in `brand/BRAND.md`; supplied icons, favicons, paper/dark
lockups, the 1200×630 site OG, and authoritative animated loaders replace the legacy cloud.
The tagline is “Save it. Lose it. Find it.” across product copy, metadata, email, and docs.
Public playlists now publish dynamic 1200×630 OG/Twitter cards with adaptive image mosaics,
video badges, text-only tiles, and anonymous private/missing fallbacks. Thumbnail preloads are
host-allowlisted, redirect-safe, timed out, and size-bounded. Focused tests, typecheck, and real
ImageResponse renders pass. All 3,484 tests, typecheck, build, formatting, and lint (existing
warnings only) pass. Current state: complete; deployment required.

## 2026-08-27 — Theater playlist media integrity repaired

Live enrichment now derives durable Instagram thumbnail-proxy URLs, matching saved playlists.
Direct saved `/p/` previews again receive their full carousel size: the old Drizzle scalar
subquery generated self-comparisons and always returned zero, so it was replaced by a keyed
user/platform/bookmark count using the existing composite index. TikTok thumbnail resolution safely follows tiktxk's
new redirect to an exact/subdomain-allowlisted official TikTok page before proxying the CDN image.
Text stages are regression-locked to the original poster's avatar. All 3,472 tests, typecheck,
build, formatting, and lint (warnings only) pass. Current state: complete; deployment required.

## 2026-08-27 — Social preview descriptions no longer repeat titles

X Open Graph and Twitter cards now reuse the title-aware SERP continuation instead of restarting
from the full post text, while retaining quote and external-link context. Real X fixtures cover
text, photo, video, quote, article, and link shapes; route tests assert the production OG path.
Instagram, TikTok, and YouTube route tests now also prove their shared description stays
complementary to the title. Focused metadata tests, typecheck, lint, and formatting pass.

## 2026-08-27 — Instagram OG thumbnails survive legacy empty media rows

Saved Instagram posts can predate durable media rows even though the thumbnail proxy can still
resolve their current image or poster. Preview metadata now publishes that same-origin proxy
instead of falling back to the ADHX logo when a saved row has `mediaCount = 0`. A regression
test covers the production-shaped image-post case. Focused tests, typecheck, lint, and formatting
pass. Current state: complete; deploy required before existing share caches can refresh.

## 2026-08-27 — Instagram carousel durability follow-up

Late review closed three edge cases before merge: OpenGraph fallback metadata can repair an
empty media set but cannot collapse a richer Relay-resolved carousel; mixed `/p/` video children
are stored as ordered poster-only photo slides until indexed child playback exists; and send-file
prefetch keys now include the resolved content type and source URL. Regression coverage exercises
all three cases. Final gates pass: 3,458 Vitest tests, typecheck, build, formatting, and lint
(warnings only). Current state: complete on the Instagram image-post PR; no follow-up known.

## 2026-08-27 — Instagram image posts and carousels complete

Instagram `/p/` links now resolve single images and ordered mixed carousels from the crawler
Relay payload, persist every child, render through preview/Saved/playlist/library theater paths,
and send via the bounded same-origin image proxy; Reel MP4 behavior remains unchanged. Canonical
paths, activity, sitemap, JSON-LD, moderation, dark-route chrome, and docs now distinguish photos
from Reels. Live probes resolved the owner examples as 1 and 11 images and a live Reel as video.
Final gates pass: 3,455 Vitest tests, 98 Playwright tests, typecheck, build, formatting, and lint
(warnings only). Review remediation is complete with no actionable findings.

## 2026-08-27 — Local product walkthrough complete

The owner-data browser walkthrough covered desktop and phone-sized Live, Saved, Queue, Library
filters, Tags, Leaderboard, Settings, Trending, and streamed shared previews. The local database
needed the documented migration before `users.role` existed; `pnpm db:migrate` restored it.
The walkthrough then found and fixed a Next 16 same-URL `router.replace` loop in Library filters,
plus unnamed Header account-menu and Bionic Reading controls. Regressions cover one-shot query
cleanup/preservation, route-loop prevention, expanded state, and switch state. Final gates pass:
3,431 Vitest tests, 97 Playwright tests, typecheck, build, formatting, lint (warnings only), and
the zero-advisory dependency audit. All review and browser-verification work is complete.

## 2026-08-27 — Completion audit and isolated browser suite green

The post-remediation audit closed the remaining auth-scope, cross-tab, moderation-cache,
retention, rate-limit identity, media-bound, and non-X SEO gaps without waivers. RSC payloads
are now bound to the same immutable account confirmed by the client; mismatches fail closed,
retry safely, and remount account providers only after trust. Public media uses trusted client
identity, shared deadlines, bounded streams/caches, and regression coverage. Final gates pass:
3,428 Vitest tests, 97 Playwright tests, typecheck, build, formatting, lint (warnings only),
zero-advisory audit, and Chromium/Firefox extension validation. Owner-server browser walkthrough
remains pending because port 3001 is not running.

## 2026-08-26 — Full review closed and product docs refreshed

All 36 review findings now have regression fixes and focused sign-off. Unresolved non-X pages
noindex transient and permanent misses, explicitly clear inherited social cards, and stay dynamic
for recovery; the unused resolve-reason field was removed. README is now a light product guide,
while ARCHITECTURE explains current routing, theater, trust, data, media, privacy, and delivery
boundaries without duplicating the runbook. All 3,387 tests, typecheck, build, formatting, lint
(warnings only), dependency audit, and Chromium/Firefox extension gates pass. Local browser
verification remains pending because the owner-managed server on port 3001 is not running.

## 2026-08-26 — Superseded auth and moderation bypasses removed

OAuth token tests now use encrypted DB fixtures instead of a production unconditional token
upsert; callback persistence remains identity- and generation-guarded. Welcome validates a live,
unbanned account, Sentry no longer exports its raw SDK namespace, and test-only auth/moderation
compatibility helpers are gone. Focused tests, typecheck, lint, formatting, and diff checks pass.

## 2026-08-26 — Non-X thin previews noindex consistently

Instagram, TikTok, and YouTube preview metadata now returns noindex whenever trusted content is
unresolved, including transient upstream failures, and dynamic rendering lets later recovery
become indexable. Streamed JSON-LD/static bodies remain suppressed for both permanent and
transient misses, with the reason encoded in the shared resolve result. Saved local metadata
remains an indexable fallback. Focused SEO/cache tests, typecheck, lint, formatting, and diff
checks passed before concurrent out-of-scope edits later blocked the global typecheck and format
check; the SEO files remain clean.

## 2026-08-26 — Playlist event retention no longer needs restarts

Accepted playlist events now trigger an independently committed, hourly-throttled prune of raw
detail older than 90 days. Event insertion and viewer-free aggregate increments remain atomic;
retention failures cannot roll them back or separate their counts, and all-time aggregates are
never pruned. Deterministic regressions cover no-restart expiry, aggregate survival, and retry
after an injected delete failure. Focused discovery tests are green.

## 2026-08-26 — Phase 6 public surfaces and data integrity verified

Non-X previews now distinguish permanent misses from transient mirror failures without caching false noindex pages. Public analytics require trusted post identities, moderation/ban checks, actor-correct dedupe, and indexed lookups; uncaught Next server failures reach privacy-bounded Sentry instrumentation. URL parsing is host-anchored, non-X bookmark/media writes and tag/ban mutations are atomic, cards and stacked sign-in modals are keyboard/focus safe, and Firefox ships validated MV3 output with accurate AMO browsing-activity disclosure. CI now validates both extension artifacts. All 3,345 tests, typecheck, build, formatting, lint (warnings only), extension builds, diff checks, and integrated review are green.

## 2026-08-26 — Phase 5 theater state stabilized

Persistent video playback now rejects superseded play promises and queued media events without remounting the iOS-granted element. Shared preview leads release after every departure, including waiting/unavailable paths, while live auth and cross-tab save/tag/delete membership stay current. Seen state uses bounded revisioned local operations (500 marks + 500 tombstones), atomic bulk unmarks, cross-tab convergence, and one-time legacy-array migration; pre-V2 tabs must reload. All 3,217 tests, typecheck, build, formatting, lint (warnings only), and focused review passes are green.

## 2026-08-26 — Phase 4 concurrency remediation verified

Auth now uses atomic magic-link/OAuth state claims, one X identity per account, disconnect generations, cross-worker refresh leases, CAS token/profile writes, and transactional email claims. Moderation fails closed across cached and uncached public surfaces, with no-store APIs and banned-source sitemap/theater filtering. Sync uses durable heartbeat leases and ownership-checked terminal writes; manual/sync bookmark links merge without race-driven metadata loss. Startup migrations repair legacy duplicates before enforcing indexes. All 3,170 tests, typecheck, build, formatting, lint (warnings only), diff checks, and the final publication review are green. Ready for stacked PR review.

## 2026-08-26 — Manual saves survive late insert races

Manual tweet add now treats its transactional bookmark insert as the ownership boundary: a late loser returns duplicate without media/quote children, metrics, or pulse, while still field-wise upserting complementary links. Startup migration first reaps stale leases, then deterministically retains the newest fresh running lease per user and fails legacy duplicates before creating the unique index. Deterministic route and migration race regressions are green with focused tests, typecheck, lint, formatting, and diff checks.

## 2026-08-26 — Link enrichment survives lost insert races

Bookmark-link writes now use a shared field-wise upsert at the unique identity, including when sync loses the main bookmark insert; `inserted=false` still protects stats and pulses while complementary article/OG data is retained. Quoted-article conflicts use the same merge path. Startup now reaps only running syncs whose heartbeat/started timestamp is over 30 minutes old, preserving healthy cross-process leases. Focused race/migration tests, typecheck, lint, formatting, and diff checks are green.

## 2026-08-26 — Bookmark link enrichment merges before dedupe

Manual and synced tweet saves now consolidate repeated link identities before insert, merging each field independently so sparse duplicates cannot erase article or preview data. Startup migration cleanup updates a deterministic survivor with the richest non-null value from every duplicate row before deletion and unique-index creation. Regressions cover repeated manual URLs, article/direct overlap, complementary legacy metadata, and idempotent migration startup. Focused tests, typecheck, lint, and formatting are green.

## 2026-08-26 — Auth, moderation, and sync races closed

Magic links and OAuth state are now atomically single-use; X linking is durably bound to the initiating ADHX account and rejects session switching. Moderation reads distinguish visible content from an unavailable store and fail closed across auth, previews, pulse, sitemap, profiles, playlists, leaderboards, and the public tweet API; moderation schema failure stops startup. Sync claims one durable running row per user before opening SSE, stale rows recover on boot/claim, and insert-aware counting prevents duplicate stats and pulses. Link enrichment is uniqueness-protected after a richer-row-preserving cleanup. Full tests, typecheck, lint, formatting, migration regressions, and integrated review are required before publication.

## 2026-08-26 — Public resource use bounded

Public media now validates every redirect hop, bounds playlist/metadata reads, byte-limits chunked HLS streams, keeps body deadlines active, and separates preview/download/read rate budgets. Mirror retries have one 50s deadline; transient IG/TikTok metadata failures no longer become one-hour misses. Public query caches are hard-capped TTL/LRU windows with bounded trending pagination. Playlist events roll into durable viewer-free all-time aggregates atomically, retain 90 days of raw detail, and remain consistent through moderation/account deletion. Full tests, typecheck, formatting, and three integrated review passes are green.

## 2026-08-26 — Deterministic containers and atomic migrations

Docker now uses Corepack-pinned pnpm 9.15.9, the frozen lockfile, pruned production dependencies, and project-local `tsx`; CI builds and boots the real non-root runner, exercises native SQLite/migrations, and probes health. Drizzle SQL plus its journal row now commit atomically with foreign-key restoration. The legacy 0003 rebuild detects partial damage, safely replays its earliest crash point, and adopts a strict completed-but-unjournaled schema fingerprint without data replay. Focused tests/typecheck/review are green; the real image smoke runs in CI because local Docker is unavailable.

## 2026-08-26 — Trust boundaries hardened

Deleted-account JWTs now require a live account, account-linked writes are rejected by durable SQLite guards, and admin access is persisted against immutable IDs with fail-loud legacy bootstrap. OG enrichment validates and pins public DNS answers at connection time across redirects. Sentry now sanitizes explicit and automatic events with keyed pseudonyms and bounded JSON/request redaction. Account deletion also clears aliases and anonymizes retained activity history. Focused tests, typecheck, formatting, and two review passes are green. Ready for review; follow-up phases cover atomic migrations, deterministic containers, bounded media/resource use, concurrency, theater state, and lower-risk audit findings.

## 2026-08-26 — YouTube: Shorts URLs only

Paste, share, URL-prefix, the add API, and the desktop extension now reject `youtu.be`, `/watch?v=`, `/embed/`, and `/live/` — those forms are regular videos. `extractYouTubeId` (and the proxy) accept `youtube.com/shorts/{id}` only. Existing saved YouTube rows still play. Follow-up: a crafted `adhx.com/shorts/{regularId}` still embeds, because the id space is shared.

## 2026-08-26 — CI: one PR, Read + Live Next locators

PR 427 is the only open branch for this work (`fix/theater-paste-saved-start`). e2e Read locators now pick the visible pill (desktop + mobile chrome both mount `data-theater-action="read"`). A Live mid-play add of a previously watched id is unmarked so it sits as Next. In-flight until the PR merges.

## 2026-08-26 — Truncated caption opens Read

Tapping the two-line theater caption opens Read when that control is offered (overflow or quote). Links inside the caption still navigate. Watch stays on the pill. e2e Read locators target the pill (`data-theater-action="read"`), not the caption. In-flight until the PR merges.

## 2026-08-26 — Theater paste plays now

Same-tab paste (⌘V / paste field) takes the stage immediately; the interrupted post is Next. Second-window tweet-added still prepends without stealing. Tests: TheaterShell-paste, orderLifoQueue pinNext. In-flight until the PR merges.

## 2026-08-26 — Saved starts newest after Live adds

Live adds pinned the Saved cursor so flipping Live → Saved opened mid-queue (new saves sat to the left of NOW). Opening Saved now starts newest-first, same as a `/saved` remount. Mid-play adds on Saved / a second window still stay Next. Tests: TheaterShell-cross-tab-add. In-flight until the PR merges.

## 2026-08-26 — CI e2e: Archive undo count + Live Next pin

Play once Archive then Undo dropped `N in queue` by one: any `personalCurrentKey` change marked the previous row Watched, so the hopped-to post left Repeat-off playable. Mark Watched only on Next / ended / queue tap. Live Repeat-off pin no longer waits on seen hydration; tweet-added prepends stamp `addedAt` now so LIFO puts the arrival as Next. Live URL e2e accepts any preview path after Next (TikTok `/video/` is valid). In-flight until the PR merges.

## 2026-08-26 — Repeat-all Next walked only two posts

`pinCurrent` (so a Repeat-off arrival is Next) stayed on during Repeat all. After each Next the playing row was re-pinned at index 0, so the next index was always the newest other post — a two-item loop after Live ⇄ Saved. Pin only when Repeat is off. Repeat all walks newest-first and wraps. Tests: TheaterShell-lifo walk, `orderLifoQueue` unpinned. In-flight until the PR merges.

## 2026-08-26 — Theater leftover cleanup, LIFO stays

Deleted leftover Live next/rewait math; Live `goNext` is loop + first-pending. Saved paste no longer jumps to the new save mid-play (same pin as a second-window add). All → empty type lens keeps the current post under the empty overlay; All restores it instead of "Nothing playing". Counts unchanged: Repeat off = Now playing + Next; Repeat all = the pile. Browser-checked Live + Saved adds and All → Text. In-flight until the PR merges.

## 2026-08-26 — LIFO e2e matches Queue Now / Next / Seen

e2e no longer expects leftover headings (`This post`, `New since you opened`) or `N of M`. Caught-up + second-window add plays immediately; mid-play add is Next; Repeat-off Queue shows Seen after Next. In-flight until the PR merges.

## 2026-08-26 — Re-watch all resets seen and plays

Caught-up **Re-watch all** unmarks the current playlist, leaves Repeat off, and starts the newest post immediately (Now playing; the rest Next). When that post ends it moves to Seen. Dwell is paused while caught-up so the overlay does not re-mark the parked row. Tests: `removeSeenKeys`, TheaterShell-lifo Re-watch. In-flight until the PR merges.

## 2026-08-26 — Repeat-off Queue adds Seen

Repeat off still plays only unseen (Now playing + Next). Watched rows sit in a third **Seen** section. Repeat stays Now playing + Next. Counts unchanged. Tests: `queueSectionHeading`, `orderLifoQueue` appendSeen, UpNextList, TheaterShell-lifo. In-flight until the PR merges.

## 2026-08-26 — Theater playlist is a LIFO queue

Live and Saved are the same playlist: newest ADHX `addedAt` first. Repeat off plays unseen only; a new post goes to the top (play now if caught up, else Next). Counts: unseen remaining / playlist total / 1 for Repeat this post. Queue UI is Now playing + Next — leftover sections, leave-order rotate, and `1 of N` are gone. Tests: `orderLifoQueue`, `TheaterShell-lifo`, chrome/e2e counts. Browser-verify two Live windows + add. In-flight until the PR merges.

## 2026-08-26 — Live queue: now playing at top, finished to the bottom

Caught-up + a second-window add showed `1 of 2` then `2 of 3` because leftover-run `played` kept counting the finished pile. Live leftover is remaining only (`N in queue`). The playlist pins now playing at the top; a left post appends at the bottom. Tests: `orderLiveQueue` leave-order, caught-up second arrival, chrome remaining, `e2e/queue-count`. In-flight until the PR merges.

## 2026-08-25 — `?open=` must survive leftover start

TheaterShell leftover-clamped again when queue prefs hydrated, so `/saved?open=` (library tap, Tag, All Clear from last) snapped to the first unread. `preserveSavedStart` skips that hydrate clamp; remount leftover start stays AuthedTheater. Tests: TheaterShell mid-queue start, AuthedTheater `preserveSavedStart`, filter snap. In-flight until the PR merges.

## 2026-08-25 — Saved starts at leftover, not mid-list

Live→Saved remounted on the last `adhx-saved-playing` cursor (or the next Videos row after it) and could All Clear while unchecked leftovers sat at the top. Resume only when earlier leftovers were left this run (`adhx-saved-played`); otherwise start at the first matching leftover. Live paste still keeps the same-shell Saved cursor. Tests: `savedStartIndex`, AuthedTheater remount, TheaterShell Videos start, chrome `1 on repeat`, `e2e/queue-count`. In-flight until the PR merges.

## 2026-08-25 — Repeat this post is 1 on repeat

Keep playing still names the pile (`18 on repeat`). Repeat this post was using the same length, so the dock said `18 on repeat` while Queue said Repeating this post. `one` is now `1 on repeat`. Tests: `computeQueueCounts`, `formatQueueCount`, theater-chrome, TheaterShell-repeat. In-flight until the PR merges.

## 2026-08-25 — Preview "This post" drops after watch

Opening a preview URL kept the lead in **This post** and leftover as `1 in queue` after caught-up (every filmstrip tile red). `liveQueueTreatAsUnseen` was wrapping live seen, and waiting still stayPut the last `currentKey`. Entry still treats the opened post as pending; once this session watches it, it joins Watched earlier and leftover copy hides on the waiting stage. Tests: `sharedThisPostKey`, theater-chrome waiting, UpNextList, TheaterShell caught-up preview. In-flight until the PR merges.

## 2026-08-25 — CI: Live ⇄ Saved `1` and leftover count flash

`2` wrote `/saved` into the bar with `replaceState` before `router.push`, so Playwright treated Saved as landed while `/live` was still mounted. Pressing `1` then hit `next === tab` and never pushed `/live`. Cross-tab switches now push only; same-tab still rewrites a leftover preview path. Live→Saved no longer local-flips an empty Saved snapshot (that All Cleared until `/saved` fetched). Leftover chrome passes `played: 0` before the seen snapshot is ready, and `countPlayedThisRun` never counts the on-stage row. Cross-tab leftover e2e asserts the pile grew and the current post stayed (unit tests own `played === 0`). In-flight until the PR merges.

## 2026-08-25 — Live leftover count after a mid-play prepend

A second-window save while leftover still had every row unseen bumped `currentIndex` (same post, one slot down). `computeQueueCounts` then treated playlist index as `played` because `unseenCount >= length`, so the dock flipped from `N in queue` to `1 of N`. Leftover math now prefers an explicit `played` from `countPlayedThisRun`. Queue row relative time paints after mount so Next's hydration overlay cannot sit on Up-next. Tests: `computeQueueCounts`, TheaterShell cross-tab add, `e2e/archive`, `e2e/theater-cross-tab-add`, `e2e/live-url` flip. In-flight until the PR merges.

## 2026-08-25 — Theater review cleanup

Fixed All Clear cross-tab prepend, `theater-resume` under a covered video, auto-advance `markSeen`, Live Save prepend + `idPlatform`, All Clear keeping `<Stage/>` mounted, Read reset on Saved cursor, and Live poll-on-enable. Extracted repeat/queue-type prefs, membership lookup, transport hook, storage catalog, and `liveQueueTreatAsUnseen`. UpNextList imports math from `theater-math`. In-flight until the PR merges.

## 2026-08-25 — Live leftover run resets at caught-up

Caught-up plus a second-window save correctly staged the arrival, but Queue still counted the leftover posts finished this session (`2 of 3` with one New-since-opened). Catching up now snapshots seen keys as the start of the next leftover run. Tests: `countPlayedThisRun`, `theater-chrome`, TheaterShell caught-up matrix. In-flight until the PR merges.

## 2026-08-25 — Live caught-up survives a Saved tab flip

Caught-up Live used to `setWaiting(false)` when flipping to Saved so the shared `<video>` could resume. Coming back to Live then kept playing that Saved clip at the same timecode. Saved still gets `theater-resume`; waiting stays true so the overlay returns. In-flight until the PR merges.

## 2026-08-25 — Saved Play once is 2 of 92, not 1 of 92

Saved one-pass reused Live leftover math (`played = index` of posts already left), so the second filmstrip post read **1 of 92**. List walks now use the 1-based now-playing index (`listWalk: true` on Saved). Live leftover is unchanged (`N in queue` then `1 of N` after Next). Signed-out shortcut e2e no longer treats Previous-enabled as “Next worked” — leftover Next stays at index 0. Tests: `computeQueueCounts`, `theater-chrome`, `e2e/queue-count`, `e2e/theater-shortcuts`. In-flight until the PR merges.

## 2026-08-25 — Saved Queue Watched on prepend / filter skip

A second-window save at the front of Saved was labelled Watched because “everything before the cursor” counted as played. Saved now tracks posts actually left this session, so prepends and Videos-skipped rows stay unmarked; landing on a prepend then leaving it still marks Watched. Session prepends keep the clay fresh accent. `/live` ⇄ `/saved` remounts resume the playing Saved identity from sessionStorage (`?open=` still wins). Tests: `TheaterShell-cross-tab-add`, `saved-playing`, AuthedTheater cursor restore, more `e2e/theater-cross-tab-add` cases. In-flight until the PR merges.

## 2026-08-25 — Cross-tab add + Queue filters

A second-window save now resets a hiding type filter the same way same-tab paste does, so a text add is not invisible behind Videos. Live paste keeps the Saved cursor (compute the new index on the prepended array, not after a stale setState). Videos while a text post is current snaps to a matching row or caught-up instead of “Nothing playing”. Saved Videos walks backward to a matching prepend. Tests: `TheaterShell-cross-tab-add`, UpNextList arrival heading, `e2e/theater-cross-tab-add.spec.ts`. In-flight until the PR merges.

## 2026-08-25 — Live home; play New-since-opened before caught-up

Signed-in `/` redirects to `/live`. A signed-in preview keeps the opened post first in leftover Live (autosave unchanged) and does not shared-post-repeat, so it auto-advances into unseen. Live Next / auto-advance now plays still-unseen arrivals (including ones already in the waiting baseline) before “You’re all caught up”. In-flight until the PR merges.

## 2026-08-25 — Unplayed leftover is “N in queue”

`0 of 1` read as a zero-based index. Off-repeat now says `N in queue` until the first leave, then `16 of 23`. Repeat on is still `N on repeat`. In-flight until the PR merges.

## 2026-08-25 — CI: prettier table + BroadcastChannel wait

format:check failed on the theater-first surface table after the “This post” cell grew. Cross-tab Archive test waited one tick and flaked empty on CI; it now waits until the channel delivers. In-flight until the PR merges.

## 2026-08-25 — Queue-count e2e + Saved Play-once persist

e2e covers Live `0 of N` → `1 of N` → `N on repeat`, Saved loop vs Play once, playlist `3 on repeat`, and preview Queue **This post**. User Next now marks the leftover post seen so the count moves without waiting on the 2s dwell. Saved repeat prefs no longer overwrite `localStorage` on the first paint. In-flight until the PR merges.

## 2026-08-25 — Playlist-style queue count; “This post” not “Shared post”

Off-repeat is YouTube/Spotify progress through what will play (`16 of 23`, including `0 of 23` at the start). Repeat on is just the pile (`23 on repeat`). The preview-page Queue heading is **This post** — it is the post the visitor opened, not a share. In-flight until the PR merges.

## 2026-08-25 — Queue count is run progress, or “on repeat”

Repeat off is how many of this leftover run have played (`16 of 23`; just `23` before the first leave). Repeat on is the pile (`24 on repeat`). Live still stages the leftover head, so this is not a playlist index and not leftover-vs-pile (`2 left · 20`). In-flight until the PR merges.

## 2026-08-25 — Queue count is leftover + pile, not position

The dock/peek `n / N` read as a playlist index, but Live always stages the next leftover post (the head of the stack). The two numbers that matter are leftover to play and how many posts are in the queue. Repeat-off leftover is `2 left · 20`; looping or caught-up is just `20`. Saved one-pass leftover shrinks (`8 left · 13`). In-flight until the PR merges.

## 2026-08-25 — Queue stays open when the stage advances

Expanding Queue (desktop panel / mobile up-next sheet) used to collapse as soon as the next post staged — the mobile sheet reset on `currentKey`, and both chromes closed after a row pick. The list now stays up while playback continues; Escape, click-away, and the Queue toggle still close it. In-flight until the PR merges.

## 2026-08-25 — Live vs Saved repeat and queue counters

Live no-repeat is leftover unseen (`1 / 2`, then wait). Re-watch all zeros that run so the counter is `1 / N` of the full list. Saved defaults to looping the list (everything there was saved on purpose); no-repeat is one pass then All Clear. The two prefs persist separately so flipping tabs does not clobber the other. Peek/dock use `computeQueuePosition` so a leftover Live run is never `8 / 13`. In-flight until the PR merges.

## 2026-08-25 — Live stop-when-caught-up does not replay the run

Repeat-off auto-advance finished the unseen run, jumped back to a mid-play arrival, then walked the frozen "unseen on entry" block again (the two just watched). It now prefers still-unwatched ahead, then arrivals behind, then waits. The Queue moves a finished post into Watched earlier (the playing row stays put). Filmstrip watched thumbs use the same grey as Queue; caught-up hides NOW/NEXT. In-flight until the PR merges.

## 2026-08-25 — Hotfix: Live queue-filter e2e hit a hidden mobile list

`e2e/live-queue-filter.spec.ts` failed on main after #414: `E2E-PULSE-TEXT` was in the DOM (`hidden`) because mobile `UpNextList` stays mounted under `lg:hidden`. `getByText().first()` pinned that copy. Queue-row asserts now go through the desktop Playlist dialog. In-flight until the hotfix PR merges.

## 2026-08-25 — Album review: hydrate photoCount, pin the grant, send clip 1

Shared Read ignored a later `photoCount` on the same post. The hydrate effect now re-seeds, and tests cover album wrap, last-clip `ended`, `<video>` identity, `?index=` on info/download, and Send staying on clip 1. In-flight until the PR merges.

## 2026-08-25 — Album pill no longer jumps, hides, or goes too dark

Cycling a clip set `videoWidth` to 0 for a frame, so the frost pill snapped to the stage bottom (under the mobile peek bar — “vanished”) then jumped back. It now keeps the last inset until the next clip has a real size, and Watch uses the same `bg-black/40` frost as Read. In-flight until the PR merges.

## 2026-08-25 — Album dots hug the painted clip, not the stage

Pinning the frost-dot pill to the stage/band bottom put it in the letterbox (and under the mobile peek bar) on cinematic Watch clips. It now measures the `object-contain` box and overlays the picture with a 12px inset — Watch and Read, desktop and mobile, photos and videos. In-flight until the PR merges.

## 2026-08-25 — Album dots sit on the bottom of the clip

Read had the frost-dot pill in the gap under the keep-playing band. It now overlays the bottom of the clip with a little inset (`bottom-3`), desktop and mobile. Watch on a phone used to pin the pill under the top scrim — it now uses the same bottom-of-clip inset (clears the peek bar). Desktop Watch stays bottom-inset too. In-flight until the PR merges.

## 2026-08-25 — Read album dots sit under the clip, not on it

The frost-dot pill on a video album in Read was overlaid on the keep-playing band (same slot as Watch). It now sits in the gap under the band, above the author row, so the clip stays clean. Watch is unchanged. In-flight until the PR merges.

## 2026-08-25 — Read shows the full album, not just the first still

Read on a multi-photo tweet only seeded `/api/media/image?index=1`, and Read on a multi-video tweet hid the snap chrome (`hideAlbum`) so later clips were unreachable. Saved / shared preview now carry `photoCount`; the typeset reader stacks every still immediately (X Articles already did this via markdown). Video albums keep the frost-dot pill in the keep-playing band. Pulse rows without a count still hydrate from `/api/share/tweet`. In-flight until the PR merges.

## 2026-08-25 — Paste clears a hiding filter; other windows see the add

Pasting a video while the theater is on Text (or any type that wouldn't show it) reset the queue filter to All so the save is visible. A second `/saved` or `/live` window now prepends `{ added }` from `notifyCollectionChanged` (BroadcastChannel; same-tab `tweet-added` is skipped so the library grid does not refetch). The receiving window stays on its current post and shifts the index. Library paste uses the same helper. In-flight until the PR merges.

## 2026-08-25 — Archive in one Saved window drops it in the others

`notifyCollectionChanged` only fired same-tab CustomEvents, and TheaterShell snapshots `personalItems` at mount, so a second `/saved` window kept the archived post. The client-event bus now mirrors over `BroadcastChannel('adhx-client-events')` (`AppShell` opens the channel). Archive/delete pass `{ removed: { platform, id } }` on `tweet-added`; TheaterShell splices that row and slides the index back when the dropped post sat before the cursor. `DockStat is not defined` on those windows was stale Fast Refresh after the Queue end-cap change — refresh, do not restore `DockStat`. In-flight until the PR merges.

## 2026-08-25 — Read / Watch keeps toggling on long captions

Read unmounted the 2-line caption, ResizeObserver reported 0×0, and `overflowing` flipped false — Watch then had no Read to come back to. Overflow now latches for the current post and remasures when the caption remounts. Quote-on-media was already always-on. In-flight until the PR merges.

## 2026-08-25 — Dock end cap is Queue / position / new

"Show all" is now "Queue". Under it: current/total (`2/83`), then `N new` when anything is new since last visit. Saved-today / remaining / waiting pills are gone. Playlist still hides the new row. `Q` and the shortcut help say Queue. In-flight until the PR merges.

## 2026-08-25 — Saved Archive is an outline, left of Download

On `/saved` Archive sat at the end of the action row as a filled clay pill. It now sits left of Download (or Copy) and uses the same glass + clay border as Save — no `bg-clay-grad` fill. Mobile is the 44px circle with the same border. In-flight until the PR merges.

## 2026-08-25 — Twitter multi-video albums snap like photos

Tweets with 2–4 videos (e.g. two side-by-side demos) used to play only `videos[0]`. The theater now uses the same snap scroller + frost-dot pill as multi-photo: `/api/media/video?index=`, shared preview / Saved seed `videoCount`, pulse rows hydrate from `/api/share/tweet`. Ended on an earlier clip goes to the next clip; the last clip advances the queue. In-flight until the PR merges.

## 2026-08-25 — Library Show archived is archived-only

The FilterBar toggle used to mean “include archived” (`hideArchived=false` → active + archived). It now lists archived posts only via `GET /api/feed?archivedOnly=true`. `hideArchived=false` still means include everything (tag views, add-to-tag, save/`?id=` lookups). Count on the pill is the archived count. Empty active collection with archives offers “Show N archived”. In-flight until the PR merges.

## 2026-08-25 — Long theater notes can scroll on mobile

A 127-line list (e.g. the backlinks note) typeset fine on desktop but looked cut off on a phone: the mobile action row was `pointer-events-auto` + `flex-1`, so the thumb zone swallowed pans and the media-weight scrim faded the last visible lines to black. The icon cluster now hugs the pills; text/article scrims use a short fade. In-flight until the PR merges.

## 2026-08-24 — Saved Show all has the same type pills as Live

Live and Saved already share `TheaterQueueFilter` in both chromes; TheaterShell was omitting the callbacks on the Saved tab (`queueFilterAvailable = !loop && !isCollectionTab`). Saved now gets All / Videos / Photos / Text / Articles, persisted as `adhx-theater-types`, and the filter actually walks the Saved queue (skip / back / ended / overlay). Empty filter: "No videos in Saved right now". Playlists still omit the pills. In-flight until the PR merges.

## 2026-08-24 — Quote is not a content type; Manual filter gone

Photo tweets (and anything with `isQuote`) were typed as `quote` because `inferContentType` treated the flag as a type and shared-preview set `previewType` to quote before checking photos. Quote tweets now classify from their own media (photo → photo, text+quote → text). Stored `content_type = 'quote'` is ignored. Library drops Quoted and Manual pills; Live drops Quotes. Quote cards / Read-on-quote still render via `item.quote`. In-flight until the PR merges.

## 2026-08-24 — Signed-out burger drops Privacy

The unauthenticated theater/leaderboard menu is Theater / Leaderboard / Sign in. `/privacy` still exists (landing footer, Settings, sitemap). In-flight until the PR merges.

## 2026-08-24 — Mobile up-next expand no longer pans the viewport

Opening the mobile playlist focused a queue row (`scrollIntoView` + default focus), which panned iOS so the sheet jumped to the top of the screen: Live type pills vanished, the peek bar went off-screen, and the rest of the stage read as a black void. Mobile now skips auto-focus on open (↑/↓ still move rows); focus uses `preventScroll` and only nudges the list scroller. The sheet is `h-[70%]` of the theater with `overflow-hidden` so `dvh` / visual-viewport jumps don't fight the open animation. Filters remain Live-only (Saved / playlists omit them). In-flight until the PR merges.

## 2026-08-24 — Dock end cap fades; filter is a cue not a label

Show all stays "Show all". An active Live type filter is a clay ListFilter glyph (hover still names the types). Queue length / new / saved-today are compact pills. The cap overlays the filmstrip with a left gradient so cards fade under it instead of hitting a hard vertical seam. In-flight until the PR merges.

## 2026-08-24 — Q toggles Show all

`Q` expands/collapses the theater playlist (desktop Show all / mobile up-next). While open, ↑/↓ move through the rows, Enter plays the focused post, Esc or a click outside closes. Same overlay contract as the account menu so stage keys don't leak through. In-flight until the PR merges.

## 2026-08-24 — Preview pages paint ADHX before the proxy

External preview links used to wait on FxTwitter / a scrape / oEmbed (and sometimes a 10s OG fetch) before any HTML. Pages now return a URL-stub theater immediately; `sharedResolve` fills the post (or `StageUnavailable`) without blocking chrome. Tweets show `StageResolving` until the kind is known; Reels/TikTok/Shorts play as video stubs. `generateMetadata` still awaits for crawlers. In-flight until the PR merges.

## 2026-08-24 — Dock filter chip + one typeface

Show all / peek-bar meta dropped mono + mixed weights; counts share 11px sans. An active Live type filter turns the toggle into a clay chip named for the selection (Videos, Videos · Photos, 3 types) so it is visible with the panel closed. Same clay tint on the mobile peek label. In-flight until the PR merges.

## 2026-08-24 — Live filter ignores non-matching preview pulses

Videos (etc.) stays on while `/api/activity` prepends new previews: matching types join the queue, others don't, and a filtered-out arrival does not auto-play the caught-up stage. Unit + e2e cover it. In-flight until the PR merges.

## 2026-08-24 — Long notes typeset as a compact document

X notes / numbered lists were sized like a long slogan (`text-xl` + relaxed leading), so a 127-line tweet looked truncated and wrapped mid-item. Compact type kicks in past 12 lines or 1500 chars; the stage starts at the top with a bottom fade so scroll is obvious. Line breaks were already in the data. In-flight until the PR merges.

## 2026-08-24 — Live queue is a type multi-select

Live Show all / the up-next sheet now has All plus Videos, Photos, Text, Articles, Quotes — tap any mix. Empty selection is All. Persists as `adhx-theater-types`; the old `adhx-theater-visual` flag migrates to videos+photos once. `I` is no longer a shortcut (one key can't drive five pills). Saved and playlists omit it. In-flight until the PR merges.

## 2026-08-24 — Visual is a playlist filter

All / Videos & photos pills live in Show all (desktop) and the up-next sheet (mobile), not as a top-bar icon. `I` still toggles; `adhx-theater-visual` still persists. Saved and playlists omit it. In-flight until the PR merges.

## 2026-08-24 — Visual sits left of paste

Moved the Live Visual (media-only) toggle from next to LIVE / left of the flame to immediately left of paste. Flame stats stay to its left. In-flight until the PR merges.

## 2026-08-24 — Theater keys: Visual + Live/Saved

`I` already toggled Visual. `1` / `2` now switch Live ⇄ Saved when signed in (personal theater + shared preview `2` → `/saved`). Signed-out and playlists no-op. Help overlay has a Theater section. In-flight until the PR merges.

## 2026-08-24 — Live theater Visual lens

Live (signed-out `/`, `/live`, Live tab, shared "more being sent") can show videos and photos only. Images frost toggle next to LIVE (desktop) / left of flame (mobile); `I` in the keymap; persists as `adhx-theater-visual`. Saved and playlists omit it. A shared lead stays even if it's text. Empty pulse: "No videos or photos in Live right now" + Show every post. In-flight until the PR merges.

## 2026-08-24 — CI: Saved tab is not Save; Tag count is not a chip

Collection e2e still looked for action-row `#tag` chips and used `name: 'Save'` which matches the Saved tab. Format: table padding in ARCHITECTURE.md / CLAUDE.md. Follow-up: none.

## 2026-08-24 — Album pager is one next-photo pill

Dots are no longer individually tappable. The whole frost chip is one button that advances (wraps). Mobile uses a lighter `bg-black/40` plate; desktop keeps `lg:bg-black/80`. Follow-up: none.

## 2026-08-24 — Album dots sit on a dark frost plate

Multi-image pagination dots were bare white/45 on the photo, so they vanished on dark shots (desktop dock gap). They now sit in a `bg-black/80` rounded pill with a white/30 border + blur. Follow-up: none.

## 2026-08-24 — Saved tab restores /saved after Live

Live replaceStates the address bar onto the staged post. Flipping back to Saved left that preview path in the bar (`onPersonalTabChange` no-op'd when the route was still `/saved`). Saved now writes `/saved` on tab change and from `useTheaterLiveUrl` when that tab is showing. Follow-up: none.

## 2026-08-24 — Mobile album: second photo was unreachable

Multi-image posts already loaded every photo, but on a phone the dots sat under the top scrim (untappable, easy to miss) and the slides used `w-full` flex children that iOS often won't pan. Dots sit below the header (safe-area), each slide is `min-w-full`, swipe is `touch-pan-x`, and a tap on the right/left third changes photo. Follow-up: none.

## 2026-08-24 — Mobile peek-bar audio always present

The mute control hid on non-video posts, which shifted the peek-bar row. It now always renders and disables (same as the desktop dock). Photo posts with more than one image snap sideways (dots) instead of showing only the first. Follow-up: none.

## 2026-08-24 — Theater Tag: count, not chips

Dropped action-row `#tag` chips. The Tag button shows a count (max 5) — desktop next to the label, mobile as a badge. `TagQuickPicker` lists assigned tags first. POST `/api/bookmarks/[id]/tags` returns 400 past 5. Follow-up: none.

## 2026-08-24 — Magic-link email matches the sign-in modal

Sign-in / confirm-email mail is now a react-email template (`src/emails/magic-link.tsx`): stage black, SignInModal card, cloud + Indie Flower wordmark, clay pill. Resend still gets HTML + a plaintext sibling. Preview with `pnpm email:dev` (:3003). Follow-up: none.

## 2026-08-24 — Saved: My Collection → Saved, /collection → /saved

User-facing "My Collection" is now **Saved**; the route is `/saved`. `/collection` 308s there (keeps `open`/`platform`). APIs/DB still say collection (`/api/collections/*`, `collection_events`, internal `PersonalTab = 'collection'`). Follow-up: none.

## 2026-08-24 — Off-site link tweets: card, not 6xl URL

A tweet that wraps a Substack (or similar) URL was typeset at slogan size and sent through `StageArticle`, which has no X Article body. Stage now keeps the tweet prose, strips that URL, and renders a `StageLinkCard` (cover + title + domain). OG thumbs are not tweet photos (that duplicated the cover). CSP `img-src` allows `https:` so publisher images load. Follow-up: filmstrip still uses `thumbnailUrl` for the tile image (the card cover) — that's intentional.

## 2026-08-24 — Staging + prod: drop every X connection

X is a Settings link now, so leftover `user_identities` (provider `x`) + `oauth_tokens` would have blocked Connect X with `linked_elsewhere` (old X-first rows used the Twitter id as `users.id`). Deleted those identities and tokens on both volumes; remapped X-first `users.id` (and matching `user_id` columns) to `detached_<old id>` so migrate's bookmark backfill cannot recreate the collision. Email identities untouched. Backups at `/data/adhx-pre-x-unlink.db`. Follow-up: users sign in with magic link, then Connect X in Settings (sync pulls a fresh X collection onto that account).

## 2026-08-24 — Link-only X: bind email, don't sign in on X

Settings Add-email now uses `/api/auth/email/change` so it cannot spawn a second account. Unsigned X callbacks bounce before spending the OAuth code; `findOrCreateUserForX` without a session is `sign_in_required` even if the identity exists. Flipping Live (caught-up) → Collection resumes the shared stage. Follow-up: `/?auth_error=x_link_only` is still silent on the public theater; existing X-only accounts still need email to sign in.

## 2026-08-24 — Signed-in `.` menu e2e is Theater-first

The account menu opens on Theater, then Live / My Collection / Library. E2E still treated Library as the first focused row, which failed CI. Follow-up: none.

## 2026-08-24 — Account avatar: X photo or generated

Settings Account gained an avatar picker (X profile photo when connected, else the generated icon). Sync X bookmarks shows that X photo instead of the X glyph. Preference `avatarSource` (`x` | `generated`) is honored in the Header and theater menu. `/api/auth/me` identities.x now includes `avatarUrl`. Follow-up: none.

## 2026-08-24 — X-link lands on Settings, not a dropped firstLogin

After linking X, the callback used to send `/?firstLogin=true`. Signed-in `/` now redirects to `/collection` and drops the query, so the library sync modal never ran. Default landing is `/settings` (returnUrl still wins). Follow-up: none.

## 2026-08-24 — Sync is once an hour; X stats are ours, not X's

Default sync cooldown is 60 minutes (still overridable via `SYNC_COOLDOWN_MINUTES`). Settings shows synced-from-X vs from-X-on-ADHX (paste/prefix included); collection total only if other platforms exist. X's bookmarks API has no user total (~800 recent cap), so we never invent one. Follow-up: none.

## 2026-08-24 — Account: no hairlines, Save sits on the field

Account dropped the row dividers and got a subtitle ("Your email and public username"). Changing a handle is one row: the field, Save, Cancel — the 15-char cap leaves room. Follow-up: none.

## 2026-08-24 — Username change is just the field

Changing a handle no longer stacks "@name", "N changes left", and a paragraph about redirects on top of the same form. Change swaps the row for the input, Available, Save, Cancel. Idle still shows the short "N changes left". Follow-up: none.

## 2026-08-24 — Settings Account card: mail and @ icons

Email and username sit in one Account card. Each row has a clay mail / @ icon beside the value — no extra titles, no MAGIC LINK pill. Connect X stays on Sync X bookmarks. Follow-up: none.

## 2026-08-24 — /collection uses the same Stage as Live

Loading My Collection paused playback (and ate Space) whenever every live pulse post was already seen — the live caught-up/`theater-pause` machinery ran on a tab that isn't that playlist. Collection now plays through the same `Stage` as Live/shared/tags; waiting/pause/Space-guard stay off that tab. 10s dwell and video `onEnded` were already the same events. Follow-up: none.

## 2026-08-24 — Settings identity is value + Change

Email and Username dropped the titled headers and the second matching icon. One untitled card, two rows: the address / `@handle`, a short hint, Change. Magic-link pill is gone (that's the only sign-in). Connect X stays on Sync X bookmarks. Follow-up: none.

## 2026-08-24 — /tags delete has no confirm

Trash on a tag card DELETEs immediately — no `window.confirm`. Follow-up: none.

## 2026-08-24 — My Collection: 10s dwell for photos and text

Non-video posts in `/collection` had no timer while Repeat was still on the dock, so Repeat-all/one had nothing to time against. The clay 10s line is back; dwell completion uses the same `personalAdvanceOnEnded` path as video-ended (off → All Clear, all wraps, one stays). Follow-up: none.

## 2026-08-24 — Settings: Email and Username are their own cards

Account had email, username, and Connect X in one card. Email and Username are now separate sections; Connect / Disconnect X lives on Sync X bookmarks. Follow-up: none.

## 2026-08-24 — /tags posters: name + stats on the image, actions below

Tag management cards stacked Public/copy/open/delete on the mosaic with the title. The mosaic now only overlays `#tag` + count/views/saves; visibility, copy, open, and delete sit in a horizontal row under the image (`CollectionPosterCard` action bar). Starter-collection clone CTAs use the same row. Follow-up: none.

## 2026-08-24 — Library FilterBar sticks under the header

FilterBar was `sticky top-0`, same as the Header, so on scroll it slid underneath and "Done adding" vanished. It now sticks at `top-16`. Follow-up: none.

## 2026-08-24 — iOS shortcut is the share menu for every network

The published shortcut now covers X, Instagram, TikTok, and YouTube. Settings (and the shared `IosHow` strip) say it adds ADHX to the iOS share menu, then you Share → ADHX from the social apps. Copy no longer calls it X-only. Follow-up: none.

## 2026-08-24 — Header search is icon-expand, library + tags only

The centered search field threw the authed bar off-center and showed on pages that cannot use it. Search is now a magnifying-glass left of the avatar; click expands. Visible only on `/library` (placeholder Search, writes `/library?search=`) and `/tags` (placeholder Tags, `tags-search` event, no URL). Follow-up: none.

## 2026-08-24 — /tags cards click through; tags can be deleted

The poster footer's title/count sat above the view link and ate clicks — only the mosaic (not the #tag) opened the playlist. Footer is now `pointer-events-none` except Public/Private + copy/open/delete. Each card has a delete control (`DELETE /api/tags`, confirm first) so tags created in the theater picker can be removed here. Follow-up: none.

## 2026-08-24 — Theater menu keeps Radio row, tabs indent under it

On the theater page the avatar menu had replaced Theater with an uppercase heading + Live / My Collection. Theater is the Radio + 13px row again (same as Library / the Header menu); Live and My Collection sit indented under it with their own icons. Follow-up: none.

## 2026-08-24 — Settings version links to GitHub release

The footer `ADHX v…` on `/settings` is now a link to `github.com/itsmemeworks/adhx/releases/tag/v{version}`. Follow-up: none.

## 2026-08-24 — iOS shortcut how-to is a 3-step icon strip

Settings (and landing) now show Add shortcut / Open X / Share → ADHX as clay tiles, same as Android. The collapsed “Instagram, TikTok, YouTube too” recipe is gone; a one-line footer covers those apps. Follow-up: none.

## 2026-08-24 — Space pauses the 10s dwell on static posts

`theater-toggle-play` (Space) only reached video stages. Timed items (photo/text/article) now pause/resume the progress line the same way, and the dock/peek-bar icon follows via `theater-pause`/`theater-resume`. Follow-up: none.

## 2026-08-24 — Leaderboard subtitle names tag → playlist

Replaced "saving into and sending around" with "People tag posts into playlists. A playlist is a public tag…" on `/leaderboard` (plus matching meta descriptions and empty-state). Follow-up: none.

## 2026-08-24 — X is a Settings link, not a sign-in method

Sign-in is email magic link only (`SignInModal`, PublicNav, landing hero). `GET /api/auth/twitter` and the callback require a session; unsigned visitors bounce `/?auth_error=x_link_only`. `findOrCreateUserForX` no longer creates accounts. Link X in Settings to sync bookmarks; SyncProgress reconnect stays for already-signed-in users. Follow-up: existing X-only accounts cannot sign in until they have email.

## 2026-08-24 — Bionic Reading in theater articles and Read mode

The Settings toggle now applies on `StageArticle` (headline + body) and the typeset `StageText` / quote-card reader. Two-line media captions stay plain. Follow-up: none.

## 2026-08-24 — Library sits below Theater in account menus

Theater group (Live / My Collection, or the single Theater entry) is now first in `TheaterAvatarMenu` and the Header avatar dropdown; Library follows, then Tags. Desktop top-bar order is unchanged. Follow-up: none.

## 2026-08-24 — Android install how-to is a 3-step icon strip

The numbered paragraph list is gone. Add to Home / Open the app / Share → ADHX are clay tiles with a one-line hint. Settings shows the strip open; the theater nudge still hides it behind How. Follow-up: none.

## 2026-08-24 — Settings uses the same Android install banner

`AndroidInstallBanner` is the single chrome for the theater/library nudge and Settings. Settings stays always-on (no tap-away / X); the nudge skips `/settings` so the card is not doubled. Follow-up: none.

## 2026-08-24 — Android install banner: why, no logo, tap away

Android A2HS banner no longer repeats the ADHX icon. Copy leads with sharing a post directly into ADHX. Tap outside dismisses it, same as the iOS shortcut nudge. Follow-up: none.

## 2026-08-24 — PR 407: merge main + Android How stays in-banner

Merged main (theater-only shortcuts, tap-declutter, Read/Watch). Android How expands the walkthrough in the banner instead of sending visitors to `/settings` (auth-gated). On theater paths the Android banner hangs under the logo at `z-[70]` so it does not cover the peek bar. Follow-up: none.

## 2026-08-24 — Repeat is R; Read / Watch is F

Repeat moved from `F` to `R`. Read / Watch took `F`. Follow-up: none.

## 2026-08-24 — E expand, F repeat, arrows scroll text

Theater keyboard: `E` toggles expand (hide/show chrome), `F` cycles repeat. `↓`/`↑` no longer change posts — they scroll the article/text stage so reading does not need the mouse. Next/previous are `→` `J` / `←` `K`. Follow-up: none.

## 2026-08-24 — Archive sits below Read / Watch in shortcut help

Actions cheatsheet order is now Read / Watch then Archive then Undo. Follow-up: none.

## 2026-08-24 — Tag picker is fully keyboardable

`T` focuses the new-tag input. Enter there creates, assigns, and closes. Arrows (and J/K off the input) move the existing tag rows; Space/Enter toggles the focused row. Follow-up: none.

## 2026-08-24 — Desktop menu has Live / My Collection

Desktop's avatar menu now gets the same Theater sub-rows as mobile (`theaterTabs`), so `.` + arrows can switch Live ⇄ My Collection. The top-bar pill stays for the mouse. Follow-up: none.

## 2026-08-24 — Arrow through the theater menu

`.` still opens the avatar/burger menu; arrows / J K / Home / End now move between `menuitem`s and Enter / Space activate the focused row (was swallowing those keys so the stage did not advance, without moving focus). Follow-up: none.

## 2026-08-24 — W / P on the caught-up stage

Waiting-stage **Re-watch all** is `W`, **Keep playing** is `P` (same click-the-chrome-button pattern; no-op when those buttons are not mounted). Collection All Clear also takes `P`. Follow-up: none.

## 2026-08-24 — Shortcut help groups next vs previous

Navigate help is two lines: next (`→` `↓` `J`) then previous (`←` `↑` `K`). J/K were listed as a pair the wrong way around. Follow-up: none.

## 2026-08-24 — Shortcut help is two columns on desktop

`TheaterShortcutsHelp` is `max-w-2xl` on `lg+` with Navigate/Playback/Also left and Actions right, so the overlay is wider and shorter. Phone stays a single column. Follow-up: none.

## 2026-08-24 — R toggles Read / Watch

Theater keyboard now has `R` for the Read/Watch switch (same control as the chrome button). No-op when the post has no overflow or quote. Follow-up: none.

## 2026-08-23 — Theater is the only keyboard surface

Library and Settings no longer bind keys (the old gallery/focus cheatsheet is gone). Theater gets a full desktop map: arrows/jk, Space, M, S/T/L/C/D/O/A, R Read/Watch, U undo, `.` menu, ⌘V/Ctrl+V paste (OS event), Shift+? help overlay. Action keys click `[data-theater-action]` on the visible chrome only. Covered by unit tests plus `e2e/theater-shortcuts.spec.ts` (help, menu, S/T/A/U/R, library no-ops). Follow-up: none.

## 2026-08-24 — Stage tap declutter onto Read/Watch

Merged tap-to-declutter onto the Read/Watch theater: first tap hides chrome and starts playback, second tap restores overlays without pausing. Pause stays on the peek-bar / dock button and Space. E2E covers desktop + mobile video tap. Follow-up: none.

## 2026-08-23 — Stage tap declutter + start (not play/pause)

Tapping a video or photo hides chrome and starts playback; tapping again restores overlays without pausing. Pause stays on the peek-bar / dock button and Space. Sound stays on the audio button (tap no longer unmutes). YouTube iframe still eats its own taps. Follow-up: none.

## 2026-08-24 — Isolate Read video under theater chrome

Read mode's video band is `z-20` (fade `z-25`) so the clip sits above the article pane. The stage wrapper had no stacking context, so that painted over sibling chrome (`z-10` paste / flame / avatar) and stole clicks. Stage + Collection article roots now `isolate`; TheaterShell's stage layer is `isolate z-0`. Current state: uncommitted on the Read/Watch branch. Follow-up: none.

## 2026-08-24 — Filmstrip NOW/NEXT no longer stretch cards

The status labels inherited body line-height and NEXT could wrap, so those two cards sat taller than the rest of the strip. Meta row is a fixed `h-4`; labels are `leading-none` + nowrap. Follow-up: none.

## 2026-08-24 — Tagged Tag button keeps the glass border

`border-clay/50` on a tagged Tag action is a no-op (hex Matter tokens drop Tailwind `/NN`) and tw-merge stole the white glass edge, so the button looked like a dark hole. Same frost as Share/Download now; clay is only on the filled icon. Follow-up: none.

## 2026-08-24 — Flame chip always shows, same slot

Owner correction: hiding it on text/articles was wrong. The chip stays left of paste on every post type (video, photo, text, article, Read). It still never sits next to the author. Follow-up: none.

## 2026-08-24 — Flame chip lives left of paste

The community trend count sat next to the author on media and in the top bar on text, so the same post looked different by type. It now has one slot — left of the desktop paste button (and the mobile paste) — and only on full-bleed video/photo. Text, articles, quotes, and Read mode hide it so it never sits on a description. Follow-up: none.

## 2026-08-24 — Shared preview lead was missing pulse stats

Opening a preview URL built the lead from FxTwitter only, so `saveCount`/`trendCount` were unset and the flame chip hid (`< 2`). The same post one card later in the dock had the counts. `buildSharedSeed` now copies those pulse fields onto the lead, same as `addedAt`. Follow-up: none.

## 2026-08-24 — Desktop de-clutter lives in the dock

The top-right expand shoved the avatar around. It's gone: transport is a 3-col grid in the dock (prev / play-pause / next over expand / repeat / mute), and the restore Minimize2 floats bottom-left when chrome is hidden. The account menu stays top-right. Follow-up: none.

## 2026-08-24 — Read fade never touches the video

The clip is left alone (no mask, no overlay). A 3rem stage-black gradient (`#08070a` → transparent) sits immediately _below_ the band so copy fades as it scrolls through that strip, then tucks under. Opening lines sit below the fade. Follow-up: none.

## 2026-08-24 — Read fade is a hairline, not a wash

First pass of the video-to-text fade was a 7rem 65% blur slab: opening copy was already dark, and scrolling painted it on the clip. Now the video only dissolves the last 8px, the gradient is 1.5rem × 30% and starts _below_ the band, and the first line sits clear of it. Follow-up: none.

## 2026-08-24 — Read mode: video-to-text fade

Hard cut under the keep-playing video in Read felt like a razor. The essay now scrolls full-bleed under the band: the clip dissolves at the bottom (`mask-image`) and a sibling blur + stage-black gradient (`StageArticleVideoFade`) sits on the junction so copy softens as it tucks under. Fade is a sibling — the band's `overflow-hidden` would clip it. Follow-up: none.

## 2026-08-23 — Theater Read/Watch review pass

Self-review of the caption/Read PR: Collection now uses the same reader split as Live (photo + Instagram + YouTube), YouTube keeps one iframe across Read, and `useClampExpand` only measures overflow (dead expand state hid Read). E2E covers signed-out/signed-in desktop and mobile icon-only on a video+quote preview. Follow-up: none.

## 2026-08-23 — Mobile Read/Watch is icon-only

Mobile action buttons never carry a label, so Read/Watch is the same 44px glass circle as Download/Share (book / TV), aria-label only. Desktop still uses the labeled pill under the caption. Follow-up: none.

## 2026-08-23 — Mobile caption stays two lines; Read is left of actions

Mobile keeps the 2-line caption above the action row. **Read** sits on the left of that row (Watch too); Download/Tag/Share stay on the right. Follow-up: none.

## 2026-08-23 — Read sits with the caption

Read/Watch was first in the action row, so empty tag `flex-1` shoved it left on some posts. It's now under the caption on purpose (Watch stays in that left slot). Download/Save/Share stay on the right. Follow-up: none.

## 2026-08-23 — Read replaces caption expand; video keeps playing

Long media captions (and quotes) go through **Read** instead of tap-to-expand / dim. **Watch** uses `TvMinimalPlay`, not Film (that's Download). Article mode keeps the same parent `<video>` playing in a top band so you can read while it continues; quote clips stay inline below. Progress/dock stay on the video. Follow-up: none.

## 2026-08-23 — Video+quote is media-first, with a Read switch

A tweet with its own video (or photo) that also quotes another post plays full-bleed again — caption is the parent text. **Read** flips to the stacked article (parent essay + both media + full quote); **Watch** goes back. Text-only quotes still use the reader. My Collection was taking the video branch first and dropping the caption/quote; it now shares this rule. Follow-up: none.

## 2026-08-23 — Personal theater paste stays on the tab

Signed-in Live (`/`) and My Collection (`/collection`) hid desktop paste and skipped ⌘V (a stale comment claimed `PasteToPreview` on AuthedHome covered it — that's `/library` only). Paste is back on both tabs: it POSTs `/api/bookmarks/add` in place so the save lands in the collection and the live pulse, and does **not** navigate to a preview page. Playlist mode still has no paste. Follow-up: none.

## 2026-08-23 — Typeset tweets clear the top chrome

StageText's reader now pads below the brand/paste cluster (`STAGE_TEXT_TOP_PAD`) and vertically centers a short tweet. Long posts, quotes, and inline media stay top-aligned and scroll. Follow-up: none.

## 2026-08-23 — Desktop paste starts as an icon

The theater top bar no longer shows the 420px paste field by default. A clipboard button sits with the avatar / de-clutter cluster; click expands the existing "Paste a link to preview" pill (Escape / click-outside collapse). Global ⌘V is unchanged. Follow-up: none.

## 2026-08-23 — Video+quote uses the stacked reader

A tweet with its own video that also quotes another tweet no longer takes the full-bleed player (which hid the parent essay and reduced the quote to a poster). `isQuoteReader` routes those posts through StageText: full parent text, inline parent video, full quoted tweet, inline quote video. Chrome treats them as text-like (no media caption overlay; 10s timed progress). Follow-up: none.

## 2026-08-23 — Full quoted tweets (and long text) on the stage

Quotes are no longer a 4-line stub. The text/quote reader shows the full parent, parent photos, and the full quoted tweet (text + photos), hydrated from `/api/share/tweet` when the pulse row is thin. Photo+quote uses the reader; video+quote overlays the quote card on the player. Share API now includes quote media. Follow-up: quote videos still show a poster, not inline playback.

## 2026-08-23 — Action pills match the paste-button frost

Dropped kube.io liquid-glass refraction. `StageGlass` now uses the same flat frost as the mobile paste button and avatar trigger (`bg-white/10 backdrop-blur-md`). Follow-up: none.

## 2026-08-23 — Text stages scroll above the action row

Article, tweet, and collection-quote stages now pad their scrollers (`STAGE_TEXT_SCROLL_PAD`) so the last lines can sit above the overlay actions and the mobile peek bar. Media captions are unchanged. Follow-up: none.

## 2026-08-23 — Theater glass via CSS/SVG refraction

Dropped `react-glassy`. Tags and action pills (`StageGlass`) use kube.io's liquid-glass approach: a convex-squircle bezel displacement map + `backdrop-filter: url(#…)` on Chromium, blur+tint+specular inset everywhere else. Follow-up: tune scale on small icon pills if the bend reads too strong.

## 2026-08-23 — Open is the source platform glyph

Dropped the platform+added-to-ADHX chip from desktop and mobile stage chrome. The Open action is now the post's social glyph (X / TikTok / Instagram / YouTube) with `Open on {platform}` as the accessible name — no ExternalLink, no "Open" label. Filmstrip and Up-next still show added-to-ADHX time. Follow-up: none.

## 2026-08-23 — Frosted theater actions; article scroll through the caption zone

Action pills and tag chips use a shared frosted glass fill (blur + saturate) so stage text doesn't read through them. Mobile bottom scrim is pointer-events-none except caption + actions, so an article's empty caption zone scrolls the body. Follow-up: none.

## 2026-08-23 — Text and article author rows link to the profile

`StageAuthorRow` (shared by `StageText` and `StageArticle`) wraps avatar + name + `@handle` in the same `authorProfileUrl` link media chrome already uses. Follow-up: none.

## 2026-08-23 — Mobile theater drops the Close X when signed in

Avatar/burger already lives top-right and has Library. The extra Close next to it on collection + signed-in shared preview was redundant and shifted the menu. Desktop Close in the tab pill stays. Follow-up: none.

## 2026-08-23 — Article splash uses author; tags move to the action row

`StageArticle` splash now shows the tweet-style avatar + name + `@handle` instead of an ARTICLE chip. Theater tag chips sit in the action row (not under the caption) so author/caption stay at a fixed height when scrolling, and article tags are visible. Follow-up: none.

## 2026-08-23 — Caption overflow re-measures after late layout

`useClampExpand` only measured once on item change, so a 0-height first paint (hidden chrome / fonts) left overflowing false and tap-to-expand dead. ResizeObserver remasures. Follow-up: none.

## 2026-08-23 — Theater captions expand on tap

Replaced the small more/less link on media captions with X-style tap-to-expand: two clamped lines with an ellipsis, tap the text to expand, tap again to collapse. Expanded state slightly darkens the media so the white text reads. Copy still lives on the action pills. Follow-up: none.

## 2026-08-23 — Android install + signed-in home is next unread

Android now has a Settings card and a banner that shows without `beforeinstallprompt` (Samsung/Firefox), plus Android-first landing copy. Share → ADHX still needs the PWA installed. Signed-in `/` redirects to `/collection` (continue / next unread). Live moved to `/live`; signed-out `/live` bounces to `/`. Follow-up: rebuild the iOS iCloud shortcut to `/share?url=` (manual).

## 2026-08-23 — Theater photos load via the image proxy

Stage photo variant was hotlinking `pbs.twimg.com`, which often 403s from localhost / Safari. Now uses `/api/media/image` (same as download) with the CDN URL as onError fallback. Follow-up: dock thumbs still use the raw pulse URL.

## 2026-08-23 — Download / Copy labels, kind lives in the icon

Visible label is Download for video+photo and Copy for tweet+article. Film / image / copy / file-text icons and titles still name the kind. Follow-up: none.

## 2026-08-23 — Copy article copies the body, not just the title

`item.text` for articles is the headline. Copy article now fetches the same `/api/share/tweet` markdown `StageArticle` renders (shared in-flight cache) and puts title + body on the clipboard. Follow-up: none.

## 2026-08-23 — Download/copy pills name the thing you get

Theater file slot is Video (film) or Photo (image), not a generic Download. Text-like slot is Copy text vs Copy article. Same on desktop labels and mobile aria-labels. Follow-up: none.

---

## 2026-08-23 — E2E save-clone vs signed-in preview autosave

`nav.spec` visiting a preview while authed now autosaves `POST.preview`, so `save-clone` saw the bookmark already there and then missed the Saved pill (it had become Tag; `name: 'Save'` also matches Saved). Delete first, accept Saved or Tag, poll `feedHasId`. Follow-up: none.

---

## 2026-08-23 — Extension local-install docs

`extension/README.md` is the walkthrough: separate `pnpm --dir extension install`, `.env` → `localhost:3001`, load unpacked from `dist/chromium`, reload after rebuild, signed-in autosave vs × badge. Root README, CONTRIBUTING, ARCHITECTURE, and CLAUDE.md point at it. Follow-up: none.

---

## 2026-08-23 — Exclude extension from app tsc

Root `tsconfig` includes `**/*.ts`, so `pnpm typecheck` / `next build` typed `extension/src` and failed in CI (`Cannot find namespace 'chrome'`) — `@types/chrome` only exists after `pnpm --dir extension install`. Exclude `extension`; it has its own tsconfig. Follow-up: none.

---

## 2026-08-23 — Shared preview tags + signed-in account tabs

Tagging a just-autosaved shared lead wrote the tag but the preview chrome stayed empty — `bookmark-tags-changed` only patched the personal queue. Shared mode now seeds `liveTagsByKey` and listens, so chips and Tag · N update. Signed-in previews also get the Live ⇄ My Collection cluster (same routes as `/`); the visitor LIVE badge was leftover from the signed-out chrome. Covered by chrome + TheaterShell `router.push` tests and an authed e2e on the preview path. Follow-up: none.

---

## 2026-08-23 — Desktop Save to ADHX extension

`extension/` is an [Extension.js](https://extension.js.org) MV3 package: toolbar click, right-click, or ⌘⇧A on an X / IG / TikTok / YouTube post opens `/share?url=` (same target as the iOS shortcut and PWA share). No content scripts; `activeTab` + `contextMenus` only. Not on the Chrome Web Store yet — load unpacked from `extension/dist/chromium`. Bookmarklet stays the no-install fallback. Follow-up: store listing once it feels as easy as Share → ADHX.

---

## 2026-08-23 — Autosave shared preview on new open

Signed-in landing on a preview URL now saves that lead (`TheaterShell` + `sharedAutoSaveReason`). Fires only for a new open: prefix / typed URL / paste (`adhx-preview-open-intent`) / `/share`. Skips reload (theater address-bar rewrite), back/forward, `/trending` clicks, home/personal/playlist, signed-out, and unavailable leads. `?save=1` still completes an explicit save after sign-in. Dwell is unchanged (`/api/activity/preview` only). The shared Save pill pops "Saved" then morphs to Tag (opens the picker); live-tab Save collapses out next to Tag. Follow-up: none.

---

## 2026-08-23 — Avatar menu shows the ADHX username

Header + theater burger led with the email for email-only accounts (and the X handle when connected). Both now show `@username` — email is a sign-in method, not the account name. Follow-up: none.

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
