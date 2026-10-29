import type { CSSProperties, ReactNode } from 'react'

/** Small stroke icons for the mockups (decorative; 24 grid, round caps). */

type IconProps = { className?: string; style?: CSSProperties; size?: number | string }

function Stroke({
  d,
  className,
  style,
  size = 18,
  width = 2,
  children,
}: IconProps & { d?: string; width?: number; children?: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={typeof size === 'string' ? { width: size, height: size, ...style } : style}
    >
      {d && <path d={d} />}
      {children}
    </svg>
  )
}

export const Check = (p: IconProps) => <Stroke {...p} width={3} d="M5 12.5l4.5 4.5L19 7.5" />
export const Search = (p: IconProps) => (
  <Stroke {...p} width={2.4}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Stroke>
)
export const Together = (p: IconProps) => (
  <Stroke {...p} width={2.2}>
    <circle cx="9" cy="8" r="3" />
    <circle cx="16" cy="9" r="2.5" />
    <path d="M3 19c0-3 3-5 6-5s6 2 6 5M14 14.5c3 0 6 1.5 6 4.5" />
  </Stroke>
)
export const Heart = (p: IconProps) => (
  <Stroke {...p} width={2.2} d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z" />
)
export const Smile = (p: IconProps) => (
  <Stroke {...p} width={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2M9 9.5h.01M15 9.5h.01" />
  </Stroke>
)
export const List = (p: IconProps) => (
  <Stroke {...p} width={2.4} d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
)
export const Bookmark = (p: IconProps) => <Stroke {...p} width={2.2} d="M6 3h12v18l-6-4-6 4z" />
export const Lock = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Stroke>
)
export const LinkIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Stroke>
)
export const Upload = (p: IconProps) => (
  <Stroke {...p} width={2.4}>
    <path d="M12 15V3M7 8l5-5 5 5" />
    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </Stroke>
)
export const Download = (p: IconProps) => <Stroke {...p} d="M12 4v11M7 10l5 5 5-5M5 20h14" />
export const Video = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="3" y="6" width="13" height="12" rx="2" />
    <path d="M16 10l5-3v10l-5-3z" />
  </Stroke>
)
export const Wave = (p: IconProps) => (
  <Stroke {...p} width={2.4} d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
)
export const Screen = (p: IconProps) => (
  <Stroke {...p} width={2.2}>
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M7 9h10M9 13h6" />
  </Stroke>
)
export const Arrow = (p: IconProps) => <Stroke {...p} width={2.4} d="M5 12h14M13 6l6 6-6 6" />
export const Close = (p: IconProps) => <Stroke {...p} width={2.4} d="M6 6l12 12M18 6L6 18" />
export const Menu = (p: IconProps) => <Stroke {...p} d="M4 7h16M4 12h16M4 17h16" />
export const Send = (p: IconProps) => <Stroke {...p} width={2.2} d="M4 12l16-8-6 16-3-7z" />
export const Chat = (p: IconProps) => <Stroke {...p} d="M4 5h16v11H9l-5 4z" />

export const Sparkle = (p: IconProps) => (
  <Stroke
    {...p}
    width={2}
    d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"
  />
)
export const Chip = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
  </Stroke>
)
export const Users = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
  </Stroke>
)

/** A filled play triangle. */
export function Play({ className, style, size = 18 }: IconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="currentColor"
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      className={className}
      style={typeof size === 'string' ? { width: size, height: size, ...style } : style}
    >
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
    </svg>
  )
}

export function Dots({ className, style, size = 18 }: IconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="currentColor"
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      className={className}
      style={typeof size === 'string' ? { width: size, height: size, ...style } : style}
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}

/** GitHub's own mark, for links to the repository. */
export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.7 18 5 18 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  )
}
