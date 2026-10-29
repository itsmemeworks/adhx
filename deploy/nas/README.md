# Docker and NAS deployment

This guide runs ADHX as one Linux container on a Docker host or NAS, behind
the HTTPS reverse proxy you already use. No particular NAS brand, DNS
provider, VPN or public tunnel is required. Internal HTTP between the proxy
and ADHX is intentional; people open the external HTTPS address.

```mermaid
flowchart LR
  People["Browsers and phone apps"] -->|"HTTPS"| Proxy["Your reverse proxy"]
  Proxy -->|"HTTP :3000"| ADHX["ADHX container"]
  ADHX <--> Data[("/data: SQLite, kept media, model cache")]
  ADHX -->|"Downloads and previews"| Networks["Source networks"]
  Mac["Optional Mac helper"] -.->|"HTTPS, machine token"| Proxy
```

In words: people reach ADHX through your proxy over HTTPS, the container keeps
everything in one `/data` folder, and an optional Mac can take the heavy
processing over the same HTTPS address.

## Quick start

You need Docker with Compose v2, an HTTPS reverse proxy (or just a loopback
port to try it), and a few GB of disk to start.

1. Pick a layout: the repository-root [`docker-compose.yml`](../../docker-compose.yml)
   for a proxy on the host, or [this directory's](docker-compose.yml) for a
   proxy running in Docker (see [Choose how your proxy reaches the app](#choose-how-your-proxy-reaches-the-app)).
2. Copy [`.env.example`](.env.example) to `.env` beside the Compose file and
   set at least `ADHX_IMAGE`, `NEXT_PUBLIC_APP_URL`, `SESSION_SECRET`
   (`openssl rand -base64 32`) and `ALLOWED_EMAILS`. The container-proxy
   layout also needs `ADHX_DATA_DIR` and `ADHX_PROXY_NETWORK`.
3. `docker compose config --quiet && docker compose up -d`
4. Open your HTTPS address and ask for a sign-in link with your email. Read
   it from `docker compose logs adhx`, open it and press **Sign in**. You're
   the first admin.
5. Save a video, watch it play, and search for something in it. Then read
   [Resource and storage controls](#resource-and-storage-controls) before
   pointing a 10,000-bookmark X import at a small NAS.

UGREEN owners can follow the [UGOS Pro walkthrough](ugreen.md) instead.

## Deployment contract

| Hook            | Requirement                                                                         |
| --------------- | ----------------------------------------------------------------------------------- |
| Image           | Linux amd64 or arm64; choose and pin the intended version or digest                 |
| Application     | One running instance; internal HTTP port 3000                                       |
| Persistence     | Mount `/data` for SQLite, kept media and model cache                                |
| Permissions     | The image runs as UID 1001; a bind-mounted data folder must be writable by that UID |
| Address         | `NEXT_PUBLIC_APP_URL` is the final external HTTPS origin                            |
| Authentication  | Stable `SESSION_SECRET`, invited emails and a sign-in delivery method               |
| Proxy           | Forward to port 3000; preserve Range requests and event streams                     |
| Health          | `GET /api/health` checks the web process and database                               |
| Outbound access | Source networks for saving; Hugging Face for the first model download               |

The image includes yt-dlp, FFmpeg and the native search dependencies. You do
not need to install these tools on the host or pass through a GPU. Search and
video conversion use the CPU. The published image workflow supports amd64 and
arm64, but check the selected release's manifest and test it on your host.
An older `latest` image does not acquire the contents of an unmerged PR.

## Choose how your proxy reaches the app

**A proxy running on the host:** use the repository-root
[`docker-compose.yml`](../../docker-compose.yml). It publishes only
`127.0.0.1:3000` by default (`ADHX_PORT` changes the host port). Point the proxy
to `http://127.0.0.1:3000`. Its named volume persists `/data` and avoids manual
bind-folder ownership. Set the application environment in a root `.env` file
or export the values; see the [main README](../../README.md#run-your-own).

**A proxy running in Docker:** the Compose file in this directory publishes
no host port. It joins a network you supply and the proxy reaches
`http://adhx:3000`. This network must already exist and include your proxy.
Choose a unique network alias in the Compose file if another service already
uses `adhx`. A host's loopback port is not reachable as `127.0.0.1` from a
separate proxy container.

NAS interfaces that import Compose projects can use the same file. Set its
environment values through the interface or supply a `.env` file alongside
it, and select a persistent folder. The interface's own setup steps differ
by vendor; the container contract above stays the same.

UGREEN owners can follow the optional [UGOS Pro walkthrough](ugreen.md) for
project creation, storage initialization and the first sign-in. The examples
in this main guide stay portable across Docker hosts and NAS vendors.

## Prepare the configuration

For the container-proxy example, copy this directory's `.env.example` to
`.env`. Set:

- `ADHX_IMAGE`: the exact image you intend to run, preferably pinned by digest.
- `ADHX_DATA_DIR`: an absolute, private data-folder path writable by UID 1001.
- `ADHX_PROXY_NETWORK`: your existing proxy's Docker network name.
- `NEXT_PUBLIC_APP_URL`: the final address, such as `https://adhx.example.com`.
- `SESSION_SECRET`: generate a random value once with `openssl rand -base64 32`
  and keep it private and stable. Changing it signs out browsers.
- `ALLOWED_EMAILS`: who can create accounts by email. Empty means nobody new
  by email (invite links still work); `*` allows open registration.

Make the dedicated data folder before starting; otherwise Docker may create
it as root and the app cannot write to it. Set ownership/permissions for UID
1001 using your host's supported controls. Do not point this mount at another
application's data folder. Keep `.env`, logs and backups private.

The examples explicitly pass the documented media/search settings into the
container. Compose reads `.env` for interpolation; merely adding an arbitrary
variable there does not automatically pass it through. If you customise the
files, preserve the environment entries you need. `DATABASE_PATH` stays under
`/data`; if you move `MEDIA_DIR` or `SEMANTIC_CACHE_DIR` outside that mount,
add persistent mounts for the new paths too.

For an unreleased source checkout, build an image before selecting it:

```sh
# Run from the repository root, on the intended architecture or a suitable builder.
docker build -t adhx:local .
# Set ADHX_IMAGE=adhx:local in the chosen Compose project's .env.
```

The PR's native AMD64/ARM64 CI validates the assembled image with synthetic
media, migrations, persisted state, byte ranges and authentication. Full model
inference is available through the CI workflow's `check_models` input. To repeat
these checks on a local builder without installing an application service:

```sh
IMAGE_TAG=adhx:local bash scripts/container-smoke.sh --models
```

Run from the repository root with Docker available. This creates temporary
containers and a named volume, downloads the pinned model and removes the test
containers/volume afterward. It uses synthetic data, not an existing library.
For custom public phone install links, add `--build-arg NEXT_PUBLIC_IOS_APP_URL=...`
and/or `--build-arg NEXT_PUBLIC_ANDROID_APP_URL=...` to the image build; they are
compiled into the web client and cannot be changed by container runtime env.

A build alone does not prove that model inference, source downloads
or media playback work on the target hardware. Do not label an untested image
as a verified release.

## HTTPS and access

Configure your own proxy and DNS so the final address reaches this service.
Use a certificate trusted by your clients. Forward to the appropriate HTTP
target above, preserve `Host` and forwarding information, and support byte
ranges so video seeking works. Disable proxy buffering for event streams
(for example `/api/moments/stream`) and allow long-running streams; a
300-second proxy read timeout is a reasonable starting point.

Leave `TRUST_PROXY_IP_HEADERS=false` until the only route to ADHX is your
trusted proxy and it overwrites client-supplied `X-Forwarded-For` and
`X-Real-IP` values. Otherwise a client can spoof its rate-limit identity.
With this setting off, anonymous requests share a rate-limit bucket.

The service can stay private on your LAN and VPN. Configure clients to reach
the same HTTPS hostname both at home and away. Public exposure is optional
and requires your own deliberate network setup. Tailscale users can use
ordinary private tailnet access with an existing proxy; Funnel is a separate
public-publishing feature and is not part of these examples.

**Media privacy:** account sign-in protects personal save lists and search.
Kept files of shared posts and shared post previews are available without
sign-in to anyone who can reach the server. File paths include source post IDs
and are not secret tokens. (A post only saved Just for me is served to its
owner alone.) The email allowlist does not make playback private. Keep the
network private if that is your intended boundary.

## Start and verify

Validate the chosen configuration before starting it:

```sh
docker compose config --quiet
docker compose up -d
```

Migrations run on startup. With the default `EMAIL_LINKS_TO_ADMIN=1`, request
a sign-in link using your email, read it privately from `docker compose logs
adhx`, then open it and press **Sign in** to become the first admin. Later invited users' links wait
on the admin page for you to hand over. These links last 60 minutes; recipients
open them and press **Sign in** in their normal browser. The one-minute resend
countdown does not expire a link. To deliver links by email, configure
SMTP or Resend instead; see [Sign-in links](../../docs/self-hosting.md#sign-in-links).

Check the final HTTPS URL and database health, owner sign-in and an invited
account, a saved video and seek operation, a picture album and search by
words/pictures/video. Restart the service and verify its data and queued work
survive. Pair phones using the final HTTPS address, then test access from the
networks where you intend to use them.

The Compose examples include `restart: unless-stopped` and a health check.
The health endpoint checks the database, not the search model, downloader or
upstream networks. A Docker `unhealthy` status alone does not restart a
running process; choose monitoring appropriate to your host.

## Optional services and X sync

Start with the local features, then add the services you want:

| Feature                                            | Additional credentials                           | Setup                                                                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kept media and local text/picture/video search     | None beyond the instance's sign-in configuration | Keep `/data` persistent and permit the initial model download.                                                                                                                        |
| Jev refinement and automatic channel/moment naming | `TYPESAFE_API_KEY`                               | Use a dedicated key for this instance. See the [payload and fallback behavior](../../docs/self-hosting.md#the-search-model).                                                          |
| Experimental image-aware generated channels        | `TYPESAFE_CHANNEL_IMAGES=on` plus the Jev key    | Separate opt-in uploads selected public-post thumbnails for naming, borderline membership, repeat spacing and covers. See [limits and privacy](../../docs/channel-image-curation.md). |
| X bookmark import                                  | `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`     | Create an OAuth 2.0 confidential Web App, register the exact callback below, then connect the intended X account in ADHX Settings. X API credits are separate.                        |

For X, register `https://adhx.example.com/api/auth/twitter/callback`, replacing
the origin with your final `NEXT_PUBLIC_APP_URL`. Use the OAuth 2.0 Client ID
and Client Secret from [X's application settings](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code),
rather than an app-only bearer token or OAuth 1.0 consumer key. ADHX requests
`tweet.read`, `users.read`, `bookmark.read` and `offline.access`; it does not
request permission to post. Check which X account is selected on the consent
screen. Keep the email sign-in and existing session secret when adding X.

The two timing controls do different jobs:

```dotenv
AUTO_SYNC_EVERY_MINUTES=50
SYNC_COOLDOWN_MINUTES=1
```

Automatic sync imports new bookmarks for connected accounts with a successful
previous sync and **Bring in new bookmarks automatically** enabled. It checks
eligibility every five minutes; 50 minutes is the interval threshold, not a
promise of a request at exactly minute 50. Set it to `0` to disable the
scheduler while testing. The one-minute setting only permits another manual
sync after its cooldown; it does not run a full import every minute.

Pass both variables through Compose's `environment`, recreate ADHX, then
check Settings and the signed-in `/api/sync/cooldown` response. A setting does
not backport a paging fix into an older image. Read the selected image's
release notes, especially when a Settings sentence still describes an older
default. Each post X returns uses credits, including posts re-read by a full
sync; avoid repeated full imports merely to test configuration.

Use private configuration for real keys and record only their variable names
in shared guides. Keep development and installed-instance keys separate so
either can be rotated independently. SMTP/Resend remain optional when you use
admin-held sign-in links; admins can retrieve their own links from the server
log after bootstrap too.

### Posts only signed-in accounts see

Some posts are hidden from anonymous viewers: TikTok's "This post may not be
comfortable for some audiences", age-gated YouTube videos. ADHX still saves
them, and **What your ADHX is doing** says "TikTok only shows this one to
signed-in accounts" until the server can see them. To let it:

1. In a desktop browser, sign in to the network with a spare account (it can
   watch everything you want kept, nothing more).
2. Export that site's cookies as `cookies.txt` (Netscape format) with a
   cookies-export extension you trust.
3. Put the file in the data folder, readable only by the ADHX user (UID 1001),
   and set `YTDLP_COOKIES=/data/yt-dlp-cookies.txt` in `.env`.
4. Recreate the container, then tap **Retry** on the post.

Downloader retries distinguish a temporary network failure from a missing post.
A sign-in page or a private/deleted post's preview image is never archived as
its media. Picture-only posts can still fall back to their preview images.

The file is a sign-in: anyone who reads it can act as that account. ADHX hands
yt-dlp a private copy for each run and never logs or serves it. Cookies
expire; when these posts start failing again, export a fresh file.

## Resource and storage controls

Start with a small library. For a shared NAS, explicitly set
`KEEP_CONCURRENCY=1` and `SEMANTIC_THREADS=1`; the Compose fallbacks are two,
while this directory's `.env.example` selects one. Measure memory and CPU
alongside your existing services.
Development measurements put the full inference worker near 2 GB and the
text query worker around 600 MB, before the web server and FFmpeg. While it
transcribes speech or reads text on screen, the worker runs one more process
that peaks near 1.5 GB (speech) or 1.8 GB (text on screen) and exits after a
minute without that work. These are
not memory guarantees for another CPU or Linux image. Video conversion can
use several cores and substantial temporary disk space, especially at 4K.

- `KEEP_CONCURRENCY`: simultaneous downloads/conversions.
- `SEMANTIC_THREADS`: inference threads; the separate query worker uses one.
- `SEMANTIC_SPEECH=off` / `SEMANTIC_SCREEN_TEXT=off`: stop transcribing speech
  or reading text on screen (words already found stay searchable).
- `KEEP_MIN_FREE_GB`: pause starting downloads below the free-space reserve.
  It does not reserve space for work already running; allow extra room for
  downloads, conversion output and other services.
- `KEEP_MAX_FILESIZE`: per-download limit, not a total library quota.
- `KEEP_BACKFILL=off`: skip older saves. Its activation boundary persists
  through restarts so accepted downloads and retries still finish. Starting
  once with backfill enabled clears that boundary for a later activation.
- `KEEP_H264=off`: skip conversion, preserving source resolution and codec;
  some browsers may not play that codec.
- `SEMANTIC_SEARCH=off`: stop model workers while continuing keyword indexing
  for new saves. Startup catches up saved posts missing from the keyword index,
  without downloading a model.

The first model download is about 400 MB and persists in `/data/models`.
Kept media dominates storage. Provision room for the library and scratch
files; a short-video collection can quickly reach tens of GB. Add CPU/memory
limits using your Docker/NAS controls only after representative tests. If an
image is killed for exceeding its limit, a healthy database check on the next
start does not prove that the chosen limit is sufficient.

### Move background understanding to a Mac

Use the [NAS and Mac technical overview](../../docs/remote-processing.md) for
topology, queue and file-lifecycle diagrams, and the
[connection walkthrough](../mac/README.md#connect-the-nas-and-mac) for both sides'
environment settings.

The optional [native Apple Silicon worker](../mac/README.md) runs background
text/image/video inference, frame sampling and H.264 conversion on another machine. Keep the
NAS's existing HTTPS/network boundary and persistent storage. Set
`PROCESSING_MODE=remote`, `PROCESSING_WORKER_TOKEN` to a dedicated random
URL-safe secret, and `INDEXING_LEVEL=light|normal|deep` in its private
configuration. The Compose examples pass these settings explicitly.
Configure the same secret and the HTTPS origin on the Mac. This is a machine
processing credential with access to queued public post content, so keep it
private and separate from user/phone/AI credentials. No database mount,
port forwarding or public endpoint is needed.

The query model remains on the NAS; keyword search and playback continue while
the Mac is asleep. Pending sections resume when it returns. Full video duration
is sampled at each detail level, with bounded sections; retained media on the
NAS stays at its original quality. Mac originals are deleted after final
acknowledgement, frames after every section, with a bounded scratch cache and
expiry cleanup for interruptions. Upgrade the server and worker together to a
compatible release before enabling remote mode.

Source downloads and small metadata probes still run on the NAS. Keep
`KEEP_CONCURRENCY=1` and monitor those separately. Non-H.264 sources wait for
conversion on the Mac; the NAS retains the source until the uploaded MP4 passes
codec, resolution, duration and audio checks and its metadata commits. Each
converted upload is limited to 4 GiB. Configure the existing HTTPS proxy to
accept that size and stream it without buffering another full copy, with adequate
read/send timeouts. See [proxy upload hooks](../mac/README.md#proxy-upload-hooks).
Consider `KEEP_H264=off` only if your clients can play the source codecs.

Remote mode reduces heavy processing load; it does not remove the need to budget
the whole service. `SEMANTIC_SEARCH=off` pauses models in either mode while remote
conversion remains available. `KEEP_MEDIA=off` separately pauses new downloads
and new conversion claims without deleting retained files.

### Budget the whole container

`SEMANTIC_THREADS` limits model threading, not the web server, media conversion
or every child process together. ADHX uses separate query and background model
processes so a search need not queue behind a video; those processes still
share the container's CPU and memory budget. Retained 4K playback and video
inference are different workloads. Test both, including a fresh search while
indexing is active.

After measuring your host, add resource keys to its existing `adhx` service.
For example, this illustrative budget allows two CPU cores and 4 GiB of RAM:

```yaml
services:
  adhx:
    # Merge these keys into the complete service; preserve image, environment,
    # storage, network, restart policy and health check.
    cpus: 2.0
    mem_limit: 4g
    mem_reservation: 2g
    memswap_limit: 4g
```

These are Docker service properties, not application environment variables.
The memory reservation is a soft threshold, not RAM set aside exclusively for
ADHX. Equal memory and memory-plus-swap limits disable container swap; leaving
the latter unset can allow additional swap. See [Docker's resource controls](https://docs.docker.com/engine/containers/resource_constraints/).
Choose a budget that leaves room for the NAS operating system and other apps.
This example is not a minimum requirement or a validated limit for every model
input. A hard limit can kill a model worker or the app if it is too low.

Check the runtime's effective limits after recreation; a saved YAML document
alone does not prove they took effect. Watch available RAM, CPU, disk activity,
container/process restarts and OOM events where the host exposes them. Avoid
treating low free-only RAM as pressure without accounting for reclaimable
cache. Check that the learning progress on **What your ADHX is doing**
(`/doing`) keeps advancing with no failures,
and try semantic search, video seeking and another service at the same time.
A healthy database endpoint alone cannot detect a repeatedly killed model
worker. Keep a private copy of the previous configuration for rollback.

## Updates, backups and recovery

### Choose an update channel

| Image reference         | What an updater can follow                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `@sha256:<digest>`      | One exact image. A newly published release does not change this reference.                 |
| `:2.1.3`                | One numbered release; it does not move to the next version number.                         |
| `:latest`, `:2`, `:2.1` | Moving stable-release aliases, limited to the selected major/minor series where specified. |
| `:main`                 | Legacy snapshot; no longer updated. Choose a release tag or verified digest instead.       |

For a deliberate update, follow release notifications and select a new verified
digest. If you choose a moving tag, a NAS image checker can report changes to
that tag. Detection, pulling an image and recreating the running container are
separate actions. Publishing an image never upgrades this installed service by
itself. Confirm the image has finished publishing, supports your architecture
and contains the intended source revision. Application PR merges are accumulated
until the Release Please PR is merged and its tagged image is published. See the [image and release flow](../../docs/releasing.md).

Record the running image digest and back up the private data before updating.
Select a new pinned image, pull it and recreate this project only. For a local
build, rebuild with a new identifiable tag and select it. Migrations run on
start; restoring an older image may also require restoring its matching
database backup.

Back up `/data/adhx.db` consistently with its SQLite WAL state and the kept
media. The simplest portable method is to stop ADHX, copy the whole `/data`
folder/volume with private permissions, and restart. Alternatively use
SQLite's backup API plus a coordinated media snapshot. The model cache can
be excluded because it downloads again. Keep an independent backup and test
restoring it to a separate project before relying on it.

Stopping or removing the app container should preserve its data. Avoid
`docker compose down -v` unless you intend to delete named-volume data. For a
failed update, stop this project, restore its data backup and matching image,
and leave unrelated services and proxy hosts alone.

When changing only environment or resource settings, keep the verified image
reference and recreate ADHX without updating every other project. A plain
process restart does not apply a new container environment. Preserve the
working VPN/proxy management path; an ADHX backup does not require stopping a
shared VPN, gateway or the NAS. If an infrastructure update would interrupt
your only remote connection, arrange independent access and recovery first.

Networks change their extractors often. See [Keeping downloads working](../../docs/self-hosting.md#keeping-downloads-working)
for updating the image's yt-dlp package; runtime-only package changes disappear when the
container is recreated.

## Troubleshooting

| Symptom                                                   | Likely cause and fix                                                                                                                                                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose up` stops with "Set SESSION_SECRET…"      | A required value is missing from `.env`. The message names it.                                                                                                                                              |
| The container restarts with `EACCES` or `SQLITE_CANTOPEN` | The data folder isn't writable by UID 1001. Fix its ownership with your host's tools, or use the [one-shot initializer](ugreen.md#choose-storage-and-initialize-permissions).                               |
| The proxy shows 502 Bad Gateway                           | The proxy can't reach the container. A proxy in Docker must share `ADHX_PROXY_NETWORK` and use `http://adhx:3000`; `127.0.0.1` inside a proxy container is the proxy itself.                                |
| Sign-in links point at `localhost`                        | `NEXT_PUBLIC_APP_URL` isn't the final HTTPS address. Fix it and recreate the container.                                                                                                                     |
| Everyone got signed out after an update                   | `SESSION_SECRET` changed. Keep it stable across recreations.                                                                                                                                                |
| Videos play but won't seek                                | The proxy drops `Range` requests. Pass them through unchanged.                                                                                                                                              |
| Right now never updates live                              | The proxy buffers event streams. Turn buffering off for `/api/moments/stream` and allow long reads.                                                                                                         |
| A network stopped downloading                             | Its extractor changed. Update yt-dlp ([how](../../docs/self-hosting.md#keeping-downloads-working)) or wait for the next release.                                                                            |
| A post says it's only shown to signed-in accounts         | The network hides it from anonymous viewers (TikTok's "may not be comfortable for some audiences", age-gated YouTube). Set `YTDLP_COOKIES` ([how](#posts-only-signed-in-accounts-see)), then tap **Retry**. |
| Search only matches exact words                           | The model is still downloading (about 400 MB, once), `SEMANTIC_SEARCH=off` is set, or the worker keeps getting killed. Check the logs and the memory limit.                                                 |
| Mac helper uploads fail with 413 or time out              | The proxy rejects large bodies. See [proxy upload hooks](../mac/README.md#proxy-upload-hooks).                                                                                                              |
| `/api/health` is healthy but nothing gets processed       | Health checks the web app and database only. Look at **What your ADHX is doing** (`/doing`), `/api/understanding/status` and the container logs.                                                            |
