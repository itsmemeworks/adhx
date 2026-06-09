/**
 * Knowledge Graph — icon paths + renderers.
 *
 * Single source of 24×24 stroke-path icons used both as in-SVG hub glyphs
 * (`NodeGlyph`, drawn inside the graph's `<svg>`) and as standalone DOM icons
 * (`GraphIcon`, for the theme picker, relation chips, filter rows, toolbar).
 * Paths are lifted from the design prototype's `P` map so the theme glyphs
 * match pixel-for-pixel. The 16 theme keys are `THEME_ICON_KEYS` in `types.ts`.
 */
import type { CSSProperties } from 'react'

export const ICON_PATHS: Record<string, string> = {
  // 16 curated theme icons
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z',
  zap: 'M13 2L4.5 13H11l-1 9 8.5-11H12l1-9z',
  flame: 'M12 3c1 4-3 5-3 9a3 3 0 006 0c0-1.5-1-2.5-1-4 2 1 3 3 3 5a6 6 0 11-12 0c0-4 4-6 7-10z',
  heart: 'M12 20s-7-4.5-9.5-9A4.5 4.5 0 0112 5a4.5 4.5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  bookmark: 'M6 4h12v17l-6-4-6 4z',
  image: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6M8.5 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  quote: 'M7 7H4v6h3l-1 4 3-4V7zm9 0h-3v6h3l-1 4 3-4V7z',
  fileText: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6M9 9h2',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  moon: 'M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z',
  tag: 'M3 7v5l8 8 6-6-8-8H4zM7.5 7.5h.01',
  search: 'M21 21l-4.3-4.3M11 19a8 8 0 100-16 8 8 0 000 16z',
  play: 'M7 4l13 8-13 8z',
  link: 'M9 15l6-6M10 6l1-1a4 4 0 016 6l-1 1M14 18l-1 1a4 4 0 01-6-6l1-1',
  // chrome icons used by the panel / filters / toolbar
  x: 'M18 6L6 18M6 6l12 12',
  check: 'M5 12l4.5 5L19 7',
  chevRight: 'M9 18l6-6-6-6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  eyeOff: 'M9.9 4.2A9 9 0 0121 12a9 9 0 01-1.6 2.6M6.6 6.6A9 9 0 003 12a9 9 0 0012 6.5M3 3l18 18',
  ext: 'M14 4h6v6M20 4l-9 9M19 14v5H5V5h5',
  refresh: 'M21 12a9 9 0 11-2.6-6.4M21 4v4h-4',
  shrink: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
}

/** Resolve an icon key (or a raw path string) to its path data. */
export function iconPath(key: string): string {
  return ICON_PATHS[key] || key
}

interface NodeGlyphProps {
  /** Icon key or raw path. */
  d: string
  cx: number
  cy: number
  size: number
  color: string
  sw?: number
}

/**
 * Draw an icon centered at (cx,cy), scaled to `size`, INSIDE a parent `<svg>`.
 * Used for the white glyph on a theme hub node.
 */
export function NodeGlyph({ d, cx, cy, size, color, sw = 2 }: NodeGlyphProps) {
  const path = iconPath(d)
  if (!path) return null
  const s = size / 24
  return (
    <g
      transform={`translate(${cx - size / 2},${cy - size / 2}) scale(${s})`}
      style={{ pointerEvents: 'none' }}
    >
      {path
        .split('M')
        .filter(Boolean)
        .map((seg, i) => (
          <path
            key={i}
            d={'M' + seg}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
    </g>
  )
}

interface GraphIconProps {
  d: string
  size?: number
  color?: string
  sw?: number
  fill?: string
  className?: string
  style?: CSSProperties
}

/** Standalone DOM icon (own `<svg>`), for pickers/chips/toolbar. */
export function GraphIcon({
  d,
  size = 18,
  color = 'currentColor',
  sw = 2,
  fill = 'none',
  className,
  style,
}: GraphIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {iconPath(d)
        .split('M')
        .filter(Boolean)
        .map((seg, i) => (
          <path key={i} d={'M' + seg} />
        ))}
    </svg>
  )
}
