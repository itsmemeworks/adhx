# Privacy

ADHX is made to be **self-hosted**, for you and the people you invite. Whoever runs an ADHX server is responsible for the data on it. This file is the honest description of what the software stores and sends on every ADHX server. The separate product website in `site/` runs no ADHX account service. Its hosting provider may process ordinary request logs; publishing it and moving the public domain are separate operational steps.

Last updated: 19 October 2026.

## Short version

- **Named to friends, never to strangers.** Your saves are shared with the members of your server (everyone who can sign in to it): they see which posts you saved, with your username, display name, avatar and when. Mark a save **Just for me** and nobody else sees it, counts it or is told you saved it.
- Your **archive, private tags and sign-in** are private to your account.
- **Shared post pages**, **Right now**, **public channels**, and **Top channels** are public by design. They show posts and curator usernames, never account IDs. People who aren't signed in see how many people saved something, never who, and Just for me saves are never counted.
- We store some identifiers **only for moderation and abuse-limiting**. Those fields are never selected on any public API or page.
- We do not sell your data. We do not run ads. We do not run metered AI on your library.

## Kept media

When a post is saved, the server downloads its video, pictures and sound once, from the network the post came from, and keeps them in its media folder. One copy is kept per post, however many people saved it. The files are deleted once nobody on the server has the post saved. Kept files play for anyone who can open the post's page on that server, the same as before ADHX kept copies. Kept files of hidden (moderated) posts are not served. File URLs contain source post IDs and are not secret tokens. Account invitations do not restrict playback; operators wanting private access must also restrict network reachability.

## What we store

### Account

When you sign in (magic-link email; X is optional later in Settings, for bookmark sync):

- a unique username, optional display name and avatar
- email address (if you used a magic link), stored lowercased
- an X user id (if you connected X)
- a signed, httpOnly session cookie (`adhx_session`, 30 days)

OAuth tokens for X are **encrypted at rest**. Magic-link tokens are stored as a hash and expire after 15 minutes.

On a server set up without email (`EMAIL_LINKS_TO_ADMIN`), the sign-in link itself is kept for up to 15 minutes so the server's admins can see it and pass it on. Before anyone is an admin, and for admins' own links, it is also printed in the server's log. Sign-in emails sent through your own mail server (`SMTP_URL`) go only through that server.

If you connect X, we check your X bookmarks for new ones about every hour, so they arrive without pressing Sync. You can turn this off in Settings.

If you make an access key (Settings → Search from Claude), we store only a hash of it, its name, its last four characters and when it was last used. A key can only search your own saves. Removing it stops it working straight away.

### Your collection (shared with your people)

Bookmarks, media rows, tags, archive state, and preferences are keyed by your account id. Members of your server can see which posts you saved and when (with your username, display name and avatar), on posts, in search across everyone's saves and in the feed. They never see your tags, archive state or preferences.

A save marked **Just for me** (`bookmarks.is_private`) is still yours to search and play, but no other member sees it, counts it or is told you saved it, and it never writes a public pulse event. Making an existing save private also removes your earlier pulse event for it. Existing saves joined the shared feed when this arrived; the web app says so once.

People who aren't signed in never see names: shared post pages, signed-out Right now and moments, public channels, the public post JSON, trending, social images and the sitemap only ever count savers.

Archive is private: it does **not** write a public pulse event.

A channel (a tag) stays private until you explicitly make it **public**, and you can make it private again from its page. Keeping a “Made for you” channel keeps it private.

### Community pulse, Right now and Top channels (public, anonymous)

When someone previews, saves, or sends a post, we may record an `activity` event for anonymous counts (never for a Just for me save). **Right now** (`/now`) groups recent saves from everyone into moments by what they’re about; it counts the people who saved, and their account ids never leave the server. When someone views or saves a public channel, we may record a `collection_events` row for Top channels.

Those logs may store:

| Field                                  | Why it exists                | Public?                                                       |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| `activity.userId`                      | moderation and rate-limiting | **Never.** No public query selects it.                        |
| `collection_events.viewerId`           | same                         | **Never.** Reads go through `src/lib/discovery/rank.ts` only. |
| post identifiers, captions, thumbnails | render the pulse / channel   | Yes — server-resolved, never accepted from the client         |
| curator username                       | channels and Top channels    | Yes — a public username, not an account id                    |

