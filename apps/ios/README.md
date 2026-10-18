# ADHX Share for iPhone

ADHX Share puts **ADHX** in your phone’s share menu. Share a post from TikTok,
Instagram, YouTube, X or any other app, pick ADHX, and the link goes to your
own ADHX. Your ADHX reads the post and keeps a copy of its media. The phone
only sends links.

It has two parts:

- **The app** (`App/`): connects to your ADHX, lists what you’ve shared lately
  and how each copy is coming along, and has Settings.
- **The Share Extension** (`ShareExtension/`): the sheet you see after picking
  ADHX in the share menu: Saving, Saved, Already in your saves, That’s not one
  post, Saved for later, Connect the app first.

Code both of them use is in `Shared/`: talking to your ADHX, storage, the list
of waiting links, network marks, colours and the sheet itself. The API and the
sheet’s states are described in `docs/specs/phone-app.md` at the repo root.

It uses only Apple’s frameworks. No packages or other tools are needed.

## What you need

- A Mac with Xcode 16 or newer (it’s built and checked with Xcode 27).
- iOS 17 or newer on the phone.
- To put it on your own phone: an Apple Developer account. A free account works
  for your own phone, but App Groups need a paid account (see below).

## Set it up for yourself

Open `Config/Base.xcconfig` and change two lines:

```
ADHX_BUNDLE_PREFIX = com.yourname.adhxshare
DEVELOPMENT_TEAM = ABCDE12345
```

- `ADHX_BUNDLE_PREFIX` is your own reverse-domain name. The app’s id becomes
  `com.yourname.adhxshare`, the extension’s
  `com.yourname.adhxshare.ShareExtension`, and the App Group
  `group.com.yourname.adhxshare`.
- `DEVELOPMENT_TEAM` is your Team ID, from developer.apple.com → Account →
  Membership.

If you’d rather not change a tracked file, put the same two lines in
`Config/Local.xcconfig` (git ignores it; `Base.xcconfig` reads it last).

## Build

**In Xcode:** open `apps/ios/ADHXShare.xcodeproj`, pick the **ADHX Share**
scheme and a phone or simulator, press Run. With your team set, Xcode makes the
app ids and the App Group for you (Signing & Capabilities).

**From the command line** (from the repo root), a simulator build with no
signing:

```sh
xcodebuild -project apps/ios/ADHXShare.xcodeproj -scheme "ADHX Share" \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath apps/ios/build CODE_SIGNING_ALLOWED=NO build
```

Then install and open it on a running simulator:

```sh
xcrun simctl install booted "apps/ios/build/Build/Products/Debug-iphonesimulator/ADHX Share.app"
xcrun simctl launch booted "$(grep '^ADHX_BUNDLE_PREFIX' apps/ios/Config/Base.xcconfig | cut -d= -f2 | tr -d ' ')"
```

An unsigned build has no App Group and no Keychain, so the app and the Share
Extension can’t share the connection: the sheet will say “Connect the app
first”. To try the whole flow on a simulator, sign it locally instead (no
account needed), which keeps the entitlements:

```sh
xcodebuild ... CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual build
```

## App Group and Keychain

The app and the extension are separate programs, so they share through an App
Group, `group.<your prefix>`:

- The server address, the Shared lately list and the waiting links live in the
  App Group’s shared settings.
- The phone key lives in the Keychain, in the App Group’s access group, so
  both can read it. It’s readable after the phone’s first unlock so waiting
  links can go in the background.

The group id comes from the `ADHXAppGroup` key in each Info.plist, so it
always follows `ADHX_BUNDLE_PREFIX`. Both targets list the group in their
entitlements (`Config/*.entitlements`).

When they aren’t available (unsigned simulator builds), the app falls back to
its own settings and, on the simulator only, keeps the key in those settings.
A phone build never keeps the key outside the Keychain.

App Groups need a paid developer account. With a free account, remove the
App Groups capability from both targets. The app still connects, but the
Share Extension can’t see the connection.

## How connecting works

1. On your computer, open your ADHX → Settings → Phone app. It shows a QR code
   and an 8-character code (like `ABCD-EFGH`) that works once, for 10 minutes.
2. The QR code holds `adhx://pair?server=<your ADHX address>&code=<code>`.
   Scan it with the app’s camera, or with the phone’s own Camera app (the
   `adhx://` link opens ADHX Share and connects straight away). Or tap “Type
   the address instead” and type both.
3. The app sends the code to `POST /api/app/pair` with the phone’s model
   name, and gets back a phone key. That key can only save links and read
   their status.
4. The Home screen checks the key with `GET /api/app/me` when it opens. If you
   removed the phone on your ADHX, the app forgets the key and goes back to
   Connect.

Disconnect in Settings forgets the key, the list and any waiting links on the
phone. Your saves stay on your ADHX. To remove the phone there too, use
Settings → Phone app on your ADHX.

Addresses without `http://` or `https://` get `https://`, except local ones
(`localhost`, `*.local`, IP addresses), which get `http://`. Plain `http://`
only works on your local network (`NSAllowsLocalNetworking`). If your ADHX is
on plain `http://` on the internet, put it behind https, or add your own App
Transport Security exception in `Config/*-Info.plist`.

## When your ADHX can’t be reached

If sending a link gets no answer, times out (15 seconds), or gets a 502, 503
or 504, the link waits on the phone (“Saved for later”). Waiting links go
when the app opens or comes back to the front, from Settings → “Send waiting
links now”, and in the background through a background refresh task
(`<prefix>.flush`). iOS decides when that runs.

## Network marks

The marks come from [Simple Icons](https://simpleicons.org) (CC0), copied into
`Shared/NetworkPaths.swift` and drawn by a small SVG path reader
(`Shared/SVGPath.swift`). LinkedIn asked Simple Icons not to carry its logo,
so LinkedIn gets a plain “in” tile, as on the website.

To update them after bumping `simple-icons`, copy each icon’s `d` attribute
from `node_modules/simple-icons/icons/<name>.svg` into `NetworkPaths.swift`.

## Fonts

The designs use Instrument Serif for headings and Hanken Grotesk for
everything else. The app uses the system serif and system sans unless
`InstrumentSerif-Regular` is installed. To use it, add
`InstrumentSerif-Regular.ttf` (SIL Open Font License) to `Shared/`, and add it
under `UIAppFonts` in both `Config/App-Info.plist` and
`Config/ShareExtension-Info.plist`.

## TestFlight

1. Set `ADHX_BUNDLE_PREFIX` and `DEVELOPMENT_TEAM` as above.
2. On developer.apple.com, make sure the two ids
   (`<prefix>`, `<prefix>.ShareExtension`) and the App Group
   (`group.<prefix>`) exist, with the App Group turned on for both ids.
   Xcode’s automatic signing usually does this for you.
3. In App Store Connect, create an app with the id `<prefix>`.
4. In Xcode: pick “Any iOS Device”, then Product → Archive, then Distribute
   App → App Store Connect → Upload.
5. In App Store Connect → TestFlight, add yourself and your friends as
   testers. Each new upload needs a higher build number
   (`CURRENT_PROJECT_VERSION` in the project settings).

The app says it uses no non-exempt encryption (it only uses https), so
TestFlight won’t ask about export rules.

## Files

```
apps/ios/
  ADHXShare.xcodeproj    the project (folders are synced; new files join automatically)
  Config/                Base.xcconfig, Info.plists, entitlements
  App/                   the app: connect, Shared lately, Settings, camera
  ShareExtension/        the extension's entry point and how it reads the shared link
  Shared/                used by both: API, storage, queue, marks, theme, the sheet
```
