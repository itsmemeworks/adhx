import { cn } from './cn'

/**
 * Gob, the ADHX mark (brand/BRAND.md): a yellow body tilted −4°, eyes that
 * never match (7 and 11 on a 96 grid, the big one keeps its highlight) and a
 * mouth tilted −7°.
 *
 * A copy of the app's mark (src/components/next/Gob.tsx). Motion is CSS in
 * app/globals.css (`.gob`), off under prefers-reduced-motion:
 * - `idle`: blinks now and then, and glances aside.
 * - `busy` (loading): bobs and looks around, with a worried "o" mouth.
 * - `shut` (can't help): eyes closed.
 * Inside an element with `gob-host`, hovering or focusing it makes Gob look
 * around too.
 */
export type GobMood = 'idle' | 'busy' | 'shut'

const INK = '#141414'

export function Gob({
  size = 32,
  mood = 'idle',
  className,
}: {
  size?: number
  mood?: GobMood
  className?: string
}) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 96 96"
      data-mood={mood}
      className={cn('gob shrink-0', className)}
    >
      <g className="gob-body">
        <rect x="10" y="14" width="76" height="72" rx="28" fill="rgb(var(--nx-accent))" />
        {mood === 'shut' ? (
          <g>
            <rect x="28" y="45" width="16" height="5" rx="2.5" fill={INK} />
            <rect x="52" y="41" width="22" height="5" rx="2.5" fill={INK} />
          </g>
        ) : (
          <g className="gob-eyes">
            <circle className="gob-eye" cx="36" cy="46" r="7" fill={INK} />
            <g className="gob-eye">
              <circle cx="63" cy="42" r="11" fill={INK} />
              <circle cx="66" cy="39" r="3.5" fill="rgb(var(--nx-accent))" />
            </g>
          </g>
        )}
        {mood === 'busy' ? (
          <circle cx="49" cy="69" r="5" fill={INK} />
        ) : (
          <rect
            x="36"
            y="64"
            width="26"
            height="7"
            rx="3.5"
            fill={INK}
            transform="rotate(-7 49 67.5)"
          />
        )}
      </g>
    </svg>
  )
}
