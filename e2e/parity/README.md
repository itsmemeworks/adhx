# Design parity harness

Puts the app next to the friends-feed design boards. One Next server on
**:3600** holds the boards' world (Pete, Ana, Ben, Mum and Jo, their saves,
channels, moments, invites, processing rows), with the real kept media. The web
capture screenshots every web board's screen from it, and the iPhone and
Android apps can pair against the same server with the phone keys it writes.

You need the repository's dependencies (`pnpm install`), Playwright's browsers
(`pnpm test:e2e:install`, once) and FFmpeg (the bundled `ffmpeg-static`, or
`FFMPEG_PATH`). `parity:compare` also needs the exported design boards as PNGs
in `PARITY_REF_DIR`. Nothing here touches your real database or `:3001`.

```bash
# 1. Fresh DB + media, then Next on http://127.0.0.1:3600 (leave it running)
PARITY_MEDIA_SRC=/path/to/adhx/data/media pnpm parity:serve

# 2. Screenshot every j*-web-* board at 1280×800, and again at 390×844
pnpm parity:capture                      # both
pnpm parity:capture --project web -g j2-5   # one board, one size

# 3. Side-by-sides and scores
pnpm parity:compare                      # PARITY_REF_DIR=… for other boards
```

`parity:capture` reuses a server already on :3600, or starts `parity:serve`
itself. Restarting `parity:serve` rebuilds the database from scratch (new
session cookies and phone keys, times relative to now) and clears the
`.next-parity` dev cache (a stale one sent open pages into a reload loop after
a restart). `PARITY_PORT=3604` (on serve, capture and compare alike) runs a second
server beside another one.

## What it writes (`e2e/parity/.out/`, gitignored)

| Path                                        | What                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `credentials.json`                          | `server`, and per member (`pete` and `ana` admins, `ben`, `mum`, `jo`): `session` (the `adhx_session` cookie value), `cookie` (ready-made `Cookie` header), `phoneKey` (paired through the real pairing-code flow; `Authorization: Bearer …`), `phones` (Ana has two). Plus `pending` (the waiting join request). |
| `parity.db`, `media/`                       | The scratch database and `MEDIA_DIR` (files are APFS clones of the source, so they cost no disk)                                                                                                                                                                                                                  |
| `media-cache/`                              | Videos made from stills and grabbed frames, reused across runs                                                                                                                                                                                                                                                    |
| `server.log`                                | When you start the server with `nohup … > .out/server.log`                                                                                                                                                                                                                                                        |
| `web/<board>.png`, `web-mobile/<board>.png` | Captures, with `<board>.json` beside each: who it ran as, the URL, which states were reached, which weren't, and known gaps                                                                                                                                                                                       |
| `compare/<board>.png`                       | design \| app, at 1280×800                                                                                                                                                                                                                                                                                        |
| `compare-mobile/<board>.png`                | the closest phone board \| mobile web                                                                                                                                                                                                                                                                             |
| `report.json`, `report.md`                  | Every pair with a score, worst first                                                                                                                                                                                                                                                                              |

The score is the mean absolute difference of small greyscale thumbnails (0 =
same, 100 = opposite). It flags a wrong screen or a missing panel, nothing
finer. Judge the side-by-sides by eye.

## The admin boards (`admin-1` … `admin-10`)

