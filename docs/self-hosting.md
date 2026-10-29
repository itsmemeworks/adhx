# Running your own ADHX

The [README](../README.md#run-your-own) gets a server up in five commands. This page is everything after that: how people sign in, who may join, every setting, how much disk to buy, the search models, and keeping downloads working.

If you're on a NAS, the [Docker host and NAS guide](../deploy/nas/README.md) covers storage, permissions, resource limits and HTTPS. If you have a spare Apple Silicon Mac, the [Mac helper](../deploy/mac/README.md) can take the heavy lifting off the NAS.

## Sign-in links

Invites (below) get people in. Sign-in links get them back in: on a new browser, or when a session runs out after 30 days. Emailed links last 15 minutes; links held for an admin to pass on last **60 minutes**. Opening a link shows a confirmation screen; press **Sign in** in the browser you want to use. Message previews cannot use the link. The one-minute countdown before requesting another link is a resend cooldown, not its expiry. Choose how links reach people:

| Option               | Set                                                                                    | Good for                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Your own mail server | `SMTP_URL=smtps://user:pass@mail.example.com:465` (or `smtp://…:587`) and `EMAIL_FROM` | Any mail account that allows SMTP, e.g. Fastmail or your domain's mail                           |
| Resend               | `RESEND_API_KEY` and `EMAIL_FROM` on a domain you verified there                       | Sending from your own domain without running mail                                                |
| No email             | Nothing (the default). `EMAIL_LINKS_TO_ADMIN=off` turns sign-in links off instead      | A handful of friends. Links wait on the admin page and you pass them on, by message or in person |

**The first sign-in is setup.** A fresh ADHX opens on **Make this ADHX yours**: enter the setup code and your email, and you're signed in as its owner (admin), with or without email set up. The code is printed in the server log on every start until then (`docker compose logs adhx | grep setup`, which also prints a ready-made link), or set your own with `SETUP_CODE` (the Render template generates one and shows it with the service's environment). Your own email doesn't need to be on `ALLOWED_EMAILS`. With no email, after that, links show up under **Sign-in links** on the admin page. Admins' own links are also printed in the server log, so you can sign back in without another admin. Only emails on `ALLOWED_EMAILS` and people who already have an account get later links, so strangers can't fill the list. Treat those logs as credentials.

