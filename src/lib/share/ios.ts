/**
 * iOS save/send entry points. The published iCloud shortcut lives outside
 * this repo and opens `/share?url=` for X, Instagram, TikTok, and YouTube —
 * installing it adds ADHX to the iOS share menu. URL-prefix and paste still
 * work as fallbacks.
 */

export const IOS_SHORTCUT_URL = 'https://www.icloud.com/shortcuts/0d187480099b4d34a745ec8750a4587b'

/** Canonical share-target prefix. Append a percent-encoded source URL. */
export const SHARE_TARGET_PREFIX = 'https://adhx.com/share?url='

export const BOOKMARKLET_CODE = `javascript:void(location.href=location.href.replace(/(?:x|twitter|instagram|tiktok|youtube)\\.com/,'adhx.com'))`
