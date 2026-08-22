// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { TheaterLinkedText } from '@/components/theater/TheaterText'

/**
 * Regression cover for the mobile auto-translate crash.
 *
 * Mobile Chrome/Safari offered to translate a non-English collection theater
 * (e.g. /t/hghguy/bravas). Page translation rewrites the text nodes React owns
 * into its own `<font>` wrappers; the next update that removed one of those
 * nodes — advancing to the next post — threw NotFoundError ("Failed to execute
 * 'removeChild' on 'Node'") and took the theater down.
 *
 * Two defenses are asserted here:
 *   1. every text run is inside an element, never a bare text node sibling of
 *      an `<a>` / `<br>` (so a translator only ever mutates an element's own
 *      children, never React's sibling bookkeeping), and
 *   2. after simulating a translation pass, re-rendering with the next post's
 *      text still works instead of throwing.
 *
 * `translate="no"` in the root layout stops the *built-in* translators; this
 * component-level hardening is what covers translation extensions, which
 * ignore the attribute.
 */

/**
 * What Chrome's translator does to the DOM: each text node is swapped for a
 * `<font>` element carrying the translated string.
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

const MIXED = 'linea uno https://example.com/a\nlinea dos @alguien'

afterEach(cleanup)

it('never emits a bare text node alongside link/br siblings', () => {
  const { container } = render(<TheaterLinkedText text={MIXED} platform="twitter" />)
  const wrapper = container.firstElementChild as HTMLElement

  const bareText = Array.from(wrapper.childNodes).filter(
    (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
  )
  expect(bareText).toEqual([])
  expect(wrapper.querySelector('a')).not.toBeNull()
  expect(wrapper.querySelector('br')).not.toBeNull()
  expect(wrapper.textContent).toContain('linea uno')
  expect(wrapper.textContent).toContain('linea dos')
})

describe('after a translation pass rewrites the text nodes', () => {
  it('advancing to the next post re-renders instead of throwing', () => {
    const { container, rerender } = render(<TheaterLinkedText text={MIXED} platform="twitter" />)
    simulateTranslate(container)
    expect(container.textContent).toContain('LINEA UNO')

    // The advance: same component position, next post's text.
    expect(() =>
      rerender(<TheaterLinkedText text="siguiente publicacion" platform="twitter" />),
    ).not.toThrow()
    expect(container.textContent).toContain('siguiente publicacion')
  })
})
