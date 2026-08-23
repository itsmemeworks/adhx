# Save to ADHX

Desktop analog of the iOS Share → ADHX shortcut. Toolbar click, right-click, or `⌘⇧A` / `Ctrl+Shift+A` on an X / Instagram / TikTok / YouTube post opens `https://adhx.com/share?url=…`. Signed-in autosave and the theater do the rest — this package does not talk to the API.

No content scripts. Permissions are `activeTab` + `contextMenus` only.

## Load it (unpacked)

```bash
pnpm --dir extension install
pnpm --dir extension build
```

Chrome → `chrome://extensions` → Developer mode → Load unpacked → `extension/dist/chromium` (path printed by the build).

Point at local ADHX with a `.env` next to this README:

```
EXTENSION_PUBLIC_APP_ORIGIN=http://localhost:3001
```

then rebuild. Unset, it ships to `https://adhx.com`.

```bash
pnpm --dir extension dev
```

opens a fresh Chrome profile with the extension loaded (does not start the Next app).

Not on the Chrome Web Store yet. The bookmarklet stays the no-install fallback.

## Layout

| File                | Role                                                                |
| ------------------- | ------------------------------------------------------------------- |
| `src/background.ts` | Toolbar, context menu, badge on unsupported URLs                    |
| `src/share-url.ts`  | Which links we will send (mirrors the app detector)                 |
| `src/manifest.json` | MV3 + Firefox adapters via [Extension.js](https://extension.js.org) |
