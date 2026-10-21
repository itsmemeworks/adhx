/**
 * The networks ADHX keeps posts from beyond X, Instagram and TikTok — the set
 * linktokeep.com supports, plus Bluesky. Pure and client-safe: link
 * recognition, the canonical link back to the post, and display names.
 *
 * Every one of these is downloaded (src/lib/keep) and served by ADHX itself;
 * none has a playback proxy. Their preview pages live at `/s/{network}/{id}`.
 */

export const LINK_NETWORKS = [
  'youtube',
  'facebook',
  'reddit',
  'linkedin',
  'vimeo',
  'soundcloud',
  'pinterest',
  'twitch',
  'threads',
  'imgur',
  'bluesky',
] as const

export type LinkNetwork = (typeof LINK_NETWORKS)[number]

export const NETWORK_LABELS: Record<string, string> = {
  twitter: 'X',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  reddit: 'Reddit',
  linkedin: 'LinkedIn',
  vimeo: 'Vimeo',
  soundcloud: 'SoundCloud',
  pinterest: 'Pinterest',
  twitch: 'Twitch',
  threads: 'Threads',
  imgur: 'Imgur',
  bluesky: 'Bluesky',
}

export function networkLabel(platform: string | null | undefined): string {
  return NETWORK_LABELS[platform || 'twitter'] ?? platform ?? 'X'
}

export function isLinkNetwork(platform: string | null | undefined): platform is LinkNetwork {
  return !!platform && (LINK_NETWORKS as readonly string[]).includes(platform)
}

export interface NetworkPost {
  platform: LinkNetwork
  /** Stable id, safe in a URL path segment (`[A-Za-z0-9._~-]`). */
  id: string
  /** Handle/channel/subreddit when the link carries one. */
  author?: string
  previewPath: string
}

const hostIs = (host: string, ...domains: string[]) =>
  domains.some((d) => host === d || host.endsWith(`.${d}`))

const SAFE_ID = /^[A-Za-z0-9._~-]{1,120}$/

/**
 * Any post id ADHX stores, on any network: X/TikTok/Instagram ids plus the
 * link networks' ids (`[A-Za-z0-9._~-]`, e.g. SoundCloud's `user~track`).
 * Use it wherever a route takes a post id, so link posts aren't refused.
 */
export const POST_ID_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/

function post(platform: LinkNetwork, id: string, author?: string): NetworkPost | null {
  if (!SAFE_ID.test(id)) return null
  return { platform, id, author, previewPath: networkPreviewPath(platform, id, author) }
}

/**
 * `/s/{network}/{id}`, with `?by=` when the network needs the author to find
 * the post again (Threads, Bluesky, Reddit, Twitch).
 */
export function networkPreviewPath(platform: string, id: string, author?: string | null): string {
  const by = author?.replace(/^@+/, '')
  const needsAuthor = ['threads', 'bluesky', 'reddit', 'twitch'].includes(platform)
  return `/s/${platform}/${encodeURIComponent(id)}${by && needsAuthor ? `?by=${encodeURIComponent(by)}` : ''}`
}

