# Privacy

This policy describes the **hosted** ADHX service at [adhx.com](https://adhx.com) (and staging at adhx.fly.dev). If you **self-host**, you are the data controller — this file is still the honest description of what the software stores.

Last updated: 24 August 2026.

## Short version

- Your **collection** (saves, archive, private tags, sign-in) is private to your account.
- **Preview pages**, the **Live / trending pulse**, **public playlists**, and the **leaderboard** are public by design. They show posts and curator usernames, never account IDs.
- We store some identifiers **only for moderation and abuse-limiting**. Those fields are never selected on any public API or page.
- We do not sell your data. We do not run ads. We do not run metered AI on your library.

## What we store

### Account

When you sign in (magic-link email; X is optional later in Settings, for bookmark sync):

- a unique username, optional display name and avatar
- email address (if you used a magic link), stored lowercased
- an X user id (if you connected X)
- a signed, httpOnly session cookie (`adhx_session`, 30 days)

OAuth tokens for X are **encrypted at rest**. Magic-link tokens are stored as a hash and expire after 15 minutes.

### Your collection (private)

Bookmarks, media rows, tags, archive state, and preferences are keyed by your account id. Other users cannot read them. Archive is private: it does **not** write a public pulse event.

A tag stays private until you explicitly make it a **public playlist**.

### Community pulse and leaderboards (public, anonymous)

When someone previews, saves, or sends a post, we may record an `activity` event so `/`, `/trending`, and related public surfaces can show what the community is watching. When someone views or clones a public playlist, we may record a `collection_events` row for `/leaderboard`.

Those logs may store:

| Field                                  | Why it exists                | Public?                                                       |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| `activity.userId`                      | moderation and rate-limiting | **Never.** No public query selects it.                        |
| `collection_events.viewerId`           | same                         | **Never.** Reads go through `src/lib/discovery/rank.ts` only. |
| post identifiers, captions, thumbnails | render the pulse / playlist  | Yes — server-resolved, never accepted from the client         |
| curator username                       | playlist and leaderboard     | Yes — a public username, not an account id                    |

Display text and images on the pulse are copied server-side from the post. Clients cannot invent what shows on the front page.

### Cookies and device storage

- **Cookie:** `adhx_session` (httpOnly, `Secure` in production, `SameSite=Lax`).
- **localStorage (this browser only):** theme, “seen” posts in the theater, install/shortcut dismiss flags. Not sent to our servers.

### Third parties

| Service       | What it sees                                           | Notes                                                                                                     |
| ------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| X / Twitter   | OAuth if you connect X; we fetch your bookmarks        | You can disconnect X in Settings. The account remains if you still have email.                            |
| Resend        | your email, when we send a magic link                  | Unset in local dev — the link is printed to the server console instead.                                   |
| Sentry        | error reports in production                            | User ids are **hashed** before they are sent as metric attributes. We do not send raw `userId` to Sentry. |
| Fly.io        | hosts the app and the SQLite volume                    | Production is `adhx.com`.                                                                                 |
| Platform CDNs | our media proxies fetch video/images to play a preview | Domain-allowlisted; see `CLAUDE.md`.                                                                      |

We do not use advertising or analytics pixels.

## What is public on the web

These URLs are meant to be crawled and shared:

- preview pages (`/{user}/status/{id}`, `/reels/{id}`, `/@{user}/video/{id}`, `/shorts/{id}`)
- `/` (Live theater), `/trending`, `/leaderboard`
- public playlists `/t/{username}/{tag}` and curator profiles `/t/{username}`
- public JSON (`/api/share/…`, `/api/trending`, `/api/activity`, `/api/collections/trending`) — **no `userId`**

Viewing a preview does not require an account. Saving does.

## How long we keep it

Until you clear your collection or delete your account (Settings). Pulse and leaderboard events that already happened stay in the anonymous logs; they still do not expose your account id.

## Your choices

- **Don’t sign in** — you can watch previews and the Live theater without an account.
- **Keep tags private** — only “make public” publishes a playlist.
- **Archive** — removes a post from your active queue without a public pulse.
- **Disconnect X** — Settings; blocked if it is your last sign-in method.
- **Clear data** — deletes your bookmarks and related rows; keeps the account.
- **Delete account** — removes the account, identities, tokens, and your collection.

To ask a question about this policy, email [security@adhx.com](mailto:security@adhx.com).

## Children

ADHX is not directed at children under 13. Do not create an account if you are under 13.

## Self-hosting

A self-hosted instance stores the same kinds of rows on **your** disk. Set your own `SESSION_SECRET`. Leave `ADMIN_USERNAMES` empty unless you intend to moderate that instance. You are responsible for your users and your backups.

## Changes

We will update this file (and `/privacy`) when the product’s data practices change. The date at the top is the latest revision.

---

Related: [SECURITY.md](SECURITY.md) (how to report a vulnerability) · [ARCHITECTURE.md](ARCHITECTURE.md) (what the tables are for).
