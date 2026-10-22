# ADHX Share — the phone app

**Status: living spec.** The apps shipped in 2.0.0; this describes them as of 2.4.0 (email sign-in by code, change picture, invites, reactions on every post and the Reactions feed, the original-post sheet, landscape while watching, Remove this phone revoking its key). Build and release steps are in [`apps/ios`](../../apps/ios/README.md), [`apps/android`](../../apps/android/README.md) and [releasing](../releasing.md).

The companion app for sharing posts to your own ADHX from any app's share menu.
Native on both platforms: `apps/ios` (SwiftUI app + Share Extension) and
`apps/android` (Kotlin + Compose). The phone sends links in, and plays and
searches your saves; the server does the work: it reads each post, downloads
its media (`src/lib/keep`), understands it for search by meaning, and streams
the files back. The phone only ever talks to your own ADHX.

Design: https://claude.ai/artifact/MWLsYCwfbzraTTbAz6aftC (boards: Settings →
Phone app, Connect, Share sheet, Saving, Saved, Already saved / Not a post /
Offline, Shared lately, Android sheet).

## Pairing

1. Settings → **Phone app** (signed in) asks `POST /api/app/pairing` for a code.
   The code is 8 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (shown as
   `ABCD-EFGH`), works **once**, for **10 minutes**. Making a new one cancels
   the old one. Only its SHA-256 is stored (`app_pair_codes`).
2. The card shows it as a QR code holding
   `adhx://pair?server=<encoded origin>&code=<code>` (the origin is the address
   the browser is on), and as text for typing.
3. The app scans it (or the user types the address and code, or the system
   camera opens the `adhx://` link), then calls `POST /api/app/pair`, which
   spends the code and returns a **phone key**.
4. The card polls `GET /api/app/phones` while the code is up and shows the new
   phone as soon as it appears.

The other way in needs no website: **Sign in with email** on Connect asks
`POST /api/app/signin` for a 6-digit code by email and spends it at
`POST /api/app/signin/verify` for the same phone key (see API below). The
pairing code and QR stay for servers that don't send email.

## Phone keys

Phone keys are rows in `access_keys` with `scope = 'phone'` (the Search from
Claude keys are `scope = 'search'`). Same shape (`adhx_` + 43 URL-safe
characters), only the SHA-256 is kept, up to 10 per account. A phone key is
accepted by `/api/app/save`, `/api/app/private`, `/api/app/note`, `/api/app/reactions`, `/api/app/reacted`, `/api/app/status`,
`/api/app/me` (and `/api/app/me/avatar`), `/api/app/invites`, `/api/app/saves`, `/api/app/search`, the friends feed
endpoints below (`feed`, `seen`, `channels`, `live`), Settings' `people` and
`doing`, members' pictures (`/api/files/avatar/<hash>`) and the owner's own
Just for me files (`/api/files/...`) only; a search key is not accepted
there, and a phone key is not accepted by `/api/agent/search`. A phone key
acts only for its own account: it reads that account's saves, and everyone's
saves only where a signed-in member could (`/api/app/search?scope=everyone`). Removing a phone in Settings deletes
its key.

## API

All app endpoints take `Authorization: Bearer <phone key>` (except `pair`,
`signin` and `signin/verify`) and answer JSON, `Cache-Control: no-store`.

**Faces.** Every person object the server sends (savers, reactors, Live
watchers and `reaction` events, people, send targets, forming groups) is
`{ username, name, avatarUrl, … }` with `avatarUrl` from `memberAvatar`: null
only when that member chose the generated icon (draw their letter then). An
uploaded or Gob picture is `/api/files/avatar/<hash>`, a members-only address:
fetch it with the phone key, or it 401s and the letter shows by mistake. Errors are `{ error: string, code: string }`, where `error` is
plain words fit to show.

### `POST /api/app/pair` — `{ code, name? }`

`name` is the phone's model ("iPhone", "Pixel 8"); trimmed to 40 characters.
The code is case-insensitive and may contain a dash or spaces.

- `201 { key, name, username }`
- `400 { code: 'bad_code' }` unknown, used or expired code (same answer for all)

### `POST /api/app/signin` — `{ email, name? }`

Emails a 6-digit code to sign this phone in (no key; the email is the
proof). Existing accounts only, and it answers `200 { ok: true }` for every
well-formed address: an address with no account, a banned one, or one still
waiting to be let in gets a stand-in code nobody receives, so asking (and
guessing, below) looks the same either way. A new code replaces the address's
previous one. In development without email the code is printed in the server
log (`[sign-in-code] …`), like magic links.

- `400 bad_email`
- `429 too_soon` — one code a minute per address (shared with the magic link)
- `429 busy` with `Retry-After` — 20 asks per 10 minutes per network, 6 an
  hour per address
- `503 no_email` — this ADHX doesn't send email (no `RESEND_API_KEY` /
  `SMTP_URL`, or links go to the admin page): use the pairing code instead.
  The same answer for every address.
- `503 send_failed` — the email didn't go; the code is dropped, so asking
  again doesn't wait a minute

### `POST /api/app/signin/verify` — `{ email, code, name? }`

`code` may contain spaces or a dash. `name` is the phone's name, as for `pair`.
The code is stored only as an HMAC (`login_tokens`, intent `phone`), works
**once**, for **15 minutes**.

- `201 { key, name, username }` — exactly what `pair` returns
- `400 bad_code` — wrong code (also for an address with no account, or one
  banned since the code went). The **fifth** wrong try burns the code.
- `410 expired` — no live code: past 15 minutes, already used, or burned.
  Ask for a new one.
- `409 too_many` — 10 phones already
- `400 bad_email`, `429 busy` (60 tries per 10 minutes per network)

### `GET /api/app/me`

- `200 { username, name, avatarUrl, avatarSource }` — who the key saves for,
  the phone's name, your picture (`memberAvatar`: null for the generated
  icon) and where it came from: `'upload' | 'gob' | 'x' | 'generated'`
  (`generated` whenever `avatarUrl` is null). Refetch it after changing your
  picture; use `avatarUrl` for "you" everywhere (your own reactions, Live
  included).
- `401 { code: 'bad_key' }` the key was removed (the app goes back to Connect)

### `DELETE /api/app/me`

Remove this phone, from the phone. Revokes the calling key and only that key
(`deleteAccessKey(userId, keyId, 'phone')`, the same as Settings → Phone app →
Remove on the web); the account's other phones keep working.

- `200 { ok: true }` — revoked. Every later request with that key, this one
  included, is `401 bad_key`.
- `401 { code: 'bad_key' }` — already gone (removed on the web, or a repeat
  after a lost answer). The apps treat it as removed.

The apps forget the key whatever the answer. When the server can't be reached
(offline, timeout, 5xx, or an older ADHX that answers 404/405), Connect says so
plainly: the phone may still show in Settings → Phone app there.

### Your picture — `/api/app/me/avatar`

The same handler as the web's `POST /api/account/avatar`
(`src/lib/avatar/handler.ts`): the same bodies, the same 30-an-hour budget
(shared with the web) and the same errors.

