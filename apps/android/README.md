# ADHX Share for Android

The phone app for your own ADHX. Share a post from any app, pick **ADHX** in
the share menu, and it lands in your saves. The phone only sends the link;
your ADHX reads the post and keeps a copy of its media.

Kotlin, Jetpack Compose and Material 3. Works on Android 8.0 (API 26) and up,
and doesn't need Google services (the QR scanner is ZXing, not ML Kit).

The API, pairing flow and copy are in [`docs/specs/phone-app.md`](../../docs/specs/phone-app.md).

## Build it

You need JDK 17 or newer and the Android SDK (platform 35). The easiest way to
get both is Android Studio.

**Android Studio:** File → Open → pick `apps/android`. Let it sync, then press
Run with a phone plugged in (USB debugging on) or an emulator.

**Command line:**

```sh
cd apps/android
./gradlew assembleDebug                  # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease                # app/build/outputs/apk/release/
```

The Gradle wrapper (8.11.1) is committed, so no separate Gradle install is
needed: `./gradlew` downloads it the first time.

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
EncryptedSharedPreferences (the encryption key lives in the Android
Keystore). The key can only save links and read how saving is going; it can't
search or read anything else.

Plain `http://` addresses are allowed, for an ADHX on your home network. Use
`https://` for anything on the internet.

**Disconnect** in the app's Settings forgets the key, the list and any waiting
links on the phone. To cancel the key on the server too, remove the phone in
Settings → Phone app on your ADHX. If you remove it there first, the app
notices next time it opens and goes back to Connect.

## Sharing, and the offline queue

When you share to ADHX, a sheet slides up over the app you're in:

1. It finds the first `http(s)://` link in what was shared and shows the
   network's mark straight away.
2. It sends `POST /api/app/save`. If you close the sheet early, the save
   still finishes.
3. **Saved** shows the post and how keeping a copy is going
   (`GET /api/app/status` every 1.5 s). It closes by itself after 3 seconds
   unless you touch it.
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

**Shared lately** on the app's home screen lists the last 50 shares (kept on
the phone only) and keeps unfinished copies up to date while it's open.

## Layout

```
app/src/main/java/com/adhx/share/
  share/   ShareActivity (share target), the sheet, its view model
  main/    MainActivity: Connect, Shared lately, Settings
  work/    SaveWorker and SaveQueue (the offline queue)
  net/     AdhxApi (OkHttp + kotlinx.serialization) and the JSON shapes
  data/    ConnectionStore (server + key), HistoryStore (recent shares)
  links/   finding links, guessing the network, network names and marks
  ui/      colours, buttons, copy
app/src/main/res/drawable/
  ic_gob.xml          Gob, the ADHX mark
  ic_net_*.xml        network marks from simple-icons (LinkedIn is drawn by hand,
                      as Simple Icons doesn't carry it)
```
