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
accepted by `/api/app/save`, `/api/app/status`, `/api/app/me`,
`/api/app/saves` and `/api/app/search` only; a search key is not accepted
there, and a phone key is not accepted by `/api/agent/search`. A phone key
only ever reads its own account's saves. Removing a phone in Settings deletes
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

### `POST /api/app/save` — `{ url }`

`url` is a link, or text containing one (the first `http(s)://` link is used).
Short links are followed on the server.

- `200 { platform, network, id, author, authorName, text, category, posterUrl,
openPath, alreadySaved, savedAt }`
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
restarts without posting the same link again. Deleting an account removes
its queued links together with its other private data.

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

### `GET /api/app/search?q&type&offset&limit`

Search your saves by meaning: words, pictures and video frames
(`src/lib/semantic/find.ts`). `type`: `all` · `videos` · `photos` · `text` ·
`articles`; `limit` 1–40 (default 30). 120 searches a minute per account.

- `200 { items: PhonePost[], total, understood, close, nextOffset }`
  - `understood: false`: meaning isn't ready on this server; these matched on
    exact words. Say "Still learning your saves: exact words only for now".
  - `close: false`: nothing matched closely; these are the nearest.
  - each item has `match: { strength: strong|good|related, on: [...] }`, and
    `learning: true` when its picture or video isn't understood yet.
- `400 no_query` · `400 bad_type` · `429 busy` (with `Retry-After`)

### `PhonePost` (`src/lib/app/phone-post.ts`)

`{ platform, id, kind, author: { handle, name, avatarUrl }, text, postedAt,
savedAt, sourceUrl, openPath, media: [{ kind: video|photo, url, posterUrl,
width, height, durationMs }], article }`

- `kind`: `video` · `audio` (SoundCloud: play `media[0].url`, it's the sound)
  · `photo` (swipe `media` sideways) · `article` · `text`
- `url`, `posterUrl` and `openPath` are relative: resolve them against the
  server. Files stream from `/api/files/…` with byte ranges. Until a file is
  kept, X, Instagram and TikTok play through their proxies; other networks wait
  for the download. A video that can't play answers 404 or 410 with
  `{ reason }` to show ("Nobody here has saved this yet", "This one couldn't
  be downloaded. The original may still play.").
- `sourceUrl` is the post on its own network ("Open original").

## The player and search (both platforms)

- **Home is My saves**: full screen, one post at a time. Swipe up for the
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
- **Search**: a field ("Describe what you're looking for") with the TRY
  DESCRIBING prompts, a two-column grid of posters, then the player on those
  results from the one you tapped.
- **Shared lately** (the old home) is a list behind a button; its rows open the
  post in the player.

## The share sheet (both platforms)

1. **Open**: read the shared link (or the first link in shared text); show the
   network's mark straight away (`simple-icons` paths), and the link.
2. **Saving**: one `POST /api/app/save` with `Prefer: respond-async`, then
   `GET /api/app/save?id=` until saved or failed. "Saving to your ADHX…" and
   "You can close this. Your ADHX carries on, and the post shows up in My
   saves once it's ready."
3. **Saved**: poster, network, author, words; "Saved to your ADHX" and
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

Channels ("Add to a channel"), Right now and saving for offline are not in
this version.

## Colours and type

Background `#0f0e0c` (app) / `#000000` (behind sheets), surface `#1a1814`,
raised `#2a2620`, placeholder `#2a2825`, hairline `#4a453c`, accent `#ffd23f`,
cream `#f2ead9`, muted `#c9bfab`, faint `#a89f8d`, good `#7ddc8a`, warn
`#ffb59a`. Headings are Instrument Serif, everything else Hanken Grotesk
(system font is fine where bundling isn't). The mark is Gob
(`src/components/next/Gob.tsx`): a yellow body tilted −4°, mismatched eyes
(r7, and r11 with a highlight) and a mouth tilted −7°. App icons come from
`public/icon-512.png`. The wordmark is "adhx" in the serif.
