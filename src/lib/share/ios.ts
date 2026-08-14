/**
 * iOS save/send entry points. The published iCloud shortcut is X-only (it
 * rewrites `x.com` → `adhx.com` and lives outside this repo). All four
 * platforms go through `/share?url=` — URL-prefix, a hand-built Share Sheet
 * shortcut, or the landing paste field.
 */

export const X_ONLY_SHORTCUT_URL =
  'https://www.icloud.com/shortcuts/0d187480099b4d34a745ec8750a4587b'

/** Canonical share-target prefix. Append a percent-encoded source URL. */
export const SHARE_TARGET_PREFIX = 'https://adhx.com/share?url='

export const BOOKMARKLET_CODE = `javascript:void(location.href=location.href.replace(/(?:x|twitter|instagram|tiktok|youtube)\\.com/,'adhx.com'))`
