# ADHX Share — the phone app

The companion app for sharing posts to your own ADHX from any app's share menu.
Native on both platforms: `apps/ios` (SwiftUI app + Share Extension) and
`apps/android` (Kotlin + Compose). The phone only sends links; the server reads
the post and downloads its media (`src/lib/keep`).

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
accepted by `/api/app/save`, `/api/app/status` and `/api/app/me` only; a search
key is not accepted there, and a phone key is not accepted by
`/api/agent/search`. Removing a phone in Settings deletes its key.

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

## The share sheet (both platforms)

1. **Open**: read the shared link (or the first link in shared text); show the
   network's mark straight away (`simple-icons` paths), and the link.
2. **Saving**: one `POST /api/app/save`. "Saving to your ADHX…" and "You can
   close this. It carries on, and the post is in My saves as soon as it lands."
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

Channels ("Add to a channel") are in the design but not in this version: phone
keys can only save and read status.

## Colours and type

Background `#0f0e0c` (app) / `#000000` (behind sheets), surface `#1a1814`,
raised `#2a2620`, placeholder `#2a2825`, hairline `#4a453c`, accent `#ffd23f`,
cream `#f2ead9`, muted `#c9bfab`, faint `#a89f8d`, good `#7ddc8a`, warn
`#ffb59a`. Headings are Instrument Serif, everything else Hanken Grotesk
(system font is fine where bundling isn't). The mark is Gob
(`src/components/next/Gob.tsx`): a yellow body tilted −4°, mismatched eyes
(r7, and r11 with a highlight) and a mouth tilted −7°. App icons come from
`public/icon-512.png`. The wordmark is "adhx" in the serif.
