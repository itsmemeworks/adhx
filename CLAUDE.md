# CLAUDE.md

Guidance for Claude Code and every other coding agent working in this
repository. [`AGENTS.md`](AGENTS.md) is the short cross-tool entry point; this
file is the reference it points to. Both are binding.

Read it top to bottom once. After that, use the headings: the rules come
first, then a map of the code, then notes per subsystem. Deep detail lives in
[`ARCHITECTURE.md`](ARCHITECTURE.md) and the specs under
[`docs/specs/`](docs/specs/), so this file only says what you need to avoid
breaking something.

## Local configuration

Create a gitignored `./CLAUDE.local.md` for settings that are yours alone:

```markdown
# CLAUDE.local.md

## GitHub CLI

Always use the `your-username` account for gh commands.

## Personal notes

- Local dev URL: http://localhost:3001
```

Put these there, never in committed files: GitHub, Sentry and hosting account
names, personal test data and user IDs, local URLs and ports, and workflow
preferences that shouldn't affect other contributors.

## What ADHX is

**Your friends have better taste than the algorithm.** ADHX is a self-hosted,
private feed of the best posts from fourteen networks (X, Instagram, TikTok,
YouTube, Facebook, Reddit, LinkedIn, Vimeo, SoundCloud, Pinterest, Twitch,
Threads, Imgur, Bluesky), picked by one group of close friends and family per
server.

The system in one breath: one Next.js 16 container (React 19, route handlers as
the backend), one SQLite file (Drizzle over `better-sqlite3`) and one media
folder (`MEDIA_DIR`). Every save's media is downloaded once and served by
ADHX itself. Search by meaning runs in forked model processes, never in the web
process. An optional native Mac helper takes the heavy processing over HTTPS.
Native iOS and Android apps (`apps/`) talk to `/api/app/*` with a phone key.
`site/` is the separate static adhx.com product site.

The privacy rule is **named to friends, never to strangers.** A **member** is
a signed-in, approved, non-banned account. Members see who saved what. Signed-out
visitors only ever see counts. A **Just for me** save is never shown, counted
or named to anyone but its owner.

## Session protocol

1. **Start** by reading the newest entries of [`docs/WORKLOG.md`](docs/WORKLOG.md)
   (append-only, newest first). It holds context that postdates the docs.
2. **After substantive work** (a feature, a fix with a lesson, a decision, a
   reverted experiment), add a dated entry at the top of the worklog: what,
   why, current state, follow-ups, 10 lines at most. Never rewrite or delete
   old entries, and never name operator GitHub logins or personal handles in
   them.
3. **Keep docs true.** If your change makes this file, `AGENTS.md`,
   `README.md`, `ARCHITECTURE.md` or a spec inaccurate, fix it in the same PR.
4. **Commit, push and open or update a PR** after substantive work, without
   waiting to be asked. Use the GitHub account named in `CLAUDE.local.md`. PR
   titles are Conventional Commits with a lowercase subject; check yours with
   `gh pr view --json title` before handing off. Don't merge on your own
   initiative: the owner merges, or asks you to arm auto-merge. Never merge the
   Release Please PR. This overrides any global "don't push unless asked"
   preference.

## Commands

