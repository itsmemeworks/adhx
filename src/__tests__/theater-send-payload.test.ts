import { describe, it, expect } from 'vitest'
import { buildSharePayload } from '@/components/theater/useSendFile'

/**
 * `buildSharePayload` — the WhatsApp "via URL URL" regression guard. Sending
 * `files` alongside a `url` field makes WhatsApp/iMessage concatenate the
 * link into the caption a second time (2026-08-14 WORKLOG). The payload must
 * carry the link ONLY in `text`, never in `url`, whenever `files` is present.
 */

describe('buildSharePayload', () => {
  it('never includes a `url` key alongside `files`', () => {
    const file = new File(['x'], 'adhx-twitter-123.mp4', { type: 'video/mp4' })
    const payload = buildSharePayload(file, 'https://adhx.com/jack/status/123')

    expect(payload.files).toEqual([file])
    expect('url' in payload).toBe(false)
  })

  it('puts the canonical link in `text` as "via <url>"', () => {
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' })
    const payload = buildSharePayload(file, 'https://adhx.com/reels/abc')

    expect(payload.text).toBe('via https://adhx.com/reels/abc')
  })
})
