/**
 * Client-side fire-and-forget ping that a post was sent (native share or
 * download). The server copies display fields from an existing pulse/bookmark
 * row — this payload is identifiers only, never captions or thumbnails.
 *
 * Safe to call from client components (no DB import).
 */
export function pingSharePulse(platform: string, id: string): void {
  if (typeof window === 'undefined' || !platform || !id) return
  void fetch('/api/activity/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, id }),
    keepalive: true,
  }).catch(() => {
    /* pulse must never break send/download */
  })
}