| Command                                       | What it does                                                        |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm install`                                | Install dependencies (pinned pnpm via Corepack).                    |
| `pnpm db:migrate`                             | Create or migrate `./data/adhdone.db`. Docker does this on start.   |
| `pnpm dev`                                    | Dev server on http://localhost:3001.                                |
| `pnpm test`                                   | The Vitest suite (needs FFmpeg on `PATH` or `FFMPEG_PATH`).         |
| `pnpm typecheck`                              | `tsc --noEmit`.                                                     |
| `pnpm lint` / `pnpm format:check`             | ESLint over `src/`, Prettier over the repo.                         |
| `pnpm test:e2e`                               | Playwright against an isolated server on :3002 and `data/e2e.db`.   |
| `pnpm test:e2e:install`                       | Download Chromium and WebKit once.                                  |
| `pnpm parity:serve` / `parity:capture`        | Design parity harness on :3600 (see `e2e/parity/README.md`).        |
| `pnpm email:dev`                              | Preview sign-in emails on :3003.                                    |
| `pnpm extension:build`                        | Build the desktop extension (after `pnpm --dir extension install`). |
| `pnpm site:dev` / `site:build`                | The adhx.com product site on :3040.                                 |
| `pnpm check:dependencies`                     | Audit all three JavaScript lockfiles.                               |
| `./gradlew assembleDebug` (in `apps/android`) | Android debug APK. iOS builds from `apps/ios/ADHXShare.xcodeproj`.  |

Locally, run with `KEEP_BACKFILL=off` unless you want your whole library
downloaded, and `SEMANTIC_SEARCH=off` if you don't need search models (they
download about 400 MB on first start). Vitest always runs with the model
processes off.

## The rules

These are the things that have bitten someone before. Each one has a reason;
the reason is usually a production incident or a privacy leak.

**This is Next.js 16.** APIs and conventions differ from older versions you
may know. Read the relevant guide in `node_modules/next/dist/docs/` before
writing framework code (the managed block at the end of `AGENTS.md` says the
same).

### Privacy

- **One condition for other people's saves.** Any query that counts, groups
  or shows someone else's saves uses `visibleSave(alias)` /
  `visibleSaveFilter` from `src/lib/people/savers.ts` (not private, not a
  quoted copy, saver not banned). `seenBy(viewerId)` adds the viewer's own.
- **Names only through `saversFor(keys, viewerId)`**, and only for a
  signed-in member. Never put savers, notes or watchers on a public output:
  previews, signed-out moments, public JSON, OG images, the sitemap.
- **Never add saver-derived fields to `anonymize()`** in
  `src/lib/semantic/items.ts`. Names are attached afterwards, for members.
- **A private save writes no activity pulse**, and making a save private
  deletes its earlier `save` pulse rows (`setSavePrivate`). Private wins on
  public channels too: `/t/{user}/{tag}` never lists a post its owner saved
  privately.
- **Never copy a note to another account** (clones set `note: null`).
- **Kept files of Just for me-only posts are owner-only**
  (`src/lib/keep/file-access.ts`). Everything else under `/api/files/` is
  reachable by anyone who can reach the server, by design.
- **Public caches check `savePrivacyFingerprint()` on every read**, including
  warm hits. Don't replace it with TTL-only or process-local invalidation.
- **`activity.userId` and `analytics_events.userId` are stored, never
  selected** on any public or aggregate read. Select explicit column lists.
- **Never accept display data from the client** (captions, thumbnails,
  avatars, types). Clients send identifiers; the server resolves the rest. A
  public "post what shows on the front page" endpoint is a stored-XSS hole.
- **Sentry gets hashed IDs only** (`src/lib/sentry.ts`). Never send a raw
  `userId`, email or token to a third party.

### Accounts and access

- **`getCurrentUserId()`** (`src/lib/auth/session.ts`) returns null unless the
  session's account exists, is `approved` and isn't banned. Every
  data-changing route checks it, usually through `withAuth`
  (`src/lib/api/with-auth.ts`). Phone routes use `withPhoneKey` /
  `withPhoneKeyOrSession` (`src/lib/api/phone-auth.ts`); admin routes use
  `withAdmin` (`src/lib/admin/guard.ts`).
- **Admin is `users.role = 'admin'` on the immutable account ID**, never a
  runtime username check. `ADMIN_USER_IDS` grants it at startup;
  `ADMIN_USERNAMES` is a strict one-time bootstrap for old deployments.
- **Links are spent by POST, never GET.** Magic links and invite links show a
  script-free confirmation on GET or HEAD (link previews must not spend them);
  a same-origin form POST consumes them with one conditional write.
- **X never creates an account or a session.** It is a link on an existing
  account for bookmark sync.

### X tokens

- **`getValidTokens(userId, { forceRefresh? })`** in `src/lib/auth/oauth.ts`
  is the only way to get a usable X access token. X refresh tokens are
  single-use and rotate; two concurrent refreshes break the chain and force
  a re-link. It coalesces in-process, takes a durable SQLite lease, and
  writes with compare-and-swap. Never call `refreshAccessToken` +
  `saveTokens` yourself.
- **`TokenRefreshError.fatal`** (400/401) deletes only the rejected
  credential row and keeps the ADHX session. Non-fatal errors keep the stored
  tokens for a later retry.
- **402 is not reauth.** X uses 402 for "the developer account has no
  credits". It's `code: 'unavailable'`; only 401/403 after one forced refresh
  become `code: 'reauth'` (`src/lib/twitter/errors.ts`).
- **The OAuth `redirect_uri` host must not contain `x.com`.** During
  logged-out login, X rewrites every `x.com` in the authorize URL to
  `twitter.com`, so `adhx.com` became `adhtwitter.com`. Set
  `TWITTER_OAUTH_REDIRECT_URI` to a host without that substring; the callback
  307-bounces back to the canonical origin before consuming anything.

### Security

- **SSRF: exact host or dot-prefixed suffix, never `.includes()`.**

  ```typescript
  // Wrong: allows twimg.com.evil.com
  if (hostname.includes('twimg.com')) { ... }

  // Right
  const ok = hostname === 'video.twimg.com' || hostname.endsWith('.twimg.com')
  ```

  Redirects are followed manually and every hop is revalidated. Arbitrary
  link previews use public-IP validation with DNS pinning.

- **Every server-side `fetch()` to the outside world has
  `signal: AbortSignal.timeout(…)`** (10 s for APIs, 30 s for large files).
  A hung CDN connection otherwise ties up the single process.
- **CSP lives in `next.config.js`.** Production never gets `'unsafe-eval'`
  (only `pnpm dev` adds it, for React Refresh). The Instagram fallback embed
  needs `frame-src https://www.instagram.com`.
