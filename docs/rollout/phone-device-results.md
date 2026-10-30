# Phone device results

Results of the [phone acceptance checks](phone-device-acceptance.md) on real
phones, newest run first. Each run says what was tested on which device and
build. A row not listed was not run. Bugs found are fixed in the same change,
with the fix named. How to drive the phones: [`e2e/devices`](../../e2e/devices/README.md).

## 30 October 2026 (Fly round 2, 2.14.3)

- **Server:** 2.14.3 from `deploy/fly` on a new app (dedicated CPU, 4 GB).
- **iPhone 16 Pro** and **Galaxy A13**, Debug builds from `main`, both still
  paired to round 1's deleted server, as Ana and Ben.

| Journey                                       | Row | iPhone                                   | Android                          |
| --------------------------------------------- | --- | ---------------------------------------- | -------------------------------- |
| Join from a group link (stale session cookie) | –   | Pass: brand fonts, name typed cleanly    | Pass                             |
| Connect this phone from a dead pairing        | P06 | Pass (once landed on caught-up, see log) | Pass                             |
| Settings → Phone app → Connect this phone     | –   | Pass                                     | Pass                             |
| Share a new post with a note                  | P02 | –                                        | Pass: the note is on the save    |
| React with words; it reaches another phone    | P19 | Pass                                     | Pass: under Channels → Reactions |
| A send from the web leads Home                | –   | Pass: "pete sent you this", Reply        | –                                |
| A post that couldn't be kept says why         | –   | Fix 1                                    | Fix 1                            |
| Search by meaning                             | P01 | Pass: "dog on a boat" by picture         | –                                |

Bugs found and fixed:

1. **"Taken down or made private on Vimeo"** for a Vimeo that only couldn't
   be kept (DRM). The server now says why, as Processing does.
2. **The owner's phone header ran off screen** while the server was learning
   (web; found by the width check).

## 30 October 2026 (a fresh Fly install)

- **Server:** 2.14.2 installed from `deploy/fly` exactly as written, on a new
  Fly app in London (then this branch, built on Fly), empty volume. The owner
  set it up from the setup link in the log; 11 real posts from YouTube, Vimeo,
  TikTok, X and SoundCloud. No email service.
- **iPhone 16 Pro**, Debug build from `main`, still paired to an old test
  server, as Ana. **Samsung Galaxy A13**, Debug build from `main`, wiped, as
  Ben. Both joined from one group link opened in the phone's browser.

| Journey                                             | Row | iPhone                                   | Android                                                |
| --------------------------------------------------- | --- | ---------------------------------------- | ------------------------------------------------------ |
| Join from a group link, wait, get let in            | –   | Pass: the page moved on by itself        | Pass                                                   |
| Connect this phone (no typing)                      | P01 | Pass after fix 1 ("Open in ADHX Share?") | Pass: "Connected to pete's ADHX"                       |
| Play the feed                                       | P01 | Pass                                     | Pass                                                   |
| Share a new post from another app                   | P02 | –                                        | Pass once the server recovered (2 GB, see the worklog) |
| React with words; it reaches another phone          | P19 | Pass: "this gnome is me on mondays"      | Pass: under Channels → Reactions                       |
| Search by meaning                                   | P01 | –                                        | Pass: "elephants at the zoo"                           |
| Channels: Your people (ring and count)              | –   | –                                        | Pass                                                   |
| Sign in without email: link in the log and on Admin | –   | (web)                                    | (web)                                                  |

Bugs found and fixed:

1. **The iPhone said "Can't load Home" after connecting to a new server.**
   A connect link while already connected paired the phone anew, but Home
   stayed mounted with what it had loaded from the old, unreachable server.
   Home now starts over with each pairing. Android already did.
2. **The invite page used the phone's stock fonts**, and Safari's predictive
   text slipped a word into the name. The link pages now load ADHX's own
   faces, and the name field turns autocorrect off.

Not run: Live moments (too few saves at once to form one), removing a phone,
and the iPhone share sheet (needs a hand).

## 30 October 2026 (review fixes and polish)

- **Server:** a production build of this branch (2.13.1 plus the review fixes
  and the launch polish), on the 29 October data folder.
- **iPhone 16 Pro**, Debug build `2.13.1 +2`, re-paired from an old test
  server to Ana over the USB tunnel. Driven by `DeviceDriver` through the hub,
  which now needs its token.
- **Samsung Galaxy A13**, Debug build `2.13.1 +2`, re-paired from an old test
  server to Ben over `adb reverse`.

