import { describe, expect, it } from 'vitest'
import { parseAdminPostRef } from '@/lib/admin/parse-post'

describe('parseAdminPostRef', () => {
  it('parses source and preview URLs', () => {
    expect(parseAdminPostRef('https://x.com/foo/status/123')?.id).toBe('123')
    expect(parseAdminPostRef('https://adhx.com/foo/status/123')).toEqual(
      expect.objectContaining({ platform: 'twitter', id: '123' }),
    )
    expect(parseAdminPostRef('/reels/AbC_12')).toEqual(
      expect.objectContaining({ platform: 'instagram', id: 'AbC_12' }),
    )
    expect(parseAdminPostRef('/p/DcHXej3lt5W')).toEqual(
      expect.objectContaining({ platform: 'instagram', id: 'DcHXej3lt5W' }),
    )
    expect(parseAdminPostRef('twitter:999')).toEqual(
      expect.objectContaining({ platform: 'twitter', id: '999' }),
    )
  })

  it('recognises a YouTube source URL via detectPlatformPost', () => {
    expect(parseAdminPostRef('https://www.youtube.com/shorts/abcdefghijk')).toEqual(
      expect.objectContaining({
        platform: 'youtube',
        id: 'abcdefghijk',
        previewPath: '/s/youtube/abcdefghijk',
      }),
    )
  })

  it('does not treat the old /shorts/ path or youtube: shorthand as a post ref', () => {
    expect(parseAdminPostRef('/shorts/abcdefghijk')).toBeNull()
    expect(parseAdminPostRef('youtube:abcdefghijk')).toBeNull()
  })

  it('returns null for junk', () => {
    expect(parseAdminPostRef('')).toBeNull()
    expect(parseAdminPostRef('not a url')).toBeNull()
  })
})
