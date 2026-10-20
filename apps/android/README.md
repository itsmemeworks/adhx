# ADHX Share for Android

The phone app for your own ADHX. Share a post from any app, pick **ADHX** in
the share menu, and it lands in your saves, for your people or just for you.
The app plays what your people saved full screen (swipe up for the next one),
has their channels and what's live, and searches everyone's saves by meaning. Your ADHX
does the work: it reads each post, keeps a copy of its media and streams it
back; the phone only sends links and plays what comes back.

Kotlin, Jetpack Compose and Material 3, with Media3 ExoPlayer for video and
Coil for pictures. Works on Android 8.0 (API 26) and up, and doesn't need
Google services (the QR scanner is ZXing, not ML Kit).

The API, pairing flow and copy are in [`docs/specs/phone-app.md`](../../docs/specs/phone-app.md).

## Build it

You need JDK 17 or newer and the Android SDK (platform 37, SDK Manager package `platforms;android-37.0`). The easiest way to
get both is Android Studio.

**Android Studio:** File → Open → pick `apps/android`. Let it sync, then press
Run with a phone plugged in (USB debugging on) or an emulator.

**Command line:**

```sh
cd apps/android
./gradlew assembleDebug                  # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease                # app/build/outputs/apk/release/
```

The Gradle wrapper (9.6.0) is committed, so no separate Gradle install is
needed: `./gradlew` downloads it the first time.

Debug builds can be connected to a test server without pairing (for example
the design parity server in `e2e/parity`), from a script:

```sh
adb reverse tcp:3600 tcp:3600
adb shell am start -n com.adhx.share/.debug.DebugConnectActivity \
  --es server http://127.0.0.1:3600 --es key "$PHONE_KEY" [--ez welcome true]
```

`welcome` opens on the Connected screen, as after pairing. `--ez noSeen true`
marks nothing seen while that process lives, so a seeded server stays as it
was. The activity is in `src/debug`, so release builds don't have it.

Tell Gradle where the SDK is, either with `ANDROID_HOME` or a
`local.properties` file (not committed):

```properties
sdk.dir=/Users/you/Library/Android/sdk
```

## Sign a release APK

Android only installs signed APKs. The debug build is signed with a debug key
automatically; the release build is signed only when you give it a key, and
comes out as `app-release-unsigned.apk` otherwise.

Make a key once and keep it safe. Every update has to be signed with the same
key, or phones refuse to install it over the old one.

```sh
keytool -genkeypair -v -keystore adhx-release.keystore -alias adhx \
  -keyalg RSA -keysize 4096 -validity 10000
```

Then either put the details in `apps/android/keystore.properties` (ignored by git):

```properties
storeFile=adhx-release.keystore
storePassword=…
keyAlias=adhx
keyPassword=…
```

or set them in the environment (handy in CI):

```sh
export ADHX_KEYSTORE=/path/to/adhx-release.keystore
export ADHX_KEYSTORE_PASSWORD=…
export ADHX_KEY_ALIAS=adhx
export ADHX_KEY_PASSWORD=…        # optional, defaults to the store password
export ADHX_VERSION_CODE=2        # optional, must go up with every release
export ADHX_VERSION_NAME=1.0.1    # optional
./gradlew assembleRelease
```

The signed APK is `app/build/outputs/apk/release/app-release.apk`.

## Install it

- **Straight from a file:** copy the APK to the phone and open it. Android asks
  once to allow installs from that app (Files, Chrome…).
- **With adb:** `adb install -r app/build/outputs/apk/release/app-release.apk`.
- **With [Obtainium](https://github.com/ImranR98/Obtainium)** (updates without
  a store): attach the signed APK to a GitHub release, then in Obtainium tap
  Add App and paste the repository's URL. Obtainium checks the releases page
  and offers each new APK as an update. Keep signing with the same key and
  raise `ADHX_VERSION_CODE` each time.

## Connect the phone

1. On your computer, open your ADHX and go to **Settings → Phone app**. It
   shows a QR code and an 8-character code (`ABCD-EFGH`) that works once, for
   10 minutes.
2. In ADHX Share, tap **Scan the code** and point the camera at it. The QR
   code holds `adhx://pair?server=…&code=…`, so the phone's own camera app
   works too: it opens ADHX Share and connects straight away.
3. Or tap **Type the address instead** and type your ADHX's address and the code.

