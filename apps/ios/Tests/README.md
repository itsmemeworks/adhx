# iPhone regression checks

Small, fast checks of the iPhone app's models and logic. Each suite is a plain
Swift program: `swiftc` compiles it with only the source files it needs, and
running it prints a pass line or stops at the first failed check. No
simulator, Xcode project or test framework is involved, so a suite builds and
runs in seconds.

## Quick start

From the repository root, on a Mac with Xcode (or its command line tools):

```sh
swiftc apps/ios/Shared/API.swift apps/ios/Shared/FriendsAPI.swift \
  apps/ios/Shared/LiveQueue.swift apps/ios/Tests/LiveReliabilityTests.swift \
  -o /tmp/adhx-live-tests
/tmp/adhx-live-tests
# iOS live reliability: 9 assertions passed
```

Swap in any suite from the table below. A non-zero exit means a check failed;
the output says which one.

## The suites

CI (`.github/workflows/native.yml`) runs **Live reliability**, **Live updates** and **Queued
privacy**, plus **Reaction connections**, **Playback recovery**, **Feed seen sessions**, **Watch tally** and **Sideload group**, on every PR that touches the apps, then builds the app for the
simulator. Run the rest by hand when you change what they cover.

| Suite                | What it checks                                                                                                                           | Files to compile (all under `apps/ios/`), plus `Tests/<Suite>.swift`                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live reliability     | Compact saver and privacy updates, explicit removals, keeping the playing post, the 200-post cache bound, 40-code-point message clipping | `Shared/API.swift Shared/FriendsAPI.swift Shared/LiveQueue.swift`                                                                                                                 |
| Live updates         | Bounded SSE framing, burst coalescing, serial refreshes, reconnect recovery, fallback, cancellation and quiet account changes            | `Shared/API.swift Shared/FriendsAPI.swift Shared/LiveUpdates.swift`                                                                                                               |
| Queued privacy       | Restoring a queued privacy choice, intent versions, history written by app and extension at once, keeping unfinished entries             | `-D ADHX_HISTORY_TEST Shared/API.swift Shared/FriendsAPI.swift Shared/Network.swift Shared/NetworkPaths.swift Shared/SVGPath.swift Shared/ResumeStore.swift Shared/Storage.swift` |
| Pairing delivery     | Consistent client/queue capture, late success/401, and conditional sign-out using an isolated URLProtocol transport                      | `-D ADHX_HISTORY_TEST Shared/API.swift Shared/FriendsAPI.swift Shared/Network.swift Shared/NetworkPaths.swift Shared/SVGPath.swift Shared/ResumeStore.swift Shared/Storage.swift` |
| Sideload group       | Finding the App Group after SideStore or AltStore rename it, reading groups out of a provisioning profile                                | `-D ADHX_HISTORY_TEST Shared/API.swift Shared/FriendsAPI.swift Shared/Network.swift Shared/NetworkPaths.swift Shared/SVGPath.swift Shared/ResumeStore.swift Shared/Storage.swift` |
| Friends parity       | Feed weights, a channel's new marks and notes, Live's busy line, forming groups                                                          | `Shared/API.swift Shared/FriendsAPI.swift`                                                                                                                                        |
| Board features       | Sending straight to your people, the sent reason, forming faces and alerts, the like thumbnail, keeping a group channel                  | `Shared/API.swift Shared/FriendsAPI.swift`                                                                                                                                        |
| Decouple             | Your picture's answers and the crop sums, invites, email sign-in codes, the reactions feed, the share card opening the app               | `Shared/API.swift Shared/FriendsAPI.swift Shared/AccountAPI.swift App/Settings/AvatarCrop.swift`                                                                                  |
| Post reactions       | Reactions on any post (`GET /api/app/reactions`)                                                                                         | `Shared/API.swift Shared/FriendsAPI.swift`                                                                                                                                        |
| Reaction connections | Production replay model: server/credential changes, failed refresh, late old responses and reconnect invalidation                        | `App/Library/PostReactionsModel.swift`                                                                                                                                            |
| Post people          | Production people model rejects late post/account responses, cancellation and reconnects                                                 | `App/Library/PostPeopleModel.swift`                                                                                                                                               |
| Playback recovery    | Scoped/bounded resume history, rejected late writes, renewed/cancelled loading deadlines and Reply pause restoration                     | `Shared/ResumeStore.swift App/Library/PlaybackRecovery.swift`                                                                                                                     |
| Feed seen sessions   | Fresh sends of watched posts are acknowledged again and update the lineup badge                                                          | `App/Feed/FeedModel.swift`                                                                                                                                                        |
| Watch tally          | Watch counts: plays from the top, finishes, loops, resume and seeks not counted, batches keeping fractions of a second                   | `App/Library/WatchTally.swift`                                                                                                                                                    |
| Server addresses     | What you type becomes the server: https or local http, IPv6 in brackets, the shown address typed back                                    | `Shared/API.swift Shared/FriendsAPI.swift`                                                                                                                                        |
| Player polish        | The 10-second photo timer, and links in captions shown short and tappable                                                                | `App/Library/PhotoTimer.swift App/Library/LinkedText.swift`                                                                                                                       |

For example, the queued privacy suite:

```sh
swiftc -D ADHX_HISTORY_TEST apps/ios/Shared/API.swift apps/ios/Shared/FriendsAPI.swift \
  apps/ios/Shared/Network.swift apps/ios/Shared/NetworkPaths.swift apps/ios/Shared/SVGPath.swift \
  apps/ios/Shared/ResumeStore.swift apps/ios/Shared/Storage.swift apps/ios/Tests/QueuedPrivacyTests.swift -o /tmp/adhx-privacy-tests
/tmp/adhx-privacy-tests
```

