# Save to ADHX (desktop extension)

The desktop twin of the phone's share menu. Click the toolbar button,
right-click a link, or press `⌘⇧A` / `Ctrl+Shift+A` on a post from any of
ADHX's fourteen networks, and the tab opens `/share?url=…` on your ADHX. If
you're signed in there, the post is saved and starts playing. That's it: this
package doesn't talk to the API, store tokens or inject scripts into pages.

When you use it, the extension sends the selected or current post's URL to your
configured ADHX by navigating the tab. Firefox therefore declares the
`browsingActivity` data collection category. Nothing is collected passively.

It isn't on the Chrome Web Store or Firefox Add-ons yet, so you load it
unpacked. No install at all? The bookmarklet in the main app still works.

| Permission     | Why                                              |
| -------------- | ------------------------------------------------ |
| `activeTab`    | Read the current tab URL when you click or press |
| `contextMenus` | Right-click → **Save to ADHX** on a page or link |

No `tabs`, no `<all_urls>`, no content scripts.

## Quick start

From the repository root, with pnpm 10 and a Chromium browser:

1. `cp extension/.env.example extension/.env` and set
   `EXTENSION_PUBLIC_APP_ORIGIN` to your ADHX (for example
   `https://adhx.example.com`, or `http://localhost:3001` for `pnpm dev`).
2. `pnpm --dir extension install && pnpm --dir extension build`
3. Open `chrome://extensions`, turn on **Developer mode**, click **Load
   unpacked** and pick `extension/dist/chromium`.
4. Sign in on your ADHX in that browser, open a post on X (or TikTok, or…)
   and click **Save to ADHX**.

---

## Prerequisites