The app calls `POST /api/app/pair` with the code and the phone's model name,
and gets back a **phone key**. The key and the address are kept in
an atomic AES-256-GCM encrypted file in the app’s private `noBackupFilesDir`;
the non-exportable key lives in Android Keystore. Existing installations read
the old EncryptedSharedPreferences once and remove it only after the new file
has been synced and decrypted successfully. A missing key, unreadable record or
full disk reports a secure-storage error and preserves the existing files.
Pairing and disconnect only report success after their new record is durable;
a disconnect writes a tombstone so an old migration copy cannot reconnect it.
A durable account-scope flag also hides old history and prevents its delivery
if clearing local rows fails while switching accounts, including after restart.
The phone’s private-default preference carries the same server/account ownership;
a kill before its old value is cleared cannot apply that value to the next account.
No phone credential is included in backup/device transfer. The key gives the app
access to its account’s permitted saves, friends feed, search, live rooms and
account-scoped actions. Server-side role and privacy checks apply to each request.

Plain `http://` addresses are allowed, for an ADHX on your home network. Use
`https://` for anything on the internet.

**Remove this phone** in the app's Settings forgets the key, the list and any waiting
links on the phone. To cancel the key on the server too, remove the phone in
Settings → Phone app on your ADHX (there's no phone-key route for that). If you remove it there first, the app
notices next time it opens and goes back to Connect.

## Sharing, and the offline queue

When you share to ADHX, a small frosted card slides up at the bottom of the
app you're in. On Android 12 and later the app behind is blurred; on older
phones, or with blur switched off, it's dimmed instead.

1. It finds the first `http(s)://` link in what was shared and shows the
   network's mark straight away.
2. It sends `POST /api/app/save` with `Prefer: respond-async`, so your ADHX
   answers at once and reads the post by itself (a home server can take a
   while, Instagram especially). The card then asks `GET /api/app/save?id=`
   every 1.5 s until the post is saved or turned down. If you close the card
   early, your ADHX carries on, and the app keeps checking now and then so
   Shared lately catches up. Every share is registered with WorkManager before
   it sends anything, including when online. New saves are staged privately
   (`deferPublish: true`) until the app acknowledges the latest **Just for me**
   choice through `PATCH /api/app/save`. The receipt, explicit choice (including
   off) and pending acknowledgement are stored before retrying, so closing the
   card or restarting the phone cannot publish a private choice or lose it.
   A failed acknowledgement retries the receipt, rather than queuing the link again.
   Each changed choice increments a stored version; retries reuse it, so an
   already accepted request cannot undo a later privacy change on the website.
   The initial POST also reuses the history UUID as `requestId`, so losing its
   response and restarting resumes the original receipt and captured default.
3. **Saved** shows the post and how keeping a copy is going
   (`GET /api/app/status` every 1.5 s). It closes by itself after 3 seconds
   unless you touch it. **Open in ADHX** opens the post in this app's player
   through `adhx://post?platform=…&id=…` (the website only if there's no id
   to go on). While its copy is still being kept, the player shows a
   shimmering card with a progress ring and plays it once it's ready.
4. **Already in your saves**, **That's not one post** and **Connect the app
   first** say what happened.

If your ADHX can't be reached (no network, no answer in 15 seconds, or a
502/503/504), the sheet says **Saved for later** and the link goes into a
queue run by Android's WorkManager. Each waiting link is one job that only
runs when there's a network, and tries again with growing waits (30 s, 1 min,
2 min… up to 5 hours) for about a week. It keeps going after a restart. If
the server turns the link down (a 4xx, like "not a post"), the job stops and
the list shows why. **Settings → Send waiting links now** starts them all
again without waiting.

**Shared lately** (in Settings) lists the last 50
completed shares, plus every unfinished delivery (kept on the phone only),
and keeps unfinished copies up to date while
it's open. Tap one to watch it in the player.

## Home: New · Channels · Live

