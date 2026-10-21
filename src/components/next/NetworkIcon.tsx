import {
  siBluesky,
  siFacebook,
  siImgur,
  siInstagram,
  siPinterest,
  siReddit,
  siSoundcloud,
  siThreads,
  siTiktok,
  siTwitch,
  siVimeo,
  siX,
  siYoutube,
} from 'simple-icons'
import { cn } from '@/lib/utils'

/** Each network's own mark (from Simple Icons), drawn in the current text colour. */
const MARKS: Record<string, string> = {
  twitter: siX.path,
  instagram: siInstagram.path,
  tiktok: siTiktok.path,
  youtube: siYoutube.path,
  facebook: siFacebook.path,
  reddit: siReddit.path,
  vimeo: siVimeo.path,
  soundcloud: siSoundcloud.path,
  pinterest: siPinterest.path,
  twitch: siTwitch.path,
  threads: siThreads.path,
  imgur: siImgur.path,
  bluesky: siBluesky.path,
}

export function NetworkIcon({
  platform,
  className,
}: {
  platform: string | null | undefined
  className?: string
}) {
  const key = platform || 'twitter'
  const path = MARKS[key]
  if (path) {
    return (
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="currentColor"
        className={cn('shrink-0', className)}
      >
        <path d={path} />
      </svg>
    )
  }
  // LinkedIn asked Simple Icons not to carry its logo; spell the name's start instead.
  if (key === 'linkedin') {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={cn('notranslate shrink-0', className)}>
        <rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="currentColor" />
        <text
          x="12"
          y="17.2"
          textAnchor="middle"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="13.5"
          fontWeight="700"
          fill="#000"
        >
          in
        </text>
      </svg>
    )
  }
  return null
}