- **Moderation fails closed.** Moderation reads return success or
  "unavailable"; never translate unavailable into visible or not banned.
  Startup stops if the moderation tables can't be read.
- **Drizzle's query builder or `sql` template tags only**, never string
  interpolation into SQL. FTS input is quoted token by token.

### Data

- **Every user-data query filters by `userId`; every lookup by `bookmarkId`
  also filters by `platform`.** Keys are composite, `(userId, platform, id)`,
  so two people can save the same post and a TikTok ID can't collide with a
  tweet ID. Never add `isNull(userId)` "legacy" fallbacks; they leak rows
  across accounts.
- **Transactions** use `runInTransaction()` from `@/lib/db`, with synchronous
  `.run()` inside (better-sqlite3 is synchronous). Examples:
  `src/app/api/bookmarks/[id]/route.ts`, `src/app/api/account/clear/route.ts`.
- **Migrations run at container start** (`src/lib/db/migrate.ts`), each step
  guarded; a failure exits with the step's name. SQLite has no
  `ADD COLUMN IF NOT EXISTS`, so new columns are guarded `ALTER TABLE`s. Add
  new columns to the in-memory test DDL in `src/__tests__/api/setup.ts` too.
- **Account triggers** (`src/lib/db/account-invariants.ts`) reject writes
  that reference a deleted `users.id`. A new user-linked table needs one.
- **DB-reading pages are `force-dynamic`** and never use
  `generateStaticParams`. The database doesn't exist at build time, so a
  prerender bakes empty HTML or fails the build.
- **One app instance, one SQLite volume.** Rate limits, caches, presence and
  the moments engine are process-local by design.
- **Never import a server-only module into a client component.** Anything
  that reaches `@/lib/db` drags `better-sqlite3` into the browser bundle.

### Models and processing

- **Models never run in the web process.** Inference blocks the event loop
  (one video once froze every request for about 15 seconds). The web server
  talks to the forked `jobs` and `query` children only through
  `src/lib/semantic/supervisor.ts`. Never import `model.ts`, `worker.ts` or
  `extract-model.ts` from a route or page.
- **Documents hold public post content only** (`src/lib/semantic/documents.ts`):
  never tags, notes or anything private.
- **Strings sent to Jev are made well-formed before `JSON.stringify`**
  (`src/lib/semantic/jev.ts`). A half emoji gets a 400.