- `POST` `multipart/form-data`: `file` (JPEG, PNG, WebP, GIF or AVIF, ≤5 MB;
  HEIC is not read, so send a JPEG; a file sent with no type or
  `application/octet-stream` is judged by its bytes) plus the crop `x`, `y`
  (the square's centre, 0–1 across the photo) and `zoom` (1–4). The server
  turns it upright, crops (clamped inside the photo), resizes to a 512px JPEG
  and strips its metadata. Either send the original with the crop, or an
  already-square JPEG with `x=0.5, y=0.5, zoom=1`.
- `POST` JSON `{ "source": "gob", "colour": "blue" | "teal" | "coral" | "lime" }`
  or `{ "source": "x" }`.
- → `200 { "avatarUrl": "/api/files/avatar/<hash>", "source": "upload" }`
  (`gob`, or the X photo's URL with `x`). `/api/files/avatar/<hash>` is
  members only: load it with the phone key.
- Errors: `429 busy`, `413 too_big`, `415 bad_type`, `422 unreadable`,
  `400 no_file` / `bad_colour` / `bad_request`, `409 no_x_picture`,
  `500 failed`.
- `DELETE` → `200 { "avatarUrl": null, "source": "generated" }`.

### Invites — `/api/app/invites`

Mirrors the web's `/api/invites` (`src/lib/auth/invites.ts`), your own invites
only (admins too: everyone's list stays on the web).

- `GET` → `{ canInvite, invites: [{ id, url, code, nameHint, createdAt,
expiresAt, uses }] }`, newest first, only links that still work. `url` is
  always **null**: only a link's hash is kept, so a link is shown once, when
  it's made (use `/link` below to share one again). `uses` is 0 (an invite
  lets one person in, then leaves this list). `code` is a short non-secret
  label for telling them apart.
- `POST` `{ nameHint? }` → `201 { id, url, expiresAt }`. `url` is the join
  page (`<origin>/invite/<token>`, for the invitee's browser: they don't have
  the app yet), good once, for 7 days. Errors: `403 not_allowed` (only
  admins invite on this server: `canInvite` false), `409 too_many` (20
  waiting), `429 busy` (30 an hour, shared with the web).
- `POST /api/app/invites/{id}/link` → `{ id, url, expiresAt }`: a fresh link
  for one of yours (the old link stops working; same id and expiry).
  `404 not_found`, `429 busy` (60 an hour).
- `DELETE /api/app/invites/{id}` → `{ "ok": true }`; `404 not_found` unless
  it's your own unused invite.

Join requests are unchanged (`/api/app/people`).

### `POST /api/app/save` — `{ url, private?, note? }`

`url` is a link, or text containing one (the first `http(s)://` link is used).
Short links are followed on the server. `private: true` saves it "Just for
me" (also through the `respond-async` queue): no one else sees, counts or is
told about it. On a repeat save, `private` updates the flag.

`note` is a few words for your people ("this is so you, Ben"), kept with a
queued share too (`phone_save_queue.note`). The server collapses whitespace,
drops control and direction characters, trims it and keeps at most 140
characters (an emoji counts as one); an empty note means none. On a repeat
save, `note` replaces the note and `""` clears it; leaving it out keeps it.

- `200 { platform, network, id, author, authorName, text, category, posterUrl,
openPath, alreadySaved, savedAt, isPrivate }`
  - `network` is the display name ("TikTok", "X").
  - `posterUrl` (or null) and `openPath` may be relative; resolve them against
    the server address. `openPath` opens the post in ADHX.
  - `alreadySaved` is true when it was already in your saves; `savedAt` is when
    you first saved it (ISO).
- `400 { code: 'no_link' }` nothing that looks like a link
- `401 { code: 'bad_key' }`
- `404 { code: 'unavailable' }` the post is gone, private or can't be read
- `422 { code: 'not_a_post' }` a link, but not to one post (a profile, a feed)
- `500 { code: 'failed' }`

The app treats no answer, a timeout, and 502/503/504 as **offline**: the link
is queued on the phone and sent when the server can be reached.

**Saving in the background** (current apps): send `Prefer: respond-async`.
Both apps send a stable `requestId` with each initial asynchronous save: the
persisted history UUID (a 21-character nanoid is also accepted). Retrying the
same account/id/link returns the original receipt, including after a lost POST
response or process restart, without changing its original default or intent.
Reusing the id for a different link returns `409 request_conflict`; another
account can use the same id independently. Keep the id until delivery ends;
only a new user-initiated share allocates another. Receipt deduplication lasts
for the queue's seven-day finished-row retention; a saved row still awaiting
publication acknowledgement is retained until it is acknowledged. Older clients may omit it.

For an editable share card, also send `deferPublish: true` (both apps do).
A new save stays private until `PATCH /api/app/save { id, private?, intentVersion? }`
acknowledges the current choice. The endpoint accepts a choice as soon as the
queue id is known, including before metadata lands. iPhone sends it then and
again for later switches. Android keeps a new save staged until metadata is
available, then acknowledges the latest persisted choice before showing Saved;
this also lets an untouched off default preserve a repeat save's privacy.
The route accepts only that phone's own queue rows, including working and
completed ones. Omitting `private` confirms the captured default for a new
save and preserves a repeat save's existing privacy. Acknowledgements are
idempotent; an interrupted acknowledgement leaves a new save private. Keep
pending acknowledgements on disk and retry them when the app resumes. New
clients send a positive safe-integer `intentVersion`, starting at 1 and changing
only with a new explicit choice. The server atomically accepts only a higher
version: equal/stale replays succeed without changing privacy, even after a
manual web edit. A never-accepted newer explicit choice is a normal mutation;
this is replay protection, not conflict resolution between simultaneous edits.
Unversioned older clients retain their existing behaviour.

On iPhone, history migrates automatically from the old app-group preference to
an atomic JSON file in the private app-group container. Cross-process file
locking protects intent/version updates by the app and extension; pending
receipts and acknowledgements remain beyond the 100-completed-share limit.
Android retains unfinished delivery beyond its 50-completed-share limit too.

The server answers at once, before reading the post (which can take a while
from a home server; Instagram is slow to answer one):

- `202 { queued: true, id, state: 'waiting' }`, or `400 no_link` / `401` as above.

Then poll `GET /api/app/save?id=…` (every 1.5 s while the sheet is open):

- `200 { id, state: 'waiting' | 'saving' }`
- `200 { id, state: 'saved', post: { …the 200 answer above… } }`; from here,
  `/api/app/status` as before.
- `200 { id, state: 'failed', code, error }`: `code` is `not_a_post`,
  `unavailable` or `failed` (gave up after retrying for about 15 minutes).
- `404 { code: 'not_queued' }` not yours, or finished more than a week ago.

The server retries a slow or failing network on its own, so the sheet can
close at any point. Without the header, `POST` saves at once as above (older
apps).
Apps persist the queue receipt before following it and resume polling after
restarts without posting the same link again. Clearing or deleting an account
removes its queued links. A queued metadata request already in progress checks
its receipt again inside the save transaction, so it cannot restore cleared data.

### `GET /api/app/status?platform=…&id=…`

How the copy of a saved post is coming along.

- `200 { platform, id, status, percent, step, quality, kept }`
  - `status`: `waiting` (queued) · `keeping` (downloading) · `kept` ·
    `retrying` (failed, will try again) · `unavailable` (gave up) · `off`
    (this server doesn't download media, or not this post: with
    `KEEP_BACKFILL=off` a post nobody saved since the server started is never
    kept, so it reads `off` rather than `waiting` forever)
  - `percent`: 0–100 while `keeping` when the download reports it, 100 when
    `kept`, otherwise null. It is null again while a downloaded video is
    re-encoded to H.264 (minutes for a long 4K video), so it never sits at 99%.
  - `step`: while `keeping`, `downloading` or `converting` (re-encoding);
    otherwise null. Apps may say "converting" instead of showing a moving bar.
  - `quality`: "720p", "1080p", "4K" … for a kept video, else null
  - `kept`: `{ videos, photos, audio }` counts of kept files
- `404 { code: 'not_saved' }` not in this account's saves

### `POST /api/app/private` — `{ platform, id, private }`

Switch one of your saves "Just for me" or back to shared with your people.

- `200 { private }`
- `400 { code: 'bad_request' }` · `401 { code: 'bad_key' }` ·
  `404 { code: 'not_saved' }`

### `POST /api/app/note` — `{ platform, id, note }`

Set or clear the note on one of your saves ("Add a note"). `note` is a string
(cleaned as above; empty clears it) or `null`.

- `200 { note }` — the note as stored, or `null`
- `400 { code: 'bad_request' }` · `401 { code: 'bad_key' }` ·
  `404 { code: 'not_saved' }`

### Reactions on any post — `/api/app/reactions`

Reactions are kept on posts (`post_reactions`) and shown, with names and
faces, only to members who can see the post (anyone's shared save, or your
own save; a post saved only Just for me keeps its reactions to its owner).
Banned members' reactions are never returned; a post an admin hid has none.
The web uses the same handlers at `/api/posts/reactions` (session).

- `GET /api/app/reactions?platform=&id=` → oldest first, the newest 100,
  `no-store`:

  ```json
  {
    "reactions": [
      {
        "id": "rmh2k3x9a1b2c3d4e5f6",
        "emoji": "😂",
        "text": null,
        "at": "2026-10-21T09:12:03.000Z",
        "saver": {
          "username": "ana",
          "name": "Ana",
          "avatarUrl": "/api/files/avatar/…",
          "isYou": false
        }
      }
    ]
  }
  ```

  Exactly one of `emoji` / `text` is set. `avatarUrl` is null when they chose
  the generated icon. 404 `not_found` when you can't see any save of the post.

- `POST /api/app/reactions` `{ platform, id, emoji }` (😂 🔥 😭 👀 💀 ❤️) or
  `{ platform, id, text }` (at most 40 characters, cleaned; show it as text,
  never HTML) → `{ "id", "at" }`. Errors: 400 `bad_reaction` / `bad_text` /
  `bad_post`, 404 `not_found` (you can't see the post), 429 `busy` with
  `Retry-After` (the same per-person budget as Live: 20 a minute, 6 of them
  words).
- `DELETE /api/app/reactions/{id}` → `{ "ok": true }` for your own reaction,
  404 `not_found` otherwise.
- **Replay**: when a post settles on screen, fetch its reactions once per
  post per visit (keep the answer for the session) and float the newest 12,
  oldest first, ~350 ms apart, starting ~600 ms after it settles, each with
  the reactor's face. Don't replay a post again in the same session. Yours
  floats at once (your face from `/api/app/me` `avatarUrl`); on failure a
  quiet "Couldn't send that. Try again." and nothing is kept.

### The reactions feed — `GET /api/app/reacted?offset&limit`

"Play all posts that have had reactions": every post you can see (`seenBy`:
anyone's shared save, or your own) with at least one reaction you can see,
**newest reaction first**. `limit` 1–50 (default 20). Banned reactors are
never counted or shown; admin-hidden posts and posts gone from their network
are left out; when moderation can't be read it fails (`500 failed`) rather
than show anything. Members only, named, like the reactions themselves.
120 reads a minute per person (`429 busy`).

```json
{
  "items": [
    {
      "…": "a PhonePost",
      "reactions": {
        "count": 3,
        "last": {
          "emoji": "🔥",
          "text": null,
          "at": "2026-10-21T09:12:03.000Z",
          "saver": {
            "username": "ana",
            "name": "Ana",
            "avatarUrl": "/api/files/avatar/…",
            "isYou": false
          }
        }
      }
    }
  ],
  "total": 12,
  "nextOffset": 20
}
```

`total` is how many posts in all ("12 posts with reactions"); `nextOffset` is
null at the end. Play them in the player: the replay floats each post's
reactions (`GET /api/app/reactions`) and React works as on any post. The web
reads the same feed at `GET /api/posts/reacted` (session) and plays it at
`/play?reacted=1`, from the Reactions row on `/channels`.

### `GET /api/app/saves?offset&limit`

Your saves for the player, newest first, without archived ones (like My saves
on the web). `limit` 1–50 (default 20).

- `200 { items: PhonePost[], total, nextOffset, preparing }` (`nextOffset` null
  at the end). A save joins the list once it's ready: its copy is kept, or
  can't be, or isn't needed. `preparing` counts links queued for metadata and
  saves still being downloaded (not in `items` or `total`); apps may say
  "2 more on their way". Disabled keeping and older saves excluded by the
  backfill cutoff remain visible rather than waiting forever.
- `?platform=…&id=…` instead: `200 { item: PhonePost }` for one of your saves,
  archived or not (Shared lately opens it in the player), or
  `404 { code: 'not_saved' }`.
- `DELETE /api/app/saves?platform=…&id=…` removes your save of a post and
  everything hanging off it (the same as the web's delete): `200 { ok: true }`,
  `404 not_saved` when it isn't yours, `400 bad_post`. Others' saves stay. The
  player's "Remove from my saves" on a post that can't play uses it.

### `GET /api/app/search?q&scope&type&offset&limit`

Search saves by meaning: words, pictures and video frames
(`src/lib/semantic/find.ts`). `scope`: `mine` (default, your saves) or
`everyone` (everyone's saves on this server; other people's "Just for me"
saves never appear). `type`: `all` · `videos` · `photos` · `text` ·
`articles`; `limit` 1–40 (default 30). 120 searches a minute per account.

- `200 { items: PhonePost[], total, understood, close, nextOffset }`
  - `understood: false`: meaning isn't ready on this server; these matched on
    exact words. Say "Still learning your saves: exact words only for now".
  - `close: false`: nothing matched closely; these are the nearest.
  - each item has `match: { strength: strong|good|related, on: [...] }`, and
    `learning: true` when its picture or video isn't understood yet.
- `400 no_query` · `400 bad_scope` · `400 bad_type` · `429 busy` (with `Retry-After`)

### `PhonePost` (`src/lib/app/phone-post.ts`)

`{ platform, id, kind, author: { handle, name, avatarUrl }, text, postedAt,
savedAt, sourceUrl, openPath, media: [{ kind: video|photo, url, posterUrl,
width, height, durationMs }], article, savers, isPrivate }`

- `savers`: `[{ username, name, avatarUrl, savedAt, isYou, note? }]`, newest
  first — the members who saved it (your own save shows with `isYou`).
  `avatarUrl` null means draw the generated icon from `username`. `note` is
  that member's note on their save, present only when they left one; it is
  only ever sent to members, and a private save's note only to its owner.
  Your own note is the `isYou` saver's `note`. Moment cards' `savers` (faces
  for the whole moment) never carry notes; a moment's items and the `save`
  event's `saver` do.
- `isPrivate`: your save is "Just for me".

- `kind`: `video` · `audio` (SoundCloud: play `media[0].url`, it's the sound)
  · `photo` (swipe `media` sideways) · `article` · `text`
- `url`, `posterUrl` and `openPath` are relative: resolve them against the
  server. Files stream from `/api/files/…` with byte ranges. Until a file is
  kept, X, Instagram and TikTok play through their proxies; other networks wait
  for the download. A video that can't play answers 404 or 410 with
  `{ reason }` to show ("Nobody here has saved this yet", "This one couldn't
  be downloaded. The original may still play."), to members only (a phone
  key counts); anyone else gets a plain 404.
- A post that is only Just for me has files only its owners can fetch. On the
  owner's own `isPrivate` posts, the `/api/files` URLs in `media` (and the
  Shared lately `posterUrl`) carry a `k=` file token, because a video player
  can't send the phone key: keep the query string when resolving them.
- `sourceUrl` is the post on its own network ("Open original").
- `why` (feed items only): the feed's reason, shown as the why chip.

### The friends feed (`docs/specs/friends-feed.md` → Phone API additions)

Apps decode these loosely: unknown fields are ignored, one unreadable item is
skipped rather than failing the page, and a 404 means "this ADHX doesn't have
it yet" (New falls back to My saves, Channels and Live say the server needs
an update).

- `GET /api/app/feed?mode=new|everyone|friends|mine&types=video,photo,text,article&cursor` →
  `{ items: (PhonePost & { why, whyReasons })[], nextCursor, caughtUp,
nothingYet, total, types, waiting, hidden }`. `types` defaults to
  `video,photo` (a sound counts as a video); `hidden` (the same as `waiting`)
  counts the unseen posts the filter left out (`{ text: 4 }`). Apps filter by
  `{ items: (PhonePost & { why })[], nextCursor, caughtUp, hidden? }`. `types`
  defaults to `video,photo` (a sound counts as a video); `hidden`, when
  given, counts what the filter left out (`{ text: 4 }`). Apps filter by
  `kind` too, so an older server that ignores `types` still plays the
  right things.
- `GET /api/app/feed/types` → `{ types }` and `PUT` the same body: the saved
  filter. On a 404 the phone keeps it on its own.
- `POST /api/app/seen` `{ posts: [{ platform, id }] }` (at most 50) → 204. A
  post counts as seen after 2 s on screen or when you swipe past it; apps send
  them in batches (10, or 5 s after the last, or on leaving New or the app).
- `GET /api/app/channels` → `{ group: [{ slug, name, size, covers, savers? }],
friends: [{ username, name, avatarUrl, size, newCount, covers }],
mine: [{ slug, name, size, covers }] }`. `covers` are addresses (or posts to
  take a poster from), relative to the server.
- `GET /api/app/channels/{group|friend|mine}/{slug}` → `{ items: PhonePost[] }`
  (a friend's slug is their username).
- `GET /api/app/live` → `{ moments: [{ slug, name|title, people, savers?,
watching, watchers?, covers, live, hue?, label? }] }`; the field set is still
  settling, so only `slug` is required.
- `GET /api/app/live/{slug}` → `{ moment, items: PhonePost[], watchers: Saver[],
reactions?: [{ id, saver, emoji?, text?, at }] }`, polled every 5 s while
  tuned in. New reactions (not yours, not ones already there when you tuned
  in) float up the screen.
- `POST /api/app/live/{slug}/react` `{ emoji }` (😂 🔥 😭 👀 💀 ❤️) or
  `{ text }` (at most 40 characters), plus `platform` and `id` of the post on
  screen.

## The player and search (both platforms)

- **Pick up where you left off** (board 14.2): a video or sound of a minute or
  more that you leave part-way (not in its first or last 15 s) is remembered
  on the phone (never sent anywhere; 300 posts, 30 days). When it comes round
  again in any player it waits, paused, under "Pick up where you left off? /
  You were 12:40 into this, yesterday." with **Resume from 12:40** and
  **Start over**. Watching to the end forgets it.
- **Up next everywhere** (14.3, 14.4): channels and search show a pill above
  the byline ("Ana’s saves · 3 of 24", "“synth” · 1 of 16") that opens Up next
  as one list: the channel newest first, the search best match first with
  how each matched ("On screen", "Said in the video", …). Dots mark posts you
  haven't seen (`isNew`), ones left behind in this player are dimmed, Now
  playing is highlighted, and tapping a post plays from there.
- **Reply to a send** (14.5–14.7): a post someone sent you has **Reply**
  beside "Ana sent you this". "Reply to Ana" offers the six emoji and a few
  words (40 characters); it goes as a reaction on that post
  (`POST /api/app/reactions`), so Ana sees it float up when she next watches
  it and in Reactions. A post whose newest reaction from someone else is less
  than a week old says so above the byline: "Pete replied · 2m", "Pete
  reacted 😂 · 2m".
- **Can't play** (14.8, 14.9): never a spinner that just sits there. A file
  that answers 404/410 (asked with the phone key, so members get the server's
  reason) shows "Can’t play this one here" with the reason, then plays the
  next one after 3 seconds ("Playing the next one in 3"; **Next now**), with
  **Open on LinkedIn** and **Remove from my saves** (yours only). Any other
  failure, or no first frame after 15 s while nothing is being kept, shows
  "Couldn’t load this one / Your ADHX didn’t answer in time. It’s still
  saved; this is just the connection." with **Try again** (carrying on from
  the same point) and **Skip it**.

- **Home** has one row on top: Gob (opens Settings, where Shared lately now
  lives), the **New · Channels · Live** tabs, and Search everyone's saves.
  New carries a small yellow badge over its top-right corner with the unseen
  posts left ("7", "20+" while more pages are coming, "99+" at most); the tab
  stays sized for its label.
  - **New** (the default) plays `/api/app/feed?mode=new` in the player below.
    A why chip sits above the byline; it (and **Why this one** in More) opens
    a sheet with the reasons and **Whose saves: Everyone · Friends only ·
    Mine** (modes `new`/`everyone`, `friends`, `mine`), and **Filter**.
    Tapping New again opens **What's in your feed**: switches for Videos,
    Photos, Text posts and Articles (videos and photos by default; one always
    stays on), Whose saves, "12 text posts and 3 articles are waiting.
    They'll still be in search and channels." and **Show videos and photos**.
    The end is a page of its own:
    "You're all caught up." / "Go touch grass." (accent), "12 from Ana, Ben
    and Mum", "4 text posts waiting · Show them" when the filter hid some, and
    **Browse channels**, **See what's live** and **Watch it all again** (mode
    `everyone`).
  - **Channels**: "From everyone" carousels (2×2 cover mosaics, faces, "38
    saves · 3 of you"), "Your people" (faces with new-count badges, opening
    "Ana's saves" with Play all) and "Made for you". Tapping a group or yours
    plays its queue.
  - **Live**: "What your lot are into tonight": live moments with a LIVE mark,
    faces and "3 of you watching", and **Tune in**; quieter ones as rows.
    Tuned in: LIVE, "Ana and Ben · watching with you", "Jo just saved one · up
    next" when a save lands (slotted in after the one on screen), and Leave.
    **React** (a smiley at the top of the rail) opens a card with six emoji
    and "Say something to everyone watching" (40 characters, Send).
    Reactions float up and fade: the reactor's face (44–56 pt, ringed in
    their colour) with the emoji as a sticker on its corner, or with a speech
    bubble in their colour for words. Under Reduce Motion they only fade.
- **Saver faces**: up to 3 overlapping faces (the photo, or a coloured
  initial) and "Ana and Ben saved this · 2h" / "You and 2 others" above the
  @handle; tapping opens that friend's channel (a choice when there are
  several). A private post shows a lock. Search tiles show faces too.
- **Just for me** in the player's More sheet (for your own saves) calls
  `/api/app/private`.
- **Notes**: the share card's "Add a note" field (140 characters, a counter
  near the limit) sends `note` with the save; the player's More sheet edits
  yours with `/api/app/note`. The player shows the newest friend's note as a
  speech bubble (their face, in their colour) above the faces line; Who saved
  it lists each note under the saver's name.
