# ADHX

[![CI](https://github.com/itsmemeworks/adhx/actions/workflows/ci.yml/badge.svg)](https://github.com/itsmemeworks/adhx/actions/workflows/ci.yml)
[![Release](https://github.com/itsmemeworks/adhx/actions/workflows/release-please.yml/badge.svg)](https://github.com/itsmemeworks/adhx/actions/workflows/release-please.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> **Save now. Read never. Find always.**

ADHX turns the stuff you save from **X, Instagram, TikTok, and YouTube** into something you'll actually watch. Every saved post lands in one **collection**, plays in one full-screen **theater**, and can be tagged into a **playlist** you share as a looping theater — with public curator profiles and a community **leaderboard** on top. Open source (MIT), self-hostable, your data in a SQLite file you own.

<p align="center">
  <img src="public/og-logo.png" alt="ADHX — save now, read never, find always" width="640" />
</p>

## What it does

- **Save from four platforms** — swap any link's host to `adhx.com` (`x.com/user/status/123` → `adhx.com/user/status/123`), use the share sheet / iOS shortcut / desktop extension (`extension/`) / bookmarklet, or sync your X bookmarks in one click. On mobile: **Copy Link** in any share sheet → open ADHX → tap **Paste link**.
- **Every post gets a preview page** — clean, fast, shareable, and indexable, with inline playback. No login needed to view.
- **The theater** — one full-screen player for everything: the community **Live** pulse at `/`, **My Collection** at `/collection`, and any shared playlist. Keyboard-driven, autoplaying, auto-advancing. The grid over your saves is the **library** at `/library`.
- **Archive** — take a post out of the active queue (private — it never appears on the public pulse). Flip **Show archived** in the library when you want it back.
- **Playlists** — tag posts, make a tag public, and it becomes a looping theater at `adhx.com/t/you/tag` with your curator profile at `adhx.com/t/you`.
- **Leaderboard** — public playlists ranked by views and clones at [`/leaderboard`](https://adhx.com/leaderboard), by day / week / month / all-time.
- **Agent-friendly** — public JSON APIs, [`llms.txt`](https://adhx.com/llms.txt), and a portable [agent skill](#agent-skill) for reading X posts as structured data.

## How it works

```mermaid
flowchart LR
    A["Link from X / IG /<br/>TikTok / YouTube"] --> B["adhx.com preview page<br/>(watch, share, no login)"]
    B -->|Save| C["Your collection"]
    C --> D["Theater: watch it<br/>· Archive: hide it"]
    C -->|Tag + make public| E["Playlist theater<br/>/t/you/tag"]
    E --> F["Curator profile · Leaderboard<br/>· Live pulse"]
```

Next.js 16 + React 19, SQLite (Drizzle) on a single volume, magic-link email accounts, and optional X OAuth 2.0 PKCE to sync bookmarks. Media plays via platform-official embeds or lightweight proxy mirrors — full details in [ARCHITECTURE.md](ARCHITECTURE.md).

## Run it locally

No API keys needed to try it — email sign-in prints the magic link to your terminal in dev:

```bash
git clone https://github.com/itsmemeworks/adhx
cd adhx
pnpm install
cp .env.example .env   # defaults work out of the box
pnpm db:migrate        # creates ./data/adhdone.db (Docker does this on start; local does not)
pnpm dev
```

Set a distinct `SESSION_SECRET` before any real deploy — JWT signing and token encryption fall back to `TWITTER_CLIENT_SECRET` if it is unset. Generate one with `openssl rand -base64 32`.

Open [http://localhost:3001](http://localhost:3001), sign in with any email, copy the magic link from the server console, and paste a post URL to save your first item.

**Optional — X bookmark sync** (needs a free [X developer app](https://developer.twitter.com)):

1. Create a project + app, enable OAuth 2.0 with PKCE.
2. Set the callback URL to `http://localhost:3001/api/auth/twitter/callback`.
3. Put the Client ID/Secret in `.env` (`TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`) and set `NEXT_PUBLIC_APP_URL=http://localhost:3001`.

```bash
pnpm test        # full test suite
pnpm typecheck   # tsc
pnpm build       # production build
```

See [`.env.example`](.env.example) for every variable, [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, and [CLAUDE.md](CLAUDE.md) if you're pointing a coding agent at this repo.

### Desktop extension (optional)

Save an X / Instagram / TikTok / YouTube post in one click while you browse. Not on the Chrome Web Store yet — load it unpacked. Full walkthrough: [`extension/README.md`](extension/README.md).

```bash
# App already running at http://localhost:3001
pnpm --dir extension install
cp extension/.env.example extension/.env   # EXTENSION_PUBLIC_APP_ORIGIN=http://localhost:3001
pnpm --dir extension build
```

Chrome → `chrome://extensions` → **Developer mode** → **Load unpacked** → `extension/dist/chromium`. Pin the toolbar icon. Then on a post: toolbar click, right-click → **Save to ADHX**, or `⌘⇧A` / `Ctrl+Shift+A`. That opens `/share?url=` on your local app (signed-in autosave + theater). After you change `.env` or source, rebuild and click **Reload** on the extension card.

A session on `adhx.com` does not apply to `localhost:3001` — sign in on the origin the extension opens. On an unsupported tab the toolbar flashes **×** and stays put; right-click a real post link still works.

## Self-hosting

The `Dockerfile` builds a standalone image that migrates its own database on startup:

```bash
docker build -t adhx .
docker run -d -p 3000:3000 -v adhx_data:/data \
  -e DATABASE_PATH=/data/adhx.db \
  -e SESSION_SECRET=$(openssl rand -base64 32) \
  -e NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  adhx
```

Add `TWITTER_CLIENT_ID`/`TWITTER_CLIENT_SECRET` for X sync (callback: `<your-url>/api/auth/twitter/callback`) and `RESEND_API_KEY` for real magic-link emails. `DATABASE_PATH` defaults to `/data/adhx.db` inside the image, so the bare command above works without setting it — the `-v` flag is what makes the SQLite file persist across container restarts.

Prefer one command? `docker-compose.yml` builds the image and wires up the same volume:

```bash
docker compose up --build
```

A ready-to-use Fly.io config ships in `fly.toml`:

```bash
fly apps create your-app && fly volumes create adhx_data --region lhr --size 1
fly secrets set SESSION_SECRET=$(openssl rand -base64 32) NEXT_PUBLIC_APP_URL=https://your-app.fly.dev
fly deploy
```

## Public API

No auth, rate-limited, stable:

| Endpoint                                 | Returns                                                              |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `GET /api/share/tweet/{username}/{id}`   | Any X post as clean JSON — full long-form Articles included          |
| `GET /api/trending`                      | The anonymous community pulse (recent saves/previews)                |
| `GET /api/collections/trending?window=`  | The collection leaderboard (`today` / `week` / `month` / `all-time`) |
| [`/llms.txt`](https://adhx.com/llms.txt) | Machine-readable index of everything above                           |

## Agent skill

ADHX ships an [Agent Skill](https://agentskills.io) — paste any X link into a skills-compatible agent (Claude Code, Claude, Cursor, Gemini CLI, Codex, Copilot, and more) and it reads the post as structured JSON via the API above. No browser, no scraping, Articles included.

```bash
# Claude Code
/plugin marketplace add itsmemeworks/adhx
/plugin install adhx

# Any other agent: drop the skill file into its skills directory
mkdir -p <SKILLS_DIR>/adhx && curl -sL \
  https://raw.githubusercontent.com/itsmemeworks/adhx/main/skills/adhx/SKILL.md \
  -o <SKILLS_DIR>/adhx/SKILL.md
```

Skill source: [`skills/adhx/SKILL.md`](skills/adhx/SKILL.md)

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Conventional commits, tests required, releases automated via Release Please.

- [Privacy](PRIVACY.md) — what the hosted app stores; `activity.userId` is never public
- [Security](SECURITY.md) — private vulnerability reports (do not file a public issue)
- [Code of Conduct](CODE_OF_CONDUCT.md)

## License

[MIT](LICENSE)
