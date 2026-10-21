# Contributing to ADHX

Thanks for wanting to help. ADHX is a private feed for small groups of friends,
built in the open, and it gets better when the people who run it fix the
things that annoy them. Bug reports, docs fixes, tests, design feedback and
code are all welcome.

Coding agents: start at [`AGENTS.md`](AGENTS.md), then [`CLAUDE.md`](CLAUDE.md).

## Before you start

- **Found a security problem?** Don't open an issue. Report it privately; see
  [`SECURITY.md`](SECURITY.md).
- **Have a question or an idea you want to talk through?** Use
  [GitHub Discussions](https://github.com/itsmemeworks/adhx/discussions).
- **Found a bug or want a feature?** Open an issue with the
  [bug report](https://github.com/itsmemeworks/adhx/issues/new?template=bug_report.yml)
  or [feature request](https://github.com/itsmemeworks/adhx/issues/new?template=feature_request.yml)
  form.
- **Planning something big** (a new network, a schema change, a new screen)?
  Open an issue or discussion first, so nobody spends a weekend on something
  that clashes with work already in flight.
- Everyone here follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Good first issues

Issues labelled
[`good first issue`](https://github.com/itsmemeworks/adhx/labels/good%20first%20issue)
are small and well described. Issues labelled
[`help wanted`](https://github.com/itsmemeworks/adhx/labels/help%20wanted)
are ones the maintainers would love a hand with. Comment on an issue before
you start so two people don't build the same thing.

No labelled issue that suits you? These are always useful:

- A docs page that was wrong or confusing for you. You're the best person to
  fix it, because you just found the confusing part.
- A test for a bug you hit, even without the fix.
- Accessibility problems: a control a screen reader can't name, a focus trap,
  text that's hard to read over video.
- A link from one of the fourteen networks that ADHX fails to save.

## What you need

| Tool                   | Version                                                     | Why                                                         |
| ---------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Node.js                | 26 recommended (22.22.1 or newer works; see `package.json`) | Runs everything.                                            |
| pnpm                   | the version pinned in `package.json`, via Corepack          | Installs dependencies.                                      |
| Git                    | 2.32 or newer                                               | Hooks and history.                                          |
| FFmpeg                 | any maintained release on your `PATH`                       | Some tests and all media processing need it.                |
| yt-dlp                 | optional, on your `PATH`                                    | Keeping media from networks other than X.                   |
| Docker                 | optional                                                    | Running the production image locally.                       |
| Xcode 16 or newer      | optional                                                    | The iPhone app ([`apps/ios`](apps/ios/README.md)).          |
| JDK 17 and Android SDK | optional                                                    | The Android app ([`apps/android`](apps/android/README.md)). |

On macOS, `brew install ffmpeg yt-dlp` covers the two media tools. On Debian
or Ubuntu, `sudo apt-get install ffmpeg` and install yt-dlp from its own
releases (distribution packages are often too old to keep up with the
networks).

## Set up in five steps

```bash
# 1. Fork on GitHub, then clone your fork
git clone https://github.com/<you>/adhx.git && cd adhx

# 2. Install (Corepack picks the pinned pnpm)
corepack enable && pnpm install

# 3. Configure: copy the example and set a session secret
cp .env.example .env.local
#    then put the output of `openssl rand -base64 32` in SESSION_SECRET

# 4. Create the local database (Docker does this on start; local dev doesn't)
pnpm db:migrate

# 5. Run it without downloading your whole library
KEEP_BACKFILL=off pnpm dev
```

Open http://localhost:3001 and sign in with any email address. With no email
service configured, the sign-in link is printed in the terminal running
`pnpm dev`, so you don't need a mail account to test.

Search by meaning downloads its models (about 400 MB) on first start. Set
`SEMANTIC_SEARCH=off` in `.env.local` if you're not working on search.

## Tests and checks

| Command                   | What it runs                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm test`               | The Vitest unit and route tests.                                                                   |
| `pnpm test:watch`         | The same, rerunning as you edit.                                                                   |
| `pnpm typecheck`          | TypeScript, no output files.                                                                       |
| `pnpm lint`               | ESLint over `src/`.                                                                                |
| `pnpm format:check`       | Prettier over the repo (`pnpm format` fixes it).                                                   |
| `pnpm test:e2e:install`   | Downloads Chromium and WebKit for Playwright, once.                                                |
| `pnpm test:e2e`           | Browser tests against an isolated server on :3002.                                                 |
| `pnpm parity:capture`     | Screenshots the app beside the design boards (see [`e2e/parity/README.md`](e2e/parity/README.md)). |
| `pnpm check:dependencies` | Audits the three JavaScript lockfiles.                                                             |

The browser tests build their own database (`data/e2e.db`) and server, so they
never touch the instance you run with `pnpm dev`. `pnpm test` doesn't include
them.

Route tests use an in-memory SQLite database and check that one account's
actions never leak into another's. If you add a route, add a test that proves
that for your route too.

The phone apps have their own build and test steps, in the
[iOS](apps/ios/README.md) and [Android](apps/android/README.md) READMEs. The
desktop extension is in [`extension/README.md`](extension/README.md).

## Making a change

1. Branch from `main`: `git switch -c fix/queue-skips-gone-videos`.
2. Keep the change focused. One fix or feature per pull request is easier to
   review and easier to revert.
3. Add or update tests. A bug fix ideally comes with a test that failed
   before it.
4. Update the docs your change makes wrong: `README.md`, `ARCHITECTURE.md`,
   `CLAUDE.md`, or a spec in `docs/specs/`.
5. For a substantive change, add a dated entry at the top of
   [`docs/WORKLOG.md`](docs/WORKLOG.md): what, why, current state and
   follow-ups, 10 lines at most.
6. For a UI change, check it at desktop and phone widths, with a keyboard,
   and with reduced motion on. Put screenshots in the pull request.

Project rules worth knowing before you write code (the full list is in
[`CLAUDE.md`](CLAUDE.md#the-rules)):

- Every query over saves filters by the account (`userId`), and by `platform`
  when it looks up a post.
- Nothing visible to signed-out visitors names who saved a post.
- Every outbound `fetch()` has a timeout.
- Pages that read the database stay dynamic; the database doesn't exist at
  build time.
- Browser translation is on, so a bare text node must never sit next to an
  element in JSX. Wrap it in a `<span>`.

## Commit messages and pull request titles

We use [Conventional Commits](https://www.conventionalcommits.org/). A Git hook
checks every commit message and CI checks every pull request title, because
pull requests are squash-merged and the title becomes the commit on `main`.

```text
<type>(<optional scope>): <lowercase subject>

<optional body>

<optional footer>
```

The rules (from [`commitlint.config.cjs`](commitlint.config.cjs)):

- the whole first line is 100 characters or fewer;
- the subject starts with a lowercase letter and has no full stop at the end;
- a blank line separates the subject from the body and the body from the
  footer.

| Type       | Use it for                          | Effect on the next release      |
| ---------- | ----------------------------------- | ------------------------------- |
| `feat`     | Something people can now do         | Minor version, in the changelog |
| `fix`      | Something that was broken now works | Patch version, in the changelog |
| `perf`     | Faster or lighter, same behaviour   | Patch version, in the changelog |
| `security` | Closes a weakness                   | Patch version, in the changelog |
| `revert`   | Undoes an earlier commit            | Patch version, in the changelog |
| `docs`     | Documentation only                  | None on its own                 |
| `test`     | Tests only                          | None on its own                 |
| `refactor` | Same behaviour, better code         | None on its own                 |
| `style`    | Formatting only                     | None on its own                 |
| `build`    | Build system or dependencies        | None on its own                 |
| `ci`       | Workflows                           | None on its own                 |
| `chore`    | Anything else                       | None on its own                 |

A breaking change adds `!` after the type (`feat!: …`) and a
`BREAKING CHANGE:` footer explaining what people must do.

Examples:

```text
fix: keep the queue playing when a video was deleted upstream
feat(android): show who saved a post on the player
docs: explain how to pair a phone without a camera
```

## Git hooks

Husky installs two hooks when you run `pnpm install`:

- **commit-msg** runs commitlint on your message.
- **pre-commit** runs ESLint and Prettier on staged files, then
  `pnpm typecheck`, then the whole test suite.

Yes, the whole suite, on every commit. Make a cup of tea; it's cheaper than a
broken `main`. Please don't bypass the hooks with `--no-verify`. If a hook
fails for a reason unrelated to your change, say so in the pull request.

## Pull requests

- Fill in the [pull request template](.github/PULL_REQUEST_TEMPLATE.md):
  what changed, why, and how you checked it.
- CI runs formatting, lint, types, unit and browser tests, the production
  build, the extension, the container, the product site, a dependency audit,
  the phone apps and CodeQL. All of it has to pass.
- A maintainer reviews and merges. Please don't merge your own pull request,
  even if you can.
- Never commit `.env` files, secrets, personal data, `CLAUDE.local.md`, or
  settings for a particular household's server.

Releases are automated by Release Please and handled by the maintainers; see
[`docs/releasing.md`](docs/releasing.md) if you're curious.

## Licence

ADHX is [MIT licensed](LICENSE). By contributing, you agree that your
contribution is released under the same licence.
