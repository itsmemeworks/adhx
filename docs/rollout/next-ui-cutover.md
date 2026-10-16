# Rollout: the find-by-meaning redesign

The redesign is the only signed-in UI: the previous look and its `next_ui`
flag were removed, so there is **no runtime kill switch** any more. A deploy
switches everyone at once; rolling back means redeploying the previous
release. Understanding can still be switched off at runtime
(`SEMANTIC_SEARCH=off`), which leaves search on keyword matches.

## What changes for people

| Before | After |
| --- | --- |
| Signed-in `/` → `/saved` | `/play?recent=1` (theater on your newest saves) |
| `/saved?open=` | `/play?recent=1&start=platform:id` |
| `/library?search=` | `/search?q=` |
| `/tags` | `/channels` |
| `/t/{user}/{tag}` | new channel page (same URL, same visibility rules) |
| — | `/start` (email-link sign-in, X import), `/play`, `/search`, `/channels` |

Unchanged: signed-out `/` (public theater), `/live`, `/trending`,
`/leaderboard`, `/settings`, `/admin`, preview pages (`/{user}/status/{id}` …).

## Switches

- `SEMANTIC_SEARCH=off` turns the understanding pipeline off entirely (search
  falls back to keyword matches; no model processes start). Runtime secret,
  no rebuild.
- There is no switch back to the previous look.

## Before anything ships

1. **GitHub**: push `feat/find-by-context` as `conspirafi`
   (`gh auth login` first), open the PR, CI green (unit + e2e).
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
6. **Right now**: `MOMENT_MIN_SAVERS` (default 3) is how many different people must save the same kind of thing before it's a moment; lower it while the user base is small. Moments only appear once posts are understood, so they fill in as the backfill runs.
7. **Email**: production needs `RESEND_API_KEY` (already used by the current
   magic link). Locally the link is only printed to the dev log.

## Stage 1 — staging

```bash
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

Walk through: sign up with a new email (real link via Resend) → name →
Connect X → import → search (mine/everyone, filters, words only) → Play all →
theater (rail, sheets, keys, swipes on a phone, the "More like …" note after
the results) → Save → add to channel / new channel → channel page signed out
→ paste a link → learning ring → account menu (Sync, Settings, Sign out) →
old links (`/saved?open=`, `/library?search=`, `/tags`) land on the new screens.

## Stage 2 — production

Without a dark launch, production switches on deploy while existing saves are
still being understood. Until then search answers from words and keywords
(results say "Words only" and the learning ring shows progress), so deploy at
a quiet time and expect the first day or two to improve as pictures and videos
are learned. Estimate the backfill first (1 dedicated CPU, one job at a time):

```bash
fly ssh console -a adhx-prod -C "sqlite3 /data/adhx.db \"select count(*) from (select distinct platform, id from bookmarks); select media_type, count(*) from (select distinct platform, bookmark_id, media_type from bookmark_media) group by 1\""
```

Rough cost per post, measured locally (calibrate on staging): words ~0.1–0.2s,
pictures ~5–8s, videos ~15–30s. Example: 20k posts with 8k photos and 6k
videos ≈ 1h + 14h + 40h ≈ 2–3 days. New saves and anything about to play
jump the queue.

```bash
fly secrets set TYPESAFE_API_KEY=… -a adhx-prod
fly deploy -c fly.production.toml
```

Watch Sentry for `semantic.*`, `channels.auto`, `/api/search*` and memory
alerts on the machine.

## Rollback

Redeploy the last release from before the redesign (`fly releases -a
adhx-prod`, then `fly deploy --image <previous image>`). Data is compatible
both ways: the new tables (`post_embeddings`, `understanding_queue`,
`auto_channels`, `post_text_fts`) are additive, and channels are ordinary
tags. To stop only the background work, set `SEMANTIC_SEARCH=off`.

## Known gaps (follow-ups)

- Videos are understood from frames only (no audio), by design for now.
- The redesign has unit/component tests but no Playwright suite yet.
- Settings, the signed-out home, Live, Trending, Leaderboard, post previews,
  Admin and Welcome still use the previous look; nothing links back to the
  removed screens.
