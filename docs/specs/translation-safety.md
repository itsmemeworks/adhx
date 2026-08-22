# Translation safety

**Browser page-translation is a supported feature of ADHX, not a hazard to switch off.** A Spanish tweet
read in English is exactly the kind of thing a bookmark theater should let you do, so `<html>` carries no
`translate="no"` and there is no `notranslate` meta. The cost is a real constraint on how we render text,
written down here because breaking it produces a hard crash, not a cosmetic bug.

## What a translator does to the DOM

Chrome (and Safari) translate a page by **replacing text nodes with their own `<font>` element wrappers**:

```html
<!-- rendered -->            <!-- after translation -->
<p>hola <a>link</a> mundo</p>  <p><font>HELLO </font><a><font>LINK</font></a><font>WORLD</font></p>
```

Two properties matter:

1. **Text nodes are replaced.** Any text node React is holding a reference to may be detached at any moment.
2. **Elements are not moved.** An element React rendered stays a child of the same parent.

## The rule

> **Never render a bare text child as the SIBLING of an element.** Wrap each text run in an element
> (`<span>`), or let the text be the element's only child.

Why those two shapes are safe:

| Shape                              | React's update path                         | Survives translation? |
| ---------------------------------- | ------------------------------------------- | --------------------- |
| `<p>{text}</p>` (text only)        | `setTextContent` on the `<p>`               | yes — clobbers the `<font>` wrappers |
| `<p><span>{a}</span><a/></p>`      | removes/inserts the `<span>` / `<a>`        | yes — both still children of `<p>` |
| `<p>{a}<a/></p>` (mixed)           | `removeChild(p, textNode)` / `insertBefore(p, node, textNode)` | **no — `NotFoundError`** |

The failure is not subtle: React throws
`NotFoundError: Failed to execute 'removeChild' on 'Node'` (or `insertBefore`), the error boundary in
`src/app/error.tsx` takes over, and the user sees "Something slipped". It fires on the next render that
touches those children — in the theater, that means **advancing to the next post**, which is how the bug
was first reported (a non-English collection at `/t/hghguy/bravas`).

## Where this bites in practice

Icon-plus-label buttons and metadata rows are the usual offenders — `<button><Download />Download</button>`
puts a bare label next to an `<svg>`. Post text is the other: `TheaterLinkedText`
(`src/components/theater/TheaterText.tsx`) splits a caption into text runs, `<a>` anchors and `<br>`
elements, so every run is wrapped in a `<span>` there deliberately. **Do not "simplify" those wrappers
away.**

## Verifying a change

jsdom is enough for the unit-level check, and there is a helper pattern in
`src/__tests__/components/TheaterLinkedText-translate.component.test.tsx`: swap every text node for a
`<font>` element, then re-render and assert nothing throws. In a real browser, run the same swap in the
console and click through a few posts:

```js
const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
const ns = []
while (w.nextNode()) ns.push(w.currentNode)
for (const t of ns) {
  if (!t.textContent?.trim()) continue
  const f = document.createElement('font')
  f.textContent = t.textContent.toUpperCase()
  t.parentNode?.replaceChild(f, t)
}
```

React names the guilty component in the console ("The above error occurred in the `<X>` component"), which
is the fastest way to find a new offender. Note this simulation is *harsher* than a real translator (it
rewrites every text node on the page, including ones Chrome would leave alone), so treat it as a strict
upper bound.
