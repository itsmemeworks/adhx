# Contributing to ADHX

Thank you for your interest in contributing to ADHX!

**External contributors:** fork the repo, branch from `main`, open a PR. Do not commit `.env`, session secrets, or `CLAUDE.local.md`. The maintainer merges — please do not merge your own PR even if you have write access.

**Security:** never file a public issue for a vulnerability. Use a [private advisory](https://github.com/itsmemeworks/adhx/security/advisories/new) or [security@adhx.com](mailto:security@adhx.com). See [SECURITY.md](SECURITY.md).

**Privacy:** what the hosted app stores (including `activity.userId`, which is never public) is in [PRIVACY.md](PRIVACY.md). Conduct reports: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

**Agents:** start at [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md). Put operator-only `gh` accounts and Fly app names in gitignored `CLAUDE.local.md`, not in committed rules.

## Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages. This enables automatic changelog generation and semantic versioning.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type       | Description                         | Version Bump |
| ---------- | ----------------------------------- | ------------ |
| `feat`     | New feature                         | Minor        |
| `fix`      | Bug fix                             | Patch        |
| `docs`     | Documentation only                  | None         |
| `style`    | Formatting, missing semicolons      | None         |
| `refactor` | Code change (no new feature or fix) | None         |
| `perf`     | Performance improvement             | Patch        |
| `test`     | Adding or updating tests            | None         |
| `build`    | Build system or dependencies        | None         |
| `ci`       | CI/CD configuration                 | None         |
| `chore`    | Other changes                       | None         |
| `revert`   | Revert a previous commit            | Patch        |
| `security` | Security improvements               | Patch        |

### Examples

```bash
# Feature (bumps minor version: 1.0.0 -> 1.1.0)
feat: add dark mode toggle

# Bug fix (bumps patch version: 1.0.0 -> 1.0.1)
fix: resolve login redirect loop

# With scope
feat(auth): add OAuth2 PKCE flow

# With body and footer
fix: prevent XSS in tweet content

The tweet text was being rendered without sanitization.
Added proper escaping for all user-generated content.

Closes #123

# Breaking change (bumps major version: 1.0.0 -> 2.0.0)
feat!: change API response format

BREAKING CHANGE: The /api/feed endpoint now returns
paginated results instead of a flat array.
```

### PR Titles

PR titles should also follow the conventional commit format. When merged via squash, the PR title becomes the commit message.

## Development Setup

```bash
# Install dependencies
pnpm install

# Create / migrate the local SQLite file (Docker does this on start; local does not)
pnpm db:migrate

# Start dev server (http://localhost:3001)
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Browser tests (isolated Next on :3002 + data/e2e.db — not your :3001 / adhdone.db)
pnpm test:e2e

# Desktop extension (separate package — see extension/README.md)
pnpm --dir extension install
pnpm extension:build
```

Do not point Playwright at a personal local database. `pnpm test` does not run e2e.

## Git Hooks

We use Husky to run checks before commits:

- **commit-msg**: Validates commit message format
- **pre-commit**: Runs tests

If you need to bypass hooks temporarily:

```bash
git commit --no-verify -m "your message"
```
