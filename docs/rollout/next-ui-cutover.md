# Rollout: the find-by-meaning redesign (`next_ui`)

The redesign (phases 0–7 on `feat/find-by-context`) is **on by default in
code** since phase 7. Production gets it in stages: ship the code with the
redesign forced off, let understanding catch up, open it to a few people,
then flip the default. Every step is reversible without a rebuild.

## What changes for people

| Before | After (default) | Opted out (`Use the previous look`) |
| --- | --- | --- |
| Signed-in `/` → `/saved` | `/play?recent=1` (theater on your newest saves) | `/saved` |
| `/saved?open=` | `/play?recent=1&start=platform:id` | unchanged |
| `/library?search=` | `/search?q=` | unchanged |
| `/tags` | `/channels` | unchanged |
| `/t/{user}/{tag}` | new channel page (same URL, same visibility rules) | old playlist page |
| — | `/start` (email-link sign-in, X import), `/play`, `/search`, `/channels` | redirect to the old equivalents |

Unchanged in both: signed-out `/` (public theater), `/live`, `/trending`,
`/leaderboard`, `/settings`, `/admin`, preview pages (`/{user}/status/{id}` …).

## Switches

- `NEXT_UI_FORCE=off|on` — **server runtime secret, wins over everything**.
  `fly secrets set NEXT_UI_FORCE=off -a <app>` rolls everyone back (machines
  restart, no rebuild). Unset it to return to the default.
- Per browser: `/api/next-ui?value=0&to=/saved` (the "Use the previous look"
  links) or `?value=1`; `?next_ui=0|1` on any page also works.
- `NEXT_PUBLIC_NEXT_UI=0` at build time changes the default (needs a rebuild;
  prefer `NEXT_UI_FORCE`).
- `SEMANTIC_SEARCH=off` turns the understanding pipeline off entirely (search
  falls back to keyword matches; no model processes start).

## Before anything ships

1. **GitHub**: push `feat/find-by-context` as `conspirafi`
   (`gh auth login` first), open the PR, CI green (unit + e2e; e2e pins the
   previous UI with `NEXT_UI_FORCE=off`).
2. **Rotate the Jev key** that was pasted in chat, then set it on both apps:
   `fly secrets set TYPESAFE_API_KEY=… -a adhx` and `-a adhx-prod`. Never in the repo.
3. **Review the privacy page** (`src/app/privacy/page.tsx`): it now discloses
   search by meaning, Everyone search, and TypeSafe/Hugging Face. It used to
   say "no metered AI on your library", which is no longer true.
4. **Machines**: both `fly.*.toml` ask for 4GB (web ~0.4GB + jobs child up to
   ~2GB + query child ~0.6GB). Confirm with `fly scale show -a <app>` after
   deploy; staging is shared-cpu-2x, production performance-1x.
5. **Volume space**: the model cache is ~1.3GB at `/data/models`, plus a few KB
   per post for vectors. Check free space: `fly ssh console -a <app> -C "df -h /data"`.
6. **Email**: production needs `RESEND_API_KEY` (already used by the current
   magic link). Locally the link is only printed to the dev log.

## Stage 1 — staging, dark

```bash
fly secrets set NEXT_UI_FORCE=off -a adhx
fly deploy -c fly.toml
```

Check:

- Logs: migrate prints `Ensured post_embeddings / understanding_queue tables`;
  two `child.ts` processes start, **query first**, jobs once query is ready
  (they share the model cache; starting together on an empty volume races
  the download).
- First boot downloads the model from Hugging Face (~1.3GB) once; later boots
  load from `/data/models`.
- Memory stays under ~3.2GB; the site stays responsive while videos are
  processed (`/api/health` under ~200ms during a video job — inference runs
  only in the niced child processes).
- Backfill progress: `GET /api/understanding/status` signed in, or count rows:

```bash
fly ssh console -a adhx -C "sqlite3 /data/adhx.db \"select kind, status, count(*) from post_embeddings group by 1,2; select kind, count(*) from understanding_queue group by 1\""
```

## Stage 2 — staging, on

```bash
fly secrets unset NEXT_UI_FORCE -a adhx
```

Walk through: sign up with a new email (real link via Resend) → name →
Connect X → import → search (mine/everyone, filters, words only) → Play all →
theater (rail, sheets, keys, swipes on a phone) → Save → add to channel / new
channel → channel page signed out → paste a link → learning ring → "Use the
previous look" and back.

## Stage 3 — production, dark

```bash
fly secrets set NEXT_UI_FORCE=off TYPESAFE_API_KEY=… -a adhx-prod
fly deploy -c fly.production.toml
```

The old UI keeps serving while every existing save is understood. Estimate
the backfill from the library size (1 dedicated CPU, one job at a time):

```bash
fly ssh console -a adhx-prod -C "sqlite3 /data/adhx.db \"select count(*) from (select distinct platform, id from bookmarks); select media_type, count(*) from (select distinct platform, bookmark_id, media_type from bookmark_media) group by 1\""
```

Rough cost per post, measured locally (calibrate on staging): words ~0.1–0.2s,
pictures ~5–8s, videos ~15–30s. Example: 20k posts with 8k photos and 6k
videos ≈ 1h + 14h + 40h ≈ 2–3 days. New saves and anything about to play
jump the queue, so this never blocks people.

Watch Sentry for `semantic.*`, `channels.auto`, `/api/search*` and memory
alerts on the machine.

## Stage 4 — production, a few people

The owner and admins opt in with `https://adhx.com/api/next-ui?value=1&to=/`
for a few days while the backfill runs.

## Stage 5 — production default

```bash
fly secrets unset NEXT_UI_FORCE -a adhx-prod
```

Anyone can go back with "Use the previous look" (search and channels screens).

## Rollback

```bash
fly secrets set NEXT_UI_FORCE=off -a adhx-prod
```

Data is compatible both ways: the new tables (`post_embeddings`,
`understanding_queue`, `auto_channels`, `post_text_fts`) are additive, and
channels are ordinary tags. To stop the background work too, also set
`SEMANTIC_SEARCH=off`.

## Known gaps (follow-ups)

- Signed-out `/` is still the previous public theater; a redesigned landing
  that leads to `/start` is not built.
- `/live`, trending, leaderboard and settings keep the previous look.
- Videos are understood from frames only (no audio), by design for now.
- The redesign has unit/component tests but no Playwright suite yet.
- Delete the previous UI and the flag once production has been on the new
  default for a few weeks without a rollback.
