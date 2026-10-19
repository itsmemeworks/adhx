# The friends feed

ADHX is a private feed of the best of every social network, picked by your closest friends and family. Each server is one group of people. This spec is the shared contract for the work that turns a pile of personal saves into that group's feed. Read it before changing anything below.

## The rule: named to friends, never to strangers

- A **member** is a signed-in, non-banned account on this server. Everyone who can sign in is one group (one group per server, no circles).
- **Saves are shared with members by default.** A save can be marked **private**: it is still kept, searchable and playable by its owner, but no other member sees it, counts it or is told who saved it.
- **Members see who saved what.** Savers are named (username, display name, avatar, when) to other members.
- **Strangers never see names.** Signed-out visitors, public pages (`/now` signed out, `/moments/*` signed out, previews, public channels, the public tweet JSON, trending, OG images, the sitemap) keep the old behaviour: savers are counted, never named, and private saves are never counted.
- Existing saves join the shared feed on upgrade (they default to not private). The web app shows a one-time notice explaining this, with a link to make saves private.
- Saves with `source = 'quoted'` (the quoted post stored with a save) are never shown as someone's save.

## Data

- `bookmarks.is_private integer NOT NULL DEFAULT 0`: a guarded ALTER in `migrate.ts`, the Drizzle column `isPrivate` in `schema.ts`, and the same column in `FULL_SCHEMA_SQL` in `src/__tests__/api/setup.ts`.
- `phone_save_queue.is_private integer NOT NULL DEFAULT 0`, so a private share from a phone stays private.
- `post_views (user_id, platform, post_id, seen_at)`, primary key `(user_id, platform, post_id)`: the server-side watched list. It is user-linked, so it needs an `ACCOUNT_GUARDS` entry and a delete on account clear and delete.
- `invites (id, token_hash, created_by, created_at, expires_at, used_by, used_at, revoked_at, name_hint)`: single-use invite links. `id` is the public handle for listing and revoking; `revoked_at` lets a revoked link say so. Also user-linked.

## Shared helpers (server)

- `src/lib/people/savers.ts`
  - `type Saver = { username: string; name: string | null; avatarUrl: string | null; savedAt: string; isYou: boolean }`
  - `saversFor(keys: { platform: string; id: string }[], viewerId: string): Map<string, Saver[]>`, keyed by `platform:id`.
    - Includes non-banned members' saves that are not private, plus the viewer's own save even when it is private.
    - Excludes `source = 'quoted'` rows.
    - Ordered newest saver first.
    - Returns an empty map when `viewerId` is `''` (signed out).
  - `visibleSaveFilter`: the SQL condition "not private and not quoted and saver not banned". Every query that counts or groups other people's saves (moments, trending, Everyone search `publishable`, group channels, the blended feed) must use it, so a post with only private savers never surfaces.
- `src/lib/people/members.ts`: `listMembers(viewerId)` returns members with their visible save counts, for friend channels and the feed's per-friend controls.

## API additions (web)

All of these require sign-in unless marked public.

