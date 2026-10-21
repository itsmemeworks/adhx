# ADHX Share for iPhone

ADHX Share puts **ADHX** in your phone’s share menu. Share a post from TikTok,
Instagram, YouTube, X or any other app, pick ADHX, and the link goes to your
own ADHX. Your ADHX reads the post and keeps a copy of its media. The app
also plays your saves and searches them by meaning; your ADHX does the work
(downloading, understanding, streaming) and the phone plays what it streams.
The app only ever talks to your own ADHX.

It has two parts:

- **The app** (`App/`): connects to your ADHX and opens on **New**, what
  your people saved that you haven’t seen, full screen (swipe up for the next)
  until “You’re all caught up.” Next to it, **Channels** (rabbit holes from
  everyone, one per friend, and ones made from what you keep) and **Live**
  (what a few of you are saving right now, to tune in to together). It
  searches everyone’s saves or just yours by meaning, lists what you’ve shared
  lately (in Settings) and how each copy is coming along, and has Settings
  (you, your people, letting people in, defaults, this phone). A pill on the
  player says what's **on its way** (being kept and learned on your ADHX),
  with Retry for what needs you. `App/Feed/` is New, Channels and Live;
  `App/Library/` is the player, search and your saves; `App/Settings/` is
  Settings and Your people; `App/Doing/` is On their way.
- **The Share Extension** (`ShareExtension/`): the sheet you see after picking
  ADHX in the share menu: Saving, Saved, Already in your saves, That’s not one
  post, Saved for later, Connect the app first. It says who will see the save
  and has a **Just for me** switch.

Code both of them use is in `Shared/`: talking to your ADHX (`API.swift`, and
the friends feed in `FriendsAPI.swift`), people’s faces and names
(`People.swift`), members' pictures loaded with the phone key
(`AuthImage.swift`), storage, the list of waiting links, network marks, colours
and the sheet itself. The API and the
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

**With your email:** on Connect, tap **Sign in with email**, type your ADHX’s
address and the email you sign in with. Your ADHX emails a 6-digit code
(`POST /api/app/signin`; existing accounts only); type it, or let iOS fill
it in from Mail, and the app gets its phone key from
`POST /api/app/signin/verify`, the same answer pairing gives.

**With the pairing code** (the other way in):

1. On your computer, open your ADHX → Settings → Phone app. It shows a QR code
   and an 8-character code (like `ABCD-EFGH`) that works once, for 10 minutes.
2. The QR code holds `adhx://pair?server=<your ADHX address>&code=<code>`.
   Scan it with the app’s camera, or with the phone’s own Camera app (the
   `adhx://` link opens ADHX Share and connects straight away). Or tap “Type
   the code instead” and type both.
3. The app sends the code to `POST /api/app/pair` with the phone’s model
   name, and gets back a phone key. That key can save links, read their
   status, read and search saves (`/api/app/saves`, `/api/app/search`), and
   play the friends feed (`/api/app/feed`, `channels`, `live`), as a
   signed-in member could; nothing else.
4. The Home screen checks the key with `GET /api/app/me` when it opens. If you
   removed the phone on your ADHX, the app forgets the key and goes back to
   Connect.

**Remove this phone** in Settings cancels the key on your ADHX
(`DELETE /api/app/me`), then forgets the key, the list and any waiting links on
the phone. Your saves stay on your ADHX. If your ADHX can't be reached it still
forgets them here, and Connect says the phone may still show in Settings →
Phone app there.

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
everything else. Both are bundled in `Shared/Fonts/` (SIL Open Font License,
licences beside them) and registered for the app and the Share Extension on
first use (`BundledFonts` in `Shared/Theme.swift`). Hanken Grotesk is one
variable `.woff2`; each weight is picked on its `wght` axis. Without them the
app falls back to the system serif and sans.

## Debug launch arguments

Debug builds read a few launch arguments, for the simulator and design checks
(`xcrun simctl launch <device> <bundle id> …`):

- `-adhxServer <url> -adhxKey <phone key> [-adhxUser <name>]` connects
  without pairing.
- `-adhxDryRun YES` never tells the server what you've watched, so a shared
  test server stays as it was.
- `-adhxWelcome YES` shows the "Connected to …" screen that follows pairing.
- `-adhxSharePreview saved|private` shows the share card's Saved state over
  a post, without sharing anything.
- `-adhxTuneIn <slug>` does what tapping a "… is live" notification does
  (opens Live and tunes in to that moment).

## Before testing on a physical phone

