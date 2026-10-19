# Verify a Mac worker rollout

Use this checklist with the [Mac setup guide](README.md) before importing a large
library. It describes checks an operator must perform; a successful build or
installation does not establish that a particular deployment passed them.

## Match the server and worker

Choose a published release, then record its version, full source commit, image
digest and target architecture. A merged Release Please version PR does not by
itself prove that its GitHub release or container image exists. Check the
[release process](../../docs/releasing.md) when publication is missing.

Use the NAS Docker tools or a Docker client connected to that host. These image
checks do not require Docker on the Mac worker. For example, inspect a published
image without starting it:

```sh
docker buildx imagetools inspect ghcr.io/itsmemeworks/adhx:VERSION
```

Confirm that the manifest includes your NAS architecture (`linux/amd64` or
`linux/arm64`) and that its `org.opencontainers.image.revision` annotation matches
the release commit. After pulling and recreating the service, inspect the image
actually used by the container, rather than relying on the configured tag:

```sh
docker inspect --format '{{.Image}}' YOUR_CONTAINER
docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' IMAGE_ID
docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' IMAGE_ID
```

Keep inspection output limited to the fields needed. Full container inspection
and rendered Compose configuration can expose environment secrets. Check that
`/api/health` reports the expected version. This endpoint establishes web and
database health; it does not test the worker, model, downloader or conversion.

Use a separate, stable Mac checkout at the same released commit. Check
`git rev-parse HEAD` and `git status --short`, then install its locked dependencies.
A newer `main` checkout can differ from the server even when a version string
looks unchanged. Keep private configuration, scratch data and reusable model
weights outside the checkout. Preserve the existing database/media volumes and
server authentication secrets when recreating the NAS service.

Check backup integrity before maintenance. A file appearing in a backup folder,
or a transfer starting, does not prove a complete usable copy. Verify the
database backup with SQLite's integrity check, validate archive contents and
checksums where available, and record where the verified copy actually resides.
Distinguish a verified NAS archive from an attempted download to another host.

If maintenance uses a one-shot helper, verify its own exit status and persisted
result or receipt, then read back the intended database/file state. A healthy
web app or a NAS project marked started does not prove that a dependency/helper
actually ran or finished successfully.

## Check the operating conditions

