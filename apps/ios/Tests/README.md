# Native live regression checks

The small live-queue suite runs against the actual Foundation models without
starting a simulator. From the repository root:

```sh
swiftc apps/ios/Shared/API.swift apps/ios/Shared/FriendsAPI.swift \
  apps/ios/Shared/LiveQueue.swift apps/ios/Tests/LiveReliabilityTests.swift \
  -o /tmp/adhx-live-tests
/tmp/adhx-live-tests
```

The friends-feed parity suite (weights, channel new marks and notes, Live's
busy line and forming groups) runs the same way:

```sh
swiftc apps/ios/Shared/API.swift apps/ios/Shared/FriendsAPI.swift \
  apps/ios/Tests/FriendsParityTests.swift -o /tmp/adhx-friends-parity-tests
/tmp/adhx-friends-parity-tests
```

The board-features suite (send straight to your people, the sent reason,
forming faces and alerts, the like thumbnail, keeping a group channel) runs
the same way:

```sh
swiftc apps/ios/Shared/API.swift apps/ios/Shared/FriendsAPI.swift \
  apps/ios/Tests/BoardFeaturesTests.swift -o /tmp/adhx-board-features-tests
/tmp/adhx-board-features-tests
```

The live suite checks compact saver/privacy updates, explicit removals, preserving the playing
post and older cached posts, the 200-post cache bound, compatible decoding, and
40-code-point message clipping without splitting emoji.

Android's matching JVM/API tests are `LiveReliabilityTest`; run the app's normal
`testDebugUnitTest` task. The server's `moments/live-names.test.ts` covers phone
presence leases, credential revocation, multi-device deduplication, a quiet SSE
room's expiry update, bounded request bodies and compact metadata for an older
cached post outside the latest 60.

## Interactive acceptance pass

Use a disposable development instance and separate test accounts. Builds and
model tests do not establish a real-device visual or accessibility pass.

- Small phone and large phone/tablet: open Live, tune in, rotate, then use the
  largest accessibility text size. Names, leave controls and reaction actions
  must remain reachable. Reaction choices scroll rather than overflowing.
- Open the reaction keyboard. Type a message containing emoji. Reject the send
  or disconnect the server. The text stays, no success bubble appears, and
  Retry sends to the original post even if playback advances. Only a successful
  acknowledgement clears the draft. Confirm the picker can scroll above the
  keyboard with large text.
- Join the same room on a phone and a web tab using one account, plus a second
  account on another device. Each account counts once. Closing one screen does
  not remove its other screen. Background the last phone: it sends leave; if
  that request is lost, it disappears after the short lease expires. Check a
  quiet web room as well as one receiving reactions.
- Interrupt the initial room load. The phone shows an actionable retry. Resume
  after a network interruption. No duplicate poll loop or duplicate reactions
  should appear. Revoke the phone key and verify the room stops naming it.
- Keep an older post playing while more than 60 newer saves arrive. Make one
  saver private from another device, then remove or moderate a different post.
  Saver names and the owner's privacy lock refresh, only ineligible posts
  disappear, and unrelated playback does not jump or restart.
- With VoiceOver/TalkBack and Reduce Motion enabled, confirm controls have
  useful names, send failure is announced, focus stays usable, and reactions
  fade without forced movement. Live reactions are temporary room feedback,
  not saved chat history.

Record device/OS, text size, network conditions and actual observations. If a
simulator cannot display or boot, report that gap rather than calling a build a
visual pass. Never use production keys or a household library for these checks.
