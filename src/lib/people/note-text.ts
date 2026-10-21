/**
 * A note on a save ("this is so you, Ben", "making this Sunday"): a few words
 * for your people, shown next to your face to members only
 * (docs/specs/friends-feed.md). No imports, so the Save sheet's counter and
 * the server agree on what counts as a character.
 */

/** Longest note, in characters people see (an emoji counts as one). */
export const NOTE_MAX = 140

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

/** The characters people see: grapheme clusters, so 👨‍👩‍👧 or 🇬🇧 is one. */
function graphemes(text: string): string[] {
  if (!segmenter) return Array.from(text)
  return Array.from(segmenter.segment(text), (s) => s.segment)
}

/** Length in characters people see (an emoji counts as one). */
export function noteLength(text: string): number {
  return graphemes(text).length
}

/**
 * A note as it will be shown: whitespace runs become one space, control and
 * direction-changing characters are dropped, ends trimmed, at most 140
 * characters. Empty → null. It is only ever rendered as text, never HTML.
 */
export function cleanNote(value: string): string | null {
  const clean = value
    // Control characters, and bidi marks/overrides/isolates that could flip what others read.
    .replace(/[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, (c) =>
      /\s/.test(c) ? ' ' : '',
    )
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return null
  const chars = graphemes(clean)
  return chars.length > NOTE_MAX ? chars.slice(0, NOTE_MAX).join('').trimEnd() : clean
}