`seed-admin.ts` adds the admin world on top (figures in `ADMIN`, `world.ts`):
joined dates, last seen and who invited whom (used invites), Ana an admin,
12 of Pete's own filler saves Just for me, notes on older shared saves,
members' channels (23, six public, never Pete's), reactions counted per day
and kind, the live-moment log (this week's five named moments, alerts, tune-ins
by day), 30 days of opens/plays/finishes/searches/file sends/shares and
channel plays, sends (the unseen ones only to Mum and Jo), Ana's watched
count (older filler), two hidden posts (not any board's posts) with the admin
log, and the Mac helper's name. Once Next is up, `parity:serve` puts four
bells (not Pete's) on the forming group. Each admin capture runs as Pete;
board 10.8 types the dark chocolate link and "ben" into the lookups.

Admin limits: the server name is the parity host; saves per day follow the
seed's save times (the filler is older than 16 days); X leads By network
(the filler is X posts); sign-in links held for an admin need
`EMAIL_LINKS_TO_ADMIN`, which the parity server doesn't set; Ana has no Just
for me saves (they'd change her channel counts on other boards). Making Ana an
admin adds the admin cards to her own Settings (j5-1).

## Using it from the phone apps

```bash
KEY=$(jq -r .members.ben.phoneKey e2e/parity/.out/credentials.json)
curl -H "Authorization: Bearer $KEY" "http://127.0.0.1:3600/api/app/feed?mode=new"
```

A simulator reaches the server at `http://127.0.0.1:3600`; an Android emulator at
`http://10.0.2.2:3600` (or `127.0.0.1` after `adb reverse tcp:3600 tcp:3600`).
Hand the key to a debug build without pairing: on iPhone with the
`-adhxServer … -adhxKey …` launch arguments ([iPhone README](../../apps/ios/README.md#debug-launch-arguments)),
on Android with `DebugConnectActivity` ([Android README](../../apps/android/README.md#connect-a-debug-build-without-signing-in)).
Or pair for real: Settings → Phone app on the web as that member makes a code.

## The world (`world.ts`, `seed.ts`)

- **Members**: Pete (admin, no email), Ana (admin), Ben, Mum, Jo, with generated
  avatars. Who can invite is **Anyone, I approve**; a second account named Ben
  (`benji`, invited by Jo 10 minutes ago) is waiting. The member Ben stays a
  member because every other board needs his saves and phone.
- **Invites**: `7KQ4` (Pete, 2 min ago) and `R9TB` (Ana, yesterday).
- **Posts**: the boards' 24 kept posts (Me at the zoo, Charlie bit my finger, the
  Rickroll, the hamster, dark chocolate, the steak, the cormorant, the synth
  patch, loafers, the bridge, the pub, forss, paper planes, NASA, …) saved by
  the boards' people at the boards' times. Pete's paper planes and the TikTok
  remix are private. Posts the source only has a thumbnail for (Charlie, the
  Vimeo plane) get a video looped from the still.
- **Filler**: 562 older posts (older than New's 14 days, already seen) so save
  counts and channel sizes match the boards (Ana 96, Ben 212, Mum 54, Jo 31,
  Pete 212; Cats with opinions 38, Food you'll cook one day 41, Kitchen synths
  17, Babies vs objects 26). Each borrows a hero post's still for its topic.
- **New**: Pete has 12 he hasn't seen. Ana sent Pete her bridge photo 3
  minutes ago (`post_sends`), so New leads with "Ana sent you this".
- **Channels**: From everyone (`group_channels`) and Pete's Made for you
  (`auto_channels`) are stored directly (naming needs the model) and stamped 30
  days ahead so they don't recompute while the server runs.
- **Right now**: synthetic vectors per topic; with `MOMENT_MIN_SAVERS=1` the
  babies and chocolate posts form live moments. Without the model they're named
  by their shared word ("Baby", "Dark"), not "Babies vs objects": the boards'
  names aren't in `MOMENT_TOPICS`, and the no-model fallback is a single
  shared word, so the seed can't reach them through the normal naming path.
  The lead card's "3 saves in 10 min" counts from the seed's save times, so
  the span grows the longer the server runs (15, then 30 min).
- **Forming** (j7-1): forming groups are only made from saves that land while
  the engine runs, so once Next is up `parity:serve` looks at `/api/moments`
  (starting the engine), then has Ben and then Jo save forss and Ana's paper
  plane (`FORMING_SAVES`, copies of an existing save's row). The card shows
  Jo and Ben's faces and "Tell me when it's live". Those two posts keep the
  week's visible synth posts at three, under the four a regroup needs, so it
  stays forming. Without the model it's named "Something new", and with
  `MOMENT_MIN_SAVERS=1` it counts saves ("2 more saves", four segments), not
  the board's "1 more save" over three people.
- **/doing**: keeping (dark chocolate, at 62%), converting (the synth patch),
  listening (the second hamster video), needs you (a private Instagram post),
  waiting (an Instagram Reel on attempt 2), and ready (recent saves). Keep is
  on, but the seed pins the `KEEP_BACKFILL=off` cutoff in the year 2999, so the
  keep worker never downloads anything. The worker turns `running` jobs back to
  `pending` when it starts, so `parity:serve` puts dark chocolate's job back to
  running at 62% (`keep_jobs.progress`) once Next is up: the theater shows
  "Getting it ready · 62%" on it (j1-4). Board j1-5 lets the browser (only) see
  it kept on the next look, so the switch to playing and "Kept on your ADHX"
  are the real ones.
- **Notes on saves**: Ana's "the original and still the best" on Charlie,
  Ben's "you’re welcome" on the Rickroll, Mum's "making this Sunday" on the
  sauce video and Pete's "this is so you, Ben" on the dark chocolate Reel.

The parity server runs with `SEMANTIC_SEARCH=off` (search is keywords plus
seeded speech and on-screen words), `AUTO_SYNC_EVERY_MINUTES=0`, and FxTwitter /
Instagram / TikTok lookups pointed at a dead local port, so nothing goes online.

It also runs with `PROCESSING_MODE=remote` and a local-only
`PROCESSING_WORKER_TOKEN` (`env.ts`). Once Next is up, `parity:serve` posts a
heartbeat to `/api/processing/jobs` every 30 s with that token, for a lease
that doesn't exist: the server answers 409, never claims or changes a job, and
notes the helper as seen, so /doing says "Mac helper connected" (j8-3). With
semantic search off nothing is ever leased to it.

## Media

`PARITY_MEDIA_SRC` is an ADHX `MEDIA_DIR` holding the boards' posts (folders
are `{platform}/{id}-{sha1(id)[0:8]}`, see `postDir` in `src/lib/keep/store.ts`).
Without it (CI), every file is a generated ffmpeg placeholder and
`credentials.json` lists them under `placeholders`. No media is committed.

## Captures never change the server

`/api/views`, `/api/app/seen` and `/api/understanding/prioritize` are answered
in the browser, the new invite on board 5.1 is mocked, and j1-5's "kept" is a
rewrite of `/api/activity/processing/posts` in the browser, so captures can run
again and again. Two more happen in the page only:

- **j7-2**: an init script (`recordStreams`) remembers the page's EventSources;
  `streamEvent` plays one `save` event (Jo saving Charlie into the moment) into
  them, so "Jo just saved one · playing next" and the Up next row are the
  theater's real handling of a save. The server's stream is untouched.
- **j8-2**: the seeded pub photo (`.out/media/…/photo-1.jpg`) is picked through
  the dialog's file input as `pub-night.jpg` and zoomed a little. Nothing is
  saved.

Phone comparisons play the phone board's post where it differs: j2-5 on a
phone plays the upright hamster video (j2-1), not Me at the zoo. People using the web app by hand do change it: playing your
own saves queues understanding work that nothing drains (the model is off), so
`/doing` grows "learning" rows. Restart `parity:serve` to reset.

## Adding a board

Add an entry to `BOARDS` in `capture.spec.ts`: the member, the URL, a `setup`
that puts the screen into the board's state (wrap each step in `attempt` so a
miss is recorded rather than failing the run), `seek` for a stable video frame,
`phone` for the closest phone board, and `known` for states the data can't show.

## Known limits (left as they are)

- **Moment names**: "Baby", "Dark" rather than "Babies vs objects" (see Right now above). Don't add the boards' names to `MOMENT_TOPICS`.
- **Moment lifetime**: the babies moment drops out of `/api/moments` about 25 minutes after seeding (the seed's save times age out of the regroup). Capture j7 screens, web and phone, from a freshly started server.
- **j3-2**: the grid is the board's (row-first masonry: newest along the top, then the shortest column; the note card in the last column under its first tile; upright tiles). The tiles aren't the board's eight: Ana's channel also holds the zoo, the second hamster, the bird and the synth patch, which other boards need her to have saved, and the board's own time labels ("2h ago", "5h ago", "3 days ago") contradict its order, so no newest-first seed reproduces it. Hence "8 you haven't seen", not 4.
- **j4-1 / j4-2**: without the model the lead is the best keyword match. "the baby that bites his brother’s finger" has no words in Charlie's speech (the real transcript has none of them), so "Same baby, same hamster" leads; dark chocolate's on-screen words repeat its caption, so the match is credited to the caption ("In the words"), not "On screen". Changing the caption would break j1-4/j1-5.
- **j5-5**: the server is on 127.0.0.1, so the page rightly warns that a phone can't reach it.
- **j8-2**: Pete has no X connected, so "Use your X picture" isn't offered.
- **j8-3**: "Needs you" sorts first on purpose (it must survive the 60-row cut), and Pete can't retry Mum's post (only people who saved it can).
- **j7-1**: the lead reads RISING or LIVE from real save times; the forming group is "Something new" with "2 more saves" (see Forming above).
- **j2-2** (no web board): the mobile web's Why this one is compared with the phone board. The capture opens the steak, whose like reason (with its thumbnail) names dark chocolate; the board's hamster has no like reason with the seeded vectors.
- Phone boards include native chrome (two-row header, no web tab bar, store buttons) that mobile web doesn't copy.
