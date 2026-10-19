# ADHX

[![CI](https://github.com/itsmemeworks/adhx/actions/workflows/ci.yml/badge.svg)](https://github.com/itsmemeworks/adhx/actions/workflows/ci.yml)
[![Release](https://github.com/itsmemeworks/adhx/actions/workflows/release-please.yml/badge.svg)](https://github.com/itsmemeworks/adhx/actions/workflows/release-please.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)

> **Save it. Lose it. Find it.** On your own server.

ADHX keeps the posts you love from X, Instagram, TikTok, YouTube, Reddit and nine more networks. It downloads each post's video, pictures and sound in the best quality the network offers. It stores them on your own server and plays them from there. Find any of them later by describing what you remember, like "the video with the frog".

It's built to run for yourself and a few friends: one Docker container, one folder of data. ADHX isn't a hosted service. Posts can't disappear behind a deleted account or a dead link, because the files are yours.

<p align="center">
  <img src="public/og-logo.png" alt="ADHX — save it, lose it, find it" width="560" />
</p>

## What you get

- **Your own copies.** Every save is downloaded once, at the highest resolution available (4K from X when the post has it), and served by ADHX. Nothing is streamed from the networks at watch time.
- **Fourteen networks.** X, Instagram, TikTok, YouTube, Facebook, Reddit, LinkedIn, Vimeo, SoundCloud, Pinterest, Twitch clips, Threads, Imgur and Bluesky. The list matches what [linktokeep.com](https://linktokeep.com) supports, plus Bluesky.
- **Search by meaning.** Describe what you remember and ADHX finds it. It matches the words, what's in the pictures, and what happens in the videos (a frame every 2 seconds). This all runs on your server: no audio is processed, and nothing is sent to an AI service unless you add the optional search refinement key.
- **A full-screen player.** Your saves play one after another, newest first, with search, channels and a share button.
- **Channels.** ADHX groups your saves by what they're about and names the groups. You can make your own channels too, and share them.
- **Right now.** See what the people on your server are saving, grouped into moments, and **Tune in** to watch along. Savers are only ever counted, never named.
- **X bookmarks, automatically.** Connect X once. Anything you bookmark there shows up in ADHX within the hour.
- **A phone app.** [ADHX Share](#phone-app-adhx-share) puts ADHX in the share menu on iPhone and Android, from any app.
- **Search from Claude.** Make an access key and the [adhx skill](#search-from-claude) can find things in your saves for you.

## Supported networks

| Network    | What ADHX keeps                          | Good to know                                                                    |
| ---------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| X          | Video (up to 4K), photos, text, Articles | Bookmarks can sync automatically                                                |
| Instagram  | Reels, photos and carousels              | Instagram sometimes asks servers to log in; ADHX falls back to public mirrors   |
| TikTok     | Video                                    | Photo posts keep their cover picture                                            |
| YouTube    | Video, Shorts                            | 4K is kept when the upload has it (see [Video formats](#video-formats))         |
| Facebook   | Videos and Reels                         |                                                                                 |
| Reddit     | Video with sound, pictures, text         | Reddit blocks servers from its own pages; ADHX finds the video through vxreddit |
| LinkedIn   | Video and pictures from public posts     |                                                                                 |
| Vimeo      | Video                                    | Videos protected with DRM can't be kept; ADHX keeps their picture and link      |
| SoundCloud | The track and its artwork                | Plays in the same player, artwork on screen                                     |
| Pinterest  | Video Pins and picture Pins              |                                                                                 |
| Twitch     | Clips                                    |                                                                                 |
| Threads    | Text and the post's picture              | Threads only shares a preview-sized picture without logging in                  |
| Imgur      | Images and albums                        | Imgur blocks the UK; a server there can't keep Imgur posts                      |
| Bluesky    | Video and pictures                       |                                                                                 |

Downloads run through [yt-dlp](https://github.com/yt-dlp/yt-dlp), plus each network's public link-preview data for picture posts. ADHX never asks for your passwords on any of these networks.

## Run your own

You need:

- **Somewhere to run a container** with a persistent folder: a home server, a NAS, a small VPS, or [Fly.io](#flyio).
- **A way to get sign-in links to people.** ADHX has no passwords; people sign in with a one-time link. Pick one (see [Sign-in links](#sign-in-links)): your own mail server, a [Resend](https://resend.com) account, or no email at all, where you pass links on yourself.
- **Disk space.** See [Disk space](#disk-space).

### Docker Compose

```bash
git clone https://github.com/itsmemeworks/adhx && cd adhx
export SESSION_SECRET=$(openssl rand -base64 32)
export NEXT_PUBLIC_APP_URL=https://adhx.your-domain.example
export ALLOWED_EMAILS='you@example.com, @your-family.example'
export EMAIL_LINKS_TO_ADMIN=1   # or SMTP_URL / RESEND_API_KEY, see Sign-in links
docker compose up -d
```

ADHX listens on port 3000. Put it behind your usual reverse proxy for HTTPS; sign-in needs HTTPS outside `localhost`. The [`docker-compose.yml`](docker-compose.yml) keeps everything in one volume mounted at `/data`: the database, the search model and every kept file. Migrations run on start.

To pin a release, set `ADHX_IMAGE=ghcr.io/itsmemeworks/adhx:<version>`. You can also build the image yourself with `docker build -t adhx .`.

**On a home NAS** with no domain or open ports, [`deploy/nas`](deploy/nas) runs ADHX with Docker Compose behind [Tailscale Funnel](https://tailscale.com/kb/1223/funnel), which gives it a public HTTPS address. Its [README](deploy/nas/README.md) walks through the install.

### Sign-in links

People sign in with a link that works once, for 15 minutes. Choose how links reach them:

| Option               | Set                                                                                    | Good for                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Your own mail server | `SMTP_URL=smtps://user:pass@mail.example.com:465` (or `smtp://…:587`) and `EMAIL_FROM` | Any mail account that allows SMTP, e.g. Fastmail or your domain's mail                           |
| Resend               | `RESEND_API_KEY` and `EMAIL_FROM` on a domain you verified there                       | Sending from your own domain without running mail                                                |
| No email             | `EMAIL_LINKS_TO_ADMIN=1`                                                               | A handful of friends. Links wait on the admin page and you pass them on, by message or in person |

With no email, sign in first yourself: your link is printed in the server log (`docker compose logs adhx | grep sign-in`), and opening it makes you the admin. Your own email doesn't need to be on `ALLOWED_EMAILS` for this. After that, links show up under **Sign-in links** on the admin page. Only invited emails (`ALLOWED_EMAILS`) and people who already have an account get one, so strangers can't fill the list.

### Who can sign up

By default, anyone who can reach your server can make an account. For a private group, set `ALLOWED_EMAILS` to a comma-separated list of emails and/or `@domain` entries. Everyone else gets "This ADHX is for invited people". Accounts that already exist can always sign in.

The admin page has sign-in links, numbers, hiding posts and banning accounts. With no email you get it on your first sign-in (see above). With email, sign up first, then set `ADMIN_USERNAMES=yourname` and restart once.

### Settings

| Setting                                      | What it does                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_APP_URL`                        | The address people use, e.g. `https://adhx.example.com`. Sign-in links point here.                                             |
| `SESSION_SECRET`                             | Signs sessions. `openssl rand -base64 32`.                                                                                     |
| `RESEND_API_KEY`, `EMAIL_FROM`               | Sign-in emails. `EMAIL_FROM` must be on a domain you verified with Resend.                                                     |
| `ALLOWED_EMAILS`                             | Who may sign up (see above).                                                                                                   |
| `MOMENT_MIN_SAVERS`                          | How many people must save the same kind of thing before it shows in Right now. `1` if it's just you, `2`–`3` for friends.      |
| `MEDIA_DIR`                                  | Where kept files live. Default: `media/` next to the database (`/data/media` in Docker).                                       |
| `KEEP_BACKFILL=off`                          | Only download posts saved from now on, leaving older saves on the networks' own links.                                         |
| `KEEP_H264=off`                              | Keep videos in whatever format the network sent (see [Video formats](#video-formats)).                                         |
| `KEEP_MAX_FILESIZE`                          | Largest single download, default `4G`.                                                                                         |
| `KEEP_CONCURRENCY`                           | Posts downloaded at once, default `2`.                                                                                         |
| `KEEP_MEDIA=off`                             | Stop downloading altogether. Files already kept still play.                                                                    |
| `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` | Optional: lets people connect X and bring in their bookmarks (see below).                                                      |
| `AUTO_SYNC_EVERY_MINUTES`                    | Minutes between automatic X bookmark syncs per person, default `50`; `0` turns it off.                                         |
| `SEMANTIC_SEARCH=off`                        | Turn search by meaning off (keyword search still works).                                                                       |
| `SEMANTIC_THREADS`                           | CPU threads the search model may use, default `2`.                                                                             |
| `SEMANTIC_CACHE_DIR`                         | Where the search model is kept. Default: `models/` next to the database (`/data/models` in Docker).                            |
| `KEEP_MIN_FREE_GB`                           | Pause downloads while the disk has less free than this, default `2`.                                                           |
| `TRUST_PROXY_IP_HEADERS=true`                | Use `X-Forwarded-For` for the visitor's address (for rate limits). Only when a proxy you run is the only way in.               |
| `TYPESAFE_API_KEY`                           | Optional: reorders the top search results by their words. Only the search text and the public words of those results are sent. |
| `NEXT_PUBLIC_IOS_APP_URL`                    | Optional: your TestFlight invite link, shown in Settings → Phone app.                                                          |
| `NEXT_PUBLIC_ANDROID_APP_URL`                | Optional: where people download the Android app. Default: this project's GitHub releases.                                      |

Every setting is in [`.env.example`](.env.example).

### Disk space

Kept media is most of the space ADHX uses. As a rough guide:

- A short phone video (TikTok, Reel, Short) is 5–30 MB.
- A minute of 1080p is 15–40 MB; a minute of 4K is 40–100 MB.
- Photos are 0.1–1 MB each.
- The search model is about 400 MB, downloaded once on first start (see [The search model](#the-search-model)).

So 1,000 mixed saves come to roughly 10–30 GB. When you first run ADHX on an existing library, it downloads everything already saved, newest first. If your disk is small, start with `KEEP_BACKFILL=off`, which also stops any older downloads already waiting.

Downloads pause by themselves while the disk has less than 2 GB free (`KEEP_MIN_FREE_GB`). They carry on once there's room. Files are deleted when nobody on your server has the post saved any more; that check runs once an hour.

### The search model

Search by meaning runs on your own server, with [EmbeddingGemma 2](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX): the text model at 4-bit and its picture encoder at 8-bit, at a pinned revision. There's nothing to install. The first time the server starts, it downloads the weights from Hugging Face into `models/` next to the database: about 400 MB, so the server needs to reach `huggingface.co` once. After that it runs offline. For a server with no internet access, copy the `models/` folder from another ADHX.

Until the model is ready, search finds posts by their words. Saves are understood in the background: words first, then pictures, then video frames (one every 2 seconds). Sounds are found only by their words. Understanding uses the CPU (`SEMANTIC_THREADS`); a large existing library takes a while the first time.

`TYPESAFE_API_KEY` is optional. With it, the top results are reordered by their words, and only the search text and the public words of those results are sent.

### Video formats

ADHX picks the highest resolution a network offers. If that video isn't H.264, ADHX re-encodes it to H.264 at the same size so it plays everywhere. Some networks send their best quality only as VP9, AV1 or HEVC, and Safari and Firefox can't play all of those. Re-encoding takes CPU time, especially for long 4K videos. Set `KEEP_H264=off` to keep the original files untouched.

### Keeping downloads working

Networks change their pages often, and yt-dlp releases fixes within days. Each ADHX release pins the latest yt-dlp. To update a running container without waiting for a release:

```bash
docker compose exec adhx /opt/yt-dlp/bin/pip install -U "yt-dlp[default]"
```

`[default]` includes the scripts YouTube needs for its player challenges; ADHX runs them with its own Node.js, so there's nothing else to install. Downloads that fail are retried with growing waits over about a day. Until a post is kept, X, Instagram and TikTok posts still play straight from the network.

### Backups

Back up the `/data` volume. It holds `adhx.db`, the `media/` folder and the `models/` folder. The models are re-downloaded if missing, so you can skip them.

### Fly.io

A starter [`fly.toml`](fly.toml) is included. Size the volume for your media:

```bash
fly apps create your-adhx
fly volumes create adhx_data --region lhr --size 50 --app your-adhx
fly secrets set --app your-adhx \
  SESSION_SECRET=$(openssl rand -base64 32) \
  NEXT_PUBLIC_APP_URL=https://your-adhx.fly.dev \
  EMAIL_LINKS_TO_ADMIN=1 \
  ALLOWED_EMAILS='you@example.com'
fly deploy --app your-adhx
```

Keep `min_machines_running = 1`. The download queue, the hourly X sync and Right now all run inside the app. For your first sign-in link without email, run `fly logs --app your-adhx | grep sign-in`.

### X bookmark sync (optional)

People sign in with email. Connecting X is optional; it brings in their bookmarks and then keeps checking for new ones about every hour.

1. Create an app in the [X Developer Portal](https://developer.x.com) with OAuth 2.0 (PKCE) and the bookmark read scope.
2. Register `<your NEXT_PUBLIC_APP_URL>/api/auth/twitter/callback` as a callback.
3. Set `TWITTER_CLIENT_ID` and `TWITTER_CLIENT_SECRET`.

X charges the developer app for every post its API returns, so automatic syncing uses API credits. Each sync asks for up to 100 recent bookmarks and stops at the first page that holds one already saved. X only ever returns someone's newest 800 bookmarks. If X runs out of credits, ADHX pauses automatic syncing for six hours and tries again.

## Saving posts

- **Paste a link** in ADHX (the Paste button, or just paste anywhere in the app).
- **The phone app:** [ADHX Share](#phone-app-adhx-share) adds ADHX to the share menu on iPhone and Android.
- **iPhone and iPad:** Settings → _Add to the iOS share menu_ shows how to make a three-step Shortcut that points at your server. Then use Share → ADHX in any app.
- **Android:** add ADHX to your home screen. It then appears in the share menu.
- **Desktop:** the extension in [`extension/`](extension/) adds a toolbar button, a right-click item and `⌘⇧A` / `Ctrl+Shift+A`. Build it with `EXTENSION_PUBLIC_APP_ORIGIN` set to your server (see [`extension/README.md`](extension/README.md)).
- **Put your address in front of any link:** `https://adhx.example.com/https://www.youtube.com/watch?v=…`.

Short share links (`pin.it`, Reddit's `/s/` links, `on.soundcloud.com`, `youtu.be`, TikTok's `vm.` links) work too.

## Phone app (ADHX Share)

ADHX Share puts ADHX in the share menu of every app on your phone. Share a post from X, Instagram, TikTok, YouTube or any of the other networks and a small sheet slides up: it saves the post to your ADHX, shows what was saved, and shows the copy being made. If your ADHX can't be reached, the link waits on the phone and goes when it can.

The apps also play your saves full screen (swipe up for the next, Repeat, Save to your phone, a small window that keeps playing in other apps) and search them by meaning, with a reader for long posts. Your server does the work: downloading, understanding and streaming. The phone only ever talks to your own ADHX. The code is in [`apps/ios`](apps/ios) and [`apps/android`](apps/android); the API it uses is in [`docs/specs/phone-app.md`](docs/specs/phone-app.md).

### Connect it

1. On your computer, open your ADHX and go to **Settings → Phone app**. Press **Show the code**.
2. Open ADHX Share on your phone and scan the code. Or scan it with the phone's own camera, or tap **Type the address instead** and type your ADHX's address and the 8-character code.

The code works once, for 10 minutes. Open ADHX at an address your phone can reach when you make it: `localhost` won't work from a phone. Your connected phones are listed under the code, and **Remove** stops a phone from saving straight away.

### iPhone

There's no App Store version. Install it one of two ways:

- **TestFlight.** If whoever runs your ADHX has set up TestFlight, use their invite link (it's on Settings → Phone app when `NEXT_PUBLIC_IOS_APP_URL` is set).
- **Build it yourself** with a Mac, Xcode 16 or newer and an Apple account (a free one works, but the app then stops opening after 7 days until you build it again):
  1. Open `apps/ios/Config/Base.xcconfig`. Set `ADHX_BUNDLE_PREFIX` to something only you use, like `com.yourname.adhxshare`, and `DEVELOPMENT_TEAM` to your team ID (Xcode → Settings → Accounts).
  2. Open `apps/ios/ADHXShare.xcodeproj`, plug in your phone, pick it at the top, and press Run.
  3. On the phone, trust your developer profile in Settings → General → VPN & Device Management.

To check it builds without a phone:

```bash
xcodebuild -project apps/ios/ADHXShare.xcodeproj -scheme "ADHX Share" -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

More in [`apps/ios/README.md`](apps/ios/README.md), including TestFlight.

### Android

Download the APK from this project's [GitHub releases](https://github.com/itsmemeworks/adhx/releases) and open it (allow installing from your browser or files app when asked). [Obtainium](https://github.com/ImranR98/Obtainium) can watch the releases and keep it up to date: add the repository's address.

To build it yourself you need JDK 17 or newer and the Android SDK (Android Studio has both). Opening `apps/android` in Android Studio is simplest. From a terminal, make the Gradle wrapper once (it isn't in the repository yet), then build:

```bash
cd apps/android && gradle wrapper --gradle-version 8.11.1 && ./gradlew assembleDebug
```

The APK lands in `app/build/outputs/apk/debug/`. Signing a release build is in [`apps/android/README.md`](apps/android/README.md).

## Search from Claude

ADHX ships an [Agent Skill](https://agentskills.io) that searches your saves by meaning, pictures and videos included. It can also read any X post as clean JSON.

1. In ADHX, open Settings → _Search from Claude_ and make a key.
2. Set it as `ADHX_API_KEY` where your agent runs.
3. Install the skill:

```bash
# Claude Code
/plugin marketplace add itsmemeworks/adhx
/plugin install adhx

# Other skills-compatible agents (Cursor, Gemini CLI, Codex, Copilot …)
SKILLS_DIR="$HOME/.cursor/skills" # change this for your agent
mkdir -p "$SKILLS_DIR/adhx" && curl -sL \
  https://raw.githubusercontent.com/itsmemeworks/adhx/main/skills/adhx/SKILL.md \
  -o "$SKILLS_DIR/adhx/SKILL.md"
```

Also set `ADHX_URL` to your server's address, e.g. `https://adhx.example.com`. Then ask things like "find my saved videos with a frog in them". Keys can only read their owner's saves, and you can remove them at any time.

## Develop locally

```bash
git clone https://github.com/itsmemeworks/adhx && cd adhx
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

The dev server runs at [http://localhost:3001](http://localhost:3001). With no email set up, sign-in links are printed in the terminal. Install yt-dlp to try downloads (`pipx install "yt-dlp[default]"`, `uv tool install "yt-dlp[default]"` or `brew install yt-dlp`); ffmpeg comes with the project. The first `pnpm dev` downloads the search model (about 400 MB) into `data/models/`, which git ignores; `SEMANTIC_SEARCH=off` skips it. With little disk space, run with `KEEP_BACKFILL=off`.

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm format:check && pnpm build
```

Read [ARCHITECTURE.md](ARCHITECTURE.md) for how it fits together, and [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow. Coding agents should also read [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md).

## Use it kindly

ADHX is for keeping posts for yourself and the people you share your server with. It isn't a way to republish other people's work. Keep the creator's name with what you save, which ADHX does on every post. Bear in mind that each network has its own terms about downloading.

## The website

[adhx.com](https://adhx.com) is a static site in [`site/`](site/), published to GitHub Pages by `.github/workflows/site.yml`. Run it with `pnpm site:dev`. It's separate from the app: your ADHX doesn't serve it.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

- [Privacy](PRIVACY.md): what an ADHX server stores
- [Security](SECURITY.md): how to report vulnerabilities privately
- [Code of Conduct](CODE_OF_CONDUCT.md)

## License

ADHX is available under the [MIT License](LICENSE).
