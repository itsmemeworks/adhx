/**
 * Reactions while tuned in to a moment: an emoji from a short list, or a few
 * words to everyone watching. Members only, broadcast to the members watching
 * that moment, never stored. No imports, so client components can use it.
 */

/** The emoji you can send, in picker order, with what a screen reader says. */
export const REACTION_EMOJI = [
  { emoji: '😂', label: 'Laughing' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '😭', label: 'Crying' },
  { emoji: '👀', label: 'Eyes' },
  { emoji: '💀', label: 'Skull' },
  { emoji: '❤️', label: 'Heart' },
] as const

export type ReactionEmoji = (typeof REACTION_EMOJI)[number]['emoji']

/** Longest message, in characters (after cleaning). */
export const MAX_REACTION_TEXT = 40

/** The allowlisted emoji `value` names, or null. A bare heart (no variation selector) counts. */
export function reactionEmoji(value: unknown): ReactionEmoji | null {
  if (typeof value !== 'string') return null
  const v = value === '❤' ? '❤️' : value
  return REACTION_EMOJI.find((r) => r.emoji === v)?.emoji ?? null
}

/**
 * A message as it will be shown: whitespace runs become one space, control and
 * direction-changing characters are dropped, ends trimmed. Empty → ''.
 * It is always rendered as text, never as HTML.
 */
export function cleanReactionText(value: string): string {
  return (
    value
      .replace(/\s+/g, ' ')
      // Control characters, and bidi overrides/isolates that could flip what others read.
      .replace(/[\p{Cc}‎‏‪-‮⁦-⁩]/gu, '')
      .replace(/ {2,}/g, ' ')
      .trim()
  )
}

/** Length in characters people see (code points), so an emoji counts once. */
export function reactionTextLength(text: string): number {
  return Array.from(text).length
}
