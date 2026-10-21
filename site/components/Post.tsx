import type { CSSProperties, ReactNode } from 'react'
import credits from '../public/media/credits.json'
import { cn } from './cn'
import { LoopVideo } from './LoopVideo'
import { NetworkIcon } from './NetworkIcon'

/**
 * Real posts on the product site: saves from an ADHX server's public Right
 * now data, kept as short muted clips and stills in public/media. Who made
 * each one, and where it came from, is in public/media/credits.json; every
 * post on the page carries its network's mark and its author's handle.
 */

export type PostId =
  | 'offbeat'
  | 'offbeat-room'
  | 'aurora'
  | 'sudara'
  | 'palettes'
  | 'modular'
  | 'muscriptor'
  | 'midi'
  | 'rc808'
  | 'sorcerer'
  | 'soundlab'
  | 'okinstruments'
  | 'wallow'
  | 'bencho'
  | 'hallmark'

type Entry = (typeof credits.posts)[number]

const BY_ID = new Map<string, Entry>(credits.posts.map((p) => [p.id, p]))

export function post(id: PostId): Entry {
  const p = BY_ID.get(id)
  if (!p) throw new Error(`No post "${id}" in public/media/credits.json`)
  return p
}

/** Every post once, in page order of first appearance (for the footer). */
export function creditedPosts(): Entry[] {
  const seen = new Set<string>()
  return credits.posts.filter((p) => {
    if (seen.has(p.url)) return false
    seen.add(p.url)
    return true
  })
}

export const mediaSrc = (file: string) => `/media/${file}`

/**
 * The post's picture or clip, filling its box. `contain` letterboxes it over
 * a blurred copy, as the app's player does with a wide video on a phone.
 * `still` shows the poster even when the post has a clip.
 */
export function PostMedia({
  id,
  className,
  style,
  fit = 'cover',
  still = false,
  credit,
  children,
}: {
  id: PostId
  className?: string
  style?: CSSProperties
  fit?: 'cover' | 'contain'
  still?: boolean
  /** Where to pin the credit chip, if anywhere. */
  credit?: 'tl' | 'tr' | 'bl' | 'br'
  children?: ReactNode
}) {
  const p = post(id)
  const poster = mediaSrc(p.poster)
  const media = cn(
    'absolute inset-0 h-full w-full',
    fit === 'contain' ? 'object-contain' : 'object-cover',
  )
  return (
    <span className={cn('block overflow-hidden bg-black', className)} style={style}>
      {fit === 'contain' && (
        <img
          src={poster}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl"
        />
      )}
      {p.video && !still ? (
        <LoopVideo src={mediaSrc(p.video)} poster={poster} className={media} />
      ) : (
        <img
          src={poster}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          width={p.width}
          height={p.height}
          className={media}
        />
      )}
      {children}
      {credit && (
        <Credit
          id={id}
          chip
          className={cn(
            'absolute',
            credit === 'tl' && 'left-2 top-2',
            credit === 'tr' && 'right-2 top-2',
            credit === 'bl' && 'bottom-2 left-2',
            credit === 'br' && 'bottom-2 right-2',
          )}
        />
      )}
    </span>
  )
}

/**
 * Whose post it is: the network's mark and the author's handle. As a chip
 * over the post, or inline in a line of text.
 */
export function Credit({
  id,
  chip = false,
  className,
  style,
}: {
  id: PostId
  chip?: boolean
  className?: string
  style?: CSSProperties
}) {
  const p = post(id)
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-[0.35em] whitespace-nowrap',
        chip &&
          'rounded-full bg-black/55 px-[0.6em] py-[0.25em] text-[10px] font-bold text-white/90 backdrop-blur-md md:text-[11px]',
        className,
      )}
      style={style}
    >
      <NetworkIcon platform={p.network} className="h-[1em] w-[1em]" />
      <span className="truncate">{`@${p.author}`}</span>
    </span>
  )
}
