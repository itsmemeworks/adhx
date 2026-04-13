# ADHX

[![CI](https://github.com/itsmemeworks/adhx/actions/workflows/ci.yml/badge.svg)](https://github.com/itsmemeworks/adhx/actions/workflows/ci.yml)
[![Release](https://github.com/itsmemeworks/adhx/actions/workflows/release-please.yml/badge.svg)](https://github.com/itsmemeworks/adhx/actions/workflows/release-please.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> **Save now. Read never. Find always.**

For people who bookmark everything and read nothing. A Twitter/X bookmark manager that actually helps you find that tweet you saved 6 months ago.

<p align="center">
  <img src="https://img.shields.io/badge/Bookmarks_Saved-∞-8B5CF6?style=for-the-badge" alt="Bookmarks Saved: Infinite" />
  <img src="https://img.shields.io/badge/Bookmarks_Read-Maybe_3-gray?style=for-the-badge" alt="Bookmarks Read: Maybe 3" />
</p>

---

## ⚡ Quick Add: URL Prefix

Save tweets instantly by adding `adh` before any x.com URL:

```
x.com/user/status/123456789
  ↓
adhx.com/user/status/123456789
```

The tweet is saved to your collection and opens in the lightbox. It's that easy. Your future self will thank you. Probably.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🐿️ **Hoard Mode** | Sync up to 800 bookmarks from Twitter/X. No judgment here. |
| 🖼️ **Gallery View** | Visual masonry grid with hover previews for videos |
| 🔍 **Actually Find Stuff** | Full-text search that works. Revolutionary, we know. |
| 🏷️ **Tag Everything** | Custom tags to organize your chaos (or don't, we won't tell) |
| ✅ **Read Tracking** | Mark bookmarks as read so you know what you've ~~actually looked at~~ scrolled past |
| 📖 **Article Support** | Full rendering of X Articles with rich text and images |
| ⌨️ **Keyboard Shortcuts** | ← → to browse, R/U for read/unread, Esc to close |
| 🔤 **ADHD-Friendly Fonts** | Choose from 4 fonts designed for readability (Lexend, Atkinson Hyperlegible, etc.) |
| 📖 **Bionic Reading** | Bold the first part of each word to help your eyes flow |
| 👥 **Multi-User Ready** | Each user gets their own bookmarks, tags, and read status |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- Twitter/X Developer Account (for OAuth credentials)
- A concerning number of unread bookmarks

### Setup

```bash
# Clone the repo
git clone https://github.com/itsmemeworks/adhx
cd adhx

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and connect your Twitter/X account.

### Environment Variables

Create a `.env` file:

```env
# Twitter OAuth 2.0 credentials (from developer.twitter.com)
TWITTER_CLIENT_ID=your_client_id
TWITTER_CLIENT_SECRET=your_client_secret

# App URL (for OAuth callback)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Session security (generate a random string)
SESSION_SECRET=your-secret-key-here
```

### Getting Twitter API Credentials

1. Go to [developer.twitter.com](https://developer.twitter.com)
2. Create a new project and app
3. Enable OAuth 2.0 with PKCE
4. Set callback URL to `http://localhost:3000/api/auth/twitter/callback`
5. Copy the Client ID and Client Secret
6. Try not to get distracted by your timeline

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 15 (App Router) + React 19 |
| **Database** | SQLite + Drizzle ORM (multi-user ready) |
| **Styling** | Tailwind CSS |
| **Auth** | Twitter OAuth 2.0 PKCE + JWT sessions |
| **Deployment** | Fly.io with automated releases |
| **Testing** | Vitest |

---

## 🧪 Development

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm test         # Run tests
pnpm test:watch   # Run tests in watch mode
pnpm typecheck    # TypeScript check
pnpm db:migrate   # Run database migrations
```

---

## 🚀 Deployment (Fly.io)

ADHX is configured for deployment on [Fly.io](https://fly.io) with persistent SQLite storage.

### Prerequisites

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login to Fly
fly auth login
```

### Deploy

```bash
# Create the app (first time only)
fly apps create your-app-name

# Create persistent volume for SQLite database
fly volumes create adhx_data --region lhr --size 1

# Set secrets (replace with your domain)
fly secrets set TWITTER_CLIENT_ID=your_client_id
fly secrets set TWITTER_CLIENT_SECRET=your_client_secret
fly secrets set SESSION_SECRET=$(openssl rand -base64 32)
fly secrets set NEXT_PUBLIC_APP_URL=https://your-app-name.fly.dev

# Deploy
fly deploy
```

### Post-deployment

1. Update your Twitter app's callback URL to match your domain:
   - Local: `http://localhost:3000/api/auth/twitter/callback`
   - Fly.io: `https://your-app-name.fly.dev/api/auth/twitter/callback`
2. Visit your app URL and connect your Twitter account

### Automated Releases

Releases are automated via [Release Please](https://github.com/googleapis/release-please):

1. Merge PRs with [conventional commits](https://www.conventionalcommits.org/) to `main`
2. Release Please creates/updates a release PR with changelog
3. Merge the release PR → automatically deploys to Fly.io

Manual deploy: `gh workflow run deploy.yml`

---

## 🤖 Agent Skill (works with any agent)

ADHX ships as an [Agent Skill](https://agentskills.io) — an open, portable format for giving AI agents new capabilities. Paste any X/Twitter link into your agent of choice and it can fetch the post as clean JSON, no browser or scraping needed.

The `adhx` skill follows the [agentskills.io specification](https://agentskills.io/specification), so it works across **any skills-compatible agent**, including: Claude Code, Claude, Cursor, Gemini CLI, OpenCode, OpenAI Codex, GitHub Copilot, Goose, Kiro, VS Code (Copilot), Letta, Factory, Roo Code, Amp, and more.

📂 Skill source: [`skills/adhx/SKILL.md`](skills/adhx/SKILL.md)

### Install

The skill is a single folder you drop into your agent's skills directory. Location varies by agent:

| Agent | Skills directory |
|-------|------------------|
| Claude Code | `~/.claude/skills/` |
| Claude (web/desktop) | Settings → Skills → Upload |
| Cursor | `.cursor/skills/` (project) or `~/.cursor/skills/` (global) |
| Gemini CLI | `~/.gemini/skills/` |
| OpenCode | `~/.config/opencode/skills/` |
| OpenAI Codex | `~/.codex/skills/` |
| GitHub Copilot / VS Code | `.github/skills/` (workspace) |
| Goose | `~/.config/goose/skills/` |

> Check your agent's docs if your client isn't listed — the install path may differ, but the skill file itself is identical everywhere.

**One-line install** (replace `<SKILLS_DIR>` with the path from the table above):

```bash
mkdir -p <SKILLS_DIR>/adhx && \
  curl -sL https://raw.githubusercontent.com/itsmemeworks/adhx/main/skills/adhx/SKILL.md \
  -o <SKILLS_DIR>/adhx/SKILL.md
```

**Claude Code marketplace** (shortcut for Claude Code users):

```bash
/plugin marketplace add itsmemeworks/adhx
/plugin install adhx
```

### Update

Re-run the same install command — it overwrites the existing `SKILL.md` with the latest version. For the Claude Code marketplace install, use `/plugin update adhx`.

```bash
# Example for Claude Code
curl -sL https://raw.githubusercontent.com/itsmemeworks/adhx/main/skills/adhx/SKILL.md \
  -o ~/.claude/skills/adhx/SKILL.md
```

### Usage

Once installed, paste any X link into your agent and ask it to read/summarize/analyze:

```
> Read this and give me the key takeaways https://x.com/dgt10011/status/2020167690560647464
```

The agent will automatically call the ADHX public API and return structured JSON with the full post content, author info, and engagement metrics — including long-form X Articles.

### API

```
GET https://adhx.com/api/share/tweet/{username}/{statusId}
```

No auth required. Works with `x.com`, `twitter.com`, and `adhx.com` URLs.

---

## 🤝 Contributing

We welcome contributions! Whether you're fixing bugs, adding features, or just improving docs.

**Quick start:**

1. Fork the repo
2. Create a branch (`git checkout -b feat/amazing-feature`)
3. Make your changes
4. Commit with [conventional commits](https://www.conventionalcommits.org/) (`git commit -m 'feat: add amazing feature'`)
5. Push and open a PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

### Commit Format

We use conventional commits for automatic versioning:

```bash
feat: add new feature      # → Minor version bump
fix: resolve bug           # → Patch version bump
feat!: breaking change     # → Major version bump
```

---

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── auth/          # Twitter OAuth flow
│   │   ├── bookmarks/     # Bookmark CRUD
│   │   ├── feed/          # Main feed endpoint
│   │   └── sync/          # Sync with Twitter
│   ├── settings/          # Settings page
│   └── page.tsx           # Main feed page
├── components/
│   ├── feed/              # Feed components
│   └── ...
└── lib/
    ├── db/                # Database schema
    ├── auth/              # OAuth utilities
    └── media/             # FxTwitter integration
```

---

## 🔒 Security

Found a security issue? Please report it privately. See [SECURITY.md](SECURITY.md) for details.

---

## 📜 License

MIT © [ADHX](LICENSE)

---

<p align="center">
  <i>Built for people who save tweets about productivity while procrastinating.</i>
  <br><br>
  <a href="https://adhx.com">adhx.com</a>
</p>
