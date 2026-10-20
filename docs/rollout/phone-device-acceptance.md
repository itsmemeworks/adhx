# Phone acceptance checks

Run this checklist before distributing a native build. No physical phone was
available for the 19 October 2026 review; the owner requested preparation of
these checks. A passing build, browser emulation or a JVM test does not mark a
physical-device check as passed.

## Prepare an isolated test

Use spare devices, an isolated ADHX database and synthetic media. Keep existing
phone installations, household accounts and the production queue out of this
test. Record the server source commit, app source commit/build, phone model,
OS version and network for each run. Use two approved test accounts, A and B,
and one unapproved account. Pair only with the isolated server.

Follow [iPhone build instructions](../../apps/ios/README.md) and
[Android build instructions](../../apps/android/README.md). Check signing and
bundle/application identifiers before installing on a spare device. Do not
replace an owner's daily-use installation with an unsigned or development
build. The test server must be reachable by the phones over a trusted HTTPS
connection; no public exposure or changes to a household access policy are
needed.

Prepare these synthetic fixtures:

- A short portrait video with speech, a landscape video, a long video with a
  visibly different ending, a photo with text and a plain article.
- Shared and private saves owned by both accounts, plus a post saved by both.
- Pending, working, failed and complete processing rows; a controllable offline
  connection; two foreground viewers and a web viewer.
- An existing paired Android installation from before the Keystore migration
  for the upgrade case. Keep that test installation's credentials until the
  migration has been verified.

## Record results

For each row record **Pass**, **Fail**, or **Not run**, the device/build and a
short observation. Capture screenshots or a screen recording when useful, but
remove account details, pairing codes, sign-in links and tokens before sharing.
All rows below currently require device execution.

| ID  | Action                                                                                                                                                                        | Expected result                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01 | Pair A, restart the app, search, play and save. Repeat after an app update.                                                                                                   | Account and pairing survive. Existing saves and privacy are unchanged.                                                                                                                                                 |
| P02 | Share each fixture while online, then offline. Close the share sheet immediately and reopen the app.                                                                          | Sharing returns promptly. One durable queued save appears and completes after reconnection.                                                                                                                            |
| P03 | Repeat P02, terminating the app after enqueue, after server acceptance and before acknowledgement.                                                                            | Receipt resumes without a duplicate. The chosen private/shared intent survives.                                                                                                                                        |
| P04 | Lose a privacy acknowledgement response; change privacy on the web; retry the old acknowledgement.                                                                            | The accepted old intent cannot undo the newer web choice.                                                                                                                                                              |
| P05 | On Android upgrade a paired legacy installation. Restart, rotate its key and disconnect. Repeat with a deliberately unavailable test Keystore and failed test storage writes. | Successful migration keeps pairing. Failed persistence preserves recoverable legacy data, shows an actionable error and never silently opens another account's history. Disconnect remains disconnected after restart. |
| P06 | Switch A to B on the same test server; fail cleanup/persistence in the test build.                                                                                            | A's history, defaults, drafts and queued work never appear or send as B.                                                                                                                                               |
| P07 | Watch together from iPhone, Android and web. Use A on two devices, then background, close, disconnect or revoke a phone key.                                                  | A counts once. Foreground presence updates; stale phone presence expires. Revoked access cannot receive names or reactions.                                                                                            |
| P08 | Change saver privacy, hide the currently playing post and add enough new posts to move an older post outside the newest batch.                                                | Saver names refresh, explicit removals apply and eligible older items remain. Playback identity does not jump unexpectedly.                                                                                            |
| P09 | Send emoji and 40-character Unicode text; fail the request, advance playback and retry.                                                                                       | Sending/failure/Retry are clear. The draft stays with its original post. It appears once after acknowledgement. Live reactions are ephemeral, not durable chat.                                                        |
| P10 | Open the keyboard at the smallest supported phone width, portrait and short landscape; repeat on a tablet and with large text.                                                | Every action remains reachable, scrolls above the keyboard and respects safe areas. No picker, Retry or close action is hidden.                                                                                        |
| P11 | Enable VoiceOver/TalkBack, reduced motion and large text. Traverse privacy, player, progress and reaction controls.                                                           | Labels describe purpose and state; focus order is useful; errors are announced; controls do not rely only on colour or motion.                                                                                         |
| P12 | Seek and resume near the end of the long video, switch networks, interrupt the worker and retry a failed item.                                                                | Playback remains usable, progress distinguishes stale/error state and queued recovery completes. Ending content becomes searchable once learned.                                                                       |
| P13 | Request sign-in in Safari/Chrome and accept in the same browser; test an expired, reused and previewed link.                                                                  | Successful sign-in persists; previews do not consume a link; failures have understandable recovery.                                                                                                                    |
| P14 | Try the unapproved account and a revoked phone pairing.                                                                                                                       | Member-only names, search, avatars, queues and reactions remain inaccessible.                                                                                                                                          |

A failed row needs a reproducible issue and a rerun after the fix. Record
physical-device results separately from automated checks in
[friends-feed verification](friends-feed-verification.md).
