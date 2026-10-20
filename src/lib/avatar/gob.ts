/**
 * "Make me a Gob": the ADHX mark as a face in your colour, for people who'd
 * rather not use a photo. One SVG, used for the dialog's preview and rendered
 * to the stored JPEG on the server, so both look the same. Follows the mark's
 * rules (brand/BRAND.md): body tilted −4°, eyes that don't match (7 and 11),
 * the big eye keeps its highlight, mouth tilted −7°, nothing added.
 */

export const GOB_COLOURS = {
  blue: { label: 'Blue', hex: '#6b8cff' },
  teal: { label: 'Teal', hex: '#5fd0c8' },
  coral: { label: 'Coral', hex: '#ff7a59' },
  lime: { label: 'Lime', hex: '#b6e35a' },
} as const

export type GobColour = keyof typeof GOB_COLOURS

export function isGobColour(value: unknown): value is GobColour {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(GOB_COLOURS, value)
}

const INK = '#141414'
const BACKGROUND = '#1a1814'

/** A square SVG document (96 viewBox) of a Gob in this colour on the warm dark. */
export function gobSvg(colour: GobColour, size = 512): string {
  const fill = GOB_COLOURS[colour].hex
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96"><rect width="96" height="96" fill="${BACKGROUND}"/><g transform="rotate(-4 48 50)"><rect x="12" y="16" width="72" height="68" rx="27" fill="${fill}"/><circle cx="37" cy="46" r="7" fill="${INK}"/><circle cx="62" cy="43" r="11" fill="${INK}"/><circle cx="65" cy="40" r="3.5" fill="${fill}"/><path d="M38 66 q10 5 20 -2" transform="rotate(-7 48 65)" stroke="${INK}" stroke-width="4.4" fill="none" stroke-linecap="round"/></g></svg>`
}

export function gobDataUri(colour: GobColour): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(gobSvg(colour, 96))}`
}