/** Recognise a post link on one of the link networks. */
export function detectNetworkPost(url: URL): NetworkPost | null {
  const host = url.hostname.toLowerCase()
  const path = url.pathname
  let m: RegExpMatchArray | null

  if (hostIs(host, 'youtube.com', 'youtube-nocookie.com')) {
    const v = url.searchParams.get('v')
    if (path === '/watch' && v && /^[\w-]{11}$/.test(v)) return post('youtube', v)
    if ((m = path.match(/^\/(?:shorts|live|embed|v)\/([\w-]{11})(?:[/?]|$)/))) {
      return post('youtube', m[1])
    }
    return null
  }
  if (host === 'youtu.be') {
    if ((m = path.match(/^\/([\w-]{11})(?:\/|$)/))) return post('youtube', m[1])
    return null
  }

  if (hostIs(host, 'facebook.com', 'fb.com')) {
    if ((m = path.match(/^\/(?:reel|reels)\/(\d{5,25})(?:\/|$)/))) return post('facebook', m[1])
    if ((m = path.match(/^\/(?:[^/]+\/)?videos\/(?:[^/]+\/)?(\d{5,25})(?:\/|$)/))) {
      return post('facebook', m[1])
    }
    const v = url.searchParams.get('v')
    if ((path === '/watch' || path === '/watch/') && v && /^\d{5,25}$/.test(v)) {
      return post('facebook', v)
    }
    if ((m = path.match(/^\/share\/([rvp])\/([A-Za-z0-9]{5,30})(?:\/|$)/))) {
      return post('facebook', `share-${m[1]}-${m[2]}`)
    }
    return null
  }
  if (host === 'fb.watch') {
    if ((m = path.match(/^\/([A-Za-z0-9_-]{5,30})(?:\/|$)/)))
      return post('facebook', `watch-${m[1]}`)
    return null
  }

  if (hostIs(host, 'reddit.com')) {
    if ((m = path.match(/^\/r\/([A-Za-z0-9_]{2,30})\/comments\/([a-z0-9]{4,12})(?:\/|$)/i))) {
      return post('reddit', m[2].toLowerCase(), m[1])
    }
    if ((m = path.match(/^\/comments\/([a-z0-9]{4,12})(?:\/|$)/i))) {
      return post('reddit', m[1].toLowerCase())
    }
    return null
  }
  if (host === 'redd.it') {
    if ((m = path.match(/^\/([a-z0-9]{4,12})\/?$/i))) return post('reddit', m[1].toLowerCase())
    return null
  }

  if (hostIs(host, 'linkedin.com')) {
    if ((m = path.match(/urn:li:(?:activity|ugcPost|share):(\d{15,25})/))) {
      return post('linkedin', m[1])
    }
    if ((m = path.match(/^\/posts\/[^/]*?-(?:activity|ugcPost|share)-(\d{15,25})(?:-|\/|$)/))) {
      return post('linkedin', m[1])
    }
    return null
  }

  if (hostIs(host, 'vimeo.com')) {
    if ((m = path.match(/^\/(?:video\/)?(\d{5,12})(?:\/|$)/))) return post('vimeo', m[1])
    if ((m = path.match(/^\/channels\/[^/]+\/(\d{5,12})(?:\/|$)/))) return post('vimeo', m[1])
    return null
  }

  if (hostIs(host, 'soundcloud.com') && !host.startsWith('api')) {
    if ((m = path.match(/^\/([a-z0-9_-]{2,60})\/([a-z0-9_-]{1,120})\/?$/i))) {
      const [, user, track] = m
      if (['sets', 'tracks', 'likes', 'reposts', 'albums', 'popular-tracks'].includes(track)) {
        return null
      }
      return post('soundcloud', `${user}~${track}`, user)
    }
    return null
  }

  if (hostIs(host, 'pinterest.com') || /(^|\.)pinterest\.[a-z.]{2,6}$/.test(host)) {
    if ((m = path.match(/^\/pin\/(\d{5,25})(?:\/|$)/))) return post('pinterest', m[1])
    return null
  }

  if (host === 'clips.twitch.tv') {
    if ((m = path.match(/^\/([A-Za-z0-9_-]{5,100})\/?$/))) return post('twitch', m[1])
    return null
  }
  if (hostIs(host, 'twitch.tv')) {
    if ((m = path.match(/^\/([A-Za-z0-9_]{2,30})\/clip\/([A-Za-z0-9_-]{5,100})(?:\/|$)/))) {
      return post('twitch', m[2], m[1])
    }
    return null
  }

  if (hostIs(host, 'threads.net', 'threads.com')) {
    if ((m = path.match(/^\/@([A-Za-z0-9._]{1,30})\/post\/([A-Za-z0-9_-]{5,30})(?:\/|$)/))) {
      return post('threads', m[2], m[1])
    }
    return null
  }

  if (hostIs(host, 'imgur.com')) {
    if ((m = path.match(/^\/(?:a|gallery)\/(?:[a-z0-9-]*-)?([A-Za-z0-9]{5,10})\/?$/i))) {
      return post('imgur', `a-${m[1]}`)
    }
    if ((m = path.match(/^\/([A-Za-z0-9]{5,10})(?:\.[a-z0-9]{3,4})?\/?$/i))) {
      return post('imgur', m[1])
    }
    return null
  }

  if (host === 'bsky.app') {
    if ((m = path.match(/^\/profile\/([A-Za-z0-9.:-]{3,253})\/post\/([a-z0-9]{8,20})\/?$/))) {
      return post('bluesky', m[2], m[1])
    }
    return null
  }

  return null
}

