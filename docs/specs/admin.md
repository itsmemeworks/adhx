# The admin area

**Status: shipped in 2.2.0** ([#571](https://github.com/itsmemeworks/adhx/pull/571)). This is the living spec for `/admin/*`.

`/admin/*` is where the people who run an ADHX look after it: who's on it,
what's been saved, how it's used, what the server is doing, and moderation.
It follows the "10 · Admin" design boards (ten 1280×800 boards; parity
captures `admin-1` … `admin-10` in `e2e/parity/capture.spec.ts`).

## Who can open it

- Admins only: `users.role = 'admin'` on the immutable account id
  (`requireAdmin` / `withAdmin`, `src/lib/admin/guard.ts`; pages use
  `adminPageActor`, `src/lib/admin/page-gate.ts`). Signed out → `/`; signed in
  but not an admin → `/settings`. Every `/api/admin/*` answer, refusals
  included, is `Cache-Control: private, no-store`.
- `ADMIN_USER_IDS` grants the role on startup; the admin area can make or
  remove admins (audited `make_admin` / `remove_admin`). The last admin can't
  be removed (409), so nobody locks the server out. A kept-out account can't
  be made an admin; an admin has to stop being one before being kept out.

## The privacy rule

- Admin numbers may include Just for me saves, **as counts**.
- A Just for me post is **never listed** anywhere in the admin area: not in
  Most saved, a person's saves, Needs attention, the processing queue or the
  inspectors. Lists are built only from shared saves (`postCards` /
  `sharedSavers`, `src/lib/admin/shared.ts`, both on `visibleSave`). Posts
  left out are counted ("And 1 Just for me post, counted, never listed").
  Find a post on a post whose every save is Just for me shows "Only kept Just
  for me" and the counts, nothing from anyone's save.
- Never what someone searched for or which posts they watched. Searches are
  counted with their mode and whether something was found; no query words are
  stored. A person's page says how many posts they watched in 30 days, never
  which.
- Notes appear only on shared saves (and count only there).
- Made for you and private channels are someone's own: their plays are what
  they watched, so Top channels lists only From everyone and public channels.

## Routes

| Route                      | Board | What it shows                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin`                   | 10.1  | People (waiting), saves (+N, Just for me), kept GB, channels, reactions, sends; saves per day (shared vs Just for me); opens, plays, notes, live moments; server health; most saved; who's busiest                                                                                                                                                                                                                |
| `/admin/people`            | 10.2  | Join requests (Decline / Let them in); members with role, joined, last seen, saves (Just for me count), notes, sends, reactions, channels, phones, ⋯ (open, make/remove admin, keep out); who can join, invites, phones                                                                                                                                                                                           |
| `/admin/people/{username}` | 10.10 | Header (make/remove admin, keep out), KPIs, saves per day, their shared saves, phones (remove), who they brought in                                                                                                                                                                                                                                                                                               |
| `/admin/posts`             | 10.3  | Posts, kept, on their way, need you, gone upstream, storage; by network (all 14); by kind; understood for search; needs attention (retry); find a post                                                                                                                                                                                                                                                            |
| `/admin/channels`          | 10.4  | Channels made, public (views, keeps), from everyone, moments, tuned in, alerts; top channels by plays; reactions by emoji (30 days); tune-ins by day                                                                                                                                                                                                                                                              |
| `/admin/live`              | 10.5  | Live now and forming (bells), this range's moments by tune-ins, reactions by emoji, who reacts most                                                                                                                                                                                                                                                                                                               |
| `/admin/analytics`         | 10.6  | Opens, plays (to the end), searches (found), sends, shared out, saves; daily lines; where / when / search mode; save → played → reactions → sent; saved from                                                                                                                                                                                                                                                      |
| `/admin/processing`        | 10.7  | The server-wide queue; Pause new work / Retry failed; Mac helper; keep settings; done this week                                                                                                                                                                                                                                                                                                                   |
| `/admin/system`            | —     | Is it working: one check per queue, worker, outside service and setup item (with the fix); a map of this server, the Mac helper and the services; per queue backlog (5-minute samples since start) and finished per hour (24 h); the helper's workers, what they can do, why one was turned away; Jev / email / FxTwitter / X / yt-dlp / Sentry; optional extras to set here; every setting (secrets Set/Not set) |
| `/admin/moderation`        | 10.8  | Look up a post (Hide/Show) and a person (Clear notes, Keep out); hidden posts; kept out; the log (last 30 days)                                                                                                                                                                                                                                                                                                   |
| `/admin/invites`           | 10.9  | Who can invite; waiting approvals; invite links (copy = a fresh link, cancel); sign-in links held for an admin                                                                                                                                                                                                                                                                                                    |

Range switches are links (`?range=today|week|month|all`, rolling 24 h / 7 /
30 days). Defaults: Posts all time, Analytics month, the rest week.

## APIs (admins only, no-store)

- `GET /api/admin/boards/{overview|people|posts|channels|live|analytics|processing|system|moderation|invites}?range=`
  → that section's numbers (`src/lib/admin/boards/*`, shared with the pages).
  `GET /api/admin/overview?range=` (or the older `window=`) is the overview.
- `GET /api/admin/people/{username}` → one person. `POST … { role: 'admin' | 'user' }`.
- `DELETE /api/admin/people/{username}/phones/{id}` → removes one phone key.
- `POST /api/admin/processing { action: 'pause' | 'resume' | 'retry_failed' }`,
  or `{ action: 'retry' | 'link_only', platform, id }`.
- `POST /api/admin/system { action: 'set', name, value }` saves an optional
  extra (`value: null` clears; 409 when the environment sets it), audited
  `set_setting` with the name only. `{ action: 'test', service: 'jev' | 'email' }`
  makes one real call (email to the admin's own address) → `{ ok, ms?, error? }`,
  audited `test_service`.
- `GET /api/admin/posts?url=` → the post plus `listable`, `card`, `savers`
  (shared only), `sharedSaves`, `privateSaves`, `notes`, `kept`, `keepState`.
  `POST` hides/shows or clears notes (unchanged).
- `GET /api/admin/users?username=` adds `notes`, `phones`, `invitedBy`,
  `avatarUrl`; `POST { username, clearNotes: true }` clears every note they
  left (audited `clear_note`, how many, never what).
- Unchanged and reused: `/api/people` (who can invite), `/api/people/requests/{id}`,
  `/api/invites*`, `/api/admin/sign-in-links`, `/api/admin/collections/hide`,
  `/api/admin/activity/hide`.

## Data

| Table / column                        | What                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reaction_counts`                     | `(day, user_id, kind, count)`, PK `(day, user_id, kind)`. `kind` is the emoji's label lowercased (`laughing`, `fire`, `crying`, `eyes`, `skull`, `heart`) or `text`. Incremented by `react()` (web and phone). Never the words, the post or the moment. Account-guarded; cleared on account clear and delete.                                                                                |
| `moment_log`                          | `(slug, title, formed_at, tune_ins, peak_watching, reactions, alerts, alerts_opened)`. A row when a moment forms (promote or regroup); a member's first join of a moment adds a tune-in (once per member per moment, in memory, so a restart may count one more); the most members watching at once; reactions sent in it; "it's live" alerts it sent and how many were opened. No user ids. |
| `users.last_seen_at`                  | Written at most once every 5 minutes (a conditional update) from `GET /api/auth/me` and phone-key requests (`phoneCaller`).                                                                                                                                                                                                                                                                  |
| `access_keys.platform`                | `ios` / `android` for a phone key, from its first request's User-Agent (CFNetwork/Darwin, Dalvik/okhttp), else the name it paired with. Null when unknown.                                                                                                                                                                                                                                   |
| `server_settings` `processing.paused` | Pause new work: the keep worker, the Mac helper's claims and the local understanding worker take nothing new while it's `1`.                                                                                                                                                                                                                                                                 |
| `server_settings` `extra.*`           | Optional extras set in Admin → System (`src/lib/settings/extras.ts`): `TYPESAFE_API_KEY`, `TYPESAFE_CHANNEL_IMAGES`, `RESEND_API_KEY`, `SMTP_URL`, `EMAIL_FROM`, `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `SERVER_LABEL`. Secrets are encrypted like X tokens and never sent to the page. Read only through `extra()`, where a set environment variable always wins.                    |
| In memory (web process)               | Since the server started: what each Mac helper said when it last asked for work and why a request was refused (`presence.ts`); each outside service's calls, as counts, times and a failure kind only (`src/lib/ops/service-calls.ts`); the backlog samples (`system.ts`).                                                                                                                   |

DDL for the two tables is `ADMIN_COUNTS_DDL` (`src/lib/admin/schema-sql.ts`),
shared by `migrate.ts` and the test schema.

### Events (`analytics_events`, counts only)

| Name                            | Written by                                                                                                       | Dimensions                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `app.open`                      | `/api/auth/me` and phone-key requests, after 30 min away                                                         | `source` = web, ios, android, phone                            |
| `search.found` / `search.none`  | `/api/search` (the settled `refine=1` call) and `/api/app/search` (first page), at most once per 15 s per person | `source` = meaning, words                                      |
| `post.finish`                   | the theater's video `ended` (client allowlist)                                                                   | post                                                           |
| `channel.play` / `channel.keep` | From everyone queues (web and phone) and public channel queues; Keep this channel                                | `surface` = group, channel; the channel's key in `bookmark_id` |

## Where the numbers come from

- Saves: `bookmarks` (quoted copies never count); shared vs Just for me from
  `is_private`; where saves come from from `source` (`phone_app`, `manual`,
  `url_prefix`, `sync`, `channel_keep`, `clone`).
- Joined: `users.created_at`. Invited by: the invite each account used
  (`invites.used_by` → `created_by`). Phones: `access_keys` with scope `phone`.
- Kept, storage: `kept_files`; on their way / need you / failed: `keep_jobs`
  and `media_conversions`; learning: `understanding_queue`; understood:
  `post_embeddings` (words, pictures, video frames) and `post_extracted_text`
  (speech, on screen); gone upstream: `post_embeddings` `none` with an error.
- Sends and watched: `post_sends` (`seen_at`). Notes: `bookmarks.note` on
  shared saves. Channels: `bookmark_tags`, `tag_shares`,
  `collection_aggregates`, `group_channels`.
- Opens, plays, finishes, searches, file sends and shares, channel plays:
  `analytics_events`. Live now and forming: the moments engine's snapshot;
  bells: `moment_alert_subs`.
- Health: a `SELECT 1`, the media folder's disk (`statfs`), the Mac helper's
  last heartbeat, version from `NEXT_PUBLIC_APP_VERSION`, uptime from the
  process.

## Not made real (on purpose or not yet)

- The funnel's third row is reactions sent, not posts reacted to: reactions
  are counted without their post.
- Phone saves aren't split into iPhone and Android ("Phone share sheet").
- The Mac helper card has Pause (the same Pause new work) but no Remove: the
  helper's token lives in the server's environment.
- "About 4 min left" isn't estimated; the card says what's keeping and
  converting instead.