To run everything in one go:

```sh
I=apps/ios
t() { name=$1; shift; swiftc "$@" -o "/tmp/adhx-$name" && "/tmp/adhx-$name" || echo "FAILED: $name"; }
t live     $I/Shared/API.swift $I/Shared/FriendsAPI.swift $I/Shared/LiveQueue.swift $I/Tests/LiveReliabilityTests.swift
t privacy  -D ADHX_HISTORY_TEST $I/Shared/API.swift $I/Shared/FriendsAPI.swift $I/Shared/Network.swift \
           $I/Shared/NetworkPaths.swift $I/Shared/SVGPath.swift $I/Shared/ResumeStore.swift $I/Shared/Storage.swift $I/Tests/QueuedPrivacyTests.swift
t pairing  -D ADHX_HISTORY_TEST $I/Shared/API.swift $I/Shared/FriendsAPI.swift $I/Shared/Network.swift \
           $I/Shared/NetworkPaths.swift $I/Shared/SVGPath.swift $I/Shared/ResumeStore.swift $I/Shared/Storage.swift $I/Tests/PairingDeliveryTests.swift
t parity   $I/Shared/API.swift $I/Shared/FriendsAPI.swift $I/Tests/FriendsParityTests.swift
t board    $I/Shared/API.swift $I/Shared/FriendsAPI.swift $I/Tests/BoardFeaturesTests.swift
t decouple $I/Shared/API.swift $I/Shared/FriendsAPI.swift $I/Shared/AccountAPI.swift \
           $I/App/Settings/AvatarCrop.swift $I/Tests/DecoupleTests.swift
t connections $I/App/Library/PostReactionsModel.swift $I/Tests/ReactionConnectionTests.swift
t people $I/App/Library/PostPeopleModel.swift $I/Tests/PostPeopleTests.swift
t reactions $I/Shared/API.swift $I/Shared/FriendsAPI.swift $I/Tests/PostReactionsTests.swift
t recovery $I/Shared/ResumeStore.swift $I/App/Library/PlaybackRecovery.swift $I/Tests/PlaybackRecoveryTests.swift
t seen $I/App/Feed/FeedModel.swift $I/Tests/FeedSeenSessionTests.swift
t watch    $I/App/Library/WatchTally.swift $I/Tests/WatchTallyTests.swift
t address  $I/Shared/API.swift $I/Shared/FriendsAPI.swift $I/Tests/ServerAddressTests.swift
t polish   $I/App/Library/PhotoTimer.swift $I/App/Library/LinkedText.swift $I/Tests/PlayerPolishTests.swift
```

**Adding a suite?** Put the exact `swiftc` line in a comment at the top of the
file (the existing ones do), add a row here, and add it to `native.yml` if it
guards something that must never regress.

### Matching checks elsewhere

- Android's matching JVM tests (for example `LiveReliabilityTest`,
  `PostReactionsTest`, `WithoutWebModelsTest`) run with the app's normal
  `./gradlew testDebugUnitTest`; see [the Android README](../../android/README.md#dependency-and-storage-checks).
- The server's `moments/live-names.test.ts` covers phone presence leases,
  credential revocation, multi-device deduplication, a quiet SSE room's expiry
  update, bounded request bodies and compact metadata for an older cached post
  outside the latest 60.

## Interactive acceptance pass

These checks need real devices and a person. Use a disposable development
instance and separate test accounts. Builds and model tests don't establish a
real-device visual or accessibility pass. The full device matrix is in
[Phone acceptance checks](../../../docs/rollout/phone-device-acceptance.md).

- **Sizes and text**: on a small phone and a large phone or tablet, open
  Live, tune in, rotate, then use the largest accessibility text size. Names,
  leave controls and reaction actions must stay reachable. Reaction choices
  scroll rather than overflow.
- **Failed reactions**: open the reaction keyboard and type a message with
  emoji. Reject the send or disconnect the server. The text stays, no success
  bubble appears, and Retry sends to the original post even if playback
  advanced. Only a successful acknowledgement clears the draft. The picker
  can scroll above the keyboard with large text.
- **Presence**: join the same room on a phone and a web tab with one account,
  plus a second account on another device. Each account counts once. Closing
  one screen doesn't remove its other screen. Background the last phone: it
  sends leave; if that request is lost, it disappears after the short lease
  expires. Check a quiet web room as well as a busy one.
- **Interruptions**: interrupt the first room load. The phone shows an
  actionable retry. Resume after a network drop. No duplicate poll loop or
  duplicate reactions appear. Revoke the phone key and check the room stops
  naming it.
- **Busy rooms**: keep an older post playing while more than 60 newer saves
  arrive. Make one saver private from another device, then remove or moderate
  a different post. Saver names and the owner's privacy lock refresh, only
  ineligible posts disappear, and unrelated playback doesn't jump or restart.
- **Assistive tech**: with VoiceOver and Reduce Motion on, controls have
  useful names, a send failure is announced, focus stays usable, and
  reactions fade without forced movement.

Record device and OS, text size, network conditions and what you actually saw.
If a simulator can't display or boot, report that gap rather than calling a
build a visual pass. Never use production keys or a household library here.

Watch delivery regression: compile `App/Library/WatchTally.swift`,
`App/Library/WatchCounts.swift` and `Tests/WatchDeliveryTests.swift` together.
It uses isolated defaults and a fake transport to check persisted request IDs,
restart recovery and connection changes; no live server or account is used.