/** The post's own page on its network. */
export function networkSourceUrl(
  platform: string,
  id: string,
  author?: string | null,
): string | null {
  const a = author?.replace(/^@+/, '') || ''
  switch (platform) {
    case 'youtube':
      return `https://www.youtube.com/watch?v=${id}`
    case 'facebook': {
      const share = id.match(/^share-([rvp])-(.+)$/)
      if (share) return `https://www.facebook.com/share/${share[1]}/${share[2]}/`
      const watch = id.match(/^watch-(.+)$/)
      if (watch) return `https://fb.watch/${watch[1]}/`
      return `https://www.facebook.com/watch/?v=${id}`
    }
    case 'reddit':
      return a
        ? `https://www.reddit.com/r/${a}/comments/${id}/`
        : `https://www.reddit.com/comments/${id}/`
    case 'linkedin':
      return `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`
    case 'vimeo':
      return `https://vimeo.com/${id}`
    case 'soundcloud': {
      const [user, track] = id.split('~')
      return user && track ? `https://soundcloud.com/${user}/${track}` : null
    }
    case 'pinterest':
      return `https://www.pinterest.com/pin/${id}/`
    case 'twitch':
      return `https://clips.twitch.tv/${id}`
    case 'threads':
      return a ? `https://www.threads.com/@${a}/post/${id}` : null
    case 'imgur':
      return id.startsWith('a-') ? `https://imgur.com/a/${id.slice(2)}` : `https://imgur.com/${id}`
    case 'bluesky':
      return a ? `https://bsky.app/profile/${a}/post/${id}` : null
    default:
      return null
  }
}

/** The author's page on their network, when there is a handle. */
export function networkAuthorUrl(platform: string, author: string): string | null {
  const a = author.replace(/^@+/, '').trim()
  if (!a) return null
  switch (platform) {
    case 'youtube':
      return a.startsWith('UC')
        ? `https://www.youtube.com/channel/${a}`
        : `https://www.youtube.com/@${a}`
    case 'reddit':
      return `https://www.reddit.com/r/${a}/`
    case 'soundcloud':
      return `https://soundcloud.com/${a}`
    case 'twitch':
      return `https://www.twitch.tv/${a}`
    case 'threads':
      return `https://www.threads.com/@${a}`
    case 'bluesky':
      return `https://bsky.app/profile/${a}`
    case 'vimeo':
      return `https://vimeo.com/${a}`
    case 'pinterest':
      return `https://www.pinterest.com/${a}/`
    default:
      return null
  }
}

/** Every network ADHX keeps posts from. */
export const ALL_PLATFORMS = ['twitter', 'instagram', 'tiktok', ...LINK_NETWORKS] as const

/**
 * Short share links (pin.it/…, reddit.com/r/x/s/…, on.soundcloud.com/…) and
 * the hosts each may redirect through. Following them needs the server
 * (src/lib/keep/shortlinks.ts, /api/links/resolve).
 */
export const NETWORK_SHORT_LINKS: Array<{ test: RegExp; hosts: string[] }> = [
  {
    test: /^https:\/\/pin\.it\/[A-Za-z0-9]+\/?$/,
    hosts: ['pin.it', 'api.pinterest.com', 'www.pinterest.com', '.pinterest.com'],
  },
  {
    test: /^https:\/\/(?:www\.)?reddit\.com\/r\/[A-Za-z0-9_]+\/s\/[A-Za-z0-9]+\/?$/,
    hosts: ['www.reddit.com', 'reddit.com'],
  },
  {
    test: /^https:\/\/on\.soundcloud\.com\/[A-Za-z0-9]+\/?$/,
    hosts: ['on.soundcloud.com', 'soundcloud.com', 'm.soundcloud.com'],
  },
  {
    test: /^https:\/\/(?:www\.)?threads\.(?:net|com)\/t\/[A-Za-z0-9_-]+\/?$/,
    hosts: ['www.threads.net', 'threads.net', 'www.threads.com', 'threads.com'],
  },
]

export function isNetworkShortLink(url: string): boolean {
  return NETWORK_SHORT_LINKS.some((s) => s.test.test(url.trim()))
}
