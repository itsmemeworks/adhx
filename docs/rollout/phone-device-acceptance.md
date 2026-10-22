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
| P13 | On the web, request sign-in in Safari/Chrome and accept in the same browser; test an expired, reused and previewed link.                                                      | Successful sign-in persists; previews do not consume a link; failures have understandable recovery.                                                                                                                    |
| P14 | Try the unapproved account and a revoked phone pairing.                                                                                                                       | Member-only names, search, avatars, queues and reactions remain inaccessible.                                                                                                                                          |
| P15 | In the app, Sign in with email: a correct code, a wrong code five times, an expired code, a second code within a minute, and a server without email.                          | The right code connects; wrong, burned, expired and too-soon codes each say what to do; a server without email points to the pairing code. Autofill from Mail/the keyboard works.                                      |
| P16 | Remove this phone online, then again with the server unreachable.                                                                                                             | Online, the key stops working on the server and the phone leaves Settings → Phone app. Offline, the phone forgets the key and says it may still be listed there.                                                       |
| P17 | Change picture: choose a photo, take a selfie, crop with pan and pinch, pick a Gob face, use the X photo (with and without one) and remove it.                                | Every "you" face (Settings, savers, reactions, Live) changes at once; errors are plain; HEIC photos arrive as JPEG.                                                                                                    |
| P18 | Invite someone: make a link, share it, Share again, revoke; repeat as a member when only admins may invite.                                                                   | Only the newest link works; a revoked link stops working; a member without `canInvite` is told only the admin can invite.                                                                                              |
| P19 | React on a post outside Live, fail one send, then come back to a post with reactions and open the Reactions feed.                                                             | Your reaction floats once with your face; a failed one is taken back with a retryable message; saved reactions replay on arrival; the Reactions feed plays every post with reactions.                                  |
| P20 | Tap the network mark on a video, a photo, a long text post and an X article; Open on the network and Copy link.                                                               | The original-post sheet shows the poster and the words in full; both actions work; the phone stays upright while the sheet is open.                                                                                    |
| P21 | Rotate while a video plays, while a sheet or the React picker is open, and on Settings and search.                                                                            | Only full-screen media turns sideways; everything else stays upright and turns back when a sheet opens.                                                                                                                |
| P22 | Open Settings on a release build and on a development build.                                                                                                                  | The version line reads the release (`2.4.0`) on a release build and `version +N · sha` otherwise.                                                                                                                      |

For the [Live streaming transport](../realtime.md), also record request traces
on an isolated server: idle foreground rooms must not fetch detail every five
seconds while SSE is healthy; a burst must produce serial, coalesced snapshots.
Switch Wi-Fi/cellular, enable airplane mode and restore connectivity, then
background/foreground and switch accounts. Missed saves and watcher names must
recover without jumping playback; old-account responses must be ignored.
Hidden screens must release streams, and a silently disconnected watcher must
expire after the bounded stream lifetime and reconnect grace. Repeat against
an older server without notification streams to check REST fallback.

A failed row needs a reproducible issue and a rerun after the fix. Record
physical-device results separately from automated checks in
[friends-feed verification](friends-feed-verification.md).