| Journey                                                  | Row | iPhone                                         | Android                             |
| -------------------------------------------------------- | --- | ---------------------------------------------- | ----------------------------------- |
| Remove this phone from an unreachable server, pair again | P06 | Pass: Shared lately empty, new account's saves | Pass                                |
| Play real kept media                                     | P01 | Pass                                           | Pass                                |
| A removed phone's private-file links stop working        | –   | Pass on the server: 200, then 404 once removed | (same)                              |
| Send the photos of a 4-photo album to Files              | –   | –                                              | Pass: all four in the chosen folder |
| Copy a video to paste into a chat                        | –   | "Copied"; pasting elsewhere not checked        | –                                   |
| Share with a note from another app                       | P02 | –                                              | Pass: the note is on the save       |
| Search by meaning                                        | P01 | Pass: "zoo" finds "Me at the zoo" by picture   | –                                   |
| Share icon is one paper plane                            | –   | Fix 1                                          | Pass                                |
| Live's red dot only while something is live              | –   | Pass                                           | Fix 2                               |
| Channels, Live                                           | –   | Pass                                           | Pass                                |

Bugs found and fixed:

1. **The iPhone's Share showed a camera on videos** (and a photo on photos),
   which read as "record". It's a paper plane for every kind now, as on
   Android and the web.
2. **Android's Live tab always had a red dot**, even with nothing live. It
   now shows only while a moment is live, as on the iPhone, and says so to
   TalkBack.
3. **Android's Your people clipped a friend's yellow ring and count.** Each
   face sat in a 62dp clipped column inside a 68dp ring. The columns are 68dp
   now, unclipped, at the same 76dp pitch.

Not run: a share made offline and sent after re-pairing (the iPhone share
sheet needs a hand), and a note added while a share is still queued on a
phone (covered by server tests).

## 29 October 2026 (release candidate)

- **Server:** a production build of `main` (2.13.0) on a Mac, started as the
  image starts it (migrate, then serve), on an empty data folder: no email
  service, models on, real posts saved from X, YouTube, Vimeo and TikTok. The
  owner set it up with the setup code from the log, made a group link, and
  two friends joined from phone browsers and were let in.
- **iPhone 16 Pro**, Debug build, as Ana, over the USB tunnel. Driven by the
  `DeviceDriver` UI test.
- **Samsung Galaxy A13** (SM-A137F), Android 14, Debug build, first as the
  owner, then as Ben, over `adb reverse`.

| Journey                                                     | Row | iPhone                                             | Android                                             |
| ----------------------------------------------------------- | --- | -------------------------------------------------- | --------------------------------------------------- |
| Sign in by email on a server without email                  | P15 | –                                                  | Pass: points to the pairing code                    |
| Pair with a typed code from Settings → Phone app            | P01 | Pass: "Connected to pete’s ADHX", their real saves | Pass                                                |
| Home for a lone owner                                       | –   | Fix 3                                              | Fix 3                                               |
| Play real kept media (X, YouTube, TikTok)                   | P01 | Pass                                               | Pass after fix 1                                    |
| Remove this phone, then pair as someone else                | P06 | –                                                  | Pass: Ben's feed, none of the owner's phone history |
| Search by meaning                                           | P01 | Pass: "fluffy dog on a boat" finds the TikTok dog  | Pass: "Nothing close; nearest first" when it isn't  |
| React; the reaction reaches another phone                   | P19 | Pass: stored once                                  | Pass: "ana replied · now" on Ben's phone            |
| Share a new post from another app                           | P02 | –                                                  | Pass: kept (30 MB), "ana and pete will see it"      |
| Channels: Reactions, Your people                            | –   | Pass                                               | Pass                                                |
| "On its way" and "Needs you" for someone else's failed save | –   | Fix 2                                              | Fix 2                                               |
| Settings: version line, no Invite row for a member          | P22 | Pass                                               | Pass: "ADHX Share 2.13.0"                           |

Bugs found and fixed:

1. **A TikTok was marked kept with nothing kept.** Its first download failed
   for a reason that wasn't about the post (FFmpeg missing); the keeper fell
   back to the page's preview, found no pictures and gave up for good. Such
   failures now retry (`collectGeneric` in `src/lib/keep/download.ts`).
2. **Everyone was told about the owner's DRM-locked Vimeo save.** Ana and Ben
   saw "1 needs you" / "1 on its way" for a post only the owner could act on.
   A post that couldn't be kept or learned now counts only for its saver
   (`doing-state.ts`, `doing.ts`).
3. **A new ADHX opened on "Nothing new yet."** Every install starts with one
   person, whose own saves don't count as new. Home now offers Play my saves
   there on the web, iPhone and Android.

The web sweep on the same server (signed out, owner and member; 1440 px and
iPhone 14) also fixed shared links pointing at adhx.com, blank X thumbnails,
Sign in pushed off phone screens and X import offered without X; see the
worklog.

