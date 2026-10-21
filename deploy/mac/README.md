# Native Apple Silicon worker

This optional companion processes ADHX's queued text, images and video segments
and browser-compatible H.264 copies on a Mac. Your NAS owns the database, media,
queue and search permissions. The worker needs no database or NAS filesystem
mount, inbound listener or public port.

Use a native Apple Silicon Mac, macOS and ARM64 Node.js 24 (or another version
allowed by `package.json`; Node 22 must be at least 22.22.1). A Docker
container cannot use macOS CoreML or VideoToolbox. Install this repository's
dependencies with `pnpm install --frozen-lockfile` in a stable checkout. Install
a maintained FFmpeg (`brew install ffmpeg` with Homebrew, or your trusted package
manager), then set its absolute path in `FFMPEG_PATH` when needed; do not
delete or move that checkout while the service is installed.

Follow the [rollout verification checklist](VERIFY.md) to match the released
server image and worker source, test the complete processing path and tune host
resources before importing a large library. This worker runs directly on macOS;
neither Docker nor Apple Container is required on the Mac. For diagrams and the
reasons behind the settings, read
[How NAS and Mac processing work](../../docs/remote-processing.md).

## Connect the NAS and Mac

Keep the NAS's existing volumes, authentication secrets and HTTPS origin. Set
these in its private configuration, then recreate ADHX using your normal
Docker/NAS update procedure:

```dotenv
SEMANTIC_SEARCH=on
KEEP_MEDIA=on
KEEP_H264=on
PROCESSING_MODE=remote
INDEXING_LEVEL=normal
PROCESSING_WORKER_TOKEN=REPLACE_WITH_A_NEW_DEDICATED_RANDOM_SECRET
```