- **My saves** (home before the friends feed; now under Channels → Made for
  you, and home on a server without the feed): full screen, one post at a time. Swipe up for the
  next, down for the previous; tap to pause (a play mark shows) or, with the
  buttons hidden, to bring them back. Pages of 20 load as you near the end.
  Videos start muted. Photo albums swipe sideways. Text and articles fill the
  page like a video: short ones centred, long ones fading above the caption.
- **Over the post**: bottom left who saved it (a friend's note in a speech
  bubble), the network's mark and who posted it, and the first lines of text
  with links shortened and tappable; bottom right a column of round buttons:
  **React** (on every post; kept with `/api/app/reactions`, and a post's kept
  reactions float up once per ordinary playback session), Save (to your saves), Share,
  Save to Photos / the phone (from `?download=1`), the **network's mark** and
  **More**. The dedicated Reactions feed always refreshes the server answer,
  including posts previously fetched with no reactions. Replay memory is bounded
  and scoped to the connection; failed refreshes never fall back to older answers.
  The mark opens the frosted original-post sheet: the poster, their
  words in full (or a kept X article), **Open on {network}** and **Copy
  link**. Sound, Fit video, Repeat, Dock and Hide live in More. Repeat is off
  by default: a video that ends plays the next save; on, it loops ("Repeating
  this one" / "Plays the next save when this ends"). Holding the stage hides
  the buttons; photos show for 10 seconds each. Along the bottom: the time and
  a line to drag through the video. Shadows only on words over media. Short
  messages take the top pill's place for 3 s instead of stacking under it.
- **Landscape**: the app turns sideways only while the player (media full
  screen) is the top screen; any sheet, the React picker or the reader over
  it keeps it upright, and leaving the player turns it back.
- **Reading**: words never scroll in the feed, so a swipe always changes save.
  A post that doesn't fit fades out with **Read all**, which opens the reader:
  the whole post on a scrolling page, a thin yellow line at the top for how far
  you've read, and a down arrow (or swipe down) back to the same save.
- **Small window**: videos have **Dock** (picture in picture) in More, and
  the small window also starts by itself when you leave the app mid-video.
  Sound carries on. On Android the window has Previous and Next save. Photos
  and words don't get one. (The iPhone Simulator has no small window; check
  it on a phone.)
