# Measuring Mac processing performance

Use the [Mac setup guide](../deploy/mac/README.md) for installation and the
[architecture guide](remote-processing.md) for queue, lease and cleanup flows.
These measurements guide experiments; they do not establish throughput on your
library or replace release compatibility checks. No server, queue or installed
worker is changed by the benchmark commands below.

## Safe changes available in this branch

`SEMANTIC_MEMORY_PROFILE=compact` disables ONNX Runtime's CPU memory arena and
memory patterns. `standard` keeps the existing runtime defaults. This is an
allocation change, not a smaller model, reduced precision or reduced video
coverage. There is no index-version change or need to clear existing saves.
The [ONNX session options](https://onnxruntime.ai/docs/api/js/interfaces/InferenceSession.SessionOptions.html)
document these native options.

The application default remains `standard`; the Mac example opts into `compact`.
Benchmark first and change only the private Mac worker environment. Restarting
the worker is required; editing an env file alone does not update a running child.
Use a released worker that matches your server, rather than deploying development
`main` against an older processing protocol. Roll back by restoring `standard`
and restarting just the worker. No NAS setting change or model download is needed.

CoreML now falls back once on an **inference** failure as well as a loading
failure. A successfully compiled graph can still reject a zero-length tensor
for an absent modality. The accelerated session is disposed before loading the
CPU replacement; subsequent calls reuse that CPU model. CPU errors remain errors.
Do not label a run accelerated merely because it selected a CoreML provider:
check fallback warnings, actual execution and results.

## Measurements on 20 October 2026

Native Apple M4, 16 GiB unified memory, ARM64 Node 24.19.0, Transformers.js 4.3.1,
two inference threads, `Nice=10`, the pinned EmbeddingGemma 2 revision
`daa72c51243991dfcaf9f9137d2c573d8f7790c0`, q4 text/q8 vision and 70 video soft
tokens per frame. Another installed worker and normal desktop applications kept
running. This is a shared-host comparison, not an idle-machine benchmark.

Each CPU variant embeds the same text and three identical 15-frame synthetic
motion batches, representing a 60-second section. The repeat reverses the order
and additionally tests static, scene-change and motion selections.

| Measurement                                              | Standard allocation | Compact allocation |
| -------------------------------------------------------- | ------------------- | ------------------ |
| First run: mean video inference                          | 13.08 s             | 12.05 s            |
| Repeat, reversed order: mean video inference             | 12.06 s             | 12.16 s            |
| First run: sampled peak physical footprint               | 2.8 GiB             | 1.9 GiB            |
| Repeat including adaptive trials: sampled peak footprint | 2.6 GiB             | 2.2 GiB            |

The repeat's text and full-video Float32 vectors are byte-identical between
allocation policies. The memory reduction repeated; a consistent inference
speed increase did not. Physical footprint was sampled every three seconds and
is approximate; it includes compressed memory that resident RSS misses. These
are child-process measurements, not total Mac RAM or hard limits.

Whole-model CoreML compiled but failed on a zero-length `video_features` input
at execution. A separate vision-only placement prototype exceeded the 3.75 GiB
experiment guard (observed 4.0 GiB) and was stopped. Neither established a usable
acceleration benefit; the vision-only mode is not exposed as a worker option.
The production recommendation remains CPU until a compatible graph/provider
passes both memory and end-to-end quality checks.
Retesting whole-model CoreML with the fallback fix completed the real pinned-model
text and three video runs successfully: the report recorded CPU fallback, and
all four vector hashes matched the CPU reference. This verifies recovery, not
successful accelerated inference.

## Experiments, not live indexing changes

The modules under `scripts/experiments/` are called only by benchmarks and tests.
The worker retains its existing sampler and light/normal/deep coverage plans.

### Representative frames

A prototype compares 8×8 RGB signatures, keeps the beginning and end, preserves
an anchor at least every three input samples (12 seconds with this normal plan),
and retains visually changed samples. The original stored video is untouched.
Unevenly spaced frames pass their original timestamps to the model.

| Compact CPU fixture       | Frames retained | Full → selected inference | Vector cosine to full |
| ------------------------- | --------------- | ------------------------- | --------------------- |
| Static image repeated     | 6 of 15         | 12.17 → 4.81 s            | 0.9924                |
| Three solid-colour scenes | 7 of 15         | 11.12 → 5.61 s            | 0.9872                |
| Moving test pattern       | 15 of 15        | No work removed           | 1.0000                |

This suggests worthwhile savings on redundant footage. Cosine similarity is
**not** a retrieval-quality guarantee: tiny objects, subtle movement, text slides,
brief events and ending-specific searches still need a labelled evaluation.
Before any rollout, evaluate those cases across light/normal/deep and version
the sampling profile/content hash so existing vectors cannot silently mix with
the new policy. Never trade away complete-video coverage or retained quality to
produce a better benchmark number.

### Batched extraction and one batch ahead

The extraction prototype decodes a section once instead of starting a decoder
for every sample. A 60-second 1080p/24 fps synthetic H.264 section with 15 samples
took roughly **2.9 seconds versus 5.4 seconds** over three alternating runs.
All decoded JPEG pixels agreed with the reference in a full-resolution repeat.
This is extraction time, not a 2× speedup of the whole processing queue.
Single-frame and low-FPS endings fall back to the established final-GOP sampler
when the batch cannot produce the expected number of frames. Abort/failure
cleanup and preservation of source bytes are regression-tested.

One-batch-ahead preparation is also measured in the inference harness. It overlaps
one FFmpeg extraction with the current model call, without another model instance
or worker job claim. One synthetic two-section comparison took **34.02 seconds
sequentially versus 30.02 seconds with one batch ahead** (about 12% less wall time),
with byte-identical vectors and a sampled 2.0 GiB footprint. This single paired
measurement needs repeated/reversed-order and real-codec validation; it is not
a queue-throughput guarantee. It is deliberately not connected to production claims:
deployment would need to preserve urgent-save fairness, lease cancellation,
active-file pins and cleanup after acknowledgement, including failed prefetches.

## Reproduce locally

Install the locked dependencies in a separate checkout. Set `FFMPEG_PATH` to a
maintained absolute FFmpeg binary. The model harness requires macOS and an
existing complete pinned cache; it uses a copy-on-write clone, disables remote
model downloads and gives the child an environment without worker credentials.
It generates its own images/video and never contacts the NAS or reads a save.
It stops its child on critical memory pressure, a sampled footprint over
3.75 GiB, or a three-minute variant deadline, and removes its own temporary
models and media on exit. These guards are sampled, not hard allocation limits.

```sh
export FFMPEG_PATH=/absolute/path/to/ffmpeg
export ADHX_VERIFY_MODEL_CACHE=/absolute/path/to/existing/model-cache
# Default: standard CPU, compact CPU, then opt-in CoreML with fallback detection.
pnpm exec tsx scripts/benchmark-mac-processing.ts

# Compare selection while reversing the CPU order.
ADHX_BENCH_ORDER=cpu-compact,cpu-standard ADHX_BENCH_ADAPTIVE=1 \
  pnpm exec tsx scripts/benchmark-mac-processing.ts

# Compare sequential preparation with one prepared batch ahead.
ADHX_BENCH_ORDER=cpu-compact ADHX_BENCH_PREFETCH=1 \
  pnpm exec tsx scripts/benchmark-mac-processing.ts

pnpm exec tsx scripts/benchmark-frame-extraction.ts
```

Reports default to the OS temporary directory; override `ADHX_BENCH_REPORT` with
a private output path. Check successful exit codes, stop/fallback fields, vector
agreement and `fixtureRemoved` before interpreting timing. Do not publish raw
stderr or reports without inspecting them for local paths. Keep tests separate
from timed trials for a cleaner comparison, repeat in both orders and compare
overall queue throughput and host responsiveness before changing a real worker.

## TypeSafe images

The [TypeSafe image API](https://docs.typesafe.ai/images) is explicitly
experimental. Its typed image judgments could help evaluate whether two sampled
frames differ or classify an image; it does not replace the 768-dimensional
EmbeddingGemma search vectors or directly process a video. The API requires an
experimental-image header and accepts PNG/JPEG inputs within its documented
dimensions and request limits.

One optional request using only generated 320×320 red/green/blue images and
`jev-1.14.0` returned the expected equality/change/colour answers in 0.332 seconds
(1,675 input tokens). This is a trivial classification smoke test, not evidence
of real-video understanding or sustained API latency. No private media was sent.
Adding cloud requests for every candidate frame could cost more latency than
the local signature comparison and would create a new privacy/dependency choice.

To reproduce deliberately, set a dedicated `TYPESAFE_API_KEY` privately and run
`pnpm exec tsx scripts/benchmark-typesafe-images.ts`. It sends one synthetic-only
request with a 30-second timeout and no retries, then writes a private report;
it accepts no library path or URL. This script is never called by the worker.
