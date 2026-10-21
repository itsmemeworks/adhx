# Privacy

ADHX is made to be **self-hosted**, for you and the people you invite. Whoever runs an ADHX server is responsible for the data on it and is its data controller. This file is the honest description of what the software stores and sends on every ADHX server, and who can see it. The separate product website in `site/` runs no ADHX account service; its hosting provider may process ordinary request logs.

Last updated: 20 October 2026.

## Short version

- **Named to friends, never to strangers.** A _member_ is anyone who can sign in to your server (approved and not banned). Your saves are shared with members by default: they see the post, your username, display name, picture, when you saved it and your note.
- **Just for me** keeps a save out of everyone else's feed, channels, search, Right now and counts, and its kept files are yours alone. One exception you should know about: admins' post and member counts include it.
- **Strangers** (anyone not signed in) see posts and counts, never who saved them. Right now, preview pages, public channels and the sitemap do show _which posts_ people on your server shared.
- **Kept media files of shared posts are not behind sign-in.** Anyone who can reach your server and knows a post's network and ID can fetch them. A post only saved Just for me is served to its owner alone. Keep the server on a private network if that matters to you.
- Your archive, tags (until you make a channel public), viewing history, Show more / less choices, bells and alerts are yours alone. A send is seen by you and the person you sent it to.
- No ads, no advertising pixels, nothing sold. Search by meaning runs on your server (or the operator's own Mac). Only the optional search refinement service receives text, described below.

## Who sees what

| What                                 | Other members                                         | Signed-out visitors                                                 | Admins                                           |
| ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------ |
| A shared save                        | The post, your name, face, note and save time         | The post (where a public page shows it) and a saver count           | Same as members                                  |
| A Just for me save                   | Nothing                                               | Nothing                                                             | Counted in post and member numbers, never listed |
| Your note on a save                  | Yes, on a shared save                                 | Never                                                               | Can clear notes; no admin page shows them        |
| A send                               | Only the person you sent it to (who, when, your note) | Never                                                               | Never                                            |
| What you've watched (`post_views`)   | Never                                                 | Never                                                               | How many in 30 days, never which                 |
| Show more / Show less                | Never                                                 | Never                                                               | Never                                            |
| Watching a moment                    | Yes, while it happens                                 | A watcher count only                                                | Same as members                                  |
| Your reactions on a post             | Yes, if they can see the post (name, face, reaction)  | Never, not even a count                                             | Counts per person; no admin page shows them      |
| Bells and alerts                     | Never                                                 | Never                                                               | Never                                            |
| Your picture (uploaded or made here) | Yes                                                   | No, unless you have a public channel (see below)                    | Yes                                              |
| Kept media files of a shared post    | Yes                                                   | **Yes, to anyone who can reach the server and knows the post's ID** | Yes                                              |
| A public channel (`/t/{you}/{tag}`)  | Yes                                                   | Yes, with your username                                             | Yes                                              |

## What we store

### Account

You join with an **invite link** or sign in with a one-time **email link**. X is optional, later, for bookmark sync.

- a unique username, an optional display name and a picture
- your email address, if you use email (stored lowercased). Invite accounts have none until you add one.
- the invite you joined with, and whether you are waiting for approval
- an X user id, if you connect X. X tokens are **encrypted at rest**.
- a signed, httpOnly session cookie (`adhx_session`, 30 days)

Sign-in links are stored as a hash and expire after 15 minutes (60 minutes when held for an admin). How they reach you is the operator's choice:

- **Email**, through Resend or the operator's own mail server (`SMTP_URL`).
- **Held for an admin** (`EMAIL_LINKS_TO_ADMIN`): the full link and the email address it was requested for are kept until used or expired, and the server's admins see them on the admin page so they can pass them on. An admin holding your link could use it. Before anyone is an admin, and for admins' own links, the link is also printed in the server's log.
- **Printed in the log**, on a development server with no email set up.

**Your picture.** If you upload or take one (Settings → You → Change picture), the server keeps a 512-pixel square JPEG of your crop, re-made without the photo's metadata (no location or camera details), in the media folder's `avatars/`. The original photo is not kept. A Gob picture is made the same way. Only members can load it (signed in, or with a phone key). It is deleted when you change or remove it, and when you delete your account. If you choose your X picture instead, ADHX stores X's address for it, which anyone can load from X.

If you connect X, ADHX checks your X bookmarks for new ones about every hour. You can turn this off in Settings. Bookmarks brought in from X follow **Just for me by default** like any other save; make them private or shared one by one if you need to.

### Your saves, notes, tags and archive

Saves (`bookmarks`), their media and link rows, tags, archive state and preferences are keyed by your account.

- **Members** see which posts you saved, when, with your username, display name, picture and note: on posts, in Everyone's saves search, in New, in your channel under Your people and in From everyone channels. They never see your tags (unless you make a channel public), archive state or preferences.
- **Just for me** (`bookmarks.is_private`): the save stays yours to search and play. No other member sees it in a feed, channel, search result or moment, it is never counted on public pages, and it writes no public pulse event. Making an existing save private also removes your earlier pulse events for it. Its kept files are served only to you (see Kept media). One place still reflects it: **admins** see saver and save counts that include private saves (never the save itself).
- **Just for me by default** (Settings → You) makes new saves start private: from the web, the phone apps, X bookmark sync, **Keep this channel** and saving someone's public channel.
- **Notes** (up to 140 characters, text only) are shown to members next to your face. A Just for me save's note is shown only to you. Notes are never shown to signed-out visitors, never copied when someone saves a public channel or keeps a channel, and never sent to any outside service. Admins can clear notes; the audit log records that they did, not the note.
- **Archive** is private and writes no public event.
- Existing saves joined the shared feed when the friends feed arrived; the web app says so once.

### New, viewing and weights

- **What you've watched** (`post_views`): a post is marked seen after about 2 seconds on screen or when you skip it. ADHX uses it to leave watched posts out of your New and to work out which friends' saves you watch most ("You watch most of Ben's saves", shown only to you). Nobody else can see your viewing marks. They are deleted after 180 days (when the server restarts), and with Clear data or account deletion. Unsent marks wait in your browser for up to 7 days.
- **Show more / Show less** from a friend, and **What's in your feed**, are stored as your preferences. Only you see them. Show more / less is stored by your friend's username.

### Sends

**Send straight to your people** stores who sent what to whom, with the optional note and when the recipient saw it (`post_sends`). Only the sender and the recipient see a send. While choosing, the sender sees which members already have a shared save of the post (never a Just for me one) and whom they already sent it to, never whether the recipient watched it. You can't send a post you only have as Just for me. Sends are kept until either person clears their data or deletes their account.

### Reactions

Members can react to any post: one of six emoji, or up to 40 characters ("Say something"). Each reaction is kept with the post (`post_reactions`: who, which post, the emoji or words, when). It is shown, with your name and face, only to signed-in members who can see the post: anyone's shared save of it, or their own save. So a post saved only as Just for me keeps its reactions to its owner. Signed-out visitors and public pages never see reactions or how many there are. A banned member's reactions are never shown, and a post an admin hid shows none. You can delete your own reactions; they are deleted when you clear your data or delete your account. The admin area shows only how many reactions each member sends per day, by kind (which emoji, or words), never the reactions themselves.

### Right now, watching together, bells

- **Right now** (`/now`) groups recent saves into moments by what they're about. Moments live in the server's memory and are rebuilt every few minutes. Only shared saves count; a Just for me save is never counted or named, not even to you.
- **Members** see who is saving a moment and who is watching it, and can react (see Reactions). Who is watching exists only in the server's memory and is never stored. A reaction sent while watching reaches the members watching that moment at once, and is also kept on its post like any other reaction.
- **Signed-out visitors** see the same moments and posts with counts only: no names, faces, notes, watchers or reactions.
- **"Tell me when it's live"** stores your bell on a forming moment, and an alert when it goes live, listed for 24 hours. They are only yours, and are deleted with Clear data or account deletion. In a browser, notifications use your browser's permission; on a phone, the app makes them from what it fetched from your server.

### Channels

- **Your people** gives every member a channel of what another member shared (members only, with their latest note). **From everyone** groups everyone's shared saves (members only). Just for me saves are in neither, and leave them as soon as you switch.
- **Made for you** channels are private to you and are worked out from all your saves, including Just for me ones.
- **Keep this channel** saves the posts you don't have, following Just for me by default, without copying anyone's note. Saving someone's public channel does the same.
- **Your channels** (tags) stay private until you make one **public** on its page; you can make it private again. A public channel never lists a post you saved Just for me, even if you tagged it.

### Kept media

When a post is saved, the server downloads its video, pictures and sound once, from the network it came from, and keeps them in its media folder. One copy is kept per post, however many people saved it, Just for me saves included.

**Kept files of shared posts are served without sign-in.** Anyone who can reach the server and knows a post's network and source ID can fetch them at `/api/files/…`, and browsers and proxies may cache them for up to 7 days. Those IDs come from the original networks and are not secret, so a determined stranger can tell that someone on the server shared a particular post.

A post that is only saved **Just for me** is different: its files are served only to the people who saved it (signed in, with their phone key, or through a link the server adds to their own phone's copy, which works for that post alone), and are never cached. To anyone else the server answers exactly as if nobody had saved the post. Why a file isn't available ("couldn't be downloaded", "nobody here has saved this yet") is only told to members. Kept files of hidden (moderated) posts are not served. Invites and the email allowlist control who can make an account, not who can play files: if that matters to you, run the server on a private network (LAN, VPN or tailnet).

Kept files are deleted within about an hour once nobody on the server has the post saved.

### Invites and approvals

- **Invites** store a fingerprint (hash) of the link, who made it, an optional name hint, when it expires (7 days), and who used or revoked it. The link itself is shown once. Whoever opens a working link, signed in or not, sees the inviter's name. Admins see every waiting invite; other members see their own. Used and expired invites are kept until the inviter or the person who joined deletes their account.
- **Who can invite** (Only me, Anyone I approve, Anyone) is a server setting.
- **Approvals.** Under "Anyone, I approve", a new account waits, signed out everywhere, until an admin answers. Admins see the waiting person's username, display name, when they asked and who invited them, never an email. The waiting person sees the inviter's and the first admin's names. Admin answers are logged.

### Phones and access keys

- **Pairing** stores only a hash of the 8-character code, for up to 10 minutes, single use.
- **Phone keys** are stored as hashes, with the phone's name, the last four characters and when the key was made and last used. A phone key acts as you in the phone app (saving, your feed, channels, search, Right now, sends, Show more / less). **Remove** in Settings → Phone app revokes it straight away and closes its live streams. The phone keeps its key in protected storage (the Keychain on iPhone, a Keystore-encrypted file on Android), sends it only to your server, and keeps unsent shares on the phone until they go.
- **Shares from the phone** wait in `phone_save_queue` (the link, your Just for me choice and your note) until saved; finished rows are deleted after 7 days.
- **Access keys** (Settings → Search from Claude) are stored the same way and can only search your own saves. Removing one stops it straight away.

### Understanding your saves (search by meaning)

So you can find saves by what is in them, each post's words, pictures, video frames, what is said in its video and the text on its pictures are turned into numbers and words by models running **on your server**, or on the operator's own Mac helper. These describe the post, never who saved it.

- **Models** are downloaded once from Hugging Face; that host sees the ordinary download request, not your saves.
- **The Mac helper** (optional, `PROCESSING_MODE=remote`) is a machine the operator runs. It authenticates with its own secret token, receives the post's words (including the original author's name) and the kept media files of the posts it works on, Just for me saves included, and sends back numbers, words and converted videos. It never receives who saved anything, notes or tags. It deletes its temporary copies when the work is done.
- **Optional refinement (Jev, by TypeSafe)**, only when the operator sets `TYPESAFE_API_KEY`:
  - your search text and the public words of the top 20 results (post text, the original author's name, article and link-preview text, quoted text, picture descriptions), to put them in a better order;
  - public words from a small sample of posts, to name Made for you channels (from your own saves), From everyone channels and Right now moments.
  - This text refinement sends no media files. Transcripts, text read off pictures, who saved anything, notes, tags and account details are never sent. If it is unavailable, local results and names are used.
- **Optional image-aware channels**, separately enabled with `TYPESAFE_CHANNEL_IMAGES=on` plus the key, can send up to eight small retained public-post thumbnails and their public source captions to TypeSafe to refine generated channel names, borderline members, repeat spacing and covers. A key alone enables no image uploads. Private-only, quoted, hidden and banned-saver posts are excluded. Cached decisions expire after seven days; clearing data or deleting an account removes its private channel jobs. See [the image-curation guide](docs/channel-image-curation.md).
- The numbers and words made from a post (its vectors, keyword index, transcript and text read off its pictures) are deleted when the last person removes the post.

### Public pulse, channel views and analytics

ADHX keeps three logs from its earlier public pages. None of them names anyone in public.

| Log                 | What it holds                                                                                            | Public?                                                                            | Kept for                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| `activity`          | Previews, shared saves and file shares of posts, with the post's details; your account id for moderation | Yes, without the account id, on the signed-out home page; admins can read the feed | 30 days (pruned when the server starts)        |
| `collection_events` | Views and copies of public channels, with the viewer's account id for de-duplication                     | Counts only, on public channels and `/api/collections/trending`                    | 90 days of detail; all-time totals per channel |
| `analytics_events`  | Product events (views, saves, file shares, copies, tags, archive, sign-ins, syncs), with your account id | No: totals and top posts by ID for admins only, without account ids                | 90 days (pruned when the server starts)        |

Display text and pictures on the pulse are copied from the post on the server; nobody can make up what shows there. Just for me saves and archive write no pulse event. Removing a save removes its "saved" pulse event.

### Admins

Admins (accounts with the admin role) have an admin area. They can make and revoke invites, approve or decline join requests, change who can invite, see sign-in links held for them (above), hide posts, clear notes, keep someone out (ban) or let them back in, remove someone's phone, make or remove admins, and pause or retry the server's processing. Every admin action is written to an audit log. What they see:

- **People**: each member's username, display name and picture, role, when they joined, who invited them, when they were last seen (`users.last_seen_at`, updated at most every 5 minutes when you use the web or phone app), and how many saves (and how many of those are Just for me), notes, sends, reactions, channels and phones they have. Each phone shows its name, the last four characters of its key, whether it's an iPhone or Android (`access_keys.platform`, from the app's requests), and when it was paired and last used. Never an email address.
- **Posts**: posts with at least one shared save, who saved them (shared saves only) and their notes. **A Just for me save is only ever a count**: admins see "1 Just for me", never the post.
- **Counts, never contents**: saves per day (shared and Just for me), opens of the app and from which kind of device (web, iPhone, Android), plays and how many were watched to the end, searches (whether by meaning or by words, and whether they found something; **what you searched for is never stored**), sends and shares, reactions, plays and keeps of shared channels, and how many posts each member watched in the last 30 days (never which).
- **Reaction counts** (`reaction_counts`): how many reactions each member sent per day, by kind (which emoji, or "words"). The counts never hold the words, the post or the moment; the reactions themselves (`post_reactions`) are on no admin page.
- **The live-moment log** (`moment_log`): each moment's name, when it formed, how many members tuned in, the most watching at once, how many reactions it got, and how many "it's live" alerts it sent and were opened. No account ids.
- **Processing**: downloads, conversions and understanding, server-wide (Just for me posts are counted, not listed).

No admin page shows another member's email, Just for me saves, notes on Just for me saves, which posts they watched, what they searched, who they sent posts to, or their alerts. Whoever runs the server can of course read its database and media folder directly.

### Cookies and device storage

- **Cookies:** `adhx_session` (httpOnly, `Secure` in production, `SameSite=Lax`, 30 days), and `adhx_return_url` briefly while you connect X.
- **This browser only** (localStorage and sessionStorage): your sound setting, recent searches, unsent viewing marks, whether you've seen the shared-saves notice, and a one-time note that you opened a shared link. Nothing here is sent anywhere, except the viewing marks, which go to your server.

### Third parties

| Service          | What it sees                                                                                                                                                                                                   | Notes                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Social networks  | The server's requests for a post's public data and media, through yt-dlp, the networks' public link-preview and oEmbed data, and public fixers and mirrors (fxtwitter, vxreddit, Instagram and TikTok mirrors) | Never your account or password on those networks. Domain-allowlisted.                               |
| X / Twitter      | OAuth and your bookmarks, if you connect X                                                                                                                                                                     | Disconnect in Settings.                                                                             |
| Resend or SMTP   | Your email address and the sign-in link, when one is emailed                                                                                                                                                   | Only if the operator set it up.                                                                     |
| TypeSafe (Jev)   | Search text and public post words; separately opted-in public-post thumbnails, as above                                                                                                                        | Text with `TYPESAFE_API_KEY`; images also require `TYPESAFE_CHANNEL_IMAGES=on`.                     |
| Hugging Face     | The model download request                                                                                                                                                                                     | Once, when the models are first needed.                                                             |
| Sentry           | Error reports, in production with `SENTRY_DSN`                                                                                                                                                                 | Account ids and usernames are pseudonymised; emails, cookies, tokens and query strings are removed. |
| Hosting provider | Whatever the operator runs the server on                                                                                                                                                                       | The operator's choice.                                                                              |

No advertising or analytics pixels.

## What is public on the web

These work without an account. None of them names who saved a post.

- preview pages (`/{user}/status/{id}`, `/p/{id}`, `/reels/{id}`, `/@{user}/video/{id}`, `/s/{network}/{id}`) and the signed-out home page
- Right now (`/now`), its moments (`/moments/{slug}`) and Tune in, which show what members are sharing, with counts
- public channels `/t/{username}/{tag}` and curator pages `/t/{username}`: once you have a public channel, your username, display name, picture and when you joined are public there and in its share image
- author pages `/{handle}` (the original posters, not members)
- the sitemap, which lists preview pages of posts members have shared
- public JSON: `/api/share/…` (a post's details, how many members shared it, and public channels holding it with their curators' usernames), `/api/collections/trending` and signed-out moments. **No account ids.** (`/api/activity`, `/api/trending` and `/api/analytics` are for admins.)
- kept media files of shared posts (see Kept media)

Viewing a preview does not require an account. Saving does.

## How long we keep it

Until you remove it, clear your data or delete your account, except:

- viewing marks: 180 days; pulse events: 30 days; analytics and channel-view detail: 90 days (pruned when the server starts)
- alerts: listed for 24 hours; who's watching: never stored; reactions and reaction counts: until you delete them (reactions), clear your data or delete your account; the live-moment log (no account ids): kept
- phone share queue rows: 7 days after they finish; pairing codes: 10 minutes; sign-in links: 15 or 60 minutes
- kept media: until nobody on the server has the post saved

## Clearing and deleting

- **Clear data** (Settings) deletes your saves and their media rows, tags, links, archive state, preferences (including Show more / less and Just for me by default), viewing marks, sends to and from you, bells and alerts, your reactions and reaction counts, X sync history and queued phone shares. It also deletes your Made for you channels and your "saved" pulse events; your other pulse events stay, without your account id. It keeps your account, sign-in methods, phone and access keys, invites and public channel settings (now empty).
- **Delete account** removes all of that plus your account, sign-in methods, X tokens, phone and access keys, pairing codes, invites you made or used, your picture files, your last-seen time, your public channels' statistics and any ban record. Your "saved" pulse events and Made for you channels are deleted; other pulse, analytics and channel-view events stay but no longer carry your account id. A few things remain: the admin audit log (and, if you were an admin, records of what you hid or banned) and other members' Show more / less entries for your username. Search data made from a post goes once nobody has it saved (above). Kept files go within the hour if nobody else saved the post.

## Your choices

- **Don't sign in.** Watch shared posts, Right now and Tune in without an account.
- **Just for me**, on any save from its ⋯ menu or the phone, or by default in Settings → You.
- **Keep channels private.** Only "Public" on a channel's page publishes it, and "Private" takes it back.
- **Archive** without a public event.
- **Bells**: turn one off on its forming moment.
- **Phones and keys**: remove any in Settings.
- **X**: turn off automatic sync, or disconnect (blocked if it is your last sign-in method).
- **Your picture**: change it, or remove it to use a face made from your username.
- **Clear data** or **Delete account** in Settings.

For a question about your server, ask whoever runs it. For the software itself, email [security@adhx.com](mailto:security@adhx.com).

## Children

ADHX is not directed at children under 13. Do not create an account if you are under 13.

## Self-hosting

Every ADHX stores the same kinds of rows on **its operator's** disk. Set your own `SESSION_SECRET`. Use `ADMIN_USER_IDS` only for accounts you intend to make admins. Decide how private the network should be (see Kept media). You are responsible for your people and your backups.

## Changes

We update this file (and `/privacy`) when the software's data practices change. The date at the top is the latest revision.

---

Related: [SECURITY.md](SECURITY.md) (how to report a vulnerability) · [ARCHITECTURE.md](ARCHITECTURE.md) (what the tables are for) · [the friends-feed spec](docs/specs/friends-feed.md) (the full rule).
