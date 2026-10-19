# Builds, images and releases

The repository has two image channels. Each merge to `main` publishes a commit
image, without waiting for a release PR. Release Please assigns numbered
versions and promotes the matching commit image when a release is created.
Publishing an image does not update an installed service or publish the website.

| Stage            | Work                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application PR   | Tests, lint/types/format, production audit, extension/site builds, browser tests and native AMD64/ARM64 runner-image smoke checks. The required `build` check depends on both native image builds; it does not compile the app again. |
| Release PR       | Validate the bot identity, repository/branch and actual three-file diff. Only package version, matching root manifest version and changelog changes are allowed. Changes to code, scripts or dependencies fail the required checks.   |
| Every main push  | Build/publish `sha-<full-commit>` for AMD64 and ARM64. Advance `main` only if this remains the main head. No repeated full application CI suite.                                                                                      |
| Numbered release | Reuse that source commit's image and apply the version tag. The latest stable release also gets major/minor and `latest` aliases. If its commit image is missing, build it once as recovery.                                          |

PR images are validation artifacts and are not published to GHCR. Protected main
requires build, format and test checks with an up-to-date base. Different source
revisions need separate images, including a release commit that changes the
application's version. Release promotion does not start a second build for the
same source revision. Existing BuildKit caches are reused.

## Why releases use an explicit publisher

Release Please uses `GITHUB_TOKEN`. GitHub suppresses most downstream workflow
events created with that token, so a release event alone is insufficient. The
release workflow calls the image workflow explicitly. A separately published
human release can also trigger it; per-commit concurrency and the immutable SHA
tag prevent duplicate builds. See [GitHub's event rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
and [Release Please's documentation](https://github.com/googleapis/release-please-action#other-actions-on-release-please-prs).

Main image publication is independent of Release Please succeeding or finding a
releasable commit. Release Please maintains its own PR branch; the owner merges the release PR.
It creates tags and release notes; it does not invoke the legacy Fly deployment. That workflow
and the Pages website remain explicit opt-in operations.

The trusted `workflow_run` metadata job reports the three branch-required check
names only after reading and validating the release PR's actual contents at its
immutable base/head revisions. It never checks out or executes the release PR's
code. These are metadata checks, not claims that the entire suite was rerun.
Feature PRs cannot bypass CI by choosing a release-like branch name.

## Tags and safe updates

- `sha-<40-character-commit>` identifies one source revision and is reused on
  retries. The OCI index records that revision.
- `main` follows the newest main commit whose image has finished publishing.
  An older run finishing later cannot deliberately move it backward.
- `2.1.3` identifies a numbered release and refuses replacement by a different
  digest. `2.1`, `2` and `latest` follow the latest stable GitHub release.
- Prereleases get their version tag without stable aliases.

For an installed service, verify the intended image's revision and platforms,
then pin its digest. Preserve the data mount, session secret, credentials and
canonical URL. Follow the [NAS update/backup guide](../deploy/nas/README.md#updates-backups-and-recovery).

## Recovery

Rerun a failed publishing job, or manually run **Publish container image** on
`main`. Leave `version` blank to recover the current main commit; enter `2.1.3`
(or `v2.1.3`) to resolve and recover that exact existing release tag. The tag must
match the package version and belong to main's history. A numbered release can
reuse an already-published SHA image; it never overwrites another release digest.
Old releases produced before SHA tags were introduced may need their original
workflow version to recover rather than replacing an existing numbered image.

If Release Please fails, fix the reported cause and rerun it. Do not fabricate a
tag from the newest manifest for an arbitrary older PR. Its normal action uses
[the manifest configuration](../release-please-config.json) and upstream default
title formatting. No PAT is required for this pipeline.
