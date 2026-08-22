// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { toBionicText } from '@/components/feed/text-rendering'

/**
 * Regression cover for the translation-safety rule (docs/specs/translation-safety.md)
 * applied to Bionic Reading — the app-wide "bold the first part of each word" text
 * transform (`toBionicText`, `src/components/feed/text-rendering.tsx`), used across
 * feed captions, theater stage text, and article rendering whenever the user's
 * Bionic Reading preference is on.
 *
 * `toBionicText` originally rendered `<span><strong>{boldPart}</strong>{normalPart}</span>`
 * — a bare text node (`normalPart`) as the sibling of an element (`<strong>`). A
 * translator replaces text nodes with its own `<font>` wrappers but never moves
 * elements, so a later React update that touches those children (re-rendering with
 * different text) throws `NotFoundError: Failed to execute 'insertBefore'/'removeChild'
 * on 'Node'`. The fix wraps `normalPart` in its own `<span>` so both children are
 * always elements.
 *
 * Two defenses are asserted here, mirroring TheaterLinkedText-translate.component.test.tsx:
 *   1. no word span emits a bare text node alongside its `<strong>` sibling, and
 *   2. after simulating a translation pass, re-rendering with different text still
 *      works instead of throwing.
 */

function simulateTranslate(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)
  for (const node of textNodes) {
    if (!node.textContent?.trim()) continue
    const font = document.createElement('font')
    font.textContent = node.textContent.toUpperCase()
    node.parentNode?.replaceChild(font, node)
  }
}

function BionicProbe({ text }: { text: string }) {
  return <p>{toBionicText(text)}</p>
}

afterEach(cleanup)

it('never emits a bare text node alongside the bolded <strong> sibling', () => {
  const { container } = render(<BionicProbe text="hello wonderful world" />)
  const wordSpans = container.querySelectorAll('p > span')
  expect(wordSpans.length).toBeGreaterThan(0)

  for (const span of Array.from(wordSpans)) {
    const bareText = Array.from(span.childNodes).filter(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
    )
    expect(bareText).toEqual([])
  }
  expect(container.querySelector('strong')).not.toBeNull()
  expect(container.textContent).toBe('hello wonderful world')
})

describe('after a translation pass rewrites the text nodes', () => {
  it('re-rendering with different text works instead of throwing', () => {
    const { container, rerender } = render(<BionicProbe text="hello wonderful world" />)
    simulateTranslate(container)
    expect(container.textContent).toBe('HELLO WONDERFUL WORLD')

    expect(() => rerender(<BionicProbe text="a brand new sentence" />)).not.toThrow()
    expect(container.textContent).toBe('a brand new sentence')
  })
})
