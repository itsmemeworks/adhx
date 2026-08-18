'use client'

/**
 * STUB — implemented by the theater-send agent (spec §2/§8).
 * Send-the-file flow for the theater: prefetches the current item's MP4 so
 * `navigator.share` runs inside the user's tap (iOS drops user-activation
 * across an await), then shares `{ files, text: "via <canonical url>" }` —
 * NEVER `url` alongside `files` (WhatsApp concatenates them). Falls back to
 * sharing/copying the preview link when files can't be shared. Pings the
 * anonymous share pulse (`POST /api/activity/share`) on success.
 */

import type { TheaterItem } from './types'

export interface SendFile {
  /** False when this item has nothing sendable (no MP4/photo) — hide the button. */
  supported: boolean
  /** True once the file is prefetched and the share sheet can open in-tap. */
  ready: boolean
  /** True while a send is in flight. */
  sending: boolean
  /** Open the native share sheet (or fall back to the link). Call from a tap. */
  send: () => Promise<void>
}

export function useSendFile(item: TheaterItem | null): SendFile {
  void item
  return { supported: false, ready: false, sending: false, send: async () => {} }
}
