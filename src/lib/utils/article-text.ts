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
 * Normalize FxTwitter entityMap to a flat dictionary.
 *
 * FxTwitter returns entityMap in multiple formats:
 * 1. Array: [{key: "0", value: {type, data}}] → {"0": {type, data}}
 * 2. Dict with wrappers: {"0": {key: "0", value: {type, data}}} → {"0": {type, data}}
 * 3. Already normalized: {"0": {type, data}} → pass through
 *
 * Detection: an entry is a wrapper if it has a `value` property that is
 * an object containing `type` or `data`.
 */
export function normalizeEntityMap(
  entityMap: unknown
): Record<string, unknown> {
  if (!entityMap || typeof entityMap !== 'object') return {}

  // Format 1: Array [{key, value}]
  if (Array.isArray(entityMap)) {
    return entityMap.reduce(
      (acc: Record<string, unknown>, item: { key: string; value: unknown }) => {
        acc[item.key] = item.value
        return acc
      },
      {}
    )
  }

  // Check first entry to detect format 2 vs 3
  const entries = Object.entries(entityMap as Record<string, unknown>)
  if (entries.length === 0) return {}

  const [, firstValue] = entries[0]
  if (
    firstValue &&
    typeof firstValue === 'object' &&
    'value' in firstValue &&
    firstValue.value &&
    typeof firstValue.value === 'object' &&
    ('type' in firstValue.value || 'data' in firstValue.value)
  ) {
    // Format 2: Dict with {key, value} wrappers
    const result: Record<string, unknown> = {}
    for (const [k, v] of entries) {
      result[k] = (v as { value: unknown }).value
    }
    return result
  }

  // Format 3: Already normalized
  return entityMap as Record<string, unknown>
}

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