- **Enqueue understanding with `noteSaved(keys, priority)`** from
  `@/lib/semantic`. It's fire-and-forget and never throws.

### Rendering and the theater

- **Browser translation is on, so never render a bare text node as a sibling
  of an element.** Wrap each run in a `<span>`. A translator swaps text nodes
  for its own wrappers and React's next DOM update throws. Full rule:
  [`docs/specs/translation-safety.md`](docs/specs/translation-safety.md).
- **Never key or remount `StageVideo`.** iOS grants audible playback to the
  element the person touched; a new element loses it. `TheaterV2` drives the
  shared `Stage` (`src/components/theater/`) only through window events in
  `usePlayerState.ts` (`theater-pause`, `theater-resume`, `theater-set-muted`,
  `theater-set-volume`, `theater-seek`, …). Don't fork the Stage.
- **Build every media URL with `keptSrc()`** (`src/lib/keep/src.ts`). Never
  hand-write `/api/media/*`; those proxies are only the fallback until a file
  is kept.
- **Instagram video: don't attach `<video src>` until a Range probe answers
  200 or 206** (`probeInstagramVideo`).
- **Sending a file shares `files` plus `text: "via <url>"`, never `url`
  with `files`** (WhatsApp prints the link twice). `useSendFile` prefetches so
  `navigator.share` stays inside the tap on iOS, and its module-level
  in-flight dedupe stops double downloads. Keep both.
- **Gestures that iOS guards happen inside the tap**: clipboard reads,
  `navigator.share`, and focusing the quick-search field (`openQuickSearch()`).
- **Inputs are 16px on phones** (`text-base sm:text-xs`), or iOS Safari zooms.
- **Search state syncs with `history.replaceState`**, not `router.replace`,
  which re-renders the server page on every keystroke.
- **Sheets move focus in once on open.** The theater re-renders several times
  a second while video plays, so focusing on every render steals focus.
- **Text over media** sits on `.nx-scrim` and `.nx-text-shadow`; controls over
  media use `.nx-plate`. Motion is `animate-nx-*` and stops under
  `prefers-reduced-motion`.
- **Line clamps:** put padding on a wrapper and `line-clamp-N` on a child with
  no vertical padding, or a clipped line peeks through.
- **Dark is the only theme.** There is no theme toggle.
- **Nested corners.** Anything inside a rounded container, along its edge or
  in a corner, gets radius = the container's radius − the gap − its border,
  at least 8. Example: Live's 26 px card with an 8 px inset and a 2 px ring
  gives a 16 px Tune in. Free-standing buttons keep their shape. On the web,
  use `rounded-[Npx]` with the arithmetic in a comment, or `--nx-nest` for
  shared buttons that appear both in and out of cards. The phones draw
  squircles (iOS `.continuous`, Android `ui/Squircle.kt`); the web keeps
  round corners because Safari has no `corner-shape`.

### Words in the product

- UI copy follows the Voice section of [`brand/BRAND.md`](brand/BRAND.md):
  clear first, funny second, punch up at ad tech, never at people. Describe
  only what ships today.
- Never name models or techniques in the UI. Say "learning", "channels",
  "words only".
- Keep privacy copy true: pictures, frames, speech and on-screen text are
  understood on your own server, but Jev does receive the search words and a
  post's own text when it's configured, so never claim nothing at all leaves.
- Reactions are "React" and "Say something", never "comments".
- **No gamification.** Streaks were removed on purpose. Don't bring them back.

## Where things live

