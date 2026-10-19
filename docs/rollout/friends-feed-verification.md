# Friends-feed reliability checks

Run these checks against an isolated database and development server. They do
not require a NAS update, production keys, or a real social-media import.

## Automated gates

```sh
pnpm typecheck
pnpm exec vitest run --maxWorkers=3
pnpm lint
pnpm format:check
pnpm exec playwright test
```

Playwright owns its fixture database and server on port 3002. Never point the
suite at an operator's database. `friends-reliability.spec.ts` checks reaction
failure/retry, preserved drafts, reduced motion, bounded layouts at 320×568,
390×844, 568×320, 844×390, 1024×768 and 1440×900, and progress error recovery in Chromium
and mobile WebKit. Browser emulation does not establish physical keyboard,
background execution, signing or operating-system integration.

Android:

```sh
cd apps/android
./gradlew assembleDebug testDebugUnitTest
```

The delivery tests interrupt metadata and acknowledgement requests, recreate
the delivery owner from persisted history, and verify that retries resume the
same receipt and privacy version. Live tests refresh private savers, preserve
the playing identity, process explicit removals, bound queues and enforce the
same Unicode limit as the server.

iOS, from the repository root on a Mac with Xcode:

```sh
swiftc apps/ios/Shared/API.swift apps/ios/Shared/FriendsAPI.swift apps/ios/Shared/LiveQueue.swift apps/ios/Tests/LiveReliabilityTests.swift -o /tmp/adhx-live-tests
/tmp/adhx-live-tests
xcodebuild -project apps/ios/ADHXShare.xcodeproj -scheme 'ADHX Share' -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/adhx-ios-check CODE_SIGNING_ALLOWED=NO build
```

The native CI workflow runs these native checks when app code or phone API
routes change. Documentation-only changes do not trigger it. No signing or
deployment credential is used.

## Queue and worker cases

- Create more than 400 visible pending posts, an older failed post and another
  account's private posts. Summary totals cover the entire visible backlog;
  the older failure remains in Needs you. Only 60 detailed rows are hydrated.
- Request `summary=1` and confirm no poster/media or saver hydration occurs.
  Mount two progress consumers and confirm they share one request/clock;
  navigation, hidden pages and account changes stop obsolete requests.
- Fail a viewing-mark request with both a network error and HTTP 503. The
  outbox retains it until an HTTP success, retries on reconnect and never
  submits it under another signed-in account.
- Constrain the Mac scratch budget below all OCR inputs plus preparation
  space. The job defers without deleting any active input or reporting false
  success. Model/inference failure retries; a successfully read blank image is
  a valid no-text result.
- Queue speech, OCR and video passes over the same retained video. The stable
  generation downloads once while it remains needed. A replacement uses a new
  identity. Final acknowledgement, cancellation/deletion reconciliation or
  bounded expiry releases downloaded copies; model weights remain reusable.
- Keep both conversion and understanding busy. They alternate, empty classes
  yield, and waiting jobs gain priority rather than being indefinitely
  displaced by new arrivals. Pausing understanding still permits conversion.

## Before distributing phone builds

Use at least two test accounts. Keep the test server separate from an existing
household installation.

1. Share while offline, close the share surface, terminate/reopen the app, and
   restore connectivity. Verify one save and the intended privacy. Repeat with
   explicit shared/private choices and with an already-private save.
2. Lose the response to an accepted privacy acknowledgement. Change the save's
   privacy in the web app, then retry the old acknowledgement. It must not
   reverse the web choice.
3. Watch together from web, iPhone and Android. One account on several devices
   counts once. Background/dismiss a phone; kill its network without sending a
   leave request; revoke its key. Presence must expire and names must disappear.
4. Make a save private or hide a post while another phone is watching. Existing
   saver metadata updates without jumping playback; removed posts disappear.
   A post falling outside newest60 remains playable if still eligible.
5. Send words while offline or rate limited. Keep the draft, show failure and
   Retry, and retry against the original post after playback advances. An
   acknowledged reaction floats once; there is no promise of durable chat or
   replay after a disconnected phone misses the short reaction window.
6. Check the smallest supported phone, landscape, tablet, large text, keyboard
   open, screen reader, reduced motion, seeking, background/resume and changing
   connection speed. Every action must remain reachable, with clear loading,
   stale, empty and error states.

Unsigned builds, fixture-browser tests and simulator checks cannot certify
physical-device background delivery or distribution signing. Record those
results separately before distributing a build.