Generate that secret once with `openssl rand -hex 32`, then copy the same value
to the Mac's `ADHX_WORKER_TOKEN`. The names differ between the two machines.
Keep the value out of source control and shared logs. Inspect the
[proxy upload hooks](#proxy-upload-hooks) before testing conversion.
`KEEP_H264=on` enables compatibility copies; turn it off if your clients support
the original codecs. On a shared NAS, start with `SEMANTIC_THREADS=1` for its query
model and `KEEP_CONCURRENCY=1` for downloads, then measure responsiveness. No
existing-library reset is required.

On the Mac, install native ARM64 Node.js 24 or another supported version and the pnpm version named
by the repository's `packageManager`. Create a separate, stable worker checkout.
Replace `RELEASE_SOURCE_COMMIT` below with the full source commit of the server
release you verified, rather than the latest development commit:

```sh
git clone https://github.com/itsmemeworks/adhx.git "$HOME/adhx-worker"
cd "$HOME/adhx-worker"
git checkout --detach RELEASE_SOURCE_COMMIT
pnpm install --frozen-lockfile

mkdir -p "$HOME/Library/Application Support/ADHX-worker"
chmod 700 "$HOME/Library/Application Support/ADHX-worker"
cp deploy/mac/worker.env.example "$HOME/Library/Application Support/ADHX-worker/worker.env"
chmod 600 "$HOME/Library/Application Support/ADHX-worker/worker.env"
```

Edit that private `worker.env` before running anything. Set `FFMPEG_PATH` to your
maintained FFmpeg binary (normally `/opt/homebrew/bin/ffmpeg` on Apple Silicon).
The installer captures that absolute binary for launchd, whose default PATH
does not include Homebrew. Check prerequisites without installing a service:

```sh
deploy/mac/install.sh "$HOME/Library/Application Support/ADHX-worker/worker.env" --check
```

Configuration:

| Mac setting                               | Value                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `ADHX_SERVER_URL`                         | Existing HTTPS origin, for example `https://adhx.example.com`, without a path or query       |
| `ADHX_WORKER_TOKEN`                       | Exact server `PROCESSING_WORKER_TOKEN` value                                                 |
| `ADHX_WORKER_ID`                          | A readable identifier such as `mac-worker`                                                   |
| `SEMANTIC_DEVICE`                         | `cpu` initially                                                                              |
| `SEMANTIC_THREADS`                        | `2` initially; tune separately from the NAS query-model threads                              |
| `SEMANTIC_MEMORY_PROFILE`                 | Optional `compact` to disable CPU arenas and memory patterns; application default `standard` |
| `SEMANTIC_SPEECH`, `SEMANTIC_SCREEN_TEXT` | Optional `off` to leave speech or on-screen text to another worker                           |

The example lists optional absolute scratch/model paths and budget overrides.
Keep reusable model weights separate from disposable scratch, preferably
outside the checkout. The same HTTPS address must be reachable from the Mac
over the intended LAN/VPN connection, with a normally trusted certificate.

Test from that checkout, wait for a completed real job and search result, then
stop the foreground worker with Control-C before installing the login service:

```sh
node --env-file="$HOME/Library/Application Support/ADHX-worker/worker.env" --import tsx src/lib/processing/mac-runner.ts
```

After stopping that foreground process:

```sh
sh deploy/mac/install.sh "$HOME/Library/Application Support/ADHX-worker/worker.env"
```

Check **Getting to know your saves** in the app and
`~/Library/Logs/ADHX-worker/worker.log` for progress. The authenticated
`/api/understanding/status` endpoint includes failure counts; `/api/health` only
checks the web app and database. Complete the [verification checklist](VERIFY.md)
before a large import.

## Running the service

The service runs as your user while logged in. It does not change sleep settings;
queued jobs wait while the Mac sleeps or is disconnected. Keep the server private
on LAN/VPN, including Tailscale for remote workers. The credential grants machine
processing access, so use a dedicated secret and rotate it on both machines if
compromised. Do not reuse a sign-in cookie, AI-service key or X credential.

The installer uses launchd's `Standard` process type with `Nice=10` and a default
of two inference threads. `Background` applies additional CPU/I/O throttling and
can substantially slow model work despite apparently busy CPU threads. These
settings keep priority and concurrency conservative without forcing background
classification; they do not impose a hard memory limit. Measure the installed
service as well as foreground runs when tuning your host.
For an existing installation, rerun `deploy/mac/install.sh` with the private
environment-file path after updating the checkout. Pulling source or restarting
the old service alone leaves its persisted `Background` plist unchanged.

On memory-constrained Macs, the example opts into `SEMANTIC_MEMORY_PROFILE=compact`.
This changes ONNX allocation, preserving the pinned model, precision and frame
coverage. It is not a hard memory cap or a guaranteed speed increase. Compare
physical footprint, system memory pressure and end-to-end section times before
and after; RSS alone omits compressed memory. Leave other active applications
alone when measuring a shared host. See the [benchmark results and experiments](../../docs/mac-processing-performance.md)
for reproduction steps, quality limits and why CoreML should remain opt-in.

Source downloads and cheap metadata probes still run on the NAS. Keep download
concurrency conservative and budget those separately. With `KEEP_H264=on` in
remote mode, non-H.264 files queue for conversion on the Mac, before inference.
Apple's hardware encoder produces full-resolution H.264/yuv420p with AAC audio;
a bounded two-thread software fallback handles unsupported inputs. The NAS keeps
the source until the streamed MP4 passes codec, resolution, full-duration and
audio checks and the per-slot metadata swap commits. The phone feed waits until
all required video slots finish. Failures preserve the source and retry with
backoff; exhausted attempts require operator attention without re-downloading.
`KEEP_H264=off` skips conversion when your clients support the original codecs.

The polling process downloads retained originals over authenticated HTTPS into a
private cache, then runs one inference segment at a time in a separate native
child. Heartbeats remain responsive while inference runs. A completed segment
releases its job so urgent saves can run before the next segment of a long video.
Conversion and understanding claims alternate while both have work, so a
large import cannot monopolise the worker with compatibility conversions.
Understanding retains urgent-save priority, with one priority point per waiting
minute so old backfill eventually gets a turn. Conversion claims alternate
between newest saves for playback and oldest sources to prevent starvation. This is fairness between jobs, not interruption of an encoding in progress.
Inference creates temporary 448px JPEG samples without changing the NAS copy.
Compatibility conversion creates a separate full-resolution temporary MP4 and
re-encodes video, so it is not byte-for-byte lossless. File and cache limits default to 4 GiB and 8 GiB. Oversized files
remain queued/failed for operator attention, rather than consuming unbounded RAM
or disk. Cached originals expire during subsequent work after 24 hours and may be
evicted earlier to meet the disk budget. A server-issued file identity lets speech, on-screen text and video understanding
reuse one original even though their result hashes differ. A successful result
releases that original as soon as its last queued/leased consumer finishes. A
replacement NAS file has a new identity and is downloaded again. Older servers
still work with per-kind caching. Abandoned or unacknowledged generations remain
subject to the same 24-hour expiry and disk ceiling. Each claim also reconciles
a bounded batch of cached identities: deleted/replaced sources and posts with no
remaining media consumers are removed on the next poll. Keys identify reusable
local copies only; every NAS download still requires the machine key and a current lease. Temporary frames are deleted after every segment, including
failures. Conversion outputs are deleted after each upload attempt; after a
validated final acknowledgement the downloaded conversion source is deleted too.
Invalidated conversion capabilities also discard stale local sources. Startup and periodic cleanup remove abandoned frame/conversion directories and
partial downloads after one hour and orphan originals after 24 hours. On-screen text decoding may skip one corrupt picture when others are readable.
Model loading/inference errors, and a job with no readable inputs, fail for retry
and preserve previously extracted words rather than recording "no text".
Reusable
model weights are stored separately and remain cached across jobs.
Use one worker per cache directory. Its disk ceiling counts originals, partial
downloads, temporary conversion outputs and frame contents, including recent crash leftovers; those
leftovers can be evicted before their expiry when space is needed. Native video
sampling reserves 64 MiB of frame scratch space and caps each JPEG at 4 MiB. A
cache too small for the current original plus that reserve rejects the work
without deleting any of its active inputs. All pictures and videos for one
on-screen-text job remain pinned through downloads and the scratch reservation;
if the full set cannot fit, the job retries instead of silently dropping images. Model weights and unrelated files are
outside the scratch ceiling and are never removed by scratch cleanup.

Light targets 120-second segments with roughly one sample every 12 seconds;
normal targets 60-second segments with one every four seconds; deep targets
30-second segments with one every two seconds. Every level samples the entire
duration, including the ending. A segment contains at most 16 frames. Videos are
limited to 24 hours and 512 segments, so very long videos use wider spacing.
These are visual samples, not a promise to capture every event.

The worker also transcribes what's said (the first ten minutes of each video or
sound, with the pinned Whisper base model) and reads text on screen (up to four
pictures and four frames from the first minute, with the pinned Florence-2 base
model), and sends back only the cleaned words. Both run on CPU in a separate
process that holds one model at a time and exits after a minute without work;
on an M4 it peaked near 1.5 GB for speech and 1.8 GB for text on screen. This
needs a server and worker on processing protocol 2: an older worker keeps
claiming words, pictures, video and conversions and is never handed these jobs.
Set `SEMANTIC_SPEECH=off` or `SEMANTIC_SCREEN_TEXT=off` in `worker.env` to leave
that work for another worker.

