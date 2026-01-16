/**
 * Utility functions for feed components
 */
import React from 'react'
import { Download } from 'lucide-react'
import type { ArticleContentBlock, ArticleEntityMap, MediaEntitiesMap } from './types'


/**
 * Download media helper - fetches image as blob and triggers download
 * This is necessary because the download attribute doesn't work for cross-origin URLs
 */
export async function handleDownloadMedia(e: React.MouseEvent, url: string, filename: string): Promise<void> {
  e.stopPropagation()
  e.preventDefault()

  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Clean up the blob URL after a short delay
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
  } catch (error) {
    // Log error but don't open in new tab - download should just fail silently
    console.error('Download failed:', error)
  }
}

/**
 * Render media with share/download overlay buttons
 */
function MediaWithActions({
  src,
  alt,
  caption,
  blockKey,
  className = 'w-full rounded-lg max-h-[600px] object-contain bg-gray-100 dark:bg-gray-800',
}: {
  src: string
  alt?: string
  caption?: string
  blockKey: string
  className?: string
}): React.ReactElement {
  // Extract a filename from the URL or use the block key
  const getFilename = () => {
    try {
      const urlObj = new URL(src)
      const pathParts = urlObj.pathname.split('/')
      const lastPart = pathParts[pathParts.length - 1]
      if (lastPart && lastPart.includes('.')) {
        return lastPart
      }
    } catch {
      // Invalid URL, fallback to block key
    }
    return `image-${blockKey}.jpg`
  }

  return (
    <figure className="my-6">
      <div className="relative group">
        <img
          src={src}
          alt={alt || ''}
          className={className}
          loading="lazy"
        />
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => handleDownloadMedia(e, src, getFilename())}
            className="p-2 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
            title="Download image"
          >
            <Download className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
      {caption && (
        <figcaption className="text-center text-gray-500 dark:text-white/60 text-sm mt-2 italic">{caption}</figcaption>
      )}
    </figure>
  )
}

/**
 * Check if a string segment contains emoji or special Unicode characters
 */
function containsEmoji(str: string): boolean {
  // Match emoji and other special Unicode ranges
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{200D}]|[\u{FE0F}]/u
  return emojiRegex.test(str)
}

/**
 * Convert text to Bionic Reading format
 * Bolds the first portion of each word to guide the eye
 * Particularly helpful for ADHD readers
 */
export function toBionicText(text: string): React.ReactNode {
  if (!text) return null

  // Split into words while preserving whitespace and punctuation
  const tokens = text.split(/(\s+)/)

  return tokens.map((token, i) => {
    // Skip whitespace tokens
    if (/^\s+$/.test(token)) {
      return <span key={i}>{token}</span>
    }

    // If token contains emoji, don't apply bionic formatting (return as-is)
    if (containsEmoji(token)) {
      return <span key={i}>{token}</span>
    }

    // Use Array.from to properly handle Unicode characters (including emoji)
    const chars = Array.from(token)
    const wordLength = chars.length
    let boldLength: number

    if (wordLength <= 1) {
      boldLength = 1
    } else if (wordLength <= 3) {
      boldLength = 1
    } else if (wordLength <= 6) {
      boldLength = 2
    } else if (wordLength <= 9) {
      boldLength = 3
    } else {
      boldLength = Math.ceil(wordLength * 0.4)
    }

    const boldPart = chars.slice(0, boldLength).join('')
    const normalPart = chars.slice(boldLength).join('')

    return (
      <span key={i}>
        <strong className="font-semibold">{boldPart}</strong>
        {normalPart}
      </span>
    )
  })
}

/**
 * Render text with Bionic Reading and clickable links
 */
export function renderBionicTextWithLinks(text: string, className?: string): React.ReactNode {
  const decodedText = decodeHtmlEntities(text)
  const lines = decodedText.split('\n')
  const urlPattern = /(https?:\/\/[^\s]+)/g

  return (
    <span className={className}>
      {lines.map((line, lineIndex) => {
        const parts = line.split(urlPattern)
        return (
          <React.Fragment key={lineIndex}>
            {lineIndex > 0 && <br />}
            {parts.map((part, i) => {
              if (urlPattern.test(part)) {
                urlPattern.lastIndex = 0
                const displayUrl = part.length > 40 ? part.slice(0, 40) + '...' : part
                return (
                  <a
                    key={i}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-400 hover:text-blue-300 hover:underline break-all"
                  >
                    {displayUrl}
                  </a>
                )
              }
              // Apply bionic formatting to non-URL text
              return <span key={i}>{toBionicText(part)}</span>
            })}
          </React.Fragment>
        )
      })}
    </span>
  )
}

/**
 * Strip media URLs from tweet text (t.co links to Twitter media)
 */
export function stripMediaUrls(text: string, hasMedia: boolean): string {
  if (!hasMedia) return text
  return text.replace(/\s*https:\/\/t\.co\/\w+$/g, '').trim()
}

/**
 * Decode HTML entities in text (named and numeric/hex)
 */
