/**
 * Decode common HTML entities in a single regex pass.
 *
 * A single pass (rather than chained `.replace()` calls, one entity at a
 * time) avoids double-unescaping. Chaining decodes greedily: if `&amp;` is
 * decoded before `&lt;`, a literal `&amp;lt;` in the source (an escaped,
 * literal "&lt;") gets turned into `&lt;` by the first replace and then into
 * `<` by the second — silently corrupting text that was never supposed to
 * become a tag. A single regex pass matches entities in the *original*
 * string only, so a `&amp;lt;` decodes to the text `&lt;`, exactly once,
 * with no second pass to over-decode it.
 */
const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  '#x27': "'",
  '#x2f': '/',
  '#x22': '"',
  '#34': '"',
  nbsp: ' ',
}

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(amp|lt|gt|quot|apos|#39|#x27|#x2f|#x22|#34|nbsp);/gi, (match, entity) => {
    return HTML_ENTITIES[entity.toLowerCase()] ?? match
  })
}
