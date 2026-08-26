# Save to ADHX (desktop extension)

Desktop analog of the iOS Share → ADHX shortcut. Toolbar click, right-click, or `⌘⇧A` / `Ctrl+Shift+A` on an **X, Instagram, TikTok, or YouTube** post opens `/share?url=…` on ADHX. Signed-in autosave and the theater do the rest — this package does **not** talk to the API, store tokens, or inject scripts into the page.

Not on the Chrome Web Store yet. Load it unpacked. The bookmarklet in the main app stays the no-install fallback.

| Permission     | Why                                              |
| -------------- | ------------------------------------------------ |
| `activeTab`    | Read the current tab URL when you click / press  |
| `contextMenus` | Right-click → **Save to ADHX** on a page or link |

No `tabs`, no `<all_urls>`, no content scripts.

---

## Prerequisites

- [pnpm](https://pnpm.io) 9 (same as the app — see the repo root `packageManager`)
- Chromium-based browser (Chrome, Edge, Brave, Arc) or Firefox
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

- Unset / empty → production `https://adhx.com`
- Staging → `https://adhx.fly.dev`
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
- YouTube Shorts (`youtube.com/shorts/…` only — not `youtu.be` or `watch?v=`)

**Signed in** on that ADHX origin: a new open of the preview autosaves the lead (Save pill → Saved → Tag). Refresh / back / in-app hops do not.

**Signed out**: the preview still plays; Save opens the sign-in modal.

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

URL detection is covered by the **root** Vitest suite (`extension/src/**/*.test.ts`):

```bash
pnpm test extension/src/share-url.test.ts
```

Typecheck this package (after `pnpm --dir extension install`):

```bash
pnpm --dir extension exec tsc --noEmit
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
| Lands on `adhx.com` instead of localhost       | `.env` missing / empty, or you did not rebuild + Reload                   |
| Preview loads but does not autosave            | Not signed in **on that origin**, or this was a refresh / back navigation |
| Toolbar does nothing except a red **×**        | Current tab is not a supported post — right-click the post link instead   |
| Load unpacked greyed out / fails               | Pick the `dist/chromium` folder, not `extension/` or `src/`               |
| `Cannot find namespace 'chrome'` in root `tsc` | Do not add `extension` back to the app `tsconfig` include                 |
| Shortcut does nothing                          | Remap at `chrome://extensions/shortcuts`                                  |
| `pnpm --dir extension install` after a clone   | Required — this package is not part of the root workspace install         |
