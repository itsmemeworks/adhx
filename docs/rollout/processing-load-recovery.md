# Processing load and recovery rehearsal

This opt-in rehearsal uses disposable synthetic data, a disk-backed SQLite WAL
database and an HTTP adapter around the actual processing and activity route
handlers. It never connects to an installed ADHX instance. It exercises queue
selection, a native runner killed during work, bounded scratch storage, complete
video sampling, conversion and cleanup while three clients continuously read
progress and health responses.

Run it from the repository root after installing dependencies and a supported
FFmpeg binary:

```sh
FFMPEG_PATH=/absolute/path/to/ffmpeg \
ADHX_LOAD_REPORT_PATH=/tmp/adhx-processing-load-report.json \
pnpm exec vitest run --config scripts/verify-processing-load.config.ts
```

The default library has 10,000 queued saves. Set `ADHX_LOAD_POSTS` between 1,000
and 100,000 for another size. The test is intentionally separate from the normal
parallel unit-test suite: it starts real processes and measures response times.
The existing CI test job also runs the default scenario after unit tests and
retains its JSON report. Real model inference is an explicit local option.
Only one test worker runs, sampling decodes one frame at a time, and fixture
generation uses one FFmpeg thread. Native conversion uses the production
VideoToolbox path, with its existing two-thread software fallback when needed.

To include real Gemma inference, set `ADHX_VERIFY_MODEL_CACHE` to an existing
model-cache root containing the complete pinned revision specified in
`src/lib/semantic/config.ts`. The rehearsal checks its required files, clones
only that revision into its temporary directory, and runs a separate native
model child with **one CPU thread**. macOS uses a copy-on-write clone; other
systems make an independent copy. No source model file is modified and no model
download is needed. This optional phase currently requires Apple Silicon macOS,
because it exercises `NativeModelProcessor`, the Mac runner's child protocol.

```sh
ADHX_VERIFY_MODEL_CACHE=/absolute/path/to/existing/models \
FFMPEG_PATH=/absolute/path/to/ffmpeg \
ADHX_LOAD_REPORT_PATH=/tmp/adhx-processing-load-report.json \
pnpm exec vitest run --config scripts/verify-processing-load.config.ts
```

The report records platform, architecture, Node/SQLite/FFmpeg versions, queue
size, response sample counts and p50/p95/maximum times. It omits the source
model-cache path, credentials, live URLs and personal content. The temporary
database, retained fixture and worker/model caches are removed on completion,
including failure. The JSON report remains at the selected output path.

## What must pass

- A backfill save aged two hours gets a turn ahead of fresh urgent saves.
- The oldest visible failed download remains in the Needs you page despite the
  10,000-save backlog. Another account's private failure is neither shown nor
  counted.
- A real native runner reaches its processor and is killed with `SIGKILL`.
  The unacknowledged lease stays durable; a subsequent claim after expiry gets
  a fresh lease for the same work and completes it. The old token is rejected.
  The test advances only the fixture lease deadline instead of waiting the real
  two minutes; it does not claim a wall-clock expiry measurement.
- An insufficient scratch budget causes a retryable error before inference,
  preserving the retained original. A larger budget resumes the job.
- A real eight-minute video is sampled across every normal-profile window,
  including its final minute and the final sample at 478 seconds. Blue frames
  exist only in that ending, so decoding their colour proves the ending was
  actually sampled. All intermediate frame files are removed.
- Completion acknowledgements remove the cached source when no consumer needs
  it; abandoned scratch from a previous worker is swept and an unrelated model
  directory stays intact. The retained original's SHA-256 stays unchanged.
- Real native H.264 conversion preserves dimensions and duration, passes the
  production integrity checks and removes its temporary output on cleanup.
- A separate 60-second **1920 × 1080, 24 fps moving-pattern video with stereo
  AAC audio** goes through the same native converter while progress requests
  continue. The result must remain 1080p and 60 seconds long, contain H.264
  video and AAC audio, preserve the input file and clean its output scratch.
  Source generation uses one CPU thread with a bounded bitrate/file size.
