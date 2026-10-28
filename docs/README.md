# ADHX documentation

Every doc in the repository, sorted by what you're trying to do. New here? Start with the [README](../README.md). Coding agent? Start with [AGENTS.md](../AGENTS.md).

## I want to run ADHX

| Doc                                                       | What's in it                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [README: Run your own](../README.md#run-your-own)         | A server up in five steps                                                                           |
| [Running your own ADHX](self-hosting.md)                  | Sign-in emails, who can join, every setting, disk space, the search models, backups, Fly.io, X sync |
| [Docker host and NAS guide](../deploy/nas/README.md)      | Storage, permissions, resource limits, HTTPS, updates and recovery                                  |
| [UGOS Pro walkthrough](../deploy/nas/ugreen.md)           | Installing on a UGREEN NAS through its Docker interface                                             |
| [Mac helper](../deploy/mac/README.md)                     | Moving video understanding and conversion to an Apple Silicon Mac                                   |
| [Checking the Mac helper](../deploy/mac/VERIFY.md)        | Proving the Mac helper is really doing the work                                                     |
| [Mac performance](mac-processing-performance.md)          | Measured numbers and memory tuning                                                                  |
| [How NAS and Mac processing work](remote-processing.md)   | The queues, the network boundary and the file lifecycle, with diagrams                              |
| [Image-aware channel curation](channel-image-curation.md) | An optional extra that sends public thumbnails to Jev, and exactly what it sends                    |
| [Privacy](../PRIVACY.md)                                  | What your server stores and who can see it                                                          |

## I want to use the apps

| Doc                                             | What's in it                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| [README: Phone apps](../README.md#phone-apps)   | Connecting and installing, in short                                |
| [Install the phone apps](install-phone-apps.md) | Android, TestFlight, AltStore PAL (EU) and SideStore, step by step |
| [iPhone app](../apps/ios/README.md)             | Building, signing, TestFlight and how the app is put together      |
| [Android app](../apps/android/README.md)        | Building, the signed release APK and how the app is put together   |
| [Browser extension](../extension/README.md)     | Save to ADHX from Chrome and other Chromium browsers               |
| [The adhx skill](../skills/adhx/SKILL.md)       | Letting Claude and other agents search your saves                  |

## I want to change ADHX

| Doc                                                     | What's in it                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| [CONTRIBUTING.md](../CONTRIBUTING.md)                   | Setup, tests, commit and pull request conventions                          |
| [ARCHITECTURE.md](../ARCHITECTURE.md)                   | How the pieces fit together, with diagrams                                 |
| [Live updates and presence](realtime.md)                | SSE transports, native packages, recovery and intentional polling          |
| [AGENTS.md](../AGENTS.md) and [CLAUDE.md](../CLAUDE.md) | The rules and the map for coding agents (humans welcome too)               |
| [Database performance](database-performance.md)         | Query families, indexes, synthetic growth audit and scaling limits         |
| [WORKLOG.md](WORKLOG.md)                                | What changed recently and why, newest first                                |
| [Releasing](releasing.md)                               | Release Please, container images, the Android APK and TestFlight           |
| [Design parity harness](../e2e/parity/README.md)        | Sample friends and posts for screenshots, design checks and the phone apps |
| [Translation safety](specs/translation-safety.md)       | Why browser translation can crash React, and the one rule that prevents it |
| [Brand](../brand/BRAND.md)                              | The Gob, colours and type                                                  |

### Specs

Specs describe how a part of ADHX is meant to work. Each says at the top whether it's current or history.

| Spec                                                                  | About                                               |
| --------------------------------------------------------------------- | --------------------------------------------------- |
| [Phone app](specs/phone-app.md)                                       | The phone apps and every `/api/app/*` route         |
| [Friends feed](specs/friends-feed.md)                                 | New, faces, notes, Just for me and the blend        |
| [Admin](specs/admin.md)                                               | The admin area                                      |
| [Links from any site](specs/any-site-links.md)                        | Saving links from networks beyond the main fourteen |
| [Theater first](specs/theater-first.md)                               | The full-screen player                              |
| [Discovery leaderboards](specs/discovery-leaderboards.md)             | Public channel rankings                             |
| [Launch UX](specs/launch-ux.md)                                       | First-run experience                                |
| [Unified theater and collection](specs/unified-theater-collection.md) | How Saved and the theater merged                    |

### Rollout checklists

For people shipping a release: [self-hosted release](rollout/self-hosted-release.md), [upgrade rehearsal](rollout/upgrade-rehearsal.md), [dependency maintenance](rollout/dependency-maintenance.md), [processing load and recovery](rollout/processing-load-recovery.md), [friends-feed verification](rollout/friends-feed-verification.md), [phone device acceptance](rollout/phone-device-acceptance.md) and the [new-look cutover](rollout/next-ui-cutover.md).
