import type { ReactNode } from 'react'
import { cn } from './cn'
import { Gob } from './Gob'
import { Face, Faces } from './People'
import { Credit, PostMedia, type PostId } from './Post'
import { Ring } from './frames'
import { Dots, LinkIcon } from './icons'

/**
 * The product site's How it works drawings, with real posts saved on an ADHX
 * server (components/Post.tsx), each credited with its network's mark and its
 * author's handle. The features themselves are screenshots (Shots.tsx). Each is a figure: the drawing is hidden from screen
 * readers and described by a visually hidden caption. Below `md` they follow
 * the phone board (compact); from `md` the desktop one.
 */

export function Mock({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <figure className={cn('m-0 min-w-0', className)}>
      <div aria-hidden>{children}</div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  )
}

function Tile({
  post,
  still,
  credit,
  className,
  children,
}: {
  post: PostId
  still?: boolean
  credit?: 'tl' | 'tr' | 'bl' | 'br'
  className?: string
  children?: ReactNode
}) {
  return (
    <PostMedia
      id={post}
      still={still}
      credit={credit}
      className={cn('relative block overflow-hidden bg-nx-surface', className)}
    >
      {children}
    </PostMedia>
  )
}

/* ——— Home: the lineup ——— */

/* ——— Saver faces and Just for me ——— */

/* ——— The meme vault ——— */

/* ——— Search ——— */

/* ——— Channels ——— */

/* ——— Live ——— */

/* ——— Invites ——— */

/* ——— How it works ——— */

/** Step 1: a post in another app, with ADHX in the share row. */
export function StepShare({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Tile post="palettes" still className="h-[100px] w-20 shrink-0 rounded-[16px]">
        <span className="absolute inset-0 bg-black/40" />
        <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[13px] bg-nx-ink shadow-[0_0_0_2px_rgb(var(--nx-accent))]">
          <Gob size={26} />
        </span>
      </Tile>
    )
  }
  return (
    <Tile post="palettes" still credit="tr" className="h-[250px]">
      <span className="absolute inset-x-4 bottom-4 flex flex-col gap-3 rounded-[20px] border border-white/10 bg-nx-surface/90 px-4 pb-3 pt-3.5 backdrop-blur-lg">
        <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-nx-muted">
          Share
        </span>
        <span className="flex gap-[18px]">
          <span className="flex flex-col items-center gap-1.5">
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-nx-ink shadow-[0_0_0_2px_rgb(var(--nx-accent))]">
              <Gob size={30} />
            </span>
            <span className="text-[12px] font-extrabold">ADHX</span>
          </span>
          <span className="flex flex-col items-center gap-1.5 text-nx-soft">
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-[#262320]">
              <LinkIcon size={22} />
            </span>
            <span className="whitespace-nowrap text-[12px]">Copy link</span>
          </span>
          <span className="flex flex-col items-center gap-1.5">
            <span className="h-[52px] w-[52px] rounded-[16px] bg-[#262320]" />
            <span className="mt-1 h-2 w-10 rounded bg-[#262320]" />
          </span>
          <span className="hidden flex-col items-center gap-1.5 text-nx-soft xl:flex">
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-[#262320]">
              <Dots size={22} />
            </span>
            <span className="whitespace-nowrap text-[12px]">More</span>
          </span>
        </span>
      </span>
    </Tile>
  )
}

/** Step 2: the server keeping a copy, 40% done. */
export function StepKeep({ compact = false }: { compact?: boolean }) {
  return (
    <Tile
      post="modular"
      still
      credit={compact ? undefined : 'tr'}
      className={compact ? 'h-[100px] w-20 shrink-0 rounded-[16px]' : 'h-[250px]'}
    >
      <span className="absolute inset-0 bg-black/50" />
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <Ring
          size={compact ? 52 : 92}
          value={0.4}
          stroke={compact ? 5 : 7}
          fill="rgba(0,0,0,0.55)"
          label="40%"
          labelSize={compact ? 13 : 22}
        />
        {!compact && (
          <span className="flex h-[34px] items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-black/55 px-3.5 text-[13px] font-extrabold backdrop-blur-md">
            <span>Keeping a copy</span>
            <span className="font-semibold text-nx-soft">· 2160p · X</span>
          </span>
        )}
      </span>
    </Tile>
  )
}

/** Step 3: the feed, with your people's faces on it. */
export function StepFeed({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Tile post="offbeat-room" still className="h-[100px] w-20 shrink-0 rounded-[16px]">
        <span className="nx-scrim absolute inset-x-0 bottom-0 h-11" />
        <Face who="ben" size={22} ring="#000" className="absolute bottom-2 left-2" />
      </Tile>
    )
  }
  return (
    <Tile post="offbeat-room" still className="h-[250px]">
      <span className="absolute left-3.5 top-3.5 flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-black/50 pl-2 pr-3.5 backdrop-blur-md">
        <Faces who={['ana', 'ben', 'mum', 'jo', 'you']} size={22} ring="#111" />
        <span className="text-[13px] font-extrabold">Your people</span>
      </span>
      <span className="nx-scrim absolute inset-x-0 bottom-0 flex flex-col gap-1 px-4 pb-3.5 pt-14">
        <span className="flex items-center gap-2">
          <Face who="ben" size={24} ring="#000" />
          <span className="whitespace-nowrap text-[14px] font-extrabold">Ben saved this</span>
          <span className="whitespace-nowrap text-[13px] text-nx-soft">· 20m</span>
        </span>
        <Credit id="offbeat-room" className="text-[13px] text-nx-soft" />
      </span>
    </Tile>
  )
}