- **Search**: a field ("Describe what you're looking for"), an **Everyone's
  saves · Mine** switch (Everyone by default), the TRY DESCRIBING prompts, a
  two-column grid of posters with faces, then the player on those results
  from the one you tapped.
- **Shared lately** (the old home) is a list in Settings; its rows open the
  post in the player.

## The friends feed on the phone

The phone side of [`friends-feed.md`](friends-feed.md). Android has all of
it; on a server without these endpoints (404) the app falls back as noted.

### API

- `GET /api/app/feed?mode=lineup&cursor&types=…` is New on both phones: the
  lineup, always in the same order. **Just saved** (your people's posts you
  haven't seen, saved or sent to you since you last looked: the newest view
  before a 30-minute gap, at most two days back; the last day if you've never
  looked), then **Not seen yet** (the rest of the last 14 days), both newest
  first, then **For you**: posts others saved and you didn't (older unseen
  ones first, then ones you've watched), closest to what you keep, each with
  its "Like … you kept" reason. Each item carries `section`
  (`just` · `unseen` · `foryou`) and the page carries
  `sections: { just, unseen, foryou }` for the whole lineup. An older server
  answers 400 `bad_query`; the apps then ask for `mode=new` from then on.
- `GET /api/app/feed?mode=new|everyone|friends|mine&cursor&types=video,photo,text,article`
  → `{ items: PhonePost[] (each with why?), nextCursor, caughtUp, hidden? }`.
  `hidden` (also sent as `waiting`) counts what the filter left out, `{ text: 4 }`. The
  app also filters on the phone, for a server that ignores `types`. `why` is
  read loosely: a line, a list of lines, or objects with `text`. A 404 means
  the server has no feed yet: home plays My saves as before. `whyReasons`
  (`[{ kind, text, username? }]`, read the same way) lists every reason for
  Why this one; `nothingYet: true` (nothing anyone saved yet) shows "Nothing
  new yet. Save something for your people to find." instead of the
  caught-up page.
