## What changed

<!-- One or two sentences. What can people do now, or what stopped being broken? -->

## Why

<!-- The problem this solves. Link the issue if there is one. -->

Closes #

## How I checked it

<!-- Commands you ran and what you looked at. Say what you did NOT check, too
(for example "not tried on a real iPhone"). -->

- [ ] `pnpm typecheck && pnpm test`
- [ ] `pnpm lint && pnpm format:check`
- [ ] `pnpm test:e2e` (if pages or flows changed)
- [ ] Looked at it at desktop and phone widths, with a keyboard (if the UI changed)

## Screenshots

<!-- For UI changes: before and after. Add a short description of each so
people using a screen reader know what changed. -->

## Checklist

- [ ] The title is a Conventional Commit with a lowercase subject (`fix: keep the queue when a video is gone`)
- [ ] Tests cover the change
- [ ] Docs that this makes wrong are updated (`README.md`, `ARCHITECTURE.md`, `CLAUDE.md`, a spec)
- [ ] A `docs/WORKLOG.md` entry, if the change is substantive
- [ ] Nothing visible to signed-out visitors names who saved a post
- [ ] No secrets, `.env` files or personal data
