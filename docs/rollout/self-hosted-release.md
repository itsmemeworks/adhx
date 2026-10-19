# Self-hosted release readiness

Updated 19 October 2026. Merge validation, a private server trial and public
product distribution have different requirements. Nothing in this record means
a service has been installed or the public website has been replaced.

## Fixes included in this PR

- **Production dependencies:** Next.js/eslint-config-next 16.3.8, Vitest 4.1.12
  and compatible transitive patches replace the affected versions. The local
  production audit reports **zero advisories**, down from fourteen. A dedicated
  CI gate rejects new production advisories at every severity. Frozen-lockfile
  installation passes.
- **Independent keyword indexing:** every save notifies a model-free text index.
  Web startup catches up missing entries, including posts with no embeddings.
  `SEMANTIC_SEARCH=off` stops model workers while keyword search continues for
  new and existing saves. Regression tests use production flags and verify
  account/platform isolation, private metadata exclusion, moderation, startup
  recovery and that no model child starts.
- **Reproducible setup:** the quick start keeps configuration and a stable secret
  in a private `.env` and explicitly builds/selects the source image. It does not
  silently test an older published `latest`. Root and NAS proxy examples remain
  vendor-neutral.
- **Honest phone links:** default install links lead to build instructions until
  signed releases exist. Custom public links are build-time Docker arguments.
  The committed Android wrapper and paid iOS App Group requirement are documented.
- **Build fonts:** the app and site bundle local fonts with their licences and
  pinned upstream provenance. Builds no longer depend on Google's changing font
  response format, which exposed a Next.js Turbopack parser bug during this audit.
- **Website separation:** PR CI builds the static site without publishing it.
  Pages publication is manual, so merging app changes cannot replace the legacy
  hosted service accidentally.

## Required merge checks

Use the checks on the current PR revision, rather than results from an earlier
commit. They cover the production web build, types/lint/format, unit and browser
suites, both extension targets, static website build and production dependency
audit.

The native Linux container matrix runs on AMD64 and ARM64. It checks the assembled
non-root image, SQLite migrations/integrity, native ONNX bindings, synthetic
VP9-to-H.264 conversion, image/video frame processing, the actual yt-dlp wrapper,
anonymous API rejection, media byte ranges and persisted data after container
recreation. The `validate-models` PR label enables real pinned text/image/video
CPU inference and prints elapsed time and peak process RSS. Use it when changing
the inference pipeline, model dependencies or container runtime. Require both
native jobs on the current revision before recommending merge. The required
`build` status depends on these native builds, avoiding a third app compilation.
Release PRs use validated version/changelog checks; see [the release flow](../releasing.md).

To repeat full container checks locally after building the selected revision:

```sh
IMAGE_TAG=adhx:local bash scripts/container-smoke.sh --models
```

This uses temporary containers and synthetic data and removes its named volume
on completion. It does not install an application service. Standard container
checks can omit `--models`; the model check downloads the pinned weights.

## Recorded Linux validation

[CI run 39218434002](https://github.com/itsmemeworks/adhx/actions/runs/39218434002)
passed all checks for `da361e3`, including both native Linux container/model jobs.
The ARM64 synthetic text/image/video model process reported about 1.31 GB peak
RSS and 35.8 seconds including loading; AMD64 reported about 1.17 GB and 22.3
seconds. These are short synthetic checks on hosted runners, not total server
memory, long-video throughput or measurements of a particular NAS. The later
font fix must also pass the current-revision CI checks before merge.

## Before a private server trial

After merging, choose the immutable `sha-<full-commit>` image published for that
main revision, or its numbered release image, and pin the digest. Verify its
source and platform rather than assuming `latest` includes a particular PR.
Main publication no longer waits for a release PR; numbered release promotion
reuses that source image. See [publishing recovery](../releasing.md#recovery).

Inspect the target's current memory, CPU, disk capacity and proxy network. Keep
its specific paths, hostnames, accounts and credentials outside this repository.
Use a new private data folder, a stable secret, explicit invites and the existing
HTTPS access boundary. Start with one download and one inference thread and a
small library. Check representative real-network downloads (including a longer
high-resolution video), inference and conversion alongside the host's existing
services before enabling broad backfill. Synthetic hosted CI is not a throughput
or memory guarantee for a particular NAS.

Then verify sign-in, save/search/play/seek, account isolation, restart/retry
recovery and backup/restore at the final HTTPS address. These checks necessarily
follow a separately authorised trial installation; they cannot be truthfully
marked done beforehand. The browser works without native app distribution.

## Before broader phone or public website release

Physical-device testing is still required for signed iOS App Group/Keychain
sharing, Android release signing, background retries, picture-in-picture and
media export. Follow the device checklists in the platform READMEs. Simulator
and emulator builds are not evidence of those behaviours. Publish real signed
APK/TestFlight links only after verifying them. These distribution tasks do not
block a private browser-based server trial.

The replacement site in `site/` builds independently. On 19 October the public
domain still served the old Fly-backed application. Plan the existing service
and data transition, configure Pages, deliberately publish and change DNS
separately. This is not required to install a private self-hosted instance.

## Remaining maintenance

The full dependency audit still reports two development-tool findings:

- [braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
  high, with no patched release available at this check.
- [postcss-selector-parser CPU exhaustion](https://github.com/advisories/GHSA-rj75-hqrm-r3gf),
  moderate, under Tailwind 3; its patch requires a major parser change.

These paths consume repository glob/CSS inputs during lint/build/watch and are
absent from the production audit. Do not suppress them or force untested major
overrides. Track upstream fixes and validate a separate tooling upgrade.

The code has useful account boundaries, durable queues and separate model
processes. Large theater/migration modules and copied network definitions still
need gradual maintenance and shared contract checks. They are not a reason to
rewrite the application before a small private trial.
