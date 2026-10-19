# Self-hosted release readiness

Checked 19 October 2026 at `fe03221`. This is a release record, not a claim
that the branch is deployed or that passing unit tests establishes safety.

## Outstanding before installation or public release

1. **Dependency updates and triage.** `pnpm audit --prod --json` reported 14
   advisories: one critical, six high, six moderate and one low. The lockfile
   contains Next.js 16.3.3, within the affected range of
   [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)
   and other Next.js advisories. The critical issue requires particular
   attacker-controlled SVG inputs to Node ImageResponse; package presence is
   not proof of exploitation in this app. Update to a patched compatible Next
   release and patch the affected sharp, source-map-js, fast-uri,
   brace-expansion and engine.io dependency paths, then repeat the audit and
   relevant builds/tests. Some paths come from the react-email tooling bundled
   as a production dependency; assess whether the renderer can be packaged
   without its development server. No dependency versions changed in this audit.
2. **Keyword-only indexing.** `noteSaved` returns early when semantic search is
   disabled, and keyword entries are currently written by the understanding
   worker. A new save with `SEMANTIC_SEARCH=off` therefore has no keyword entry
   unless it was indexed earlier. Reproduced against a migrated synthetic database
   in production mode: the fresh save was absent from keyword results until an
   FTS entry was explicitly written. Separate cheap text indexing from model
   inference and cover fresh/existing saves and account isolation in tests.
3. **Actual Linux container and hardware checks.** Build the intended fixed
   revision for linux/arm64 and linux/amd64. Test migrations, model loading,
   representative video/image downloads, seek playback, restart recovery and
   memory/CPU use on the target. Select a pinned image digest after validation.
   The published latest image inspected earlier predates this branch.
4. **Physical phones and distribution.** Simulator/emulator evidence exists;
   verify signed physical-device sharing, background retries and picture in
   picture. Publish usable phone download links before advertising them as
   available releases.
5. **Website cutover.** The replacement static product site is in `site/` and
   builds independently. On 19 October the public domain still served the old
   Fly-backed application. The Pages workflow runs from main/manual dispatch;
   configure Pages, plan the legacy service/data transition and change DNS
   separately. Do not imply an unmerged PR has updated the public domain.

## Quality assessment

The code has useful boundaries for authentication, download queues, retained
files and model processes, and broad automated coverage. The fixes at fe03221
passed 2,843 tests, production web and iOS simulator builds, type checking and
formatting; lint had no errors and 79 warnings. A temporary production server
also checked migrations, retained saves, authentication and byte ranges.

Maintainability still needs work: the theater component exceeds 1,700 lines,
the migration runner exceeds 1,000, and network definitions are copied between
clients/site/server. Prefer smaller modules, explicit shared contracts and
cross-client contract checks as the product stabilises. Add a PR gate for the
static website build and a dependency audit gate after the present advisory
backlog is resolved. These are follow-ups, not reasons to rewrite working code
before a small private trial.