The phone apps can sign in the same way, with a 6-digit code instead of a link (**Sign in with email** on the app's first screen). That needs real email delivery: with `EMAIL_LINKS_TO_ADMIN=1` the app says so and points people at the pairing code instead.

People who joined by invite have no email until they add one in **Settings → You**. Until then their browser session is their only way in, so nudge them to add one.

## Who can sign up

**Invite links are the easy path.** On the admin page, in **Settings → Your people**, or in the phone app's **Settings → Invite someone**, make a link and send it however you like. Your friend opens it, sees "Ana wants you in.", picks a name and presses **Join**. That's the whole sign-up: no email, no password, and their phone pairing code is on the next screen. Each link works once, for 7 days. Pending ones are listed by a short code with **Copy link** and **Revoke**. A banned person's invites stop working. Links are shown once, when they're made: ADHX keeps only a fingerprint of each, so **Copy link** on an older invite asks first, then makes it a fresh link (the one you sent before stops working). Message previews can open an invite without using it; only pressing **Join** does.

**Or one link for the whole group chat.** On the admin page, under **Invites**, **Make a group link** gives you a single link to drop into a group chat. Up to 25 people can join with it within 7 days. Each picks a name and lands on "Waiting for Ana to let you in." (your name); you answer each one under **Waiting for you** (**Let them in**, **Not now** or **Decline**). The link's row shows how many joined and how many are waiting. **Cancel** stops it at once (people already waiting stay waiting until you answer); a link that's full, expired, or whose maker is no longer an admin stops too. Only admins can make group links, and joins with one from a single address are limited to 20 an hour.

**Who can invite** is in **Settings → Your people** (admins): **Only me**, **Anyone, I approve** or **Anyone**. With **Anyone, I approve**, someone a member invites picks a name and lands on "Waiting for Ana to let you in"; their account can't see anything else until an admin presses **Approve** under **Waiting for you** (or **Not now**, or **Decline**). Invites an admin makes always let people straight in. `INVITES=members` only sets the first choice (**Anyone**); after that, Settings wins. The example Compose files don't pass `INVITES` through, so add it to their `environment:` if you want it.

**Nobody needs email to join.** You don't need email set up either: make an invite link, send it, and that's it. By default nobody can make an account by typing their email on the sign-in page; they get "This ADHX is for invited people. Ask whoever runs it for an invite link." To let people sign up by email, set **Who may sign up by email** in **Admin → System → Settings** (or `ALLOWED_EMAILS`) to a comma-separated list of emails and/or `@domain` entries, or `*` for anyone who can reach your server. Accounts that already exist can always sign in by email. Invite links work whatever this says: the invite is the permission.

Upgrading from a version where an empty `ALLOWED_EMAILS` meant anyone: a server that already had accounts is saved as `*` on its first start, so its sign-up doesn't change. **Admin → System** shows it as **Anyone**; clear it (or set `none`) to make it invite-only.

The admin page has invites, sign-in links, numbers, hiding posts and banning accounts. Whoever finishes setup gets it. To make someone else an admin later, have them sign up, open `/api/auth/me` while signed in, put their `user.id` in `ADMIN_USER_IDS` and restart once. (`ADMIN_USERNAMES` is only a bridge for older installs.)

Kept media and shared post previews do not require sign-in for anyone who can reach the server. Media URLs contain source post IDs, not secret tokens. Use private LAN/VPN access if that is your intended privacy boundary; invites and the email allowlist protect account creation, not playback.

## Search engines

A new ADHX keeps itself out of search engines. `/robots.txt` turns every crawler away, `/sitemap.xml` is empty and every page carries `noindex`. People can still open a shared post, Right now or a public channel from a link, and the link-preview bots of X, Facebook, WhatsApp, Slack, Discord, Telegram and LinkedIn may still fetch a page so a sent link shows its card.

To let Google and others list Right now, public channels and shared posts' preview pages, turn on **Show up in search engines** in **Admin → System → Settings** (or start with `PUBLIC_PAGES=on`). robots.txt and the sitemap then use this server's own address (`NEXT_PUBLIC_APP_URL`, the host's, or the one you set ADHX up from). Turning it off again stops new crawling at once. Pages a search engine already listed can linger there for a while; its own removal tool (Google Search Console's Removals, for one) speeds that up.

Upgrading from a version without the switch: if any channel on the server was already public, the first start saves the switch as **On**, so the server stays listed as before. Every other server starts Off. Either way, the switch shows its state on the System page.

## Settings

Many of these can also be changed later in **Admin → System → Settings**, with no restart: Jev (`TYPESAFE_API_KEY`, `TYPESAFE_CHANNEL_IMAGES`), email (`RESEND_API_KEY`, `SMTP_URL`, `EMAIL_FROM`), `ALLOWED_EMAILS`, the X app keys and `AUTO_SYNC_EVERY_MINUTES`, the `KEEP_*` switches (`KEEP_MEDIA`, `KEEP_BACKFILL`, `KEEP_CONCURRENCY`, `KEEP_MAX_FILESIZE`, `KEEP_MIN_FREE_GB`, `KEEP_H264`), `INDEXING_LEVEL`, `SEMANTIC_SPEECH`, `SEMANTIC_SCREEN_TEXT`, `PUBLIC_PAGES` and `SERVER_LABEL`. A value saved there wins over the environment, which then only gives the starting value; clearing it goes back to the environment's. Keys are stored encrypted in the database, and **Test Jev** and **Send me a test email** check them. The others (paths, `PROCESSING_MODE`, `SEMANTIC_SEARCH`, `SESSION_SECRET` and friends) are read at startup and show there read-only. **Admin → System** also shows whether every queue, the Mac helper and each outside service is working.

| Setting                                      | What it does                                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_APP_URL` (or `APP_URL`)         | The address people use, e.g. `https://adhx.example.com`. Sign-in links point here. Optional: Render, Railway, Fly and Coolify give it; otherwise the address you set ADHX up from is kept. |
| `SESSION_SECRET`                             | Signs sessions and file links and keys stored X tokens. Optional: without it ADHX makes one in `/data/session-secret` on first start. Back it up with the database.                        |
| `SETUP_CODE`                                 | The code that makes the first person the owner (`/setup`). Optional: without it, read the code from the server log.                                                                        |
| `RESEND_API_KEY`, `EMAIL_FROM`               | Sign-in emails. `EMAIL_FROM` must be on a domain you verified with Resend.                                                                                                                 |
| `ALLOWED_EMAILS`                             | Who may sign up by email: a list, `*` for anyone, or unset for invite links only (see above).                                                                                              |
| `INVITES=members`                            | Start with **Who can invite: Anyone** (Settings → Your people changes it later).                                                                                                           |
| `PUBLIC_PAGES=on`                            | Let search engines list Right now, public channels and shared posts (see [Search engines](#search-engines)). Default off.                                                                  |
| `MOMENT_MIN_SAVERS`                          | How many people must save the same kind of thing before it shows in Right now. `1` if it's just you, `2`–`3` for friends.                                                                  |
| `MEDIA_DIR`                                  | Where kept files live. Default: `media/` next to the database (`/data/media` in Docker).                                                                                                   |
| `KEEP_BACKFILL=off`                          | Only download posts saved from now on, leaving older saves on the networks' own links.                                                                                                     |
| `KEEP_H264=off`                              | Keep videos in whatever format the network sent (see [Video formats](#video-formats)).                                                                                                     |
| `KEEP_MAX_FILESIZE`                          | Largest single download, default `4G`.                                                                                                                                                     |
| `KEEP_CONCURRENCY`                           | Posts downloaded at once, default `2`.                                                                                                                                                     |
| `KEEP_MEDIA=off`                             | Stop downloading altogether. Files already kept still play.                                                                                                                                |
| `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` | Optional: lets people connect X and bring in their bookmarks (see below).                                                                                                                  |
| `AUTO_SYNC_EVERY_MINUTES`                    | Minutes between automatic X bookmark syncs per person, default `50`; `0` turns it off.                                                                                                     |
| `SYNC_COOLDOWN_MINUTES`                      | Wait between manual X syncs. Set `1` for a one-minute cooldown; this does not set the automatic interval.                                                                                  |
| `SEMANTIC_SEARCH=off`                        | Stop model workers; keyword search still indexes new saves and catches up missing entries on startup.                                                                                      |
| `SEMANTIC_THREADS`                           | CPU threads the search model may use, default `2`.                                                                                                                                         |
| `SEMANTIC_CACHE_DIR`                         | Where the search model is kept. Default: `models/` next to the database (`/data/models` in Docker).                                                                                        |
| `SEMANTIC_SPEECH=off`                        | Stop transcribing what's said in videos. Transcripts already made stay searchable.                                                                                                         |
| `SEMANTIC_SCREEN_TEXT=off`                   | Stop reading text on pictures and video frames. Text already read stays searchable.                                                                                                        |
| `KEEP_MIN_FREE_GB`                           | Pause downloads while the disk has less free than this, default `2`.                                                                                                                       |
| `TRUST_PROXY_IP_HEADERS=true`                | Use `X-Forwarded-For` for the visitor's address (for rate limits). Only when a proxy you run is the only way in.                                                                           |
| `TYPESAFE_API_KEY`                           | Optional: refines search order and chooses names for automatic channels and moments, using search text and public post text.                                                               |
| `TYPESAFE_CHANNEL_IMAGES=on`                 | Separate opt-in: experimental background channel naming, membership checks, repeat spacing and covers using public-post thumbnails. Default off.                                           |
| `NEXT_PUBLIC_IOS_APP_URL`                    | Optional: your TestFlight invite link, shown in Settings → Phone app.                                                                                                                      |
| `NEXT_PUBLIC_ANDROID_APP_URL`                | Optional: where people download the Android app. Default: the Android build guide in this repo.                                                                                            |

Every setting is in [`.env.example`](../.env.example).

For automatic X sync about every 50 minutes and a one-minute manual cooldown,
set `AUTO_SYNC_EVERY_MINUTES=50` and `SYNC_COOLDOWN_MINUTES=1`. The scheduler
checks every five minutes, so an eligible automatic sync can start up to about
five minutes later. **Bring in new bookmarks automatically** must also be on
in Settings. These values are minutes, not posts per API page; paging fixes
require an image containing that code. See the
[configuration and update checks](../deploy/nas/README.md#optional-services-and-x-sync).

## Disk space

Kept media is most of the space ADHX uses. Memes are small; your uncle's 4K drone footage is not. As a rough guide:

- A short phone video (TikTok, Reel, Short) is 5–30 MB.
- A minute of 1080p is 15–40 MB; a minute of 4K is 40–100 MB.
- Photos are 0.1–1 MB each.
- The search model is about 400 MB, downloaded once on first start, plus about 410 MB for the speech and on-screen text models the first time they're needed (see [The search model](#the-search-model)).

So 1,000 mixed saves come to roughly 10–30 GB. When you first run ADHX on an existing library, it downloads everything already saved, newest first. If your disk is small, start with `KEEP_BACKFILL=off`, which also stops any older downloads already waiting.

Downloads pause by themselves while the disk has less than 2 GB free (`KEEP_MIN_FREE_GB`). They carry on once there's room. Files are deleted when nobody on your server has the post saved any more; that check runs once an hour. With `KEEP_BACKFILL=off`, the cutoff persists through restarts so accepted downloads and retries finish. Starting once with backfill enabled clears that cutoff.

## The search model

Search by meaning runs on your own server, with [EmbeddingGemma 2](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX): the text model at 4-bit and its picture encoder at 8-bit, at a pinned revision. There's nothing to install. The first time the server starts, it downloads the weights from Hugging Face into `models/` next to the database: about 400 MB, so the server needs to reach `huggingface.co` once. After that it runs offline. For a server with no internet access, copy the `models/` folder from another ADHX.

Until the model is ready, search finds posts by their words. Saves are understood in the background: words first, then pictures, what's said, text on screen, then video frames. The default local worker samples the first 32 seconds at one frame every two seconds. Local understanding uses the CPU (`SEMANTIC_THREADS`); a large existing library takes a while the first time.

### What's said and what's on screen

Two more models, also pinned and downloaded once into `SEMANTIC_CACHE_DIR`, turn media into words your server can search:

- **Speech.** [Whisper base](https://huggingface.co/onnx-community/whisper-base) (multilingual, about 135 MB) transcribes the first ten minutes of each kept video or sound, in its own language. Silence, music and the lines speech models invent on them ("Thanks for watching") are dropped.
- **Text on screen.** [Florence-2 base](https://huggingface.co/onnx-community/Florence-2-base-ft) (8-bit, about 275 MB) reads up to four of a post's pictures and four frames from the first minute of its video. Stray marks and blank pictures are dropped.

The words join the post's own words, labelled "Said in the video" and "Text on screen", for both meaning and keyword search, and results say when that's where they matched. Each model runs in a short-lived process that exits after a minute without work, so only one of them is in memory at a time. Measured on an Apple M4 with two threads: about 3½ seconds per minute of speech and 1.6 seconds per picture or frame, with the extract process peaking near 1.5 GB (speech) and 1.8 GB (text on screen) on top of the search worker. Expect a slower NAS CPU to take several times longer. `SEMANTIC_SPEECH=off` or `SEMANTIC_SCREEN_TEXT=off` stops new work of that kind; words already found stay searchable.

For a shared NAS, use the optional [native Apple Silicon worker](../deploy/mac/README.md). Set `PROCESSING_MODE=remote`, a dedicated `PROCESSING_WORKER_TOKEN`, and `INDEXING_LEVEL=light|normal|deep` on the server. The Mac downloads retained media over authenticated HTTPS and samples throughout the full video in short, resumable sections. Light targets one frame per 12 seconds, normal one per four seconds and deep one per two seconds, with bounded work per section and limits for very long videos. Search can match an individual section rather than averaging away a brief detail. The Mac also transcribes speech and reads text on screen, sending back only the words. It reuses downloaded originals across processing passes and clears them when no work still needs them. Conversion and learning share the queue fairly, so a cold import can make progress on both.

The NAS still serves searches and downloads/retains source media. In remote mode the Mac also handles H.264 compatibility conversion, using Apple’s hardware encoder with a bounded software fallback. The NAS checks the uploaded MP4’s codec, full resolution, duration and audio before switching files, and keeps the source until that succeeds. The Mac uses temporary lower-resolution samples for inference. It deletes frames after each section, conversion outputs after each upload attempt and downloaded copies after the final result is acknowledged. Conversion preserves resolution but re-encodes video; it is separate from inference sampling. Interrupted work has an 8 GiB default scratch ceiling and expiry cleanup; reusable model weights stay cached. The queue waits when the Mac is offline. `SEMANTIC_SEARCH=off` pauses model processing in either mode.

`TYPESAFE_API_KEY` is optional. Jev (TypeSafe) refines the top search results by their words and chooses names for automatic channels and Right now moments. It receives your search text and candidate posts’ own public text for search, or public text from a small sample of grouped posts for naming. A key alone sends no media files, locally extracted words, private tags or account identities. Local search, image/video understanding and grouping work without this key; unavailable or timed-out Jev requests fall back to local results and names.

Separately, `TYPESAFE_CHANNEL_IMAGES=on` enables experimental, cached background curation for generated channels: better display names, conservative borderline membership checks, spacing apparent reposts and selecting channel cover posts. This uploads selected retained public-post thumbnails and source captions, never private-only posts or saver details. Pages do not wait for it, and originals/saves/manual channels remain intact. Read the [data boundary, limits and setup guide](channel-image-curation.md) before enabling it.

## Video formats

ADHX picks the highest resolution a network offers. If that video isn't H.264, ADHX re-encodes it to H.264 at the same size so it plays everywhere. Some networks send their best quality only as VP9, AV1 or HEVC, and Safari and Firefox can't play all of those. Re-encoding takes CPU time, especially for long 4K videos. Set `KEEP_H264=off` to keep the original files untouched.

## Keeping downloads working

Networks change their pages often, and yt-dlp releases fixes within days. Each ADHX release pins a yt-dlp version. To update a running container without waiting for a release:

```bash
docker compose exec adhx /opt/yt-dlp/bin/pip install -U "yt-dlp[default]"
```

`[default]` includes the scripts YouTube needs for its player challenges; ADHX runs them with its own Node.js, so there's nothing else to install. Downloads that fail are retried with growing waits over about a day. Until a post is kept, X, Instagram and TikTok posts still play straight from the network.

## Backups

Back up the `/data` volume consistently: stop ADHX before copying it, or use SQLite's backup API with a coordinated media snapshot. It holds `adhx.db` (and any SQLite WAL files), the `media/` folder and the `models/` folder. The model cache can be downloaded again. Keep an independent private backup and test a restore; see the [deployment guide](../deploy/nas/README.md#updates-backups-and-recovery).

## Fly.io

[`deploy/fly/fly.toml`](../deploy/fly/fly.toml) runs the published image. Size the volume for your media:

```bash
curl -fsSLO https://raw.githubusercontent.com/itsmemeworks/adhx/main/deploy/fly/fly.toml
fly launch --copy-config --no-deploy --name your-adhx
fly volumes create adhx_data --size 50 --app your-adhx
fly deploy --app your-adhx
fly logs --app your-adhx | grep setup
```

Fly gives the app its address (`https://your-adhx.fly.dev`); set `NEXT_PUBLIC_APP_URL` once you put your own domain on it. Keep `min_machines_running = 1`. The download queue, the hourly X sync and Right now all run inside the app.

## X bookmark sync (optional)

People sign in with email. Connecting X is optional; it brings in their bookmarks and then keeps checking for new ones about every hour.

1. Create an app in the [X Developer Portal](https://developer.x.com) with OAuth 2.0 (PKCE) and the bookmark read scope.
2. Register `<your NEXT_PUBLIC_APP_URL>/api/auth/twitter/callback` as a callback.
3. Set `TWITTER_CLIENT_ID` and `TWITTER_CLIENT_SECRET`.

X charges the developer app for every post its API returns, so automatic syncing uses API credits. The hourly sync asks for up to 50 recent bookmarks and stops at the first page that holds one already saved; **Sync X bookmarks** in Settings goes through the whole list. X only ever returns someone's newest 800 bookmarks, and sometimes ends the list early: when a full sync stops on a full page, ADHX goes through once more 20 at a time (re-reading the newest ones, which X charges for again). If X runs out of credits, ADHX pauses automatic syncing for six hours and tries again.