- `GET /api/app/feed/types` → `{ types }` and `PUT` the same: the feed
  filter. It may 404 until the blend lands; the phone keeps its own copy and
  the default is videos and photos.
- `GET /api/app/feed/weights` → `{ weights: { "ana": 1, "ben": -1 } }` and
  `PUT { username: "ana", weight: -1 | 0 | 1 }` → `{ weights }`: "Show less /
  Show more from Ana" (board j2-2), the same stored choice as the web's
  `/api/feed/weights` (1 more, -1 less, 0 back to normal, which drops the
  name). Only other members: yourself or no such member is 404
  `no_member`; a bad body is 400 `bad_weight`. New's `whyReasons` then say
  "You asked for more from Ana".
- `POST /api/app/seen { posts: [{ platform, id }] }` → 204. The app sends at
  most 50 at a time, as soon as 10 are waiting, else within 5 s, and when it
  goes to the background. A batch that fails is sent again.
- `GET /api/app/channels` → `{ group: [{ slug, name, size, covers, savers? }],
friends: [{ username, name, avatarUrl, size, newCount, covers }],
mine: [{ slug, name, size, covers }] }`; covers are addresses (posts are
  accepted too, their poster is used).
- `GET /api/app/channels/{group|friend|mine}/{slug}` → `{ items: PhonePost[] }`.
  On `group` and `friend` every item adds `isNew: boolean` (you haven't
  saved or seen it; "New" on the tile, and what `?new=1` plays). `friend`
  also adds `note`: the friend's latest note on a save you may see, for the
  note card, or null:

  ```json
  {
    "items": [
      { "platform": "youtube", "id": "_OBlgSz8sSM", "kind": "video", "isNew": false, "…": "…" }
    ],
    "note": {
      "text": "the original and still the best",
      "platform": "youtube",
      "id": "_OBlgSz8sSM",
      "savedAt": "2026-10-17T02:09:01.940Z"
    }
  }
  ```

  `mine` items carry neither.

