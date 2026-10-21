import { describe, it, expect } from 'vitest'
import { detectNetworkPost, networkSourceUrl } from '@/lib/platform/networks'
import { detectPlatformPost } from '@/lib/platform/url'

const detect = (url: string) => detectNetworkPost(new URL(url))

/** [link, platform, id, author?, previewPath] */
const CASES: Array<[string, string, string, string | undefined, string]> = [
  // YouTube
  [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5s',
    'youtube',
    'dQw4w9WgXcQ',
    undefined,
    '/s/youtube/dQw4w9WgXcQ',
  ],
  [
    'https://youtube.com/shorts/Y9aytLYBajw?si=abc',
    'youtube',
    'Y9aytLYBajw',
    undefined,
    '/s/youtube/Y9aytLYBajw',
  ],
  ['https://youtu.be/Y9aytLYBajw', 'youtube', 'Y9aytLYBajw', undefined, '/s/youtube/Y9aytLYBajw'],
  // Facebook
  [
    'https://www.facebook.com/reel/1234567890123',
    'facebook',
    '1234567890123',
    undefined,
    '/s/facebook/1234567890123',
  ],
  [
    'https://www.facebook.com/somepage/videos/9876543210/',
    'facebook',
    '9876543210',
    undefined,
    '/s/facebook/9876543210',
  ],
  [
    'https://www.facebook.com/watch/?v=1122334455',
    'facebook',
    '1122334455',
    undefined,
    '/s/facebook/1122334455',
  ],
  [
    'https://www.facebook.com/share/r/AbCdEf123/',
    'facebook',
    'share-r-AbCdEf123',
    undefined,
    '/s/facebook/share-r-AbCdEf123',
  ],
  // Reddit
  [
    'https://www.reddit.com/r/pics/comments/1abc2d/a_title/',
    'reddit',
    '1abc2d',
    'pics',
    '/s/reddit/1abc2d?by=pics',
  ],
  ['https://redd.it/1abc2d', 'reddit', '1abc2d', undefined, '/s/reddit/1abc2d'],
  // LinkedIn
  [
    'https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/',
    'linkedin',
    '7123456789012345678',
    undefined,
    '/s/linkedin/7123456789012345678',
  ],
  [
    'https://www.linkedin.com/posts/jane-doe_topic-activity-7123456789012345678-AbCd/',
    'linkedin',
    '7123456789012345678',
    undefined,
    '/s/linkedin/7123456789012345678',
  ],
  // Vimeo
  ['https://vimeo.com/76979871', 'vimeo', '76979871', undefined, '/s/vimeo/76979871'],
  // SoundCloud
  [
    'https://soundcloud.com/some-artist/a-track',
    'soundcloud',
    'some-artist~a-track',
    'some-artist',
    '/s/soundcloud/some-artist~a-track',
  ],
  // Pinterest
  [
    'https://www.pinterest.com/pin/123456789012345/',
    'pinterest',
    '123456789012345',
    undefined,
    '/s/pinterest/123456789012345',
  ],
  // Twitch
  [
    'https://clips.twitch.tv/FunnyClipSlug-abc123',
    'twitch',
    'FunnyClipSlug-abc123',
    undefined,
    '/s/twitch/FunnyClipSlug-abc123',
  ],
  [
    'https://www.twitch.tv/streamer/clip/FunnyClipSlug-abc123',
    'twitch',
    'FunnyClipSlug-abc123',
    'streamer',
    '/s/twitch/FunnyClipSlug-abc123?by=streamer',
  ],
  // Threads
  [
    'https://www.threads.net/@zuck/post/C1a2B3c4D5e',
    'threads',
    'C1a2B3c4D5e',
    'zuck',
    '/s/threads/C1a2B3c4D5e?by=zuck',
  ],
  [
    'https://www.threads.com/@zuck/post/C1a2B3c4D5e',
    'threads',
    'C1a2B3c4D5e',
    'zuck',
    '/s/threads/C1a2B3c4D5e?by=zuck',
  ],
  // Imgur
  ['https://imgur.com/AbCdE12', 'imgur', 'AbCdE12', undefined, '/s/imgur/AbCdE12'],
  ['https://imgur.com/a/AbCdE12', 'imgur', 'a-AbCdE12', undefined, '/s/imgur/a-AbCdE12'],
  [
    'https://imgur.com/gallery/funny-cat-AbCdE12',
    'imgur',
    'a-AbCdE12',
    undefined,
    '/s/imgur/a-AbCdE12',
  ],
  // Bluesky
  [
    'https://bsky.app/profile/jay.bsky.team/post/3kabc123def45',
    'bluesky',
    '3kabc123def45',
    'jay.bsky.team',
    '/s/bluesky/3kabc123def45?by=jay.bsky.team',
  ],
]

describe('detectNetworkPost / detectPlatformPost', () => {
  it.each(CASES)('%s → %s', (link, platform, id, author, previewPath) => {
    const expected = { platform, id, author, previewPath }
    expect(detect(link)).toEqual(expected)
    expect(detectPlatformPost(link)).toEqual(expected)
  })

  it('rejects non-post pages on supported networks', () => {
    for (const link of [
      'https://www.youtube.com/',
      'https://www.youtube.com/@channel',
      'https://soundcloud.com/some-artist/sets',
      'https://soundcloud.com/some-artist/tracks',
      'https://www.reddit.com/r/pics/',
      'https://www.pinterest.com/someone/boards/',
      'https://www.twitch.tv/streamer',
      'https://bsky.app/profile/jay.bsky.team',
    ]) {
      expect(detect(link), link).toBeNull()
    }
  })

  it('rejects unrelated hosts that look like a network', () => {
    for (const link of [
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://notyoutube.com/shorts/Y9aytLYBajw',
      'https://evil.example/r/pics/comments/1abc2d/',
      'https://evil.example/?next=https://vimeo.com/76979871',
      'https://fakebsky.app/profile/a.b/post/3kabc123def45',
    ]) {
      expect(detectPlatformPost(link), link).toBeNull()
    }
  })
})

describe('networkSourceUrl', () => {
  it('round-trips back to a link that detects as the same post', () => {
    for (const [link, platform, id, author] of CASES) {
      const source = networkSourceUrl(platform, id, author)
      expect(source, link).toBeTruthy()
      expect(detect(source!), `${link} → ${source}`).toMatchObject({ platform, id })
    }
  })

  it('returns null when an author-keyed network has no author', () => {
    expect(networkSourceUrl('threads', 'C1a2B3c4D5e')).toBeNull()
    expect(networkSourceUrl('bluesky', '3kabc123def45')).toBeNull()
    expect(networkSourceUrl('myspace', '1')).toBeNull()
  })
})