- [pnpm](https://pnpm.io) 10 (the version in this package's and the repository's `packageManager`)
- Chromium-based browser (Chrome, Edge, Brave, Arc) or Firefox 140+
- For **local** saves: ADHX running at [http://localhost:3001](http://localhost:3001) (`pnpm dev` from the repo root; do not use port 3000)

The extension is a **separate package**. Root `pnpm install` does not install it. Root `pnpm typecheck` / `next build` also ignore this folder on purpose (`tsconfig.json` excludes `extension` — `@types/chrome` only exists after you install here).

---

## Point it at local ADHX

Copy the example env and set the origin to match `pnpm dev`:

```bash
cp extension/.env.example extension/.env
```

In `extension/.env`:

```
EXTENSION_PUBLIC_APP_ORIGIN=http://localhost:3001
```

- Your server → its HTTPS origin, e.g. `https://adhx.example.com`.
- Unset / empty still uses the legacy default `https://adhx.com`; always set your own origin for self-hosting. A static product site cannot receive saves.
- No trailing slash. Rebuild after any change (env is baked in at build time).
- `extension/.env` is gitignored. Do not commit it.

A session cookie only works on the origin it was issued for. If you sign in on localhost but the extension still opens `adhx.com`, you forgot the env (or forgot to rebuild).

---

## Build and load unpacked (Chrome / Edge / Brave)

From the **repo root**:

```bash
pnpm --dir extension install
pnpm --dir extension build
```

(`pnpm extension:build` is the same as the second command.)

The build prints the output path. Load that folder:

1. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
2. Turn on **Developer mode** (top right).
3. **Load unpacked**.
4. Select `extension/dist/chromium` (absolute path:
   `<repo>/extension/dist/chromium`).

Pin the puzzle-piece toolbar icon so **Save to ADHX** stays visible.

After you change source or `.env`, rebuild, then click **Reload** on the extension card. Chrome will not pick up a new `dist/` until you reload.

### Firefox (temporary)

```bash
pnpm --dir extension build:firefox
```

Then `about:debugging` → **This Firefox** → **Load Temporary Add-on…** → pick `manifest.json` inside the Firefox output folder the build printed (typically `extension/dist/firefox`). Temporary add-ons vanish when Firefox quits.

The Firefox build uses the stable Gecko add-on ID `save-to-adhx@adhx.com`. This is the
project-owned release identity under the ADHX domain; do not change it between releases.
Its minimum supported Firefox version is 140.0, where the declared data-collection consent
contract is available.

---

## Use it

With ADHX running locally (and the env above), sign in on [http://localhost:3001](http://localhost:3001) first (magic-link email prints the URL in the Next terminal).

| Action                         | What it uses                           | Result                          |
| ------------------------------ | -------------------------------------- | ------------------------------- |
| Toolbar icon                   | Current tab URL                        | Tab navigates to `/share?url=…` |
| `⌘⇧A` (Mac) / `Ctrl+Shift+A`   | Current tab URL                        | Same                            |
| Right-click a **link**         | The link href (preferred)              | Same                            |
| Right-click a page / selection | Tab URL, or a URL inside the selection | Same                            |

Supported URLs (same set `/share` already routes):

- X / Twitter status (`x.com/…/status/…`, `twitter.com`, vx/fx mirrors)
- Instagram Reels / posts (`instagram.com/reel/`, `/reels/`, `/p/`)
- TikTok videos and short links (`vm.` / `vt.` / `tiktok.com/t/`)
- YouTube, Facebook, Reddit, LinkedIn, Vimeo, SoundCloud, Pinterest, Twitch, Threads, Imgur and Bluesky (the server validates individual posts)

**Signed in** on that ADHX origin: a fresh open from the extension saves the post and plays it in the theater. Refreshing, going back or moving around inside ADHX doesn't save again.

**Signed out**: the post still plays; pressing Save sends you to sign in (`/start`) and saves it when you come back.

**Unsupported page** (e.g. `x.com/home`, a random site): the toolbar click stays put and flashes a short **×** badge. Right-click a real post link on that page still works.

### Keyboard shortcut stolen?

Chrome → `chrome://extensions/shortcuts` → set **Save this post to ADHX**. Another extension may already own `⌘⇧A`.

---

## Dev Chrome (fresh profile)

```bash
pnpm --dir extension install
# keep EXTENSION_PUBLIC_APP_ORIGIN in extension/.env
pnpm --dir extension dev
# or from the repo root: pnpm extension:dev
```

This opens a **new Chrome profile** with the extension loaded. It does **not** start Next. Sign in again in that window if you want autosave — it does not share cookies with your everyday Chrome.

`pnpm --dir extension start` loads a production-like build the same way. `pnpm --dir extension preview` previews the last build.

---

## Tests

URL detection and the source Manifest V3/action contract are covered by the **root** Vitest suite
(`extension/src/**/*.test.ts`):

```bash
pnpm test extension/src
```

Typecheck this package (after `pnpm --dir extension install`):

```bash
pnpm --dir extension typecheck
```

To verify both emitted browser manifests after building them:

```bash
pnpm --dir extension build:chrome
pnpm --dir extension build:firefox
pnpm --dir extension validate:manifests
```

---

## Layout

| Path                | Role                                                                         |
| ------------------- | ---------------------------------------------------------------------------- |
| `src/background.ts` | Toolbar, context menu, `×` badge, keyboard command                           |
| `src/share-url.ts`  | Which links we will send (standalone copy of the app detector)               |
| `src/manifest.json` | MV3 Chromium + Firefox adapters via [Extension.js](https://extension.js.org) |
| `src/images/`       | Toolbar icons                                                                |
| `.env.example`      | `EXTENSION_PUBLIC_APP_ORIGIN`                                                |

`src/content/` and `src/sidebar/` are unused Extension.js template leftovers and are **not** in the manifest. Do not wire them in — the product decision is no content scripts.

---

## Troubleshooting

| Symptom                                        | Likely cause                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Lands on `adhx.com` instead of your server     | `.env` missing / empty, or you did not rebuild + Reload                   |
| Preview loads but does not autosave            | Not signed in **on that origin**, or this was a refresh / back navigation |
| Toolbar does nothing except a red **×**        | Current tab is not a supported post — right-click the post link instead   |
| Load unpacked greyed out / fails               | Pick the `dist/chromium` folder, not `extension/` or `src/`               |
| `Cannot find namespace 'chrome'` in root `tsc` | Do not add `extension` back to the app `tsconfig` include                 |
| Shortcut does nothing                          | Remap at `chrome://extensions/shortcuts`                                  |
| `pnpm --dir extension install` after a clone   | Required — this package is not part of the root workspace install         |