| Area                   | Code                                                                                                                         | Read more                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Pages and routes       | `src/app/` (App Router; route handlers under `src/app/api/`)                                                                 | [`ARCHITECTURE.md`](ARCHITECTURE.md#product-surfaces)                     |
| Middleware             | `src/proxy.ts` (full source URL after the host → clean preview route)                                                        |                                                                           |
| Database               | `src/lib/db/` (`schema.ts`, `migrate.ts`, `account-invariants.ts`)                                                           | [Persistence planes](ARCHITECTURE.md#persistence-planes)                  |
| Accounts and sign-in   | `src/lib/auth/` (`account.ts`, `session.ts`, `invites.ts`, `approval.ts`, `phone-pairing.ts`, `phone-signin.ts`, `oauth.ts`) | [Accounts](ARCHITECTURE.md#accounts-and-authentication)                   |
| Email                  | `src/lib/email/magic-link.ts`, templates in `src/emails/`                                                                    |                                                                           |
| People and privacy     | `src/lib/people/` (`savers.ts`, `members.ts`), `src/lib/bookmarks/privacy.ts`, `visibility-sql.ts`                           | [`docs/specs/friends-feed.md`](docs/specs/friends-feed.md)                |
| Saving                 | `src/app/api/bookmarks/add`, `src/app/api/tweets/add`, `src/app/api/app/save`, `src/lib/platform/networks.ts`                | [Save to watch](ARCHITECTURE.md#save-to-watch)                            |
| Kept media             | `src/lib/keep/` (worker, `file-access.ts`, `src.ts`), served by `src/app/api/files/`                                         | [Kept media](ARCHITECTURE.md#kept-media)                                  |
| Understanding, search  | `src/lib/semantic/` (`supervisor.ts`, `search.ts`, `vector-index.ts`, `rerank.ts`)                                           | [Understanding](ARCHITECTURE.md#understanding-pipeline-search-by-meaning) |
| Mac helper protocol    | `src/lib/processing/`, `deploy/mac/`                                                                                         | [`docs/remote-processing.md`](docs/remote-processing.md)                  |
| New (the blended feed) | `src/lib/feed/` (`blend.ts` pure, `blend-db.ts`, `views.ts`, `kinds.ts`)                                                     | [New](ARCHITECTURE.md#new-the-blended-feed)                               |
| Sends                  | `src/lib/sends/`                                                                                                             | [Sends](ARCHITECTURE.md#sends)                                            |
| Right now (moments)    | `src/lib/moments/` (`engine.ts`, `group.ts`, `people.ts`, `presence.ts`)                                                     | [Right now](ARCHITECTURE.md#right-now-live-moments)                       |
| Reactions              | `src/lib/reactions/`                                                                                                         | [`docs/specs/phone-app.md`](docs/specs/phone-app.md)                      |
| Channels               | `src/lib/channels/` (`overview.ts`, `group.ts`, `friends.ts`, `auto.ts`), `src/lib/tags/`                                    | [Channels](ARCHITECTURE.md#channels)                                      |
| Admin and moderation   | `src/lib/admin/`, `src/components/next/admin/`                                                                               | [`docs/specs/admin.md`](docs/specs/admin.md)                              |
| X sync                 | `src/app/api/sync`, `src/lib/sync/`, `src/lib/twitter/`                                                                      | [X bookmark sync](ARCHITECTURE.md#x-bookmark-sync)                        |
| Phone API              | `src/app/api/app/`, `src/lib/app/`, `src/lib/api/phone-auth.ts`                                                              | [`docs/specs/phone-app.md`](docs/specs/phone-app.md)                      |
| The UI                 | `src/components/next/` (theater, search, channels, moments, settings, admin)                                                 |                                                                           |
| The media Stage        | `src/components/theater/` (`StageVideo.tsx`, `useSendFile.ts`, shared by `TheaterV2`)                                        |                                                                           |
| Phone apps             | `apps/ios/` (Swift), `apps/android/` (Kotlin, Compose)                                                                       | [iOS](apps/ios/README.md), [Android](apps/android/README.md)              |
| Desktop extension      | `extension/`                                                                                                                 | [`extension/README.md`](extension/README.md)                              |
| Deployment examples    | `docker-compose.yml`, `deploy/nas/`, `deploy/mac/`, `Dockerfile`                                                             | [`deploy/nas/README.md`](deploy/nas/README.md)                            |
| Product site           | `site/` (imports nothing from `src/`; editing it doesn't publish it)                                                         |                                                                           |
| Tests                  | `src/__tests__/` (Vitest), `e2e/` (Playwright), `e2e/parity/`                                                                | [Testing](#testing)                                                       |

## Subsystem notes

Short notes on what is easy to get wrong. Each links to the full description.

### Accounts, invites and sign-in

- Two ways in: an **invite link** (`/invite/{token}`, 7 days, single use, only
  the token's SHA-256 stored; it makes an account with no email) or an
  **email magic link** (15 minutes; 60 when links are held for an admin with
  `EMAIL_LINKS_TO_ADMIN`). `ALLOWED_EMAILS` limits who may create an account
  by email; existing accounts can always sign in. In development without
  `RESEND_API_KEY` or `SMTP_URL`, links are printed to the server console.
- **Who can invite** (`admin | approve | anyone`) lives in `server_settings`
  (`invites.who`); `INVITES=members` only sets the first default. Under
  `approve`, people a non-admin invited join as `pending` and wait at
  `/invite/waiting` until an admin answers in Settings → Your people.
- `GET /api/auth/me` is the client's source of truth for the account,
  identities, X connection and admin role.
- Sessions are an HS256 JWT in the `adhx_session` cookie: 30 days, `httpOnly`,
  `sameSite=lax`, `secure` in production, signed with `SESSION_SECRET`.
- OAuth tokens are AES-256-GCM encrypted at rest
  (`src/lib/auth/token-encryption.ts`).

### Phones

- **Pairing:** Settings (or `/invite/done`) shows an 8-character code that
  works once for 10 minutes; the app spends it at `POST /api/app/pair` and
  gets a phone key (`access_keys`, scope `phone`, stored as a hash).
- **Sign in on the phone:** `POST /api/app/signin { email }` emails a 6-digit
  code (15 minutes, five wrong tries burn it, always answers `{ ok: true }`);
  `POST /api/app/signin/verify` returns a phone key.
- **Every phone route reuses the web's library code**, never a fork.
  `DELETE /api/app/me` lets a phone revoke its own key.
- Share sheets post to `/api/app/save` with `deferPublish: true`: the save is
  staged privately until `PATCH /api/app/save` confirms the Just for me choice
  with a monotonic `intentVersion`. Without that confirmation, a new save
  stays private.

### Saves, notes and privacy

- Every save path takes `private?` and `note?` and honours the saver's "Just
  for me by default" (`withPrivateDefault`). A repeat save changes privacy
  only when `private` is passed explicitly.
- Notes are cleaned by `cleanNote` (`src/lib/people/note-text.ts`): 140
  characters at most, control and bidi characters dropped.
- Tags are cleaned by `sanitizeTag` (`src/lib/utils/tag.ts`): lowercase,
  hyphens, 15 characters. At most 5 tags a post (`MAX_TAGS_PER_POST`).
- Seen marks live in `post_views` (`src/lib/feed/views.ts`): 2 seconds on
  stage or a skip, batched through an account-scoped outbox to
  `POST /api/views` (phones: `/api/app/seen`).

### Kept media

- `keep_jobs` has one row per post, not per saver. X downloads through
  FxTwitter; everything else through yt-dlp. Non-H.264 video is re-encoded
  unless `KEEP_H264=off` (on the Mac in remote mode).
- `/api/files/{platform}/{id}/{slot}` serves kept files with Range support.
  Until a file is kept, X, Instagram and TikTok fall back to the old proxies
  under `/api/media/`.
- FFmpeg comes from the system (`FFMPEG_PATH` or `PATH`); `ffmpegPath()`
  returns an absolute path because yt-dlp doesn't search `PATH`.

### Understanding and search

- Vectors: EmbeddingGemma 2 for words, pictures and sampled video frames.
  Words: Whisper base for speech, Florence-2 base for text on screen, both in
  a short-lived `extract-child.ts`. Everything is keyed by post, with no
  `user_id`.
- `GET /api/search` fuses z-scored vector lists with FTS5 keywords, then an
  optional Jev rerank (`refine=1`) of the top 20. Plain rank fusion was tried
  and was far worse; re-tune with `scripts/eval-search.ts` after big changes.
- Bump `SEMANTIC_MODEL_VERSION` to re-understand everything.
- `PROCESSING_MODE=remote` stops the local jobs child and hands work to the
  Mac helper over leased `/api/processing/*` calls authenticated by
  `PROCESSING_WORKER_TOKEN` (never an account or phone key).

### New, moments, reactions and channels

- **New** (`/play?feed=new`) is scored in pure functions in
  `src/lib/feed/blend.ts`; snapshots cache only ordering, and every page
  rechecks moderation, savers and gone posts.
- **Right now** is an in-memory engine in the web process
  (`src/lib/moments/engine.ts`). It is anonymous; names are added per request
  for members only (`people.ts`), and signed-out responses keep their old
  shape.
- **Reactions** (`post_reactions`) show only to members who can see the post,
  never from banned members, never on hidden posts.
- **A channel is a tag or a derived group**, never a second system: From
  everyone (`group_channels`), Your people (one per friend), Made for you
  (`auto_channels`, private), and your own tags (public via
  `tag_shares.is_public` at `/t/{user}/{tag}`).

### The theater

- `TheaterV2` (`src/components/next/theater/`) plays every queue at `/play`;
  the query picks the source (`feed=`, `recent=1`, `q=`, `channel=`, `auto=`,
  `group=`, `friend=`, `moment=`, `reacted=1`).
- Preview pages (`/{user}/status/{id}`, `/p/{id}`, `/reel(s)/{id}`,
  `/@{user}/video/{id}`, `/s/{network}/{id}`) render `PreviewTheater`: the
  page paints at once and passes a not-awaited promise for the upstream post,
  while `generateMetadata` awaits it for crawlers. A signed-in fresh open
  saves the post (`autosave-shared.ts`).
- Keyboard (handled in `TheaterV2.tsx`): `→`, `↓` or `J` next; `←` or `↑`
  previous (on an article the up and down arrows scroll instead); `Space` or
  `K` play and pause; `M` mute; `F` full screen; `Q` the queue; `/` search;
  `⌘V` pastes a link.
- Every control the design hides keeps a focus-revealed button. Never show two
  visible Previous/Next pairs: e2e clicks `Next` by exact name.

### Admin and moderation

- `/admin/*` boards read `src/lib/admin/boards/*`. They count Just for me
  saves but build every list from shared saves only, and never show what
  anyone searched or watched.
- Hiding a post writes `moderated_posts`, `activity.hidden` and `admin_audit`
  in one transaction. Banning writes `user_bans`; the account's sessions,
  phone keys and invites stop working.

## Environment variables

[`.env.example`](.env.example) lists every variable with a comment; copy it to
`.env.local`. The ones you'll meet first:

| Variable                                                     | Purpose                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `SESSION_SECRET`                                             | Signs sessions and file tokens. Generate with `openssl rand -base64 32`. |
| `NEXT_PUBLIC_APP_URL`                                        | The address people use (http://localhost:3001 locally).                  |
| `DATABASE_PATH`, `MEDIA_DIR`                                 | SQLite file and kept-media folder.                                       |
| `RESEND_API_KEY`, `SMTP_URL`, `EMAIL_LINKS_TO_ADMIN`         | How sign-in links are delivered.                                         |
| `ALLOWED_EMAILS`, `INVITES`, `ADMIN_USER_IDS`                | Who may join, who may invite, who is admin.                              |
| `KEEP_MEDIA`, `KEEP_BACKFILL`, `KEEP_H264`                   | Kept-media switches (`off` to disable).                                  |
| `SEMANTIC_SEARCH`, `SEMANTIC_SPEECH`, `SEMANTIC_SCREEN_TEXT` | Model switches (`off` to disable).                                       |
| `PROCESSING_MODE`, `PROCESSING_WORKER_TOKEN`                 | Local processing or the Mac helper.                                      |
| `TYPESAFE_API_KEY`                                           | Optional Jev rerank and naming. Never commit or log it.                  |
| `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`                 | Optional X bookmark sync.                                                |
| `TRUST_PROXY_IP_HEADERS`                                     | `true` only behind a proxy that overwrites `X-Forwarded-For`.            |

## Testing

- **Unit and route tests** are Vitest files in `src/__tests__/`. Route tests
  use an in-memory SQLite database from `createTestDb()` in
  `src/__tests__/api/setup.ts` and check that one account's actions never
  touch another's.
- **Mock every `@/lib/db` export a route uses.** A missing export (say,
  `runInTransaction`) shows up as a silent 500 in the test:

  ```typescript
  vi.mock('@/lib/db', () => ({
    get db() {
      return testInstance.db
    },
    runInTransaction<R>(fn: () => R): R {
      return testInstance.sqlite.transaction(fn)()
    },
  }))
  ```

- **Browser tests** live in `e2e/*.spec.ts` and are not part of `pnpm test`.
  `e2e/serve.ts` migrates and seeds `data/e2e.db`, starts Next on :3002 and
  mints a session. Never point them at your own `:3001` or `adhdone.db`.
- **Design parity** (`e2e/parity/`) screenshots the app beside the design
  boards; its README explains the world it builds.
- **Native apps** build and test in the Native apps workflow; locally see the
  [iOS](apps/ios/README.md) and [Android](apps/android/README.md) READMEs.
- Before you call something done: `pnpm typecheck && pnpm test`, then
  `pnpm lint && pnpm format:check`. For UI changes, also look at it in a
  browser at desktop and phone widths. A passing test is not a screenshot.

## CI, releases and deployment

| Workflow              | When                          | What                                                                                     |
| --------------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `ci.yml`              | Pull requests                 | Format, lint, typecheck, tests, e2e, build, extension, container smoke, site, audit.     |
| `native.yml`          | Pull requests                 | Android and iOS builds and tests.                                                        |
| `pr-title.yml`        | Pull requests                 | Conventional Commit PR title.                                                            |
| `codeql.yml`          | Pull requests, weekly         | Code scanning.                                                                           |
| `release-please.yml`  | Push to `main`                | Opens the release PR; on release, publishes the image, Android APK and TestFlight build. |
| `image-publish.yml`   | Called by release, or by hand | AMD64 and ARM64 images to `ghcr.io/itsmemeworks/adhx`.                                   |
| `android-release.yml` | Called by release, or by hand | Signed APK attached to the GitHub release (skips without signing secrets).               |
| `ios-testflight.yml`  | Called by release, or by hand | Signed upload to TestFlight (skips without App Store secrets).                           |
| `site.yml`            | By hand                       | Publishes `site/` to GitHub Pages.                                                       |
| `deploy.yml`          | By hand                       | Legacy hosted Fly apps. Never run it unless the owner asks.                              |

Merging to `main` never deploys anything. The owner merges the Release Please
PR; installing a release on a server is a separate step. Release mechanics,
secrets and the Release Please quirks are in
[`docs/releasing.md`](docs/releasing.md). Commit messages and PR titles are
checked by commitlint (`commitlint.config.cjs`): a type from the allowed list,
a lowercase subject, no trailing full stop, 100 characters at most.

## History

ADHX began as an X-first hosted bookmark app with a library grid, an older
theater (`TheaterShell`), Discover at `/live`, `/trending` and a playlist
leaderboard. All of that is gone, and `next.config.js` redirects the old URLs
to `/now` or `/channels`. If an old doc or comment tells you to edit
`TheaterShell`, `FeedCard` or the library grid, it's a ghost: don't feed it.

What survives from that era, and why:

- **Tables with old data:** `activity` (the anonymous post pulse, 30 days),
  `analytics_events` (private product log, 90 days), `collection_events` and
  `collection_aggregates` (channel views and clones). Their privacy rules
  above still apply.
- **Words in public contracts:** APIs and columns still say "collection" and
  "playlist" (`/api/collections/trending`, `tag_shares`). Don't rename them;
  they're indexed and linked.
- **The media proxies** under `/api/media/` (FxTwitter, Instagram, TikTok,
  HLS for long X videos) remain as the fallback before a file is kept.
- **The legacy Fly configs** (`fly.toml`, `fly.production.toml`) and the
  manual Deploy workflow. The current product is self-hosted with Docker.

The long-form history, with the reasoning behind each removal, is in
[`docs/WORKLOG.md`](docs/WORKLOG.md) and in this file's git history.