- Progress summary, filtered Needs you and health responses remain responsive
  throughout media work. The generous local regression guards are p95 below
  one second for progress endpoints and no health response above two seconds.
  These are test guards, not a promised remote-access service level.
- With a cloned model supplied, real text inference and the video's final
  15-frame segment each return a finite, normalized 768-dimensional vector while
  the same three clients continue making requests.

## Observed rehearsal, 19 October 2026

The 10,000-save rehearsal passed on an Apple Silicon Mac with 10 logical CPUs
and 16 GiB RAM, Node 24.19.0, SQLite 3.53.4 and FFmpeg 9.0.2. The model child
used one native CPU thread and an isolated clone of the pinned model. Both
cases passed together in 99.55 seconds. During that combined run the host also
had a two-worker FFmpeg source compile, a one-worker browser suite and an
Android build running. These are local observations under development
contention, not reference hardware performance promises.

| Phase                                               | Summary p95 | Needs you p95 | Health p95 |
| --------------------------------------------------- | ----------: | ------------: | ---------: |
| Baseline, 10,000-save queue                         |      540 ms |        421 ms |     416 ms |
| Cold model text phase                               |      473 ms |        473 ms |     270 ms |
| All frame sampling and real final-segment inference |      160 ms |        294 ms |       5 ms |
| H.264 conversion phase                              |      362 ms |        364 ms |     361 ms |
| 60-second moving 1080p conversion with audio        |      275 ms |        497 ms |     171 ms |

The sampling/inference phase measured 797 responses across three clients.
All eight video windows completed, with 120 decoded frames including 15 blue
frames from the final minute. Real inference on that final 15-frame segment
took 16.11 seconds and produced a finite normalized 768-dimensional vector.
A new model child's text task took 4.40 seconds, and conversion of the tiny
synthetic source took 0.89 seconds. The route test process peaked at 251 MiB
resident memory; this **excludes**
the separate model and FFmpeg processes and is not a whole-system memory claim.
The killed-runner recovery, stale-token rejection, retryable scratch limit,
preserved original and cache cleanup assertions also passed.

The 1080p case encoded 60 seconds of moving video and stereo audio in
**8.21 seconds** through the production native converter. Its 39.3 MB H.264/AAC
output retained 1920 × 1080 dimensions and a 60-second duration. The three
clients measured 83 responses in the conversion/load phase, with no response above
560 ms. The 31.1 MB retained input's hash stayed unchanged and all conversion
scratch was removed. These numbers describe that synthetic fixture, rather
than a promised rate for downloaded videos.

The JSON report distinguishes actual work duration from the combined load
phase: the three clients make a minimum number of requests, so their last
responses can finish after a quick model or conversion task has completed.
Do not treat the combined phase duration as inference or encode throughput.

## Interpretation and limits

The eight-minute source is deliberately small: 320 × 180 at one frame per
second, with deterministic colours. It checks temporal coverage, cleanup and
recovery cheaply; it cannot establish 1080p/4K transcoding throughput, decoder
memory usage or quality on real social videos. The separate 60-second moving
1080p fixture exercises realistic resolution, frame rate and audio, but still
does not represent real camera footage or a mix of social-media codecs.
Earlier video segments use a
constant vector to exercise queue completion. Even with the optional real final
segment, this is **not** an end-to-end timing of inference over all eight
minutes.

Authentication is replaced with fixture accounts at the HTTP adapter. SQLite,
route validation, scheduling, lease ownership, media downloads, frame sampling,
native conversion and runner cleanup are real. The harness does not measure
Next page rendering, TLS, Tailscale, a shared NAS disk, mobile networking or a
physical phone. Pair its report with the browser suite and the physical-device
checks in [the friends-feed verification guide](friends-feed-verification.md).

Real disk-full exhaustion is represented by the worker's configured scratch
budget, avoiding intentional exhaustion of the host disk. Platform filesystem
errors such as ENOSPC still need a separately constrained filesystem rehearsal
if an operator requires that additional guarantee.