export function decodeHtmlEntities(text: string): string {
  const namedEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  }

  // First handle named entities
  let result = text.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (match) => namedEntities[match] || match)

  // Handle decimal numeric entities (&#12345;)
  result = result.replace(/&#(\d+);/g, (_, dec) => {
    const codePoint = parseInt(dec, 10)
    return String.fromCodePoint(codePoint)
  })

  // Handle hexadecimal numeric entities (&#x1F600; or &#X1F600;)
  result = result.replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => {
    const codePoint = parseInt(hex, 16)
    return String.fromCodePoint(codePoint)
  })

  return result
}

/**
 * Render text with clickable links and line breaks
 */
export function renderTextWithLinks(text: string, className?: string): React.ReactNode {
  const decodedText = decodeHtmlEntities(text)
  const lines = decodedText.split('\n')
  const urlPattern = /(https?:\/\/[^\s]+)/g

  return (
    <span className={className}>
      {lines.map((line, lineIndex) => {
        const parts = line.split(urlPattern)
        return (
          <React.Fragment key={lineIndex}>
            {lineIndex > 0 && <br />}
            {parts.map((part, i) => {
              if (urlPattern.test(part)) {
                urlPattern.lastIndex = 0
                const displayUrl = part.length > 40 ? part.slice(0, 40) + '...' : part
                return (
                  <a
                    key={i}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-blue-400 hover:text-blue-300 hover:underline break-all"
                  >
                    {displayUrl}
                  </a>
                )
              }
              return <span key={i}>{part}</span>
            })}
          </React.Fragment>
        )
      })}
    </span>
  )
}

/**
 * Render article text with inline styles and entity links
 */
