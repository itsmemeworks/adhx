# Dependency and media-tool maintenance

ADHX has three JavaScript lockfiles, Android runtime libraries, operating-system
packages, a Python downloader and native media/model libraries. A clean npm
audit covers only the packages sent to that audit.

## Automated checks

- `pnpm check:dependencies` audits both production and full dependency graphs
  for the application, browser extension and isolated pinned release-compatibility tools. Registry errors fail the check.
- The only temporary JavaScript exception is
  [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
  an unpatched `braces` stack-exhaustion issue used by build tooling. Only
  trusted repository glob patterns reach it. The exception never applies to
  production dependencies, expires on **19 November 2026**, and stops applying
  when the registry advertises a fixed version. No general severity waiver is
  used. Reassess exposure and remove the dependency or apply the upstream fix
  when available.
- Android exports its resolved runtime graph with
  `./gradlew exportRuntimeDependencies`. Run
  `node scripts/security/check-android.mjs apps/android/app/build/reports/runtime-dependencies.json`
  from the repository root to query those exact Maven versions against OSV.
  Missing/incomplete responses and known advisories fail the check. This
  covers runtime libraries, not arbitrary Gradle plugins or unreported flaws.
- Existing AMD64 and ARM64 image builds are scanned for fixable high/critical
  OS and library advisories before their smoke checks. Reports are retained as
  CI artifacts. Release publication also scans the actual digest for both
  architectures, including reused images, before promoting release/latest tags.
  Unfixed advisories still need operator review; passing this
  gate does not establish that an image has no vulnerabilities.
- Dependabot checks the root app, extension, Android, Docker base and Actions
  weekly. Minor/patch updates are grouped; major migrations need their own
  compatibility review.

## FFmpeg and downloader

The app uses `FFMPEG_PATH` when explicitly configured, otherwise `ffmpeg` on
PATH. It no longer relies on the old binaries downloaded by `ffmpeg-static`.
The Docker image uses Debian's maintained FFmpeg package, allowing OS scanner
and distribution security updates to track the installed binary. Rebuild the
image to pick up distribution updates; recreating an unchanged image is not an
update.

On macOS, install FFmpeg through a trusted maintained package manager, record
`ffmpeg -version`, and set the absolute path in the private worker environment.
The worker installer checks that executable and captures it for launchd. Its
`--check` mode validates prerequisites without installing/restarting a service.
Keep original media and test frame extraction, audio and H.264 conversion after
updating FFmpeg. Distribution security backports can make an older upstream
version secure; use its advisory status as well as its displayed version.

The image separately pins yt-dlp in `Dockerfile`; check its upstream stable
release and extractor compatibility when cutting a release. Python packages
and native ONNX/media dependencies are also part of the image scan. npm version
numbers do not establish their security or compatibility.

## Review scope

The October 2026 refresh updates compatible app/extension dependencies and the
Android library/toolchain set. Major migrations such as Tailwind, TypeScript,
ESLint and the test runner remain separate work; adding them to a feature
integration without migration-specific testing is not a maintenance strategy.
See [upgrade rehearsal](upgrade-rehearsal.md),
[processing load and recovery](processing-load-recovery.md)
and [physical phone checks](phone-device-acceptance.md) before distribution.