| Setting or dependency    | Check before starting                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native runtime           | macOS on Apple Silicon with ARM64 Node.js 22 or newer; no Docker or Apple Container requirement.                                                                                |
| Server role              | `PROCESSING_MODE=remote`, `SEMANTIC_SEARCH=on` and `KEEP_MEDIA=on` for the complete inference test.                                                                             |
| Machine authentication   | Dedicated random `PROCESSING_WORKER_TOKEN` on the server equals `ADHX_WORKER_TOKEN` in the private Mac environment file.                                                        |
| Server address           | `ADHX_SERVER_URL` is the reachable HTTPS origin; ordinary certificate validation succeeds over the intended LAN/VPN connection.                                                 |
| Indexing level           | Choose server-side `INDEXING_LEVEL=normal` initially; light and deep change sampling density across the full duration.                                                          |
| Native inference         | Start with `SEMANTIC_DEVICE=cpu` and `SEMANTIC_THREADS=2`; measure before changing either.                                                                                      |
| Model cache              | Allow the first pinned model download to finish before measuring warm inference; preserve its cache across worker updates.                                                      |
| Compatibility conversion | Enable `KEEP_H264=on` if clients need H.264 copies; keep source downloads conservative on a shared NAS.                                                                         |
| Storage                  | Leave space for the retained source and conversion upload on the NAS, and the worker's original plus frame/output scratch on the Mac. Model weights need additional disk space. |
| Proxy                    | Inspect the active proxy configuration for large authenticated streaming PUT requests; use the [upload hooks](README.md#proxy-upload-hooks).                                    |
| Recovery                 | Keep a consistent database/media backup and the previous image digest and worker commit available.                                                                              |

Do not use an account session, phone access key, X credential or AI-provider key
as the machine token. Never place the token in a URL or an FFmpeg argument.

This is a native macOS service because VideoToolbox and optional CoreML are
macOS frameworks. Apple Container runs Linux containers in a virtual machine;
it is not the runtime used by this worker. The supplied launchd service runs
while its user is logged in and leaves sleep settings unchanged. Durable work
waits on the server while the Mac sleeps, logs out or loses connectivity.

Stop a foreground worker before installing its login service. Run only one
worker per cache directory. The installer captures absolute paths to the Node
binary, checkout and private environment file. Reinstall after moving the
checkout or changing Node's installed location; restart after editing the
environment file. A change in an interactive shell does not reconfigure an
already running launchd process.
To apply the `Standard` scheduling fix to an older installation, rerun
`deploy/mac/install.sh` from the updated checkout with the same private
environment-file path. Updating source or kickstarting the existing job does
not rewrite a persisted `Background` plist.

NAS file managers and archive tools can assign uploaded or extracted files to
their own user. Before maintenance imports, verify that the container's ordinary
application UID can read the new files and write the intended destination.
An `EACCES` failure can be an ownership mismatch even when the NAS file manager
can open the same file. Correct only the newly introduced files using the
application's actual UID and required modes. Avoid recursive permission changes
across an existing library or running the application permanently as root.

## Prove the processing path with a small batch

Use a few non-sensitive test saves you control. Include a text-only save, a
photo, a video longer than one indexing segment, and a non-H.264 video with audio
when compatibility conversion is enabled. Give the long video a distinctive
visual event near its ending. Retain the original fixtures outside the worker
scratch directory so they remain available for comparison.

Use a fresh fixture when proving conversion. An existing library may already
contain H.264 media, so successful inference of those saves does not exercise
the conversion queue or large HTTPS uploads. A deliberately non-H.264 fixture
with audio and distinct beginning/middle/ending scenes can exercise both paths.
Pending canary segments can yield to other queued saves; do not label the whole
video understood until all its segments have finished.

Run the worker in the foreground first, then check each part of the path:

| Check                              | Evidence to collect                                                                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Machine authentication and leasing | The worker claims real work through the deployed HTTPS origin without authentication/model mismatch errors. Starting a process or receiving an empty queue response alone does not prove processing.                                             |
| Text and image inference           | Both saves finish understanding and can be found with a relevant description. Record failed counts as well as completed counts.                                                                                                                  |
| Full-video coverage                | Video progress advances through multiple segments and reaches completion; a query about the distinctive ending retrieves that save. The level samples the duration, so it does not guarantee recognition of every event.                         |
| Result acknowledgement             | Server-side progress remains complete after refreshing or restarting the worker; repeating the same job is not required to make its result visible.                                                                                              |
| Conversion                         | The converted save becomes playable in the intended browser/phone, including its ending and audio. Compare duration and dimensions with the source; an upload log alone is not proof of promotion.                                               |
| Original safety                    | Conversion failures leave the retained NAS source available. A successfully promoted compatibility copy is re-encoded H.264, not a byte-identical archive.                                                                                       |
| Local cleanup                      | After final acknowledgement, that job's downloaded Mac original is gone. Frame directories disappear after each segment and conversion output disappears after its upload attempt. An unfinished video may retain its original between segments. |
| Shared responsiveness              | Search and playback remain usable during inference/conversion, and other NAS services remain responsive. Check both machines' memory pressure, CPU and available disk.                                                                           |

Use the signed-in understanding view and server/worker logs together. The
authenticated `/api/understanding/status` response can help distinguish queued,
current and failed work; it is scoped to that account. A completed counter can
include an unsuccessful result, so inspect failures and actual search behavior.
Avoid copying private save URLs, tokens or media details into public diagnostics.

Check cleanup inside the configured scratch root, not the reusable model cache.
An incomplete video can retain a cached source until it resumes or expires.
Crash leftovers are removed by startup/periodic cleanup and may be evicted
earlier to enforce the scratch budget. Model weights intentionally survive jobs.
The worker does not provide automatic log rotation; include its log directory
in the host's maintenance policy.

Once the foreground checks pass, install launchd and repeat a small real job.
Check that a brief worker stop leaves progress durable and that work resumes
after restarting. Do not test recovery by stopping unrelated host services.

## Tune for responsiveness

Measure on the Mac that will run the service. CPU count or CoreML availability
alone cannot establish the fastest useful configuration. Compare two and four
`SEMANTIC_THREADS` with the same model, indexing level, image and representative
video-frame batch, one worker at a time. Separate initial model loading or
CoreML compilation from warm inference measurements, and repeat warm runs.

Record elapsed processing time, peak worker/model-process memory, system memory
pressure and swap activity, plus interactive search/playback latency. Include
ordinary host workloads in the decision. Select the setting that sustains useful
throughput while both machines stay responsive; more threads can make a shared
machine slower. Include compressed memory and page-in activity, rather than
using resident memory alone: a low RSS can hide a much larger compressed process
footprint and repeated decompression/page faults. Activity Monitor or `top` can
show process memory and compressed memory alongside system pressure. Process
footprint totals are not interchangeable with physical RAM usage.

The installer uses `ProcessType=Standard` with `Nice=10`. launchd's `Background`
classification adds CPU/I/O resource policy and can make an installed service
much slower than a foreground process with the same thread count and nice value.
Compare the same warmed fixture sequentially if diagnosing a difference; keep
the live worker stopped during any separate inference benchmark. `Adaptive`
responds to XPC activity, so it is not a substitute for ordinary HTTP polling or
Node IPC. See Apple's [launchd process types](https://github.com/apple-oss-distributions/launchd/blob/main/man/launchd.plist.5)
and [Apple silicon scheduling guidance](https://developer.apple.com/documentation/apple-silicon/tuning-your-code-s-performance-for-apple-silicon/).
Neither nice priority nor a thread limit supplies a hard memory cap or an
automatic memory-pressure circuit breaker.

Keep CPU as the baseline. Test `SEMANTIC_DEVICE=coreml` only with memory headroom
and compare real end-to-end results. Provider availability does not establish
that every operator uses the GPU/Neural Engine or that inference is faster.
Compilation can increase system memory pressure. FFmpeg can also fall back to
software despite a successful exit, so distinguish advertised VideoToolbox
support from a verified hardware path when evaluating performance.

## Migrate existing work and increase load

Switching from local to remote processing does not require clearing saves or
accounts. Recreate the NAS service with the remote role and its dedicated token,
then start the matching worker. Existing retained media and durable queue work
remain on the server. Older whole-video embeddings are reprocessed for the
selected elastic profile as backfill discovers missing current results. Do not
truncate queue, embedding or lease tables to force this migration.

Before a large import, pause scheduled sync if needed and keep download
concurrency low. Resume with a small batch and watch processing, conversion,
upload space and shared-service responsiveness before increasing volume. X sync
can consume provider credits; a fresh import is not a necessary health check.

If the owner explicitly wants a fresh library, take a backup first and use
**Settings → Danger zone → Clear all data**. It removes saves, archive state,
sync history, manual channel/tag membership, preferences and queued phone saves,
while preserving the account and connected X credentials. Derived channel caches
and public tag-sharing configuration can remain. **Delete account** also removes
sign-in identities and credentials. Neither action is an indexing migration step.
Recheck sync preferences after clearing them before starting a controlled import.

Clearing an account does not promise deletion of shared retained originals,
download jobs, text/image embeddings or every shared processing queue entry.
Re-saving the same posts can reuse those assets and results, so a clear-and-sync
cycle is not a fresh-processing benchmark. Use an isolated disposable instance
for a fully cold test, or plan a deliberate administrative cache/media reset with
verified backups. Shared assets can serve other accounts; never purge them based
only on one account having no saves. Preserve account identities, connected OAuth
credentials and other users' data during any approved maintenance.

If the rollout fails, stop the worker and inspect the failed stage before
retrying. An authentication error requires matching tokens and the remote server
role; an upload rejection may originate in the proxy; a healthy web endpoint
does not eliminate model or conversion failures. Preserve originals and durable
progress while diagnosing. Check database migration compatibility and backup
recovery before rolling the NAS image back; using an old image against a newer
database is not automatically safe.
