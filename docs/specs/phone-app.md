# ADHX Share — the phone app

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

## Phone keys

Phone keys are rows in `access_keys` with `scope = 'phone'` (the Search from
Claude keys are `scope = 'search'`). Same shape (`adhx_` + 43 URL-safe
characters), only the SHA-256 is kept, up to 10 per account. A phone key is
accepted by `/api/app/save`, `/api/app/private`, `/api/app/status`,
`/api/app/me`, `/api/app/saves`, `/api/app/search` and the friends feed
endpoints below (`feed`, `seen`, `channels`, `live`) only; a search key is not accepted
there, and a phone key is not accepted by `/api/agent/search`. A phone key
acts only for its own account: it reads that account's saves, and everyone's
saves only where a signed-in member could (`/api/app/search?scope=everyone`). Removing a phone in Settings deletes
its key.

## API

All app endpoints take `Authorization: Bearer <phone key>` (except `pair`) and
answer JSON. Errors are `{ error: string, code: string }`, where `error` is
plain words fit to show.

### `POST /api/app/pair` — `{ code, name? }`

`name` is the phone's model ("iPhone", "Pixel 8"); trimmed to 40 characters.
The code is case-insensitive and may contain a dash or spaces.

- `201 { key, name, username }`
- `400 { code: 'bad_code' }` unknown, used or expired code (same answer for all)

### `GET /api/app/me`

- `200 { username, name }` — who the key saves for, and the phone's name
- `401 { code: 'bad_key' }` the key was removed (the app goes back to Connect)

### `POST /api/app/save` — `{ url, private? }`

`url` is a link, or text containing one (the first `http(s)://` link is used).
Short links are followed on the server. `private: true` saves it "Just for
me" (also through the `respond-async` queue): no one else sees, counts or is
told about it. On a repeat save, `private` updates the flag.

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

- `savers`: `[{ username, name, avatarUrl, savedAt, isYou }]`, newest first —
  the members who saved it (your own save shows with `isYou`). `avatarUrl`
  null means draw the generated icon from `username`.
- `isPrivate`: your save is "Just for me".

- `kind`: `video` · `audio` (SoundCloud: play `media[0].url`, it's the sound)
  · `photo` (swipe `media` sideways) · `article` · `text`
- `url`, `posterUrl` and `openPath` are relative: resolve them against the
  server. Files stream from `/api/files/…` with byte ranges. Until a file is
  kept, X, Instagram and TikTok play through their proxies; other networks wait
  for the download. A video that can't play answers 404 or 410 with
  `{ reason }` to show ("Nobody here has saved this yet", "This one couldn't
  be downloaded. The original may still play.").
- `sourceUrl` is the post on its own network ("Open original").
- `why` (feed items only): the feed's reason, shown as the why chip.

### The friends feed (`docs/specs/friends-feed.md` → Phone API additions)

Apps decode these loosely: unknown fields are ignored, one unreadable item is
skipped rather than failing the page, and a 404 means "this ADHX doesn't have
it yet" (New falls back to My saves, Channels and Live say the server needs
an update).

- `GET /api/app/feed?mode=new|everyone|friends|mine&types=video,photo,text,article&cursor` →
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
- **My saves** (Home on an ADHX without the feed): full screen, one post at a time. Swipe up for the
  next, down for the previous; tap to pause (a play mark shows) or, with the
  buttons hidden, to bring them back. Pages of 20 load as you near the end.
  Videos start muted. Photo albums swipe sideways. Text and articles fill the
  page like a video: short ones centred, long ones fading above the caption.
- **Over the post**: bottom left the @handle and the first lines of text;
  bottom right a column of round buttons: Sound and Repeat (video and sound),
  Save (to Photos / the gallery, from `?download=1`), Share, and **Original**,
  which is the network's own logo. Repeat is off by default: a video that ends
  plays the next save; on (yellow), it loops. A short note says which
  ("Repeating this one" / "Plays the next save when this ends"). Along the
  bottom: the time, a line to drag through the video, and Hide, which leaves
  only the picture and a thin progress line. Shadows only on words over media.
- **Reading**: words never scroll in the feed, so a swipe always changes save.
  A post that doesn't fit fades out with **Read all**, which opens the reader:
  the whole post on a scrolling page, a thin yellow line at the top for how far
  you've read, and a down arrow (or swipe down) back to the same save.
- **Small window**: videos have a picture-in-picture button next to Hide, and
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
7. **Not connected**: "Connect the app first" / "Open ADHX Share and scan the
   code in Settings → Phone app on your ADHX."

**Just for me** (Saving, Saved and Already saved): off (the default) shows
"Ana, Ben, Mum and Jo will see it" with their faces (the people the app last
saw in Channels or the feed, kept on the phone), or "Your people will see it";
on shows a lock and "Only you will see this save. It's still kept and
searchable." The save goes out as soon as the sheet opens, so the switch
calls `/api/app/private` once the post has landed; switched before that, it's
applied when it lands (by the sheet, or later by the app), and a link waiting
offline is sent with `private`.

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