A simulator build does not establish device signing, App Group/Keychain sharing,
background execution or picture-in-picture. Before distributing a build:

- Pair at the final HTTPS origin, revoke the key and confirm the phone disconnects.
- Share a real supported post from another app, then repeat offline and retry.
- Confirm the main app and Share Extension use the same connection.
- Play and seek a retained video, test picture-in-picture and save to Photos.
- Search beyond the first results page, change queries during loading and retry
  a failed page.

These are device checks to complete with the operator; an unsigned simulator
build is not evidence that they passed.

## TestFlight

Releases upload themselves: `.github/workflows/ios-testflight.yml` archives the
release tag and sends it to TestFlight once the repository has the App Store
Connect key and signing secrets. Setup, secrets and the one-time App Store
Connect steps are in
[`docs/releasing.md`](../../docs/releasing.md#iphone-app-on-testflight).

By hand, from Xcode:

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

## The friends feed

Your people see what you save, named, unless you switch **Just for me** (on
the share sheet, or in the player’s More). The app only shows names the
server sends it, which it does for members only.

- **New** plays videos and photos unless you switch on text posts or
  articles (tap New again). The choice is saved on your ADHX
  (`/api/app/feed/types`) and on the phone, for servers that don’t keep it.
- **New** marks a post seen after 2 seconds on screen, or as soon as you swipe
  past it, and sends them to `/api/app/seen` in batches.
- The share sheet names your people from the last Channels or feed the app
  loaded (kept on the phone in the App Group, cleared on Disconnect), or says
  “Your people will see it”.
- Live refreshes every 5 seconds while you’re tuned in and in the foreground.
  A screen-specific presence lease expires after 15 seconds if the phone
  disconnects; leaving/backgrounding sends an explicit leave. Existing saver
  metadata refreshes without jumping playback, and explicit removals are
  distinguished from posts falling outside the latest page.
- Reactions (an emoji, or up to 40 Unicode code points) go to
  `/api/app/live/{slug}/react` and float up after acknowledgement. Failed words
  remain available for Retry against the original post. They are ephemeral
  reactions, not stored messages.
- Why this one has Show less / Show more from a friend
  (`/api/app/feed/weights`); a friend's channel marks what you haven't seen
  (`isNew`), plays just those, and shows their latest note; Live says how
  busy a moment is (`recentSaves` in `windowMinutes`) and lists groups still
  forming. Details in `docs/specs/phone-app.md` → iPhone notes.
- The why, filter and On their way sheets are the boards' own bottom sheets
  (`App/BoardSheet.swift`); Share opens the send sheet
  (`App/Library/SendSheet.swift`), which downloads the kept file and hands it
  to Messages, Mail, Files, Photos or the share sheet, or sends the post
  straight to one of your people (it shows in their New as "Pete sent you
  this").
- Forming groups on Live have a bell, "Tell me when it's live". When one goes
  live you get a local notification (`App/Feed/LiveAlerts.swift`), from a
  poll while the app is open and a background refresh task
  (`<prefix>.alerts`, beside `<prefix>.flush` in `Config/App-Info.plist`);
  tapping it tunes in. The app asks to show notifications on the first bell.
- A From everyone channel can be kept as one of yours (Keep this channel,
  then Kept · Open).
- On an ADHX without these endpoints yet (404), New plays your saves as
  before, and Channels and Live say the server needs an update.

Search follows the server's `nextOffset` as you reach the end of the result
grid or its player. Further-page failures keep the results already loaded and
offer a retry. Changing the query cancels the older page request.

The share card confirms its privacy choice against the server queue before
finishing the extension. New saves stay private until that confirmation, even
if metadata finishes first. An interrupted confirmation is kept in Shared
lately and retried on the next refresh. Each changed choice gets a persisted
monotonic version; retries reuse it so an already accepted request cannot undo
a later web privacy edit. A genuinely new explicit choice is a new mutation.
This uses `deferPublish` and `PATCH /api/app/save` from the matching server
release; update the server before testing this flow with a newly built app.

History automatically moves from the old app-group preference into an atomic
JSON file in the same private app-group container. A file lock protects each
read/change/write across the app and extension, and unfinished receipts and
acknowledgements are retained beyond the recent-history limit. The queue
records an accepted receipt before removing its offline entry. Each initial
save reuses its stored history UUID as `requestId`, so a lost initial response
returns the same receipt after a restart. Unfinished offline entries can be
reconstructed from history if interrupted.

For regression commands and the cross-device recovery matrix, see
[Friends-feed reliability checks](../../docs/rollout/friends-feed-verification.md).