export function renderStyledText(
  text: string,
  inlineStyleRanges?: Array<{ length: number; offset: number; style: string }>,
  entityRanges?: Array<{ key: number; length: number; offset: number }>,
  entityMap?: ArticleEntityMap,
  bionicReading?: boolean
): React.ReactNode {
  if (!text) return null

  type Segment = { start: number; end: number; text: string; bold?: boolean; italic?: boolean; link?: string }
  const segments: Segment[] = []

  const charStyles: Array<{ bold?: boolean; italic?: boolean; link?: string }> = Array(text.length)
    .fill(null)
    .map(() => ({}))

  if (inlineStyleRanges) {
    for (const range of inlineStyleRanges) {
      for (let i = range.offset; i < range.offset + range.length && i < text.length; i++) {
        if (range.style === 'BOLD') charStyles[i].bold = true
        if (range.style === 'ITALIC') charStyles[i].italic = true
      }
    }
  }

  if (entityRanges && entityMap) {
    for (const range of entityRanges) {
      const entity = entityMap[range.key]
      if (entity?.type === 'LINK' && entity.data?.url) {
        for (let i = range.offset; i < range.offset + range.length && i < text.length; i++) {
          charStyles[i].link = entity.data.url
        }
      }
    }
  }

  let segmentStart = 0
  for (let i = 0; i <= text.length; i++) {
    const prevStyle = i > 0 ? charStyles[i - 1] : null
    const currStyle = i < text.length ? charStyles[i] : null

    const styleChanged =
      !prevStyle ||
      !currStyle ||
      prevStyle.bold !== currStyle.bold ||
      prevStyle.italic !== currStyle.italic ||
      prevStyle.link !== currStyle.link

    if (styleChanged && i > segmentStart) {
      segments.push({
        start: segmentStart,
        end: i,
        text: text.slice(segmentStart, i),
        ...charStyles[segmentStart],
      })
      segmentStart = i
    }
  }

  return segments.map((seg, i) => {
    // Apply bionic reading to unstyled text segments (not bold/italic)
    let content: React.ReactNode = bionicReading && !seg.bold && !seg.italic && !seg.link
      ? toBionicText(seg.text)
      : seg.text

    if (seg.bold && seg.italic) {
      content = (
        <strong key={`style-${i}`}>
          <em>{content}</em>
        </strong>
      )
    } else if (seg.bold) {
      content = <strong key={`style-${i}`}>{content}</strong>
    } else if (seg.italic) {
      content = <em key={`style-${i}`}>{content}</em>
    }

    if (seg.link) {
      return (
        <a
          key={i}
          href={seg.link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-blue-400 hover:text-blue-300 hover:underline"
        >
          {content}
        </a>
      )
    }

    return <span key={i}>{content}</span>
  })
}

/**
 * Render an article content block
 */
export function renderArticleBlock(
  block: ArticleContentBlock,
  entityMap: ArticleEntityMap | undefined,
  index: number,
  mediaEntities?: MediaEntitiesMap,
  bionicReading?: boolean
): React.ReactNode {
  // Choose the appropriate text renderer based on bionic reading preference
  const renderBlockText = (text: string, inlineStyleRanges?: Array<{ length: number; offset: number; style: string }>, entityRanges?: Array<{ key: number; length: number; offset: number }>) => {
    if (bionicReading) {
      // For bionic reading, we apply it to the plain text portions
      return renderStyledText(text, inlineStyleRanges, entityRanges, entityMap, true)
    }
    return renderStyledText(text, inlineStyleRanges, entityRanges, entityMap, false)
  }
  if (block.type === 'atomic' && block.entityRanges?.length) {
    const entityKey = block.entityRanges[0].key
    const entity = entityMap?.[entityKey]

    if (entity?.type === 'MEDIA' && entity.data?.mediaItems?.[0]?.mediaId) {
      const mediaId = entity.data.mediaItems[0].mediaId
      const mediaInfo = mediaEntities?.[mediaId]
      const caption = entity.data?.caption

      if (mediaInfo?.url) {
        return (
          <MediaWithActions
            key={block.key || index}
            src={mediaInfo.url}
            alt={caption}
            caption={caption}
            blockKey={String(block.key || index)}
          />
        )
      }

      return (
        <figure key={block.key || index} className="my-6">
          <div className="w-full aspect-video bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-xl flex flex-col items-center justify-center border border-gray-200 dark:border-gray-700/50 gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700/50 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <span className="text-gray-400 dark:text-gray-500 text-sm">Image unavailable</span>
          </div>
          {caption && <figcaption className="text-gray-500 dark:text-white/50 text-sm mt-3 text-center">{caption}</figcaption>}
        </figure>
      )
    }

    if (entity?.type === 'IMAGE' || entity?.data?.src) {
      const imgSrc = entity.data.src || entity.data.url
      if (imgSrc) {
        return (
          <MediaWithActions
            key={block.key || index}
            src={imgSrc}
            alt={entity.data.alt}
            blockKey={String(block.key || index)}
            className="w-full rounded-lg max-h-96 object-contain bg-gray-100 dark:bg-gray-800"
          />
        )
      }
    }

    return null
  }

  if (block.type === 'header-one') {
    return (
      <h3 key={block.key || index} className="text-gray-900 dark:text-white text-xl font-semibold mt-6 mb-2">
        {renderBlockText(block.text, block.inlineStyleRanges, block.entityRanges)}
      </h3>
    )
  }

  if (block.type === 'header-two') {
    return (
      <h4 key={block.key || index} className="text-gray-900 dark:text-white text-lg font-semibold mt-4 mb-2">
        {renderBlockText(block.text, block.inlineStyleRanges, block.entityRanges)}
      </h4>
    )
  }

  if (block.type === 'header-three') {
    return (
      <h5 key={block.key || index} className="text-gray-900 dark:text-white text-base font-semibold mt-3 mb-2">
        {renderBlockText(block.text, block.inlineStyleRanges, block.entityRanges)}
      </h5>
    )
  }

  if (block.type === 'blockquote') {
    return (
      <blockquote key={block.key || index} className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 my-4 text-gray-700 dark:text-white/80 italic">
        {renderBlockText(block.text, block.inlineStyleRanges, block.entityRanges)}
      </blockquote>
    )
  }

  if (block.type === 'unordered-list-item') {
    return (
      <li key={block.key || index} className="text-gray-800 dark:text-white/90 leading-relaxed ml-4 list-disc">
        {renderBlockText(block.text, block.inlineStyleRanges, block.entityRanges)}
      </li>
    )
  }

  if (block.type === 'ordered-list-item') {
    return (
      <li key={block.key || index} className="text-gray-800 dark:text-white/90 leading-relaxed ml-4 list-decimal">
        {renderBlockText(block.text, block.inlineStyleRanges, block.entityRanges)}
      </li>
    )
  }

  if (!block.text?.trim()) {
    // Empty blocks create paragraph breaks - use generous spacing
    return <div key={block.key || index} className="h-6" />
  }

  // Check if this text has newlines that should create visual breaks
  // If so, split into multiple paragraphs
  if (block.text.includes('\n\n')) {
    const paragraphs = block.text.split('\n\n')
    return (
      <div key={block.key || index} className="space-y-4">
        {paragraphs.map((para, i) => (
          para.trim() ? (
            <p key={i} className="text-gray-800 dark:text-white/90 leading-relaxed">
              {bionicReading ? toBionicText(para) : para}
            </p>
          ) : (
            <div key={i} className="h-2" />
          )
        ))}
      </div>
    )
  }

  // Single newlines become line breaks within a paragraph
  if (block.text.includes('\n')) {
    const lines = block.text.split('\n')
    return (
      <p key={block.key || index} className="text-gray-800 dark:text-white/90 leading-relaxed mb-4 last:mb-0">
        {lines.map((line, i) => (
          <React.Fragment key={i}>
            {i > 0 && <br />}
            {bionicReading ? toBionicText(line) : line}
          </React.Fragment>
        ))}
      </p>
    )
  }

  return (
    <p key={block.key || index} className="text-gray-800 dark:text-white/90 leading-relaxed mb-4 last:mb-0">
      {renderBlockText(block.text, block.inlineStyleRanges, block.entityRanges)}
    </p>
  )
}
