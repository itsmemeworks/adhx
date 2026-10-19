export const DISPLAY_NAME_MAX = 40

/**
 * A display name as people typed it, made safe to show: whitespace collapsed,
 * control and direction-changing characters dropped, ends trimmed, at most
 * 40 characters. Empty means "use my username".
 */
export function cleanDisplayName(raw: unknown): string | null | undefined {
  if (raw === null) return null
  if (typeof raw !== 'string') return undefined
  const clean = raw
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return clean ? Array.from(clean).slice(0, DISPLAY_NAME_MAX).join('') : null
}
