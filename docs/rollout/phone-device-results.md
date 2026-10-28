# Phone device results

Results of the [phone acceptance checks](phone-device-acceptance.md) on real
phones, newest run first. Each run says what was tested on which device and
build. A row not listed was not run. Bugs found are fixed in the same change,
with the fix named. How to drive the phones: [`e2e/devices`](../../e2e/devices/README.md).

## 28 October 2026

- **Server:** the parity test world (`pnpm parity:serve`, LAN mode) from this
  branch, on a Mac. No real accounts or data.
- **iPhone 16 Pro**, iOS 27.2, Debug build from this branch, as Ana. Reached
  the server over the USB tunnel (`http://[fd87:…::2]:3600`). Driven by the
  `DeviceDriver` UI test.
- **Samsung Galaxy A13** (SM-A137F), Android 14, Debug build from this branch,
  as Pete. Reached the server over Wi-Fi. Driven over adb.

| Journey                                      | Row | iPhone                   | Android                         |
| -------------------------------------------- | --- | ------------------------ | ------------------------------- |
| Pair with a typed code, Connected, Home      | P01 | Pass after fixes 1 and 4 | Pass                            |
| A removed key on the server                  | P16 | –                        | Pass: "This phone was removed…" |
| Remove this phone (online)                   | P16 | Pass                     | –                               |
| React on a playing post outside Live         | P19 | Pass after fix 2         | Pass after fix 3                |
| Share a saved post, a non-post and a new one | P02 | –                        | Pass after fix 5                |
| Search by words                              | P01 | –                        | Pass                            |

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

Noted, not changed: on Android, a share opened over ADHX itself leaves Home
playing behind the share card; sharing from another app (the usual way) isn't
affected.