- `POST /api/bookmarks/add` and `POST /api/tweets/add` accept `private?: boolean`. A repeat save that passes `private` updates the flag.
- `PATCH /api/bookmarks/[id]/private` with body `{ platform, private }` → `{ private }`.
- `FeedItem.savers?: Saver[]` and `FeedItem.isPrivate?: boolean` (the viewer's own save is private). These are set on `/api/feed`, `/api/search`, `/api/search/similar` (signed in), channel queues and moment items, but only when the viewer is signed in.
- `GET /api/search?scope=everyone`, signed in: the same posts as today, minus posts whose only savers are private, with `savers` attached. Signed-out callers keep the anonymous shape.
- `GET /api/feed/blend?mode=new|everyone|friends|mine&types=video,photo,text,article&limit&cursor` → `{ items: FeedItem[], nextCursor: string | null, caughtUp: boolean, nothingYet: boolean, total: number, types: FeedKind[], waiting: { [kind]: number } }`
  - `types` ("What's in your feed") filters by kind: `video` (sound, such as SoundCloud, counts as video), `photo`, `text`, `article`, judged the same way as `toPhonePost` and search's type filter (an article first, then video, then photos, else text). Omitted, it's the person's stored choice (`user_preferences` `feed.types`), else `video,photo`. `caughtUp`, `why` and `total` apply within it. In `new`, `waiting` counts the unseen posts it leaves out, by kind.
  - Items carry `savers`, `isPrivate`, `why` (the headline reason) and `whyReasons: { kind, text, username? }[]` (every reason, headline first; `kind` is `together | more | like | close | fresh | yours`).
  - `new` returns only posts someone else saved in the last 14 days that the viewer hasn't seen (no `post_views` row), blended, newest-weighted, and ends with `caughtUp: true`. Posts only the viewer saved are left out (they know them). `nothingYet` is true when nobody else saved anything in that window, so the client can say "Nothing new yet" instead of "caught up".
  - `everyone` blends all members' saves; the viewer's own play sparingly (×0.3, at most one in every four); seen posts are down-weighted (×0.35). A quiet server reaches past 14 days to the newest 300 posts.
  - `friends` is what friends saved that the viewer hasn't saved themselves.
  - `mine` is the viewer's saves (newest 500, not archived).
  - `limit` 1–50 (default 20). The cursor is opaque: the first page computes a snapshot (kept per user for about 5 minutes under a seed the cursor carries), so later pages never reshuffle. An expired snapshot is recomputed from the same seed; New then starts over from what's still unseen.
- `GET /api/feed/types` → `{ types }` and `PUT { types: FeedKind[] }` (at least one) → `{ types }`.
- `GET /api/feed/weights` → `{ weights: { username: -1 | 1 } }` and `PUT { username, weight: -1 | 0 | 1 }` → `{ weights }` ("Show more / less from …", `user_preferences` key `feed.weights`). Only other members.
- `POST /api/views` with body `{ posts: [{ platform, id }] }` (at most 50) marks posts seen → 204. Idempotent: a post keeps the time it was first seen. Rows older than 180 days are pruned at migrate.
- `GET /api/channels` adds `group: [{ slug, name, size, members, savers, newCount, covers }]` (made from everyone's visible saves; `members` = how many saved into it, `savers` = up to 3 faces) and `friends: [{ username, name, avatarUrl, size, newCount, covers }]` (one per other member with visible saves; `newCount` = their visible saves you haven't saved or seen), plus `canInvite`.
- `GET /api/channels/group/[slug]` and `GET /api/channels/friend/[username]` return play queues in the `/api/channels/auto/[slug]` shape (`{ name, items, total, understood, close, refined, nextOffset }`), newest save first. The friend queue adds `friend` and takes `?new=1` (only what's new to you); your own username is 404 (your saves are My saves).
- `group_channels (slug, name, size, post_keys, savers, position, saves_at_compute, computed_at, model_version)`: server-wide, no `user_id`. Recomputed when missing, the model changed, after 12 h, after ±10 visible saves, or when a counted saver left or was banned. Every read re-checks each post's visible savers.
- Moments: when signed in, `MomentView.savers` (up to 5 faces plus `people`, saves inside the moment's window, newest first), `MomentView.watchers`, moment items carry `savers` (on the item, not the post), the detail carries `watchers`, the stream's `watching` event carries `watchers: Saver[]` (members tuned in now, without the receiver and banned accounts, names only to signed-in subscribers) and `save` carries `saver` (who just saved it). Moments name visible saves only: a private save is never counted or named there, not even to its owner. Names are computed per request from the moment's post keys (`momentPostKeys` + `saversFor`); the engine and anything it broadcasts stay anonymous. Signed out, every moments response keeps its old shape (no `savers` or `watchers` keys).
- `POST /api/moments/{slug}/react` with body `{ emoji, platform, id }` or `{ text, platform, id }` (exactly one) → `{ id, at }`. `emoji` is one of 😂 🔥 😭 👀 💀 ❤️; `text` has whitespace collapsed, control and direction characters dropped, ends trimmed, and must then be 1–40 characters (an emoji counts as one); it is only ever rendered as text, never HTML. 20 reactions a minute per person, 6 of them words; never stored. It reaches the signed-in subscribers watching that moment (the sender included, with `isYou`) as a `reaction` event `{ slug, id, at, saver, emoji | text, post: { platform, id } }`. Strangers never receive one. Errors: `bad_reaction`, `bad_text`, `bad_post`, `busy` (429), `no_moment` (404).
- `POST /api/invites` (admin, or any member when Who can invite isn't "Only me") → `{ id, url, expiresAt }`. `GET /api/invites` lists unused ones (with a short `code` from the id, never the link); `DELETE /api/invites/[id]` revokes one; `POST /api/invites/[id]/link` gives a fresh link for it (the old one stops working).
- Who can invite: `admin | approve | anyone` (`PATCH /api/people { inviteMode }`, admins; `INVITES=members` is only the first default). With `approve`, someone a member invited is `pending` (signed out everywhere but `/invite/waiting` and `GET /api/auth/approval`) until an admin answers `POST /api/people/requests/[id] { decision: approve | not_now | decline }`. `GET /api/people` → `{ members, isAdmin, canInvite, inviteMode, requests? }`; phone: `GET /api/app/people`, `POST /api/app/people/requests/[id]`.
- `GET /api/activity/processing?scope=all|mine|needs` (phone: `GET /api/app/doing`): posts on their way, stuck or just finished, only ones the viewer may see, with `savers`, step, status, reason and retry. `POST /api/activity/processing/retry` and `/link-only` `{ platform, id }` for people who saved it.
- `/invite/[token]` (public page): pick a name, which signs you in, then shows the phone pairing code and QR on the same screen. A used or expired invite says so.

## Phone API additions (`/api/app/*`, phone key)

- `PhonePost.savers: Saver[]` and `PhonePost.isPrivate: boolean`.
- `POST /api/app/save` accepts `private: boolean` (in the async queue too).
- `POST /api/app/private` with body `{ platform, id, private }` → `{ private }`.
- `GET /api/app/feed?mode=new|everyone|friends|mine&types&cursor&limit` → `{ items: PhonePost[], nextCursor, caughtUp, nothingYet, total, types, waiting, hidden }`; each item adds `why` and `whyReasons`. `types` as on the web; `hidden` repeats `waiting` under the name the phone apps read.
- `GET|PUT /api/app/feed/types`: the same stored choice as `/api/feed/types`.
- `POST /api/app/seen` with body `{ posts: [{ platform, id }] }` → 204.
- `GET /api/app/search?scope=mine|everyone`.
- `GET /api/app/channels` → `{ group, friends, mine }`, using the shapes above with covers as absolute-path URLs. `mine` = your channels then Made for you, `{ slug, name, size, kind: 'channel' | 'made-for-you', isPublic, covers }`. `GET /api/app/channels/{group|friend|mine}/{slug}` → `{ items: PhonePost[] }` (`friend` takes `?new=1`; `mine` tries your channel first, then Made for you). These also accept a signed-in session.
- `GET /api/app/live` → the moments snapshot with `savers` and `watchers` on each moment, covers as image addresses (a path from the server root, or a full URL for a link's preview picture), the Just saved strip as `PhonePost`s. `GET /api/app/live/{slug}` → `{ moment, items: PhonePost[], watchers }` (404 `moment_gone`).
- `POST /api/app/live/{slug}/react` (same body and rules as the web) and `GET /api/app/live/{slug}/stream`: SSE for that moment only (`watching`, `save` with `item.post` as a `PhonePost`, `formed`, `reaction`), counting the phone's member as watching by name.

## Product behaviour

- **Saver faces**: up to 3 overlapping avatars plus "Ana and Ben saved this" or "Ana and 3 others", on the theater byline, search tiles, channel tiles and phone players. Your own save shows as "You". Tapping a face opens that friend's channel.
- **Private toggle**: "Just for me" in the theater's Save sheet and More menu, the phone share cards and the phone player's More sheet. A private post shows a small lock.
- **New**: the signed-in home (`/` → `/play?feed=new`, first tab in the nav). It plays only what you haven't seen, then ends on a card: "You're all caught up. Go touch grass." and "That's everything your people saved since you last looked.", with Browse channels, See what's live and Watch it all again (Everyone, seen posts included). A post counts as seen after 2 s on stage, or when you skip it. Everyone · Friends only · Mine switches the mode (New lights Everyone). Next to it, **What's in your feed** shows a summary ("Videos and photos") and opens four toggle chips (Videos, Photos, Text posts, Articles; at least one stays on); videos and photos by default. When the filter holds back unseen posts, the caught-up card adds "4 text posts waiting · Show them", which plays just those, this once (`/play?feed=new&types=text`). On a server where nobody else has saved anything lately: "Nothing new yet. Save something for your people to find." with Paste.
- **The blend**: the signals are fresh, saved together, close to you, like what you keep, not seen yet, variety (no more than 2 in a row from one friend, or from one Made for you topic) and your own (sparingly). Each item carries `why` ("Ana and Ben saved this", "Like the frog videos you kept", "Mum saved this · 1h", "You watch most of Ben's saves"), shown as the chip at the stage's top-left ("Saved together" for two or more savers) and on each Up next tile. **Why this one** (in More) lists every reason, with Show more / Show less per friend.
- **Channels**: a "From everyone" row (group channels: "Rabbit holes, dug by your friends", "38 saves · 3 of you", "N new") and a "Your people" row (one big avatar card per friend, "N new", plus "Invite someone" → Settings when you may invite) above "Made for you" and "Your channels". A friend's channel is `/channels/friend/{username}` (members only): Play all, Play the N new ones, "Only people on this server can see this page." Play: `/play?group=slug`, `/play?friend=username[&new=1]`.
- **Who saved it**: the theater's faces open a popover listing each saver and when, with "See Ana’s saves" (yours: "See your saves" → My saves).
- **Private wins on public channels**: `/t/{user}/{tag}`, its OG mosaic, the public queue, clone, curator profile, leaderboard tiles and the sitemap never list a post the owner saved privately. The owner still sees it.
- **Live with names**: moment cards show faces ("Ana, Ben and Jo are saving these") and who's watching ("Ana and Ben are watching", green rings); the button says "Tune in with Ana" when a friend is in. Tuned in: "Ana and Ben are watching with you", the arriving-save toast names the saver ("Jo just saved one · playing next", with the post's picture), and one React button (a smiley in the rail) opens a picker: six emoji (a tap sends and closes) and "Say something to everyone watching" with Send. Reactions rise up the stage for everyone tuned in and fade: the reactor's avatar leads, ringed in their colour, with an emoji as a sticker on its corner or words in a speech bubble in their colour. Reduced motion: they fade in and out in place.
- **Search everyone's saves**: the search scope switch defaults to Everyone for signed-in members, with names on tiles.
- **Search what's on screen and said**: speech in videos is transcribed and on-screen text is read on the server, both added to the post's words for search. Copy that promised "no audio is processed" must be updated to say what is processed, and that it all stays on your server.

## Copy

Follow `brand/BRAND.md` → Voice. Buttons and errors stay plain; the grin goes in headlines, empty states and the end of the feed.
