/** The networks ADHX keeps posts from (mirrors src/lib/platform/networks.ts in the app). */
export const ALL_PLATFORMS = [
  'twitter',
  'instagram',
  'tiktok',
  'youtube',
  'reddit',
  'facebook',
  'linkedin',
  'vimeo',
  'soundcloud',
  'pinterest',
  'twitch',
  'threads',
  'imgur',
  'bluesky',
] as const

const LABELS: Record<string, string> = {
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

export function networkLabel(platform: string): string {
  return LABELS[platform] ?? platform
}