Native CPU is the default, using the same pinned q4/q8 model as the server. Set
`SEMANTIC_DEVICE=coreml` only after measuring memory and latency on your Mac.
CoreML uses MLProgram with initialization fallback to CPU; its availability does
not guarantee all model operators use the GPU or Neural Engine, and compilation
can increase memory pressure. Benchmark actual latency, memory and search quality
before opting in. FFmpeg uses
VideoToolbox decoding with a bounded software fallback. The worker never puts
the shared credential in FFmpeg arguments or URLs.

`SEMANTIC_SEARCH=off` on the server pauses local and remote inference while
conversion remains available. `KEEP_MEDIA=off` separately pauses new source
downloads and new remote conversion claims. Neither deletes retained
media.

Logs are in `~/Library/Logs/ADHX-worker/`; include them in normal log rotation. Stop and remove the login service with
`sh deploy/mac/uninstall.sh`; this preserves the private configuration and caches.
For updates, stop the worker, update its checkout and dependencies to a compatible
server release, then reinstall. Jobs and partial video progress stay on the NAS.

## Proxy upload hooks

Converted MP4 uploads have a 4 GiB hard ceiling and must also fit the worker's
per-file/scratch budgets. The default 8 GiB scratch ceiling fits a 4 GiB input
plus a 4 GiB output; model weights are separate. An oversized/truncated output
is rejected, preserving the source. Uploading streams from disk rather than
loading a video into RAM.

Keep the existing private HTTPS boundary. Configure its reverse proxy to accept
large `PUT /api/processing/result` bodies, disable request buffering if supported
and allow enough time for a large transfer. For an Nginx-based proxy, adapt these
hooks to that proxy's supported configuration context:

```nginx
client_max_body_size 4g;
proxy_request_buffering off;
proxy_read_timeout 1200s;
proxy_send_timeout 1200s;
```

The app still enforces its own 4 GiB limit, a 20-minute total upload deadline,
60-second inactivity deadline, two concurrent uploads and an 8 GiB server upload
scratch ceiling, plus `KEEP_MIN_FREE_GB`. Worker uploads time out after ten minutes.
A proxy's 413/timeout response can occur before the app sees a request; inspect
its configuration as well as worker logs. Do not expose a new public port or
relax the worker's machine-token and lease checks to solve an upload problem.