- `GET /api/app/live` → `{ moments: [{ slug, name (or title), people, savers?,
watching, watchers?, covers, live, recentSaves, windowMinutes }] }`; a 404
  reads as nothing live. `recentSaves` and `windowMinutes` say how busy it is
  lately: "LIVE · 3 saves in 10 min" (`{ "recentSaves": 3, "windowMinutes":
10 }`). The window is the smallest of 5, 10, 15, 30 or 60 minutes that holds
  the visible saves of the last hour (whole minutes, like "10 min ago");
  with none it is `0` in `60`, and the app shows its other line. The detail's
  `moment` carries them too.
- `GET /api/app/live/{slug}` → `{ moment, items, watchers, reactions }`.
  Items may be `{ post, … }` wrappers. `reactions` is the last 15 s, oldest
  first: `[{ id, at, saver: Saver, emoji? | text?, post: { platform, id } }]`.
  The app floats each `id` once and skips `isYou` (yours showed when sent).
  Current apps POST `{ known: [platform:id, ...] }` (at most 200) to the same
  route every 5 s in the foreground, with `X-ADHX-Watch: <screen UUID>`.
  The response refreshes known post metadata and includes authoritative
  `removedKeys` and compact `saverUpdates: [{ key, savers, isPrivate }]` for
  older known posts; absence from the newest 60 alone is not a removal. POST falls
  back to GET on older servers. `DELETE` with the same screen UUID leaves;
  disconnected/background phones expire after 15 s. Accounts count once across
  web tabs and phones. `GET /api/app/live/{slug}/stream` remains available.
- `POST /api/app/live/{slug}/react { emoji } | { text }, platform, id` (text at
  most 40 characters). It goes to the room and is also kept on the post under
  the same `id`, so `GET /api/app/reactions` replays it later; skip ids you
  already floated live.
- `GET /api/app/people` → `{ members: [{ username, name, avatarUrl, saves,
lastSavedAt, role: owner|admin|member, banned, isYou }], isAdmin, canInvite,
inviteMode, requests? }`; `requests` (admins only) are
  `[{ id, username, name, askedAt, invitedBy: { username, name } | null }]`.
  `POST /api/app/people/requests/{id} { decision: approve | not_now | decline }`
  → `{ approval }` (403 `forbidden` for non-admins, 404 `not_found` when
  someone else answered first).
- `GET /api/app/doing?scope=all` → `{ items: [{ platform, id, title, network,
thumbnail, savers, savedAt, step (1–7), stepLabel, steps, percent, status:
working|waiting|needs_you|ready, playable, reason, quality, learned, retry,
finishedAt }], summary: { onTheirWay, keeping, learning, needsYou, ready,
freeBytes, processing, remoteConnected } }`. `thumbnail` (like Shared lately's
  `posterUrl`) is an `/api/files/…/poster` path: the kept poster, or the
  network's picture until it's kept; null for a post with nothing to show. `POST /api/app/doing/retry
{ platform, id }` → `{ retried }`, for people who saved it (`retry: true`).
- `GET /api/app/send?platform=&id=` → the send sheet's "Or straight to your
  people" (board j4-4), one face per member (not you):

  ```json
  {
    "sendable": true,
    "people": [{ "username": "jo", "name": "Jo", "avatarUrl": null, "has": true, "sent": false }]
  }
  ```

  `has`: they already have a save of it they can see (their own save, any
  visibility), shown dimmed with "Jo already has it."; `sent`: you've already
  sent it to them. `sendable` is false (and `people` is `[]`) when the only
  save you can see is your own private one: say "Just for you. Share it
  first to send it." 404 `not_found` when you can't see any save of it.

- `POST /api/app/send { "platform", "id", "to": ["ana","ben"], "note"?: string ≤140 }`
  → `{ "sent": ["ana"], "skipped": [ { "username": "ben", "reason": "has" | "sent" | "unknown" } ] }`.
  60 a minute per user, then 429 `busy` with `Retry-After`; 403 `private`
  for a post only you keep privately; 400 `bad_request` for a bad body.
- New's sent posts: an unseen send leads New with the reason
  `{ "kind": "sent", "text": "Pete sent you this", "username": "pete" }`
  (plus `note` when the sender wrote one) until it's seen (`/api/app/seen`).
  With a note, the item's saver for Pete carries it as `note`. Treat an
  unknown `kind` as a plain reason. The server sends it whatever kinds New
  asks for; an app that also filters by kind on the phone must let an item
  with a `sent` reason through (both apps do: `sentToYou`).
- The `like` reason gains `"post": { "platform", "id", "posterUrl" }`: your
  own kept post it's most like. `posterUrl` is a path from the server root
  (or a full URL, or null); show it as a 38 pt Gob-shaped square at the
  reason's right; tapping it opens that post.
- `GET /api/app/live` `forming[]` entries add `"people": [ { "username",
"name", "avatarUrl" } ]` (members only, newest saver first, at most 4,
  visible saves only) and `"alert": true|false` (you asked to be told).
  `PUT|DELETE /api/app/live/forming/{id}/alert` → `{ "alert": true|false }`,
  or 404 `forming_gone`. The bell survives regroups and merges.
- `GET /api/app/alerts` → `{ "alerts": [ { "id": "a1", "slug":
"kitchen-synths-x1y2", "title": "Kitchen synths", "at": "ISO" } ] }`
  (unseen only, newest first, at most 20; older than 24 h expire). Notify
  "Kitchen synths is live" (tapping it opens Tune in for that slug), then
  `POST /api/app/alerts/seen { "ids": [...] }` → `{ "ok": true }`. iOS: a
  local notification from the foreground poll and a BGAppRefreshTask (ask on
  the first bell tap). Android: NotificationCompat on a "Live" channel from
  the foreground poll and a 15-minute WorkManager check (POST_NOTIFICATIONS
  on the first bell tap).