Not run here: the iPhone share sheet (the driver can't pick ADHX in it),
offline sharing, Live moments (too few saves to form one) and release-signed
builds.

## 28 October 2026

- **Server:** the parity test world (`pnpm parity:serve`, LAN mode) from this
  branch, on a Mac. No real accounts or data.
- **iPhone 16 Pro**, iOS 27.2, Debug build from this branch, as Ana. Reached
  the server over the USB tunnel (`http://[fd87:…::2]:3600`). Driven by the
  `DeviceDriver` UI test.
- **Samsung Galaxy A13** (SM-A137F), Android 14, Debug build from this branch,
  as Pete (as Ben for email sign-in: Pete has no email in the test world).
  Reached the server over Wi-Fi. Driven over adb.

| Journey                                                  | Row | iPhone                                                               | Android                                   |
| -------------------------------------------------------- | --- | -------------------------------------------------------------------- | ----------------------------------------- |
| Pair with a typed code, Connected, Home                  | P01 | Pass after fixes 1 and 4                                             | Pass                                      |
| A removed key on the server                              | P16 | –                                                                    | Pass: "This phone was removed…"           |
| Remove this phone (online)                               | P16 | Pass                                                                 | Pass                                      |
| React on a playing post outside Live                     | P19 | Pass after fix 2                                                     | Pass after fix 3                          |
| Share a saved post, a non-post and a new one             | P02 | –                                                                    | Pass after fix 5                          |
| Search by words                                          | P01 | Pass: "zoo" finds the zoo clip                                       | Pass                                      |
| Channels: From everyone, Your people, a friend's channel | –   | –                                                                    | Pass                                      |
| Live: a moment, Tune in                                  | P07 | Pass                                                                 | Pass                                      |
| Watch together from both phones (names, a live reaction) | P07 | Pass: "Pete · watching with you"                                     | Pass: Ana's 🔥 arrived in about a second  |
| Send straight to a friend                                | –   | Pass: Ben's feed leads with "Ana sent you this"                      | –                                         |
| Close the Send sheet; its file size                      | –   | Pass after fix 6                                                     | Pass after fixes 6 and 7                  |
| The original post: Open on X, Copy link                  | –   | Pass: "Link copied"                                                  | Pass                                      |
| Up next: jump to a post                                  | –   | –                                                                    | Pass                                      |
| Whose saves: New, Everyone, Friends, Mine                | –   | –                                                                    | Pass: newest first, checked on the server |
| Invites: make, share, take back                          | –   | –                                                                    | Pass: checked on the server               |
| Change your picture                                      | –   | Pass: the new face reached Android                                   | Pass                                      |
| Share while offline, then online                         | P02 | –                                                                    | Pass: queued, then saved                  |
| Turn the phone                                           | –   | Pass: media goes sideways, Settings stays up                         | Pass: the video goes full screen sideways |
| Labels a screen reader reads                             | –   | Pass after fix 8                                                     | –                                         |
| Reconnect with an IPv6 address                           | P01 | Pass: Settings shows `[fd87:…::2]:3600`                              | –                                         |
| Share from Safari                                        | P02 | Pass: "That’s not one post", then OK back to Safari (opened by hand) | –                                         |
| Sign in with email                                       | –   | Pass: the code connects on its own                                   | Pass after fix 9                          |

Bugs found and fixed:

1. **iPhone: Home played under the welcome.** After connecting, Home played
   behind "Connected to your ADHX", moved on and counted posts as seen, so
   Start watching opened on the fourth post. `LibraryHome` now holds the
   player while the welcome is up.
2. **iPhone: a video ending while you reacted skipped on.** With the React
   picker (or the Send sheet) open, the video's end moved to the next post
   and closed the picker, losing what you'd typed. `PlayerView` now waits at
   the end and moves on when the picker or sheet closes.
3. **Android: the same, and the picker followed you.** The video moved on with
   React, Send, More, the original or Read open, and the picker stayed open
   over the next post. `PlayerScreen` now waits at the end until they close,
   and moving off a post closes its picker.
4. **iPhone: IPv6 addresses.** Settings showed `fd87:…::2:3600` (the port read
   as part of the address), and Connect filled that back in and refused it.
   Addresses now show in brackets, and a bracketed address without a scheme
   is local (http), like a LAN IPv4 one. `ServerAddressTests` covers it.
5. **Android: the share card repeated its heading.** "That's not one post"
   (and "Couldn't save this") showed the heading again as the explanation.
   The card now says what to do.
6. **Both: the Send sheet had no ×.** Only a swipe closed it. Both apps now
   have the close button the design shows.
7. **Android: "0 MB" for small files.** The Send sheet rounded anything under
   a megabyte to 0 MB; it now says KB, like the iPhone. `SendSizeTest` covers it.
8. **iPhone: unlabelled fields.** VoiceOver read the address, code and email
   fields by their placeholder ("adhx.example.com"), because their visible
   labels sit above them. Each field now carries its label.
9. **Android: the keyboard hid "Email me a code".** With the keyboard up, the
   button scrolled out of view under "Use a pairing code instead", so only the
   keyboard's Send key worked. The button now scrolls into view once the
   keyboard is up. (A first try hid the other ways in while typing, which hid
   "Use a pairing code instead" on a fresh install, where the keyboard opens
   straight away; the follow-up keeps them.)

Noted, not changed: on Android, a share opened over ADHX itself leaves Home
playing behind the share card; sharing from another app (the usual way) isn't
affected.
