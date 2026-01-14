# Contributing to ADHX

Thank you for your interest in contributing to ADHX!

## Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages. This enables automatic changelog generation and semantic versioning.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | New feature | Minor |
| `fix` | Bug fix | Patch |
| `docs` | Documentation only | None |
| `style` | Formatting, missing semicolons | None |
| `refactor` | Code change (no new feature or fix) | None |
| `perf` | Performance improvement | Patch |
| `test` | Adding or updating tests | None |
| `build` | Build system or dependencies | None |
| `ci` | CI/CD configuration | None |
| `chore` | Other changes | None |
| `revert` | Revert a previous commit | Patch |
| `security` | Security improvements | Patch |

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

# Start dev server
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## Git Hooks

We use Husky to run checks before commits:

- **commit-msg**: Validates commit message format
- **pre-commit**: Runs tests

If you need to bypass hooks temporarily:
```bash
git commit --no-verify -m "your message"
```