Display text and images on the pulse are copied server-side from the post. Clients cannot invent what shows on the front page.

### Cookies and device storage

- **Cookie:** `adhx_session` (httpOnly, `Secure` in production, `SameSite=Lax`).
- **localStorage (this browser only):** theme, “seen” posts in the theater, install/shortcut dismiss flags. Not sent to our servers.

### Third parties

| Service          | What it sees                                                                                                                                                                                                                                            | Notes                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| X / Twitter      | OAuth if you connect X; we fetch your bookmarks                                                                                                                                                                                                         | You can disconnect X in Settings. The account remains if you still have email.                            |
| Resend           | your email, when we send a magic link                                                                                                                                                                                                                   | Unset in local dev — the link is printed to the server console instead.                                   |
| Sentry           | error reports in production                                                                                                                                                                                                                             | User ids are **hashed** before they are sent as metric attributes. We do not send raw `userId` to Sentry. |
| Hosting provider | hosts the instance and its persistent data                                                                                                                                                                                                              | Chosen by the server operator; Fly.io is one option.                                                      |
| Social networks  | the server downloads each saved post's media from the network it came from (through yt-dlp, the networks' public link-preview data, and the fixers fxtwitter and vxreddit); previews of posts nobody saved yet still stream through allowlisted proxies | Never your account or password on those networks; domain-allowlisted.                                     |

The local search model is downloaded from Hugging Face on first use; that host sees the ordinary download request, not the saved library. If the operator configures `TYPESAFE_API_KEY`, TypeSafe receives search queries and public post words for refinement and channel naming, not private tags or saver identities. These requests are optional.

Phone pairing stores a hashed single-use code for up to ten minutes. Connected phone keys are stored as hashes, with their names, hints and usage dates. They can save links and read/search their owner's saves. Removing a phone key revokes its API access. The phone keeps its key in protected device storage and queues unsent shares locally.

We do not use advertising or analytics pixels.

## What is public on the web

These URLs are meant to be crawled and shared:

- preview pages (`/{user}/status/{id}`, `/reels/{id}`, `/@{user}/video/{id}`)
- `/`, Right now (`/now`) and its moments (`/moments/{slug}`)
- public channels `/t/{username}/{tag}`, curator profiles `/t/{username}`, and author pages `/{handle}`
- public JSON (`/api/share/…`, `/api/trending`, `/api/activity`, `/api/collections/trending`) — **no `userId`**

Viewing a preview does not require an account. Saving does.

## How long we keep it

Until you clear Saved or delete your account (Settings). Pulse and channel-view events that already happened stay in the anonymous logs; they still do not expose your account id.

## Your choices

- **Don’t sign in** — you can watch shared posts, Right now and Tune in without an account.
- **Keep channels private** — only “Public” on a channel’s page publishes it, and “Private” takes it back.
- **Archive** — removes a post from your active queue without a public pulse.
- **Disconnect X** — Settings; blocked if it is your last sign-in method.
- **Automatic X sync** — on while X is connected; turn it off in Settings.
- **Access keys** — remove any key in Settings.
- **Clear data** — deletes your bookmarks and related rows; keeps the account.
- **Delete account** — removes the account, identities, tokens, access keys, and Saved.

To ask a question about this policy, email [security@adhx.com](mailto:security@adhx.com).

## Children

ADHX is not directed at children under 13. Do not create an account if you are under 13.

## Self-hosting

A self-hosted instance stores the same kinds of rows on **your** disk. Set your own `SESSION_SECRET`. Leave `ADMIN_USERNAMES` empty unless you intend to moderate that instance. You are responsible for your users and your backups.

## Changes

We will update this file (and `/privacy`) when the product’s data practices change. The date at the top is the latest revision.

---

Related: [SECURITY.md](SECURITY.md) (how to report a vulnerability) · [ARCHITECTURE.md](ARCHITECTURE.md) (what the tables are for).
