/**
 * Convert X Article DraftJS block structure to markdown.
 *
 * FxTwitter returns article content as DraftJS blocks with entityMap and
 * media_entities. This utility converts them to readable markdown for
 * programmatic consumers (APIs, LLMs, RSS readers).
 */

interface ArticleBlock {
  key: string
  text: string
  type: string
  data?: Record<string, unknown>
  entityRanges?: Array<{ key: number; length: number; offset: number }>
  inlineStyleRanges?: Array<{ length: number; offset: number; style: string }>
}

interface EntityMapEntry {
  type: string
  data: {
    url?: string
    src?: string
    width?: number
    height?: number
    alt?: string
    caption?: string
    mediaItems?: Array<{ mediaId: string }>
  }
}

type EntityMap = Record<string | number, EntityMapEntry>
type MediaEntities = Record<string, { url: string; width?: number; height?: number }>

/**
 * Apply inline styles (bold, italic) and entity links to text.
 * Returns markdown-formatted text.
 */
function applyInlineFormatting(
  text: string,
  inlineStyleRanges?: ArticleBlock['inlineStyleRanges'],
  entityRanges?: ArticleBlock['entityRanges'],
  entityMap?: EntityMap
): string {
  if (!text) return ''

  // Build character-level annotations
  const chars: Array<{ bold?: boolean; italic?: boolean; linkUrl?: string }> =
    Array.from({ length: text.length }, () => ({}))

  if (inlineStyleRanges) {
    for (const range of inlineStyleRanges) {
      for (let i = range.offset; i < range.offset + range.length && i < text.length; i++) {
        if (range.style === 'BOLD') chars[i].bold = true
        if (range.style === 'ITALIC') chars[i].italic = true
      }
    }
  }

  if (entityRanges && entityMap) {
    for (const range of entityRanges) {
      const entity = entityMap[range.key]
      if (entity?.type === 'LINK' && entity.data?.url) {
        for (let i = range.offset; i < range.offset + range.length && i < text.length; i++) {
          chars[i].linkUrl = entity.data.url
        }
      }
    }
  }

  // Group consecutive characters with identical formatting into segments
  type Segment = { text: string; bold?: boolean; italic?: boolean; linkUrl?: string }
  const segments: Segment[] = []
  let currentSeg: Segment | null = null

  for (let i = 0; i < text.length; i++) {
    const c = chars[i]
    if (
      currentSeg &&
      currentSeg.bold === c.bold &&
      currentSeg.italic === c.italic &&
      currentSeg.linkUrl === c.linkUrl
    ) {
      currentSeg.text += text[i]
    } else {
      currentSeg = { text: text[i], bold: c.bold, italic: c.italic, linkUrl: c.linkUrl }
      segments.push(currentSeg)
    }
  }

  // Render segments to markdown
  return segments
    .map((seg) => {
      let result = seg.text
      if (seg.bold && seg.italic) {
        result = `***${result}***`
      } else if (seg.bold) {
        result = `**${result}**`
      } else if (seg.italic) {
        result = `*${result}*`
      }
      if (seg.linkUrl) {
        result = `[${result}](${seg.linkUrl})`
      }
      return result
    })
    .join('')
}

/**
 * Convert an array of DraftJS article blocks to markdown text.
 */
export function articleBlocksToMarkdown(
  blocks: ArticleBlock[],
  entityMap?: EntityMap | null,
  mediaEntities?: MediaEntities | null
): string {
  const lines: string[] = []
  const map = entityMap || {}

  for (const block of blocks) {
    const styledText = applyInlineFormatting(
      block.text,
      block.inlineStyleRanges,
      block.entityRanges,
      map
    )

    switch (block.type) {
      case 'header-one':
        lines.push(`# ${styledText}`)
        break

      case 'header-two':
        lines.push(`## ${styledText}`)
        break

      case 'header-three':
        lines.push(`### ${styledText}`)
        break

      case 'blockquote':
        lines.push(`> ${styledText}`)
        break

      case 'unordered-list-item':
        lines.push(`- ${styledText}`)
        break

      case 'ordered-list-item':
        lines.push(`1. ${styledText}`)
        break

      case 'atomic': {
        // Try to resolve image from entityMap + mediaEntities
        const entityKey = block.entityRanges?.[0]?.key
        if (entityKey !== undefined) {
          const entity = map[entityKey]

          // MEDIA type: look up actual URL from mediaEntities
          if (entity?.type === 'MEDIA' && entity.data?.mediaItems?.[0]?.mediaId && mediaEntities) {
            const mediaId = entity.data.mediaItems[0].mediaId
            const info = mediaEntities[mediaId]
            if (info?.url) {
              const alt = entity.data.caption || entity.data.alt || ''
              lines.push(`![${alt}](${info.url})`)
              break
            }
          }

          // IMAGE type: direct src/url
          if (entity?.type === 'IMAGE' || entity?.data?.src) {
            const src = entity.data.src || entity.data.url
            if (src) {
              const alt = entity.data.alt || ''
              lines.push(`![${alt}](${src})`)
              break
            }
          }
        }
        // Skip unresolvable atomic blocks
        break
      }

      default:
        // unstyled and other block types
        if (styledText.trim()) {
          lines.push(styledText)
        } else {
          // Empty block = paragraph break
          lines.push('')
        }
        break
    }
  }

  // Collapse multiple consecutive empty lines to one, trim edges
  return lines
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
