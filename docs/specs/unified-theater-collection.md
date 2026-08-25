# Unified theater: Saved, nav simplification, tags-first

**Status: building (2026-08-20).** From live user review after the accounts launch: the theater
(filmstrip dock + stage) is THE interaction model. Every other browsing UX is a competing
mental model and must fold into it. Nav shrinks to what a signed-in person actually does:
their Collection, the Live pulse, and their tags.

## 1. Navigation (authed Header)

- Tabs are **Library · Theater · Tags · Leaderboard** (Trending removed from the authed nav; the public
  `/trending` + `/trending/[filter]` routes and all their SEO stay untouched — they're just no
  longer surfaced to signed-in users).
- **Theater** is a pair of routes, not an overlay: `/live` is Live (signed-in `/` redirects here), `/saved` is Saved.
  The library grid at `/library` navigates to `/saved` (card tap / leftover deep links) —
  it does not mount a second TheaterShell.
- The **`+` Add button and its modal trigger are removed**. Adding by URL is paste-first: a
  global paste listener on the authed Collection (new `PasteToPreview` component) catches a
  pasted platform URL anywhere outside an input/textarea and routes it through
  `resolvePastedLink()` to its preview page (same behavior as the theater's paste input).
  The `open-add-tweet` / `close-add-tweet` event plumbing goes away.
- Search, Collection entry, avatar menu stay. Mobile width budget unchanged (nothing new at bar level).

## 2. Saved IS the theater (kill the vertical rail)

`CollectionTheater` + `CollectionRail` (vertical list column) are replaced by the same
`TheaterShell` filmstrip experience used everywhere else.

- New `TheaterShell` mode: **`'personal'`** — seeded from AuthedHome's current filtered feed
  (unread-first, exactly the items CollectionTheater receives today), `live: false`, no
  activity-pulse writes, no URL rewriting (the overlay lives on `/`), loop off, StageWaiting
  replaced by a "Pile clear 🎉" done-state with a Close button.
- **Bottom-right actions (desktop) / action row (mobile)** in collection mode:
  `Done` (primary gradient, ✓) · `Later` · `Tag` (opens `TagQuickPicker`) · `Delete` (5s undo
  toast) · `Open`. Done POSTs the existing `/api/bookmarks/[id]/read?platform=` then advances;
  Later just advances; Delete uses the existing deferred-delete semantics.
- **Keyboard map preserved verbatim from CollectionTheater**: `→` Done+advance, `←` Later,
  `↓`/`Backspace`/`Delete` = Delete (undo window), `U` undo, `Esc` close. `↑` steps back.
- **Filmstrip** shows the collection queue; resolved cards get the seen/checked treatment and the
  strip advances like the live theater. Dock end-cap shows `{n} left today` + streak flame.
- **Collection ↔ Live toggle** lives in the theater top bar (desktop) / peek-bar label (mobile):
  switching tabs swaps the seed between the collection queue and the live pulse feed
  (`useTheaterFeed` live mode). Live items show the authed `SavePostButton`. Marking state never
  leaks between tabs.
- `CollectionTheater.tsx` + `CollectionRail.tsx` + the already-unmounted `TriageMode.tsx` are
  deleted once parity is verified (keyboard map, deferred delete, streak tick, `?open=` deep link
  if it exists — check `/api/feed?id=` usage first).

## 3. Avatar in the theater (authed)

- When `useAuthMe()` reports authed, the theater chrome shows the user's avatar top-right
  (desktop top bar, right cluster before de-clutter; mobile top scrim right).
- Tapping opens a small dark menu (`TheaterAvatarMenu`): identity header (avatar + username/email),
  **Your collection** (`/`), **Settings** (`/settings`), **Sign out** (POST `/api/auth/logout` →
  `location.href='/'`). Signed-out shows nothing (Save-intent modal already covers sign-in).

## 4. Tags: create fast, fill fast

- FilterBar keeps the Tags dropdown, gains a **`+ New tag`** entry: inline input with the live
  `sanitizeTag()` preview (existing util), Enter creates it (a tag exists once one post carries
  it — creating just enters Select mode below with zero posts).
- **Select mode**: with a tag active, an **"Add posts"** toggle puts the grid in selection mode —
  every card gets a tap-target ring + check; tapping toggles that post's membership in the
  active tag via the existing `/api/bookmarks/[id]/tags` POST/DELETE. A sticky bottom bar shows
  `{tag} · {n} posts · Done`. Esc or Done exits. No new endpoints.
- **`TagQuickPicker`** (shared component): compact dark popover listing the user's tags
  (checkbox per tag for the current post) + inline create-new; used by the collection theater's
  `Tag` action. Contract: `<TagQuickPicker platform bookmarkId open onClose />`, self-contained
  fetching via `/api/tags` + `/api/bookmarks/[id]/tags`.

## 5. Out of scope (explicitly)

- Public/signed-out surfaces (home theater, previews, tag theaters, /trending SEO) unchanged.
- No new API endpoints; everything composes existing ones.
- Production deploy timing stays the user's call.

## Invariants

- One `TheaterShell`; modes: `home | shared | playlist | personal`. Every mode-specific behavior
  is gated on the mode, never forked into a second shell.
- Mobile chrome and desktop dock must both work in collection mode (the old CollectionTheater was
  desktop-leaning; the reel UX on phones applies to the personal theater too).
