/**
 * iOS save/send entry points. The published iCloud shortcut lives outside
 * this repo and opens adhx.com's `/share?url=`; a self-hosted ADHX shows
 * people how to make their own (Settings). URL-prefix and paste still work
 * as fallbacks.
 */

export const IOS_SHORTCUT_URL = 'https://www.icloud.com/shortcuts/0d187480099b4d34a745ec8750a4587b'

/** Canonical share-target prefix. Append a percent-encoded source URL. */
export const SHARE_TARGET_PREFIX = 'https://adhx.com/share?url='

/** A bookmarklet that sends the current page to an ADHX's share target. */
export function bookmarkletCode(origin = 'https://adhx.com'): string {
  return `javascript:void(location.href='${origin.replace(/'/g, '')}/share?url='+encodeURIComponent(location.href))`
}

export const BOOKMARKLET_CODE = bookmarkletCode()
