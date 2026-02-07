import { describe, it, expect } from 'vitest'
import { articleBlocksToMarkdown } from '@/lib/utils/article-text'

describe('articleBlocksToMarkdown', () => {
  it('converts header-one to # heading', () => {
    const blocks = [
      { key: '1', text: 'Main Title', type: 'header-one' },
    ]
    expect(articleBlocksToMarkdown(blocks)).toBe('# Main Title')
  })

  it('converts header-two to ## heading', () => {
    const blocks = [
      { key: '1', text: 'Sub Title', type: 'header-two' },
    ]
    expect(articleBlocksToMarkdown(blocks)).toBe('## Sub Title')
  })

  it('converts header-three to ### heading', () => {
    const blocks = [
      { key: '1', text: 'Section', type: 'header-three' },
    ]
    expect(articleBlocksToMarkdown(blocks)).toBe('### Section')
  })

  it('converts blockquote to > prefix', () => {
    const blocks = [
      { key: '1', text: 'A wise person once said this.', type: 'blockquote' },
    ]
    expect(articleBlocksToMarkdown(blocks)).toBe('> A wise person once said this.')
  })

  it('converts unordered-list-item to - prefix', () => {
    const blocks = [
      { key: '1', text: 'First item', type: 'unordered-list-item' },
      { key: '2', text: 'Second item', type: 'unordered-list-item' },
    ]
    expect(articleBlocksToMarkdown(blocks)).toBe('- First item\n\n- Second item')
  })

  it('converts ordered-list-item to 1. prefix', () => {
    const blocks = [
      { key: '1', text: 'Step one', type: 'ordered-list-item' },
      { key: '2', text: 'Step two', type: 'ordered-list-item' },
    ]
    expect(articleBlocksToMarkdown(blocks)).toBe('1. Step one\n\n1. Step two')
  })

  it('converts unstyled text as plain paragraphs', () => {
    const blocks = [
      { key: '1', text: 'Hello world.', type: 'unstyled' },
      { key: '2', text: 'Another paragraph.', type: 'unstyled' },
    ]
    expect(articleBlocksToMarkdown(blocks)).toBe('Hello world.\n\nAnother paragraph.')
  })

  it('handles empty blocks as paragraph breaks', () => {
    const blocks = [
      { key: '1', text: 'Before', type: 'unstyled' },
      { key: '2', text: '', type: 'unstyled' },
      { key: '3', text: 'After', type: 'unstyled' },
    ]
    // Multiple consecutive empty lines collapse to one
    expect(articleBlocksToMarkdown(blocks)).toBe('Before\n\nAfter')
  })

  it('resolves atomic IMAGE blocks to markdown images', () => {
    const blocks = [
      {
        key: '1',
        text: ' ',
        type: 'atomic',
        entityRanges: [{ key: 0, length: 1, offset: 0 }],
      },
    ]
    const entityMap = {
      0: {
        type: 'IMAGE',
        data: { src: 'https://example.com/photo.jpg', alt: 'A photo' },
      },
    }
    expect(articleBlocksToMarkdown(blocks, entityMap)).toBe('![A photo](https://example.com/photo.jpg)')
  })

  it('resolves atomic MEDIA blocks via mediaEntities', () => {
    const blocks = [
      {
        key: '1',
        text: ' ',
        type: 'atomic',
        entityRanges: [{ key: 0, length: 1, offset: 0 }],
      },
    ]
    const entityMap = {
      0: {
        type: 'MEDIA',
        data: { mediaItems: [{ mediaId: 'media_123' }], caption: 'My caption' },
      },
    }
    const mediaEntities = {
      media_123: { url: 'https://pbs.twimg.com/media/abc.jpg', width: 800, height: 600 },
    }
    expect(articleBlocksToMarkdown(blocks, entityMap, mediaEntities)).toBe(
      '![My caption](https://pbs.twimg.com/media/abc.jpg)'
    )
  })

  it('skips unresolvable atomic blocks', () => {
    const blocks = [
      {
        key: '1',
        text: ' ',
        type: 'atomic',
        entityRanges: [{ key: 0, length: 1, offset: 0 }],
      },
    ]
    // No entityMap provided
    expect(articleBlocksToMarkdown(blocks)).toBe('')
  })

  it('applies bold inline styles as **text**', () => {
    const blocks = [
      {
        key: '1',
        text: 'Hello bold world',
        type: 'unstyled',
        inlineStyleRanges: [{ offset: 6, length: 4, style: 'BOLD' }],
      },
    ]
    expect(articleBlocksToMarkdown(blocks)).toBe('Hello **bold** world')
  })

  it('applies italic inline styles as *text*', () => {
    const blocks = [
      {
        key: '1',
        text: 'Hello italic world',
        type: 'unstyled',
        inlineStyleRanges: [{ offset: 6, length: 6, style: 'ITALIC' }],
      },
    ]
    expect(articleBlocksToMarkdown(blocks)).toBe('Hello *italic* world')
  })

  it('applies bold+italic as ***text***', () => {
    const blocks = [
      {
        key: '1',
        text: 'Hello emphasis world',
        type: 'unstyled',
        inlineStyleRanges: [
          { offset: 6, length: 8, style: 'BOLD' },
          { offset: 6, length: 8, style: 'ITALIC' },
        ],
      },
    ]
    expect(articleBlocksToMarkdown(blocks)).toBe('Hello ***emphasis*** world')
  })

  it('converts LINK entities to markdown links', () => {
    const blocks = [
      {
        key: '1',
        text: 'Visit our website for more.',
        type: 'unstyled',
        entityRanges: [{ key: 0, length: 11, offset: 10 }],
      },
    ]
    const entityMap = {
      0: {
        type: 'LINK',
        data: { url: 'https://example.com' },
      },
    }
    expect(articleBlocksToMarkdown(blocks, entityMap)).toBe(
      'Visit our [website for](https://example.com) more.'
    )
  })

  it('handles a complete article with mixed blocks', () => {
    const blocks = [
      { key: '1', text: 'Introduction', type: 'header-one' },
      { key: '2', text: 'This article explores key ideas.', type: 'unstyled' },
      { key: '3', text: '', type: 'unstyled' },
      { key: '4', text: 'Key Points', type: 'header-two' },
      { key: '5', text: 'First point', type: 'unordered-list-item' },
      { key: '6', text: 'Second point', type: 'unordered-list-item' },
      { key: '7', text: 'In conclusion, this is important.', type: 'blockquote' },
    ]
    const result = articleBlocksToMarkdown(blocks)
    expect(result).toContain('# Introduction')
    expect(result).toContain('This article explores key ideas.')
    expect(result).toContain('## Key Points')
    expect(result).toContain('- First point')
    expect(result).toContain('- Second point')
    expect(result).toContain('> In conclusion, this is important.')
  })

  it('handles null/undefined entityMap and mediaEntities', () => {
    const blocks = [
      { key: '1', text: 'Plain text.', type: 'unstyled' },
    ]
    expect(articleBlocksToMarkdown(blocks, null, null)).toBe('Plain text.')
    expect(articleBlocksToMarkdown(blocks, undefined, undefined)).toBe('Plain text.')
  })
})
