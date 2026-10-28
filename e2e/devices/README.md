# Driving real phones

Test the iPhone and Android apps on real devices against a throwaway test
server, one step at a time. You can run the journeys in
[phone acceptance checks](../../docs/rollout/phone-device-acceptance.md) by
hand, or an agent can run them for you. Nothing here touches your real server,
your data or `:3001`.

| Piece                             | What it does                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm parity:serve` (LAN mode)    | The [parity](../parity/README.md) test world (Pete, Ana, Ben, Mum, Jo, their saves and channels), reachable by the phones |
| `pnpm parity:pair <member>`       | A fresh pairing code for one member, as Settings → Phone app would show it                                                |
| `hub.mjs`                         | Passes commands from this Mac to the iPhone driver, and answers back                                                      |
| `ios.sh`                          | Builds ADHX Share and the `DeviceDriver` UI test, installs both on the iPhone and keeps the driver running                |
| `drive.mjs <ios\|android> <op> …` | One step: read the screen, tap, type, swipe, take a screenshot. Android goes straight over adb                            |

## Once

- **iPhone:** Developer Mode on, the Mac trusted, and
  `apps/ios/Config/Local.xcconfig` with your team, as in the
  [iPhone guide](../../apps/ios/README.md). The first run asks on the phone to
  allow the Local Network for the driver.
- **Android:** USB debugging on, and the Mac allowed. `adb` comes from the
  Android SDK (`~/Library/Android/sdk/platform-tools`, or set `ADB`).
- Both phones on USB. An iPhone on USB is reached over the tunnel Xcode keeps
  to it, so it works without Wi-Fi. Android reaches the Mac over Wi-Fi, or over
  USB with `adb reverse tcp:3600 tcp:3600` and `http://127.0.0.1:3600`.

## Every session

```bash
# 1. The test world, listening on every interface (IPv4 and IPv6). The public
#    origin goes into invite links; use this Mac's Wi-Fi address.
PARITY_HOST=:: PARITY_PUBLIC_ORIGIN=http://$(ipconfig getifaddr en0):3600 \
  PARITY_MEDIA_SRC=/path/to/adhx/data/media pnpm parity:serve

# 2. The hub, then the iPhone driver (xcrun devicectl list devices for the UDID)
node e2e/devices/hub.mjs
IOS_UDID=<udid> e2e/devices/ios.sh

# 3. The Android app
(cd apps/android && ./gradlew assembleDebug)
node e2e/devices/drive.mjs android install apk=apps/android/app/build/outputs/apk/debug/app-debug.apk
```

Without `PARITY_MEDIA_SRC`, every post plays a generated test pattern; the
journeys still work. To connect a phone, take a code with
`pnpm parity:pair ana` and type it under **Type the code** on the Connect
screen. The server address is `http://[<tunnel>::2]:3600` for an iPhone on USB
(`ios.sh` prints it) or `http://<Wi-Fi address>:3600`.

## Steps

`node e2e/devices/drive.mjs <ios|android> <op> key=value …`. Values that look
like numbers or `true`/`false` are parsed; `[…]` and `{…}` are JSON.

| Op                             | iPhone                                                                     | Android                                                        |
| ------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `elements`                     | What's on screen: type, label, id, value, centre and size                  | The same, from uiautomator                                     |
| `shot`                         | Screenshot to `e2e/devices/.out/` (or `out=`)                              | The same                                                       |
| `tap`                          | `label=`, `id=` or `contains=` (+ `type=`, `index=`), or `x= y=` in points | `text=`, `desc=`, `id=` or `contains=`, or `x= y=` in pixels   |
| `long`                         | Like `tap`, with `seconds=`                                                | The same                                                       |
| `type`                         | `text=` into the focused field (or `label=` to tap one first)              | `text=` (`into=` a field by its text first)                    |
| `clear`                        | Empties a field (`label=`…)                                                | Empties a field (`x= y=` or `text=`)                           |
| `swipe`                        | `dir=up\|down\|left\|right`, on the screen or an element                   | `dir=`, or `x1= y1= x2= y2= ms=`                               |
| `exists`                       | `label=`… `timeout=` → `{"exists":true}`                                   | The same, with Android's keys                                  |
| `launch`                       | Starts ADHX Share (`args=[…]`, `env={…}`)                                  | Starts ADHX                                                    |
| `terminate` / `stop`           | Ends the app                                                               | `stop` force-stops it; `clear` wipes its data                  |
| `target`                       | `bundle=com.apple.mobilesafari` to drive another app, `bundle=adhx` back   | –                                                              |
| `open`                         | `url=` (a deep link or a web page)                                         | `url=` as a VIEW intent                                        |
| `share`                        | –                                                                          | `text=` (a link) to ADHX's share screen, like the share sheet  |
| `home`, `alert`, `orientation` | Home button; tap a system alert's `button=`; `to=left\|right\|portrait`    | `key name=home\|back\|enter…`, `rotate to=landscape\|portrait` |
| `wait`                         | `seconds=`                                                                 | `seconds=`                                                     |
| `quit`                         | Ends the driver                                                            | –                                                              |

The iPhone driver finds elements in a snapshot of the screen and taps their
middle, so a live camera or a playing video never stops it. If it does stop,
`ios.sh` starts it again.