- `POST /api/app/channels/group/{slug}/keep` → `{ "tag": "food-youll-cook",
"url": "/t/pete/food-youll-cook", "added": 37 }` ("Keep this channel",
  board j6-2; not made public; posts you haven't saved are saved for you).
  `GET /api/app/channels/group/{slug}` adds `"kept": { "tag", "url" } | null`;
  once kept the button reads "Kept · Open".
- Faces: `avatarUrl` is `/api/files/avatar/<hash>`, members only, so the app
  loads it with `Authorization: Bearer <phone key>` (only to its own server)
  and keeps it in memory; the address changes with each new picture.

### Home: New · Channels · Live

- **One light row on top**: Gob (opens Settings) on the left, the tabs in the
  middle, Search on the right. New carries a small yellow badge over its
  top-right corner with how many unseen posts are left ("7", "19+" while
  more pages may come, capped at "99+"). Shared lately moved into Settings.
- **New** (the default) plays the lineup in the player, so opening the app
  always plays the newest first. A strip under the tabs shows its parts
  ("Just saved 2 · Not seen yet 6 · For you"; empty parts are left out), the
  one playing lit and filling as you go. A pill above the byline says where
  you are ("Just saved · 1 of 2") and opens **Up next**: the lineup in its
  three parts, a yellow dot on each post you haven't watched, Now playing
  highlighted, who saved each one (or "Ana sent you this", which is why it's
  that high), For you with its reason; tap a post to play from there. The
  New badge counts the Just saved and Not seen yet posts you haven't watched
  (skipping ahead doesn't count them). Back after 30 minutes away, New starts
  again at the top of the lineup. A post counts as seen
  after 2 s on stage, or as soon as you swipe past it (not when you go back).
  The why chip sits over the byline; tapping it opens **Why this one**: the
  post, every reason, and Whose saves (Everyone · Friends only · Mine:
  Everyone is `new`, the others switch the mode) and Filter.
- **What's in your feed**: tap New again (or Filter in Why this one) for
  switches for Videos, Photos, Text posts and Articles (videos and photos by
  default; at least one stays on) and Whose saves. The feed starts over once,
  when the sheet closes. The feed ends on "You're
  all caught up. / Go touch grass." with Gob, what you watched, and Browse
  channels, See what's live and Watch it all again (mode `everyone`), and
  "4 text posts waiting · Show them" when the filter left some out.
- **Channels**: From everyone (2×2 cover tiles with faces), Your people
  (round faces, a yellow ring and a count for what you haven't seen), Made
  for you (My saves first, then your own channels). A channel is a header
  (a friend's face, "96 saves · 4 you haven't seen"), Play, and a poster grid.
- **Live**: the moments, the first one big with its covers, LIVE, faces and
  "3 of you watching". Tune in plays it, asks again every 5 s, shows "Ana and
  Ben are watching with you" (the chip shows "watching with you"; the names
  go to screen readers), and adds **React** (a smiley) to the button
  column: six emoji (😂 🔥 😭 👀 💀 ❤️) or "Say something to everyone
  watching" with Send. Reactions float up the left of the screen and fade,
  each as the sender's face ringed in their colour, with the emoji as a
  sticker on its corner or the words in a bubble of their colour. Yours shows
  after acknowledgement; failed words stay in the composer with Retry, bound
  to the original post even if playback advances. Reactions are kept on the
  post (see Reactions on any post) and replay when someone watches it later. Ones that arrive together rise 0.7 s apart.
- **Faces**: up to 3 overlapping avatars (their photo, or their initial on
  their colour) and "Ana and Ben saved this" / "Ana and 3 others saved this"
  on the player byline and search tiles. Tapping a face opens that friend's
  channel (yours opens My saves).
- **Just for me**: a switch on the share card (with "Only you will see this
  save. It's still kept and searchable." when on) and in More. Flipped
  while the save is on its way, its intent is persisted before publication; a link
  waiting offline sends `private` with it. A private save shows a lock.
- **Search** has Everyone's saves · Mine, Everyone first.
- With Remove animations on, pages jump instead of sliding, nothing pulses,
  and reactions fade in place instead of rising.

### Settings

Gob opens Settings, in this order:

- **You**: your face (Gob shaped, ringed in your colour, with a pencil),
  name, "@pete · 214 saves" and **Change picture**: a sheet with **Choose a
  photo**, **Take a selfie** (the front camera), four Gob faces, **Use my X
  photo** (409 `no_x_picture` says to connect X first) and **Remove
  picture**. A photo is cropped on the phone (a square, pan and pinch, round
  preview) and sent as a square JPEG to `POST /api/app/me/avatar` with
  `x=0.5, y=0.5, zoom=1`; Gobs and X send JSON; Remove is `DELETE`. Then
  `/api/app/me` is read again and every face of yours changes at once.
- **Waiting for you** (admins with someone waiting): "Ben wants in",
  "Invited by Jo · 10m ago", **Let Ben in**, **Not now** (hides it for a few
  days) and **Decline** (asks first: "Keep Ben out?").
- Rows: **Your people** (faces and a count; the list has everyone with their
  saves, role and when they last saved, and opens a friend's channel),
  **Invite someone** (when you may invite: a sheet that makes a link with
  `POST /api/app/invites` and opens the system share sheet, and lists your
  links still waiting with Revoke; Channels' Invite opens the same sheet),
  **What's in your feed**
  (the New filter sheet), **Just for me by default**, **Sound on by
  default** (videos start with sound), **What your ADHX is doing** ("3 on
  their way · 1 needs you", opening the full list).
- **This phone**: "Connected to Ana's ADHX" (the owner; "your ADHX" when it's
  you), the address and **Remove this phone**: `DELETE /api/app/me` revokes
  the key on the server, then the phone forgets it, its list and waiting
  links. If the server can't be reached it still forgets the key, and Connect
  says it couldn't reach the server, so the phone may still show in
  Settings → Phone app there.
- **Shared lately**, then the version.

Just for me by default is kept on the phone: the server keeps the same choice
for the web (`save.privateDefault`) but has no phone route to read or set it.
On, shares from this phone (and links waiting offline) go out with
`private: true` and the share card's switch starts on; off, `private` is left
out so the server's own choice still applies.

### On their way

- While New's player is on screen (and the app is in front), the app asks
  `/api/app/doing` every 5 s, and stops when it's hidden. When posts are on
  their way, a pill sits under the tabs: a spinning ring and "3 on their way"
  (or "1 needs you" when nothing else is moving). An older server (404) gets
  the old "2 on their way" from `/api/app/saves`' `preparing` instead.
- Tapping it opens a sheet: "3 on their way" and "1 needs you", then one row
  per post: its picture, title, a thin bar (yellow, green once it plays) and
  the step ("Keeping a copy · 62%", "Making it play everywhere · Jo", "Plays
  now · listening to what's said"). A row that needs you is outlined in red,
  titled with the plain reason ("It's private on Instagram."), says "Couldn't
  keep it · Mum's save", and has **Retry** when you saved it. Then **See
  everything your ADHX is doing** and "All on your server. Nothing sent
  anywhere."
- The full list: Needs you, On their way and Done lately (with quality and
  what was learned), whether the Mac helper is connected, and the free space.

### Android differences

- The "On their way" pill asks `/api/app/doing` every 5 s while something is
  on its way and every 15 s otherwise, and stops on a 404.
- "Just for me by default" left unset sends no `private`; switched off, a
  new save that comes back private is switched back with `/api/app/private`
  (never a repeat share).
- Shared lately sits in Settings with how many links are waiting, after This
  phone; Decline sits at the end of the waiting request's row.
- Why this one shows one pair of pills: Show less from the last friend who
  saved the post and Show more from the first (the same friend when there's
  one), from `/api/app/feed/weights`; a chosen one turns cream and tapping it
  again sets 0. On a server without weights (404) the Filter pill shows instead.
- Channels: `isNew` posts get a yellow "New" in their top corner and **Play
  the N new** plays only those (the ones marked when the channel opened). The
  friend's `note` is a paper tile after the third post and plays that post
  (or opens it on its own when it isn't in the grid).
- Live: the moment line is "3 saves in 10 min · names" from `recentSaves` /
  `windowMinutes`, else the save count; smaller moments keep just the faces and
  names. `forming` groups are dashed rows ("Forming", the `people` faces, "1
  more save to go live"); they aren't playable. Their bell is "Tell me when
  it's live" (`PUT|DELETE /api/app/live/forming/{id}/alert`, yellow while on;
  a 404 drops the row). The first bell tap asks for POST_NOTIFICATIONS on
  Android 13+. From then on the app reads `GET /api/app/alerts` every minute
  while it's open and every 15 minutes in WorkManager, shows each alert as a
  notification on the "Live" channel ("Kitchen synths is live · Tune in",
  opening Tune in through `adhx://live?slug=`), and marks them seen
  (`POST /api/app/alerts/seen`). Without permission the open app says it in a
  toast instead; the background check leaves them for later.
- Send sheet: under Send with, "Or straight to your people" (`GET /api/app/send`):
  a 52dp face per member; one who has it is dimmed with "Jo already has it.",
  a tap sends it (`POST /api/app/send`) and leaves a tick. A private save
  says "Just for you. Share it first to send it." A server without the route
  shows no row. Send via is WhatsApp, Copy, Files, Save to phone and More. A
  text post or article gets the same sheet with "Sending the words" (or "the
  article"): WhatsApp and More send its words, Copy its ADHX link, and the row
  sends the post.
- New: a `sent` headline is the why chip "Pete sent you this" with Pete's
  face; Why this one gives it a send icon and his face. Unknown kinds show
  their words. A `like` reason shows its `post.posterUrl` as a 38dp Gob-shaped
  thumbnail on the right, which opens that post.
- A group channel has **Keep this channel** (`POST
/api/app/channels/group/{slug}/keep`) beside Play all; with `kept` it reads
  **Kept · Open** and opens your channel.

### iPhone notes

- Why this one, What's in your feed and On their way are the boards' bottom
  sheets (full width, joined to the bottom edge), not system sheets. Why
  this one has "− Show less from Ben" / "+ Show more from Ana"
  (`/api/app/feed/weights`, loaded when it opens): more is the first friend
  who saved it, less the second (the same one when alone), or whoever you
  already chose; the chosen one is cream and a tap goes back to normal; a
  long press picks another friend. A post only you saved shows What's in
  your feed there instead.
- A friend's channel opens under Home's header (tap Channels, or swipe in
  from the left edge, to go back) with New on unseen tiles, **Play the N
  new** and their note as a paper card third in the grid (opens that post).
  Your people has **See all** (the people list) and **Invite** (when
  `canInvite`; the in-app invite sheet, as in Settings).
- Live: the first moment is the big card ("3 saves in 10 min · …" from
  `recentSaves`/`windowMinutes`, else "4 saves"); the rest are rows labelled
  with the window ("Right now", "Last few days") or "Live · 1 save in 5 min";
  `forming` groups show as dashed "Forming" rows with "1 more save to go
  live", the `people` saving into it (up to 4 faces) and a bell: **Tell me
  when it's live** (`PUT|DELETE /api/app/live/forming/{id}/alert`, lit
  yellow while on). The first bell tap asks to show notifications. Fired
  alerts (`GET /api/app/alerts`) become local notifications, "Kitchen synths
  is live · Tune in", from a 60 s poll while the app is open and a
  BGAppRefreshTask (`<prefix>.alerts`, scheduled for 48 h after a bell is
  on); then `POST /api/app/alerts/seen`. The phone remembers the last 100
  shown so one that wasn't marked seen isn't shown twice; without
  notification permission they're left unseen. Tapping one opens Live and
  tunes in to that slug.
- Share on the player opens **Sending the video itself**: the kept file
  downloads with a progress line, then goes out through **Send via**:
  WhatsApp, Copy, Files, Save to Photos or More (the system share sheet). Below, **Or straight to your people**
  (`GET /api/app/send`): a 52 pt face per member; tapping one sends it
  (`POST /api/app/send`) and puts a yellow tick on the face. Someone who
  already has it is dimmed, with "Jo already has it." beside the faces (under
  them when there are more than four). Not `sendable` (your own private save):
  "Just for you. Share it first to send it." The row is left out on an ADHX
  without the route.
- In New, a post someone sent you leads with the `sent` reason: the why chip
  says "Pete sent you this" with Pete's face; the why sheet has a paper plane
  and their face. Reasons of a kind the app doesn't know show as their words.
- Why this one: the `like` reason shows the post of yours it's like
  (`post.posterUrl`) as a 38 pt Gob-shaped thumbnail on the right; tapping it
  closes the sheet and opens that post.
- A From everyone channel plays with its name and **Keep this channel** over
  the player (`POST /api/app/channels/group/{slug}/keep`); after keeping (or
  when the queue says `kept`) it reads **Kept · Open**, which plays your
  channel (`/api/app/channels/mine/{tag}`).

## The share sheet (both platforms)

1. **Open**: read the shared link (or the first link in shared text); show the
   network's mark straight away (`simple-icons` paths), and the link.
2. **Saving**: one `POST /api/app/save` with `Prefer: respond-async`, then
   `GET /api/app/save?id=` until saved or failed. "Saving to your ADHX…" and
   "You can close this. Your ADHX carries on, and the post shows up in My
   saves once it's ready."
3. **Saved**: poster, network, author, words; "Saved for your people" (or
   "Saved, just for you") and
   "Keeping a copy · 720p · 60%" with a bar, polling `/api/app/status` every
   1.5 s while the sheet is open. **Open in ADHX** and **Done**. The sheet
   closes itself 3 s after Saved unless touched.
4. **Already saved**: "Already in your saves", "Saved 3 days ago · kept in 4K".
5. **Not a post** (`422`, or no link at all): "That's not one post" / "ADHX
   keeps single posts. Open the post itself (a Reel, a photo, a video) and
   share that." **OK**.
6. **Offline**: "Saved for later" / "Your ADHX can't be reached right now. This
   goes as soon as it can." **Done**.
7. **Not connected**: "Connect the app first" / "Open ADHX Share and sign in
   with your email, or scan the code in Settings → Phone app on your ADHX."

**Just for me** (Saving, Saved and Already saved): off (the default) shows
"Ana, Ben, Mum and Jo will see it" with their faces (the people the app last
saw in Channels or the feed, kept on the phone), or "Your people will see it";
on shows a lock and "Only you will see this save. It's still kept and
searchable." The save goes out as soon as the sheet opens, so the switch
uses `PATCH /api/app/save { id, private?, intentVersion }` for an accepted
queue receipt, including while metadata is still being fetched, and
`/api/app/private` for a directly saved post. Both apps persist the receipt,
choice and monotonic intent version before sending. New shares stage privately
until acknowledgement. iPhone dismissal waits for the intent request; Android
hands delivery to durable WorkManager before network work starts. Interrupted
acknowledgements retry the same version without submitting a duplicate save or
undoing a later web privacy edit. A changed choice increments the version.

Adding to a channel and saving for offline are not in this version.

## Colours and type

Background `#0f0e0c` (app) / `#000000` (behind sheets), surface `#1a1814`,
raised `#2a2620`, placeholder `#2a2825`, hairline `#4a453c`, accent `#ffd23f`,
cream `#f2ead9`, muted `#c9bfab`, faint `#a89f8d`, good `#7ddc8a`, warn
`#ffb59a`. Headings are Instrument Serif, everything else Hanken Grotesk
(system font is fine where bundling isn't). The mark is Gob
(`src/components/next/Gob.tsx`): a yellow body tilted −4°, mismatched eyes
(r7, and r11 with a highlight) and a mouth tilted −7°. App icons come from
`public/icon-512.png`. The wordmark is "adhx" in the serif.
