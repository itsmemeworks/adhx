/**
 * Tag sanitization utility - used by both frontend and backend
 * Ensures consistent tag formatting across the application.
 */

const MAX_TAG_LENGTH = 15

/** A post can carry this many tags. The theater Tag button shows this count. */
export const MAX_TAGS_PER_POST = 5

/** Count to show on the Tag control — never more than `MAX_TAGS_PER_POST`. */
export function displayTagCount(
  countOrTags: number | readonly string[] | null | undefined,
): number {
  const n = typeof countOrTags === 'number' ? countOrTags : (countOrTags?.length ?? 0)
  return Math.min(Math.max(0, n), MAX_TAGS_PER_POST)
}

/** Accessible name for the theater Tag button. */
export function tagActionLabel(
  countOrTags: number | readonly string[] | null | undefined,
  opts?: { thisPost?: boolean },
): string {
  const n = displayTagCount(countOrTags)
  if (n <= 0) return opts?.thisPost ? 'Tag this post' : 'Tag'
  return `Tag ${n}`
}

/** Assigned tags first, original relative order otherwise (stable sort). */
export function sortTagsActiveFirst<T extends { tag: string }>(
  tags: readonly T[],
  active: ReadonlySet<string>,
): T[] {
  return [...tags].sort((a, b) => {
    const aOn = active.has(a.tag) ? 0 : 1
    const bOn = active.has(b.tag) ? 0 : 1
    return aOn - bOn
  })
}

/**
 * Sanitize a tag input to a valid slug format.
 * - Converts to lowercase
 * - Replaces invalid characters with hyphens
 * - Collapses multiple hyphens
 * - Removes leading/trailing hyphens
 * - Truncates to max length
 *
 * @example
 * sanitizeTag('AI@Claude#Test!') // 'ai-claude'
 * sanitizeTag('  Hello World  ') // 'hello-world'
 * sanitizeTag('---test---') // 'test'
 */
export function sanitizeTag(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-') // Replace invalid chars (incl. underscore) with hyphen
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .slice(0, MAX_TAG_LENGTH) // Truncate to max length
    .replace(/-$/, '') // Remove trailing hyphen after truncation
}

/**
 * Live keystroke-time variant of `sanitizeTag` for tag inputs: spaces (and
 * any other invalid character) kebab into hyphens AS THE USER TYPES, so the
 * field never shows anything the sanitizer would change on submit. Unlike
 * `sanitizeTag` it deliberately KEEPS a trailing hyphen — mid-word, the
 * hyphen the space just produced must stay visible or the keystroke looks
 * swallowed ("hello " → "hello-", then typing "w" → "hello-w"). Submit
 * paths still run `sanitizeTag`, which trims it.
 */
export function kebabTagInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .slice(0, MAX_TAG_LENGTH)
}

/**
 * Check if a tag is valid (non-empty after sanitization)
 */
export function isValidTag(input: string): boolean {
  return sanitizeTag(input).length > 0
}
