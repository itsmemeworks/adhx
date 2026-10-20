# Design parity harness

Puts the app next to the friends-feed design boards. One Next server on
**:3600** holds the boards' world (Pete, Ana, Ben, Mum and Jo, their saves,
channels, moments, invites, processing rows), with the real kept media. The web
capture screenshots every web board's screen from it, and the iPhone and
Android apps can pair against the same server with the phone keys it writes.

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

| Path                                        | What                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `credentials.json`                          | `server`, and per member (`pete` admin, `ana`, `ben`, `mum`, `jo`): `session` (the `adhx_session` cookie value), `cookie` (ready-made `Cookie` header), `phoneKey` (paired through the real pairing-code flow; `Authorization: Bearer …`), `phones` (Ana has two). Plus `pending` (the waiting join request). |
| `parity.db`, `media/`                       | The scratch database and `MEDIA_DIR` (files are APFS clones of the source, so they cost no disk)                                                                                                                                                                                                              |
| `media-cache/`                              | Videos made from stills and grabbed frames, reused across runs                                                                                                                                                                                                                                                |
| `server.log`                                | When you start the server with `nohup … > .out/server.log`                                                                                                                                                                                                                                                    |
| `web/<board>.png`, `web-mobile/<board>.png` | Captures, with `<board>.json` beside each: who it ran as, the URL, which states were reached, which weren't, and known gaps                                                                                                                                                                                   |
| `compare/<board>.png`                       | design \| app, at 1280×800                                                                                                                                                                                                                                                                                    |
| `compare-mobile/<board>.png`                | the closest phone board \| mobile web                                                                                                                                                                                                                                                                         |
| `report.json`, `report.md`                  | Every pair with a score, worst first                                                                                                                                                                                                                                                                          |

The score is the mean absolute difference of small greyscale thumbnails (0 =
same, 100 = opposite). It flags a wrong screen or a missing panel, nothing
finer. Judge the side-by-sides by eye.

## Using it from the phone apps

```bash
KEY=$(jq -r .members.ben.phoneKey e2e/parity/.out/credentials.json)
curl -H "Authorization: Bearer $KEY" "http://127.0.0.1:3600/api/app/feed?mode=new"
```

A simulator reaches the server at `http://127.0.0.1:3600`; an Android emulator at
`http://10.0.2.2:3600`. Store the key the way the app stores a paired key, or
pair for real: Settings → Phone app on the web as that member makes a code.

## The world (`world.ts`, `seed.ts`)

- **Members**: Pete (admin, no email), Ana, Ben, Mum, Jo, with generated
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
- **New**: Pete has 12 he hasn't seen.
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

## Media

`PARITY_MEDIA_SRC` is an ADHX `MEDIA_DIR` holding the boards' posts (folders
are `{platform}/{id}-{sha1(id)[0:8]}`, see `postDir` in `src/lib/keep/store.ts`).
Without it (CI), every file is a generated ffmpeg placeholder and
`credentials.json` lists them under `placeholders`. No media is committed.

## Captures never change the server

`/api/views`, `/api/app/seen` and `/api/understanding/prioritize` are answered
in the browser, the new invite on board 5.1 is mocked, and j1-5's "kept" is a
rewrite of `/api/activity/processing/posts` in the browser, so captures can run
again and again. People using the web app by hand do change it: playing your
own saves queues understanding work that nothing drains (the model is off), so
`/doing` grows "learning" rows. Restart `parity:serve` to reset.

## Adding a board

Add an entry to `BOARDS` in `capture.spec.ts`: the member, the URL, a `setup`
that puts the screen into the board's state (wrap each step in `attempt` so a
miss is recorded rather than failing the run), `seek` for a stable video frame,
`phone` for the closest phone board, and `known` for states the data can't show.
