# Install the phone apps

ADHX Share isn't in the App Store or Google Play. That's fine: you can still
put it on your phone. This guide shows how, step by step, for Android and
iPhone. Then you [connect it to your ADHX](#connect-it-to-your-adhx).

Checked on 28 October 2026. Phone makers and Apple change these screens now
and then, so the words on yours may differ a little.

## Which way is yours?

| Your phone | Where you are                            | How                                  | Costs you | Ready today?                         |
| ---------- | ---------------------------------------- | ------------------------------------ | --------- | ------------------------------------ |
| Android    | Anywhere                                 | [The APK from GitHub](#android)      | Nothing   | Yes                                  |
| iPhone     | Anywhere, if your ADHX's owner offers it | [TestFlight](#testflight)            | Nothing   | Not yet ([owner steps](#testflight)) |
| iPhone     | The EU                                   | [AltStore PAL](#iphone-in-the-eu)    | Nothing   | Not yet ([owner steps](#owner-eu))   |
| iPhone     | Everywhere else                          | [SideStore](#iphone-everywhere-else) | Nothing   | Yes, with a Mac to make the file     |

"Your ADHX's owner" is whoever runs the server you use. If that's you, the
owner steps are yours too.

## Android

Every ADHX release comes with a signed app file, `adhx-<version>.apk`. You need
Android 8.0 or newer. About five minutes.

1. On your phone, open
   [github.com/itsmemeworks/adhx/releases/latest](https://github.com/itsmemeworks/adhx/releases/latest).
2. Scroll to **Assets** (tap it if it's folded) and tap `adhx-<version>.apk`.
   The `.sha256` file beside it is only for checking; you don't need it.
3. When the download finishes, tap **Open**.
4. The first time, Android stops you: your browser isn't allowed to install
   apps. Tap **Settings**, turn on **Allow from this source**, then go back.
5. Tap **Install**. If Play Protect asks to scan the app, let it. If it warns
   it doesn't know the app, tap **More details**, then **Install anyway**.
6. Tap **Open**, and [connect it](#connect-it-to-your-adhx).

You can turn **Allow from this source** off again afterwards (Settings → Apps →
Special app access → Install unknown apps → your browser).

**Updates:** do the same with the newer APK. It installs over the old one and
stays connected. Every release is signed with the same key, which is how your
phone knows it's the same app. Or let [Obtainium](https://github.com/ImranR98/Obtainium)
watch for you: tap **Add App**, paste `https://github.com/itsmemeworks/adhx`
and it offers each new APK as an update.

**Check a download (optional):** on a computer, `sha256sum adhx-<version>.apk`
should print the same as the `.sha256` file on the release.

## iPhone

Apple only lets apps outside the App Store in through a few doors. Which one
you can use depends on where you live:

- **Anywhere:** [TestFlight](#testflight), Apple's beta app. Easiest of all,
  but your ADHX's owner has to set it up with a paid Apple developer account.
- **In the EU:** [AltStore PAL](#iphone-in-the-eu), an app marketplace Apple
  allows there. It installs like a normal app, with no weekly refresh.
- **Everywhere else:** [SideStore](#iphone-everywhere-else), which installs the
  app with your own free Apple Account and keeps it alive every week.

Every way keeps the share card (**ADHX** in the share menu) working.

### TestFlight

If your ADHX's owner has set it up, Settings → Phone app on the web shows
**iPhone (TestFlight)**.

1. Install [TestFlight](https://apps.apple.com/app/testflight/id899247664) from
   the App Store.
2. Open the invite link from Settings → Phone app on your phone.
3. Tap **Accept**, then **Install**.
4. Open ADHX Share and [connect it](#connect-it-to-your-adhx).

Updates show up in TestFlight. Each build works for 90 days, and new releases
upload themselves, so you only notice if the owner stops uploading.

**Owner, once:** releases already build and upload to TestFlight on their own
(`.github/workflows/ios-testflight.yml`). It waits for a paid
[Apple Developer Program](https://developer.apple.com/programs/) membership
(US$99 a year) and seven repository secrets. Follow
[iPhone app on TestFlight](releasing.md#iphone-app-on-testflight), make an
external testing group with a public link, and put that link in
`NEXT_PUBLIC_IOS_APP_URL` so Settings shows it. The first build of each version
goes through Apple's quick beta review. Up to 10,000 people can join
([TestFlight](https://developer.apple.com/testflight/)).

### iPhone in the EU

In the EU, Apple lets you install apps from other app marketplaces. The app
still has to be checked ("notarized") by Apple, so it installs like any other
app: no weekly refresh, no computer, and the share card works. We use
[AltStore PAL](https://altstore.io), a free marketplace that any developer can
publish to. It works the same way in Japan and Brazil.

You need:

- an Apple Account set to an EU country, and to be in the EU (if you're away
  for long, about 30 days, apps keep working but stop updating),
- the latest iOS (17.4 or newer at the very least).

Steps:

1. In Safari, open [altstore.io/download](https://altstore.io/download) and tap
   the button to install AltStore PAL.
2. iOS explains what installing a marketplace means. Read it, tap **Allow**,
   and follow the steps on screen
   ([Apple's guide](https://support.apple.com/117767)).
3. Open AltStore PAL, go to **Sources**, tap **+** and paste the ADHX source
   address your ADHX's owner gives you.
4. Find **ADHX Share** and tap to install it. iOS shows a sheet with the app's
   name and developer, as checked by Apple. Confirm it.
5. Open ADHX Share and [connect it](#connect-it-to-your-adhx).

Updates arrive in AltStore PAL like they would in the App Store.

<a id="owner-eu"></a>

**Owner, once.** There is no ADHX source to add yet; someone with a paid
developer account has to publish one. It costs the membership (US$99 a year)
and nothing else for a free app:

1. Join the [Apple Developer Program](https://developer.apple.com/programs/)
   and accept the latest agreement. Since 1 October 2026 the EU terms are part
   of it (Attachment 14).
2. Make the app record and App Group as for TestFlight
   ([steps](releasing.md#once-in-apples-portals)).
3. [Register with AltStore PAL](https://faq.altstore.io/developers/distribute-with-altstore-pal):
   send your developer ID (App Store Connect → Edit Profile) to its API, then
   in App Store Connect → Users and Access → Integrations → **Marketplace**, add
   the token it gives you, pick ADHX Share and choose to send notifications.
4. Set the app's review type to **Notarization** and submit each version. This
   checks that the app works and isn't malware; it isn't full App Store review.
5. Download the notarized package (the "ADP") and host it untouched, then
   publish a [source](https://faq.altstore.io/developers/make-a-source): a small
   JSON file with the app's details and its `marketplaceID`. GitHub Releases
   works for the files.

Apple charges a 5% commission only on sales
([Apple](https://developer.apple.com/support/alternative-app-marketplace-in-the-eu/)),
and ADHX sells nothing. Apple can withdraw notarization, as with any app.

Why not Apple's **Web Distribution** (installing straight from a website)? It's
real, but only for developers who show financial standing: a nonprofit fee
waiver, a credit score, a stock listing, venture funding, a US$1,000,000 letter
of credit, an audited account, or two years' membership plus an app with a
million installs a year
([Apple](https://developer.apple.com/support/web-distribution-eu/)). A
self-hosted open-source app usually has none of these. AltStore PAL asks for
none of them.

### iPhone everywhere else

Outside the EU (and Japan and Brazil), Apple doesn't allow app marketplaces.
What still works anywhere: installing an app you signed yourself, with your
own Apple Account. [SideStore](https://sidestore.io) does that for you.

**Why SideStore:**

- It's free and open source, and your free Apple Account is enough.
- You need a computer once. After that it re-signs the app on the phone, over
  Wi-Fi, before the 7 days Apple allows run out.
- It keeps the share card: tell it to keep the app's extension (below).

What we didn't pick, and why:

| Option                                            | Why not first                                                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [AltStore Classic](https://altstore.io)           | Same free account and limits, but refreshing every week needs AltServer running on a computer on the same Wi-Fi. |
| Paid signing services                             | A stranger's certificate, shared by thousands. Apple revokes them often and every app stops at once.             |
| [TestFlight](#testflight)                         | The easiest of all, but only once your ADHX's owner pays for a developer account and sets it up.                 |
| Xcode ([iPhone app guide](../apps/ios/README.md)) | Works, but you build it yourself and redo it every 7 days with a free account.                                   |

**What a free Apple Account allows** (Apple's limits, not ours):

- 3 sideloaded apps at once, SideStore included. ADHX Share is one more.
- 10 app IDs a week. ADHX Share uses two: the app and its share card.
- Apps stop opening after 7 days unless they're refreshed. SideStore refreshes
  them; keep LocalDevVPN able to connect.

A paid developer account lifts the 3-app limit and lasts a year
([SideStore FAQ](https://docs.sidestore.io/docs/faq)).

#### 1. Install SideStore (once, about 15 minutes)

You need iOS 15 or newer, Wi-Fi, and a Mac, Windows or Linux computer just for
this part. SideStore's own [install guide](https://docs.sidestore.io/docs/installation/prerequisites)
has pictures.

1. On the phone, install **LocalDevVPN** from the App Store.
2. On the computer, get [iloader](https://iloader.app) and open it.
3. Plug the phone in with a cable. Tap **Trust** on the phone and type your
   passcode.
4. In iloader, sign in with your Apple Account, pick your phone and click
   **Install SideStore (Stable)**.
5. On the phone, open Settings → General → **VPN & Device Management**, tap
   your Apple Account under Developer App, then **Trust**.
6. Settings → Privacy & Security → **Developer Mode**, turn it on. The phone
   restarts.
7. Open LocalDevVPN and tap **Connect**.
8. Open SideStore and sign in with the same Apple Account. In **My Apps**, tap
   the **7 DAYS** button beside SideStore to refresh it once.

#### 2. Get the ADHX Share file

Releases don't include an iPhone file (`.ipa`) yet. Until they do, someone
with a Mac and Xcode makes it from this repository in one command (no Apple
account needed), and sends it to you:

```bash
apps/ios/Config/make-sideload-ipa.sh adhx-share.ipa
```

It's signed only on that Mac, so SideStore can sign it again as yours. Save
`adhx-share.ipa` to Files on the phone (AirDrop works).

#### 3. Install ADHX Share

1. Make sure LocalDevVPN is connected.
2. In SideStore, go to **My Apps**, tap **+** and pick `adhx-share.ipa`.
3. If SideStore asks about the app's extensions, choose **Keep All**. That's
   the share card. Removing it takes **ADHX** out of the share menu.
4. Open ADHX Share and [connect it](#connect-it-to-your-adhx).

**Every week:** SideStore refreshes in the background when it can. If an app
says it's no longer available, open LocalDevVPN, tap Connect, then open
SideStore → My Apps → **Refresh All**. Your connection and saves stay put.

**Updates:** install the newer `.ipa` the same way. It replaces the old one.

If the share card says "Connect the app first" even though the app is
connected, the app and its card aren't sharing their storage. Refresh in
SideStore, and if it stays, [tell us](https://github.com/itsmemeworks/adhx/issues).

## Connect it to your ADHX

The app opens on **Connect to your ADHX**. Pick one way in. Both work on
iPhone and Android.

**With your email** (needs your ADHX to send email):

1. On iPhone, tap **Sign in with email**. On Android it's the first thing you
   see.
2. Type your ADHX's address, like `adhx.example.com`, and the email you sign in
   with. Tap **Send me a code** (Android: **Email me a code**).
3. Type the 6-digit code from the email (your phone may fill it in), then tap
   **Connect** (Android: **Sign in**). The code works once, for 15 minutes.

**With a pairing code** (works even if your ADHX doesn't send email):

1. On a computer, open your ADHX → **Settings → Phone app → Show the code**. It
   shows a QR code and a code like `ABCD-EFGH`, good once for 10 minutes. Just
   joined from an invite? It's on the "You're in." screen.
2. On iPhone the app opens with the camera ready: point it at the QR code. The
   phone's own Camera app works too. On Android, tap **Use a pairing code
   instead**, then **Scan the code**.
3. No camera? Tap **Type the code instead** (Android: **Type the code**), type
   the address and the code, and tap **Connect**.

Then share any post, pick **ADHX**, and it's saved. If ADHX isn't in the share
menu yet, scroll the row of apps to the end, tap **More** (or **Edit**) and add
it.

## Something wrong?

| What you see                                    | What to do                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Android says "App not installed"                | An older copy signed with a different key is on the phone (a build you made yourself). Uninstall it, then install again. |
| "This ADHX doesn't send email"                  | Use the pairing code from Settings → Phone app on the web.                                                               |
| Can't connect to an `http://` address           | Plain `http://` only works on your home network. Put your ADHX behind `https://`.                                        |
| iPhone app won't open after a week              | SideStore didn't refresh it. Connect LocalDevVPN, then SideStore → My Apps → Refresh All.                                |
| SideStore says you've reached the app limit     | A free account allows 3 sideloaded apps, SideStore included. Remove one you don't use.                                   |
| AltStore PAL won't install                      | Check your Apple Account's country is in the EU, you're in the EU, and iOS is up to date.                                |
| Channels and Live say the server needs updating | Your ADHX is older than the app. Update the server.                                                                      |

More detail for builders: [iPhone app](../apps/ios/README.md) and
[Android app](../apps/android/README.md).
