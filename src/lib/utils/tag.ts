/**
 * Tag sanitization utility - used by both frontend and backend
 * Ensures consistent tag formatting across the application.
 */

const MAX_TAG_LENGTH = 10

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
 * sanitizeTag('  Hello World  ') // 'hello-worl'
 * sanitizeTag('---test---') // 'test'
 */
export function sanitizeTag(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '-') // Replace invalid chars with hyphen
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .slice(0, MAX_TAG_LENGTH) // Truncate to max length
    .replace(/-$/, '') // Remove trailing hyphen after truncation
}

/**
 * Check if a tag is valid (non-empty after sanitization)
 */
export function isValidTag(input: string): boolean {
  return sanitizeTag(input).length > 0
}
