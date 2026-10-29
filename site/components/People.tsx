import type { CSSProperties } from 'react'
import { cn } from './cn'

/**
 * The fictional friends on one ADHX server, as they appear in the mockups.
 * Faces are Gob shaped, like the app's: a rounded square (38% corners)
 * tilted −4°, showing each person's picture: original drawings in the spirit
 * of internet animals (public/avatars, also each person's picture in the
 * demo, see e2e/parity/seed.ts).
 */
export const PEOPLE = {
  ana: { name: 'Ana', initial: 'A', color: '#ff8fa3', avatar: 'ana' },
  ben: { name: 'Ben', initial: 'B', color: '#7fd1ae', avatar: 'ben' },
  mum: { name: 'Mum', initial: 'M', color: '#ffb35c', avatar: 'mum' },
  jo: { name: 'Jo', initial: 'J', color: '#c4a7ff', avatar: 'jo' },
  you: { name: 'You', initial: 'P', color: '#6b8cff', avatar: 'pete' },
} as const

export type PersonId = keyof typeof PEOPLE

/** A length: pixels, or any CSS length (the phone mockups pass scaled units). */
type Size = number | string

const len = (s: Size) => (typeof s === 'number' ? `${s}px` : s)
const part = (s: Size, f: number) => (typeof s === 'number' ? `${s * f}px` : `calc(${s} * ${f})`)

export function Face({
  who,
  size = 28,
  ring,
  ringWidth = 2,
  className,
  style,
}: {
  who: PersonId
  size?: Size
  /** The colour of the gap ring, matching what's behind (for stacks). */
  ring?: string
  ringWidth?: number
  className?: string
  style?: CSSProperties
}) {
  const p = PEOPLE[who]
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-extrabold leading-none text-black',
        className,
      )}
      style={{
        width: len(size),
        height: len(size),
        borderRadius: '38%',
        transform: 'rotate(-4deg)',
        background: p.color,
        fontSize: part(size, 0.44),
        boxShadow: ring ? `0 0 0 ${ringWidth}px ${ring}` : undefined,
        ...style,
      }}
    >
      <img
        src={`/avatars/${p.avatar}.svg`}
        alt=""
        decoding="async"
        className="absolute inset-0 h-full w-full"
      />
    </span>
  )
}

/** Overlapping faces, first on top of the pile's left. */
export function Faces({
  who,
  size = 28,
  ring = '#000',
  overlap = 0.3,
}: {
  who: PersonId[]
  size?: Size
  ring?: string
  overlap?: number
}) {
  return (
    <span aria-hidden className="flex shrink-0">
      {who.map((w, i) => (
        <Face
          key={w}
          who={w}
          size={size}
          ring={ring}
          style={i ? { marginLeft: part(size, -overlap) } : undefined}
        />
      ))}
    </span>
  )
}
