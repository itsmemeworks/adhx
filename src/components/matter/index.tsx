import { cn } from '@/lib/utils'

/**
 * Shared Matter design-system primitives — the warm, editorial direction.
 * Tokens live in globals.css (--m-*) / tailwind.config.ts (paper/surface/ink/clay…).
 */

export type ContentType = 'video' | 'photo' | 'text' | 'article'
export type PlatformId = 'twitter' | 'instagram' | 'tiktok' | 'youtube'

/** content-type label + dot color (the dot is the only color in the label). */
export const TYPE_META: Record<ContentType, { label: string; dot: string }> = {
  video: { label: 'Video', dot: 'bg-type-video' },
  photo: { label: 'Photo', dot: 'bg-type-photo' },
  text: { label: 'Text', dot: 'bg-type-text' },
  article: { label: 'Article', dot: 'bg-type-article' },
}

/** GOB + ADHX lockup. Header placements stay at least 32px tall; compact
 * placements can lower `minHeight`. `auto` follows the page theme, while
 * fixed theater/panel surfaces opt into the matching supplied asset. Hovering
 * the lockup swaps only GOB for the matching animated loader while preserving
 * the supplied ADHX wordmark. */
export function MatterLogo({
  size = 22,
  minHeight = 32,
  surface = 'auto',
  className,
}: {
  size?: number
  minHeight?: number
  surface?: 'auto' | 'dark' | 'paper'
  className?: string
}) {
  const height = Math.max(minHeight, size * 1.7)
  const renderVariant = (variant: 'dark' | 'paper', wrapperClassName?: string) => {
    const asset = variant === 'dark' ? '/logo-dark.png' : '/logo-paper.png'
    const loader = variant === 'dark' ? '/gob-loader.svg' : '/gob-loader-paper.svg'
    const aspectRatio = variant === 'dark' ? 700 / 280 : 476 / 176
    const imageStyle = { height }

    return (
      <span
        className={cn('relative inline-block flex-none', wrapperClassName)}
        style={{ width: height * aspectRatio, height }}
      >
        <img
          src={asset}
          alt="ADHX"
          style={imageStyle}
          className="absolute inset-0 block w-auto transition-opacity duration-100 group-hover/logo:opacity-0"
        />
        <img
          src={asset}
          alt=""
          aria-hidden
          style={{ ...imageStyle, clipPath: 'inset(0 0 0 40%)' }}
          className="pointer-events-none absolute inset-0 block w-auto opacity-0 transition-opacity duration-100 group-hover/logo:opacity-100"
        />
        <img
          src={loader}
          alt=""
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 h-full w-[40%] -translate-y-1/2 object-contain opacity-0 transition-opacity duration-100 group-hover/logo:opacity-100"
        />
      </span>
    )
  }

  return (
    <span className={cn('group/logo inline-flex items-center', className)} style={{ minHeight }}>
      {surface === 'auto' ? (
        <>
          {renderVariant('paper', 'dark:hidden')}
          {renderVariant('dark', 'hidden dark:inline-block')}
        </>
      ) : (
        renderVariant(surface)
      )}
    </span>
  )
}

/** Inline platform glyph. `twitter` renders the X mark. */
export function PlatformGlyph({
  platform,
  size = 14,
  className,
}: {
  platform?: PlatformId | string | null
  size?: number
  className?: string
}) {
  const p = platform === 'twitter' ? 'x' : platform
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    className,
    'aria-hidden': true,
  } as const
  if (p === 'x')
    return (
      <svg {...common} fill="currentColor">
        <path d="M18.9 2H22l-7.3 8.3L23 22h-6.6l-5.2-6.8L5.3 22H2.2l7.8-8.9L1.5 2h6.8l4.7 6.2L18.9 2zm-1.2 18h1.8L7.4 3.8H5.5L17.7 20z" />
      </svg>
    )
  if (p === 'tiktok')
    return (
      <svg {...common} fill="currentColor">
        <path d="M16.6 5.8a4.3 4.3 0 01-1-2.8h-3v12.1a2.5 2.5 0 11-2.5-2.5c.26 0 .5.04.74.1V9.6a5.6 5.6 0 00-.74-.05A5.55 5.55 0 1014.6 15V9a7.3 7.3 0 004.3 1.4V7.4a4.3 4.3 0 01-2.3-1.6z" />
      </svg>
    )
  if (p === 'instagram')
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    )
  if (p === 'youtube')
    return (
      <svg {...common} fill="currentColor">
        <path d="M23 12s0-3.2-.41-4.73a2.49 2.49 0 00-1.75-1.76C19.07 5 12 5 12 5s-7.07 0-8.84.51a2.49 2.49 0 00-1.75 1.76C1 8.8 1 12 1 12s0 3.2.41 4.73a2.49 2.49 0 001.75 1.76C4.93 19 12 19 12 19s7.07 0 8.84-.51a2.49 2.49 0 001.75-1.76C23 15.2 23 12 23 12zM9.75 15.3V8.7L16 12l-6.25 3.3z" />
      </svg>
    )
  return null
}

/** Circular translucent platform chip for media tiles (always on dark media). */
export function PlatformChip({
  platform,
  className,
}: {
  platform?: PlatformId | string | null
  className?: string
}) {
  if (!platform) return null
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/50 backdrop-blur-md text-white',
        className,
      )}
    >
      <PlatformGlyph platform={platform} size={13} />
    </span>
  )
}

/**
 * Unified content-type label — dark translucent chip, white uppercase text,
 * 5px type-color dot. Same treatment everywhere (media, cards, discovery).
 */
export function TypeBadge({ type, className }: { type: ContentType | string; className?: string }) {
  const meta = TYPE_META[type as ContentType]
  if (!meta) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md bg-black/50 backdrop-blur-sm px-2 py-1',
        'text-[10.5px] font-bold uppercase tracking-[0.09em] text-white',
        className,
      )}
    >
      <span className={cn('w-[5px] h-[5px] rounded-full flex-none', meta.dot)} />
      <span>{meta.label}</span>
    </span>
  )
}

/** Pulsing green "live" dot used on Discover / front-page live panels. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('w-2 h-2 rounded-full bg-live animate-live-pulse flex-none', className)} />
  )
}

/**
 * "Connect with [X]" label — the X logo stands in for the word "X" (no separate
 * leading glyph). Use as the contents of the connect buttons.
 */
export function ConnectWithX({ size = 15 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>Connect with</span>
      <PlatformGlyph platform="twitter" size={size} />
    </span>
  )
}
