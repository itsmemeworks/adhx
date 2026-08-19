import { describe, it, expect } from 'vitest'
import { parseArticleMarkdown, parseInline } from '@/lib/theater/article-markdown'

describe('parseInline', () => {
  it('returns a single text node for plain text', () => {
    expect(parseInline('hello world')).toEqual([{ type: 'text', text: 'hello world' }])
  })

  it('parses bold', () => {
    expect(parseInline('a **bold** word')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', children: [{ type: 'text', text: 'bold' }] },
      { type: 'text', text: ' word' },
    ])
  })

  it('parses italic', () => {
    expect(parseInline('a *italic* word')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'italic', children: [{ type: 'text', text: 'italic' }] },
      { type: 'text', text: ' word' },
    ])
  })

  it('parses bold+italic', () => {
    expect(parseInline('***both***')).toEqual([
      { type: 'boldItalic', children: [{ type: 'text', text: 'both' }] },
    ])
  })

  it('parses a plain link', () => {
    expect(parseInline('see [this](https://example.com/x)')).toEqual([
      { type: 'text', text: 'see ' },
      {
        type: 'link',
        href: 'https://example.com/x',
        children: [{ type: 'text', text: 'this' }],
      },
    ])
  })

  it('parses a link wrapping already-bold text (applyInlineFormatting order)', () => {
    expect(parseInline('[**bold link**](https://example.com)')).toEqual([
      {
        type: 'link',
        href: 'https://example.com',
        children: [{ type: 'bold', children: [{ type: 'text', text: 'bold link' }] }],
      },
    ])
  })

  it('keeps raw angle-bracket text inert (no HTML parsing)', () => {
    const input = 'before <script>alert(1)</script> after'
    expect(parseInline(input)).toEqual([{ type: 'text', text: input }])
  })

  it('returns an empty array for empty input', () => {
    expect(parseInline('')).toEqual([])
  })
})

describe('parseArticleMarkdown', () => {
  it('parses headings at all three levels', () => {
    const blocks = parseArticleMarkdown('# One\n\n## Two\n\n### Three')
    expect(blocks).toEqual([
      { type: 'heading', level: 1, inline: [{ type: 'text', text: 'One' }] },
      { type: 'heading', level: 2, inline: [{ type: 'text', text: 'Two' }] },
      { type: 'heading', level: 3, inline: [{ type: 'text', text: 'Three' }] },
    ])
  })

  it('parses a plain paragraph', () => {
    expect(parseArticleMarkdown('Just some text.')).toEqual([
      { type: 'paragraph', inline: [{ type: 'text', text: 'Just some text.' }] },
    ])
  })

  it('parses an image block', () => {
    expect(parseArticleMarkdown('![a caption](https://img.example.com/a.jpg)')).toEqual([
      { type: 'image', alt: 'a caption', src: 'https://img.example.com/a.jpg' },
    ])
  })

  it('parses an image block with empty alt text', () => {
    expect(parseArticleMarkdown('![](https://img.example.com/a.jpg)')).toEqual([
      { type: 'image', alt: '', src: 'https://img.example.com/a.jpg' },
    ])
  })

  it('parses a divider', () => {
    expect(parseArticleMarkdown('---')).toEqual([{ type: 'divider' }])
    expect(parseArticleMarkdown('-----')).toEqual([{ type: 'divider' }])
  })

  it('does not treat a short dash run as a divider', () => {
    expect(parseArticleMarkdown('--')).toEqual([
      { type: 'paragraph', inline: [{ type: 'text', text: '--' }] },
    ])
  })

  it('parses a blockquote', () => {
    expect(parseArticleMarkdown('> a quoted line')).toEqual([
      { type: 'quote', inline: [{ type: 'text', text: 'a quoted line' }] },
    ])
  })

  it('parses unordered and ordered list items', () => {
    expect(parseArticleMarkdown('- first\n\n- second')).toEqual([
      { type: 'list-item', ordered: false, inline: [{ type: 'text', text: 'first' }] },
      { type: 'list-item', ordered: false, inline: [{ type: 'text', text: 'second' }] },
    ])
    expect(parseArticleMarkdown('1. first\n\n2. second')).toEqual([
      { type: 'list-item', ordered: true, inline: [{ type: 'text', text: 'first' }] },
      { type: 'list-item', ordered: true, inline: [{ type: 'text', text: 'second' }] },
    ])
  })

  it('drops blank-line separators between blocks', () => {
    const blocks = parseArticleMarkdown('# Title\n\n\n\nBody text.')
    expect(blocks).toEqual([
      { type: 'heading', level: 1, inline: [{ type: 'text', text: 'Title' }] },
      { type: 'paragraph', inline: [{ type: 'text', text: 'Body text.' }] },
    ])
  })

  it('keeps a script-tag-looking paragraph as inert text, never parsed as HTML', () => {
    const blocks = parseArticleMarkdown('before <img src=x onerror=alert(1)> after')
    expect(blocks).toEqual([
      {
        type: 'paragraph',
        inline: [{ type: 'text', text: 'before <img src=x onerror=alert(1)> after' }],
      },
    ])
  })

  it('handles a realistic multi-block article body', () => {
    const md = [
      '# The Headline',
      '',
      'An intro paragraph with a [link](https://example.com) and **bold** text.',
      '',
      '## A Section',
      '',
      '![alt text](https://img.example.com/photo.jpg)',
      '',
      '---',
      '',
      '> A closing thought.',
    ].join('\n')

    const blocks = parseArticleMarkdown(md)
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'image',
      'divider',
      'quote',
    ])
  })

  it('returns an empty array for empty/undefined-like input', () => {
    expect(parseArticleMarkdown('')).toEqual([])
  })
})