One light row sits on top: Gob (Settings), the tabs, and Search. The full
behaviour and the endpoints are in
[`docs/specs/phone-app.md` → The friends feed on the phone](../../docs/specs/phone-app.md#the-friends-feed-on-the-phone).

- **New** (`GET /api/app/feed?mode=new`) plays what you haven't seen, with a
  count on the tab and a why chip over the byline (tap it for Why this one,
  Everyone · Friends only · Mine, and **Show less from Ben** / **Show more
  from Ana**: the last and first friend who saved it, through
  `GET/PUT /api/app/feed/weights`, cream while chosen, tap again for normal).
  A post someone sent you leads with "Pete sent you this" and their face; a
  "Like … you kept" reason shows that post of yours as a small thumbnail
  (tap to open it).
  Tap New again for What's in your feed: videos and photos by default, text posts and articles if you want them
  (`types=` on the feed, kept with `/api/app/feed/types` and on the phone). Posts count as seen after 2 s on
  stage or when you swipe past, sent in batches to `POST /api/app/seen`. It
  ends on "You're all caught up. Go touch grass."
- **Channels** (`GET /api/app/channels`): From everyone, Your people (a face
  per friend, with how many of theirs you haven't seen) and Made for you
  (My saves first), with See all (Your people) and Invite. A channel opens as a grid (`/api/app/channels/{kind}/{slug}`)
  and plays from the one you tap. Posts you haven't saved or seen carry a yellow
  **New** (`isNew`), and **Play the 4 new** plays just those. A friend's channel
  shows their latest note as a paper tile ("Ana's note", in quotes, "on Charlie
  bit my finger · 3 days ago") a few tiles in; it opens that post. A From
  everyone channel has **Keep this channel**
  (`POST /api/app/channels/group/{slug}/keep`), which makes it one of yours
  and turns into **Kept · Open**.
- **Live** (`GET /api/app/live`): the moments your lot are saving into, with how busy
  each is lately ("3 saves in 10 min · Ana, Ben and Jo", from `recentSaves` and
  `windowMinutes`; the save count when there were none). Groups still forming
  (`forming`) follow as dashed rows: "Forming", their name, who's saving into
  them and "1 more save to go live", with a bell for **Tell me when it's live**
  (`PUT|DELETE /api/app/live/forming/{id}/alert`). The first bell asks to show
  notifications (Android 13+); after that the app checks `GET /api/app/alerts`
  every minute while open and every 15 minutes with WorkManager, and each one
  arrives on the "Live" notification channel. Tapping it tunes in. Tune
  in plays one, asks `/api/app/live/{slug}` every 5 s for new posts, who's
  watching and reactions, and adds React (emoji or a few words,
  `POST /api/app/live/{slug}/react`). Reactions float up with the sender's face.
- **Faces** on the byline and search tiles open that friend's channel.
- **Just for me** on the share card persists through the queued receipt;
  More in the player uses `POST /api/app/private`. Private saves show a lock.

A server without the feed (404) keeps the old home: My saves. A feed with
nothing anyone has saved yet (`nothingYet`) says "Nothing new yet. Save
something for your people to find." instead of the caught-up page, and Why
this one lists every reason in `whyReasons`.

## Settings, approvals and "On their way"

Gob opens **Settings**: your face (in Gob's shape) and name, then rows for
Your people, Invite someone, What's in your feed, Just for me by default,
Sound on by default, What your ADHX is doing (with its count), then
"Connected to Ana's ADHX" with **Remove this phone**, and Shared lately.

- **Your people** (`GET /api/app/people`): everyone let in, with faces, save
  counts and when they last saved; a row opens their saves.
- **Waiting for you** (admins, from `requests` on the same answer): Let in,
  Not now, and Decline at the end of the request's row (`POST /api/app/people/requests/{id} { decision }`).
- **Change picture** and **Invite someone** open Settings on your ADHX
  (`/settings#you`, `/settings#invite`): their routes take a signed-in
  browser, not a phone key.
- **Just for me by default** and **Sound on by default** are kept on the
  phone. Until the first is touched here, saves leave `private` out and the
  account's own default on the server applies. On sends `private: true`;
  off applies only to a new save when acknowledging publication. An untouched
  off default never makes an existing private repeat shared. Explicitly changing
  the share-card switch applies to repeats too.
- **On their way**: over the New player, a pill ("3 on their way") while
  posts are processing, asking `GET /api/app/doing` every 5 s while it's on
  screen (15 s while nothing is). Tap it for a sheet: each post's picture,
  step and a thin bar (green once it plays); ones that need you show why and
  **Retry** (`POST /api/app/doing/retry`). **See everything your ADHX is
  doing** opens the full list (On their way · Needs you · Ready).

Members' pictures (`/api/files/avatar/…`) are for members only, so Coil's
OkHttp client adds the phone key to requests for the connected ADHX (same
scheme, host and port) and to nothing else.

## My saves: the player and search

**My saves** (`GET /api/app/saves`, under Channels → Made for you): full screen, newest
first, one post at a time. Swipe up for the next save and down for the one
before; pages of 20 load as you near the end. Tap to pause or play. One Media3
ExoPlayer plays whichever post is on screen and is let go when the app goes to
the background. Photo albums swipe sideways, text posts and articles fill the
page in a large serif, and SoundCloud plays its sound over the artwork.

A save joins My saves once your ADHX has kept its copy. Until then the server
counts it in `preparing`: over the player a small pill says "2 on their way",
and with nothing else saved yet the page shows a shimmering card ("Getting it
ready… it'll be here in a moment."). The app looks again every 15 s, and at
the top the new post slides in from above.

On the right, top to bottom (as on the design boards): **Save** (a bookmark,
yellow when the post is in your saves; on a friend's post it saves it to yours
too), **Share** (its icon says what it sends), **Save to phone** (puts the
video, sound or every photo of an album into the phone's gallery under ADHX,
on Android 10 and up; a text post's words go to the clipboard) and **More**.
Live adds **React** on top. Your ADHX is private, so Share sends what it kept
rather than a link: a video, sound or photos open the send sheet, which fetches
the file (`?download=1`, with how far along) and hands it to Chat, Mail, Files,
Save to phone or the share sheet, or sends the post straight to one of your
people (a face each, from `GET /api/app/send`; a tap is `POST /api/app/send`
and leaves a tick; someone who has it is dimmed); a text post or article gets the same sheet, sending
its words through Chat, Mail or More, or the post straight to your people. A post whose copy is still being kept says so instead. Share downloads use separate private
cache batches, so starting another share keeps earlier recipients' files usable.
Failed batches are removed immediately; batches older than 24 hours are removed
on later exports, excluding downloads still active in the app. Share downloads check
for a 64 MiB free-space reserve before starting and periodically while streaming.
There is no additional per-file size limit. **More** has the player's own
switches, **Sound** (videos start muted, unless Sound on by default is set) and
**Repeat** (off, a video that ends moves on to the next save; on, it loops),
**Open on** the network, **Keep playing in a small window** (picture-in-picture,
with buttons for the previous and next save; it also goes there by itself when
you leave the app while a video plays) and **Hide controls** (everything but a
thin progress line until the next tap), then **Share an ADHX link** for people
on the same server. Along the bottom: who saved it (with a friend's note in a
speech bubble), where it's from, the first lines of text, and a thin line you
can drag to seek. A text post
too long for the page fades out with **Read all**, which opens it as a
scrolling page. A video that can't play says why, in the server's words.

**Search** (`GET /api/app/search`) finds everyone's saves (or, with Mine,
yours) by what you describe, not only by the exact words: type, and after a moment a two-column grid of posters
shows how close each one is. Tap one to play the results from there.

## Dependency and storage checks

Android uses Coil 3 with its explicit OkHttp network component and cache-control
strategy. The phone key goes only to the paired scheme, host and port; redirects
to another origin lose it. Both image caches have a credential-derived namespace
so pairing to another account cannot reuse the previous account’s pictures.
The namespace is a digest, never the phone key. The deprecated AndroidX
`security-crypto` package remains only for one-time reads of old pairings; new
credentials use Android Keystore directly.

Run `./gradlew --no-daemon --max-workers=2 assembleDebug testDebugUnitTest exportRuntimeDependencies` to build, test and write the resolved runtime Maven
graph to `app/build/reports/runtime-dependencies.json`. JVM tests cover migration,
failed writes/readback, missing/wrong keys, tampering, disconnect tombstones,
origin-restricted authentication, cross-origin redirects and cache separation.
They exercise the production migration/encryption logic with an in-memory file
and JVM AES implementation. Android Keystore/AtomicFile behaviour still requires
the physical-device checks below.

## Before distributing a phone build

A debug build or emulator run does not establish signed physical-device behaviour.
On a physical phone, verify pairing/revocation at the final HTTPS origin, sharing
from another app, offline queuing/retries, seek playback, picture-in-picture,
saving media to the gallery and search pagination. Keep the release signing key
private and reuse it for updates. For the credential migration specifically:

- Use a disposable test account and the same signing key to install the previous
  paired app, then update in place. Confirm the same account works without pairing
  again and the old encrypted preferences disappear only after the new record works.
- Force-stop and restart after pairing, migration and disconnect. Disconnected
  phones must stay disconnected; a failed write must never claim success.
- On an emulator or disposable test installation only, fill its private storage,
  interrupt a write and remove its test Keystore key. The app must show an error,
  retain its stored files and queued shares, and avoid sending with a guessed key.
  Recover with available disk space or an explicit fresh pairing code.
- Pair to another test account on the same origin. Confirm previous private
  pictures/history are absent, image fetching uses the new key and no credential
  is forwarded to an external image origin.
- Verify Android backup/restore and device transfer require fresh pairing; do not
  copy Keystore-bound credential files between devices.

No signed APK or store release is published by
merging this server PR.

## Layout

```
app/src/main/java/com/adhx/share/
  share/   ShareActivity (share target), the sheet, its view model
  main/    MainActivity (the screens and back), Connect, Shared lately,
           Settings, Your people and join approvals
  doing/   On their way: the pill, its sheet and the full list
  feed/    Home (New · Channels · Live), the caught-up page, Why this one,
           channels, Live and Tuned in, reactions, seen batching, Just for me
  library/ The player, My saves, search by meaning, More, their view model
  work/    SaveWorker and SaveQueue (the offline queue)
  net/     AdhxApi (OkHttp + kotlinx.serialization) and the JSON shapes
  data/    ConnectionStore (server + key), HistoryStore (recent shares),
           SettingsPrefs (Just for me and Sound by default)
  links/   finding links, guessing the network, network names and marks
  ui/      colours, buttons, copy
app/src/main/res/drawable/
  ic_gob.xml          Gob, the ADHX mark
  ic_net_*.xml        network marks from simple-icons (LinkedIn is drawn by hand,
                      as Simple Icons doesn't carry it)
```
