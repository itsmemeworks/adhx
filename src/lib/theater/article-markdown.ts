/**
 * Pure markdown parser for the subset `articleBlocksToMarkdown`
 * (`src/lib/utils/article-text.ts`) emits: #/##/### headings, blockquotes,
 * list items, ![alt](src) images, `---` dividers, plain paragraphs, and
 * inline **bold** / *italic* / [text](url) links.
 *
 * No HTML parsing and no `dangerouslySetInnerHTML` anywhere downstream —
 * everything that isn't one of the constructs above (including something
 * that looks like a tag, e.g. `<script>`) is carried as an opaque text
 * string and rendered as a React text node by the stage, so it can never
 * execute. Deliberately dependency-free so it's unit-testable in plain node.
 */

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }
  | { type: 'boldItalic'; children: InlineNode[] }
  | { type: 'link'; href: string; children: InlineNode[] }

export type ArticleMdBlock =
  | { type: 'heading'; level: 1 | 2 | 3; inline: InlineNode[] }
  | { type: 'paragraph'; inline: InlineNode[] }
  | { type: 'quote'; inline: InlineNode[] }
  | { type: 'list-item'; ordered: boolean; inline: InlineNode[] }
  | { type: 'image'; alt: string; src: string }
  | { type: 'divider' }

// Link first (so `[**bold**](url)` resolves as a link whose text is then
// re-parsed for the bold), then bold+italic, bold, italic — all non-greedy
// so adjacent spans don't swallow each other.
const INLINE_RE =
  /\[([^\]]*)\]\(([^)\s]+)\)|\*\*\*([\s\S]+?)\*\*\*|\*\*([\s\S]+?)\*\*|\*([\s\S]+?)\*/

/** Parse inline spans (links / bold / italic / bold+italic) out of one line of text. */
export function parseInline(text: string): InlineNode[] {
  if (!text) return []
  const nodes: InlineNode[] = []
  let rest = text

  while (rest.length > 0) {
    const match = INLINE_RE.exec(rest)
    if (!match) {
      nodes.push({ type: 'text', text: rest })
      break
    }

    const index = match.index
    if (index > 0) nodes.push({ type: 'text', text: rest.slice(0, index) })

    const [full, linkText, linkHref, boldItalic, bold, italic] = match
    if (linkHref !== undefined) {
      nodes.push({ type: 'link', href: linkHref, children: parseInline(linkText) })
    } else if (boldItalic !== undefined) {
      nodes.push({ type: 'boldItalic', children: parseInline(boldItalic) })
    } else if (bold !== undefined) {
      nodes.push({ type: 'bold', children: parseInline(bold) })
    } else if (italic !== undefined) {
      nodes.push({ type: 'italic', children: parseInline(italic) })
    }
    rest = rest.slice(index + full.length)
  }

  return nodes
}

const HEADING_RE = /^(#{1,3})\s+(.*)$/
const DIVIDER_RE = /^-{3,}$/
const IMAGE_RE = /^!\[([^\]]*)\]\((\S+)\)$/
const QUOTE_RE = /^>\s?(.*)$/
const ORDERED_RE = /^\d+\.\s+(.*)$/
const UNORDERED_RE = /^-\s+(.*)$/

function parseLine(line: string): ArticleMdBlock {
  const heading = HEADING_RE.exec(line)
  if (heading) {
    return {
      type: 'heading',
      level: heading[1].length as 1 | 2 | 3,
      inline: parseInline(heading[2]),
    }
  }
  if (DIVIDER_RE.test(line)) return { type: 'divider' }

  const image = IMAGE_RE.exec(line)
  if (image) return { type: 'image', alt: image[1], src: image[2] }

  const quote = QUOTE_RE.exec(line)
  if (quote) return { type: 'quote', inline: parseInline(quote[1]) }

  const ordered = ORDERED_RE.exec(line)
  if (ordered) return { type: 'list-item', ordered: true, inline: parseInline(ordered[1]) }

  const unordered = UNORDERED_RE.exec(line)
  if (unordered) return { type: 'list-item', ordered: false, inline: parseInline(unordered[1]) }

  return { type: 'paragraph', inline: parseInline(line) }
}

/**
 * Parse a full markdown document (as returned by the public tweet JSON API's
 * `article.content` field) into a flat list of blocks. `articleBlocksToMarkdown`
 * puts every block on its own line separated by a blank line, so blank lines
 * are pure paragraph separators and are dropped here.
 */
export function parseArticleMarkdown(markdown: string): ArticleMdBlock[] {
  if (!markdown) return []
  return markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseLine)
}
