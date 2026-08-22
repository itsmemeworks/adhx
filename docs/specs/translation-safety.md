# Translation safety

**Browser page-translation is a supported feature of ADHX, not a hazard to switch off.** A Spanish tweet
read in English is exactly the kind of thing a bookmark theater should let you do, so `<html>` carries no
`translate="no"` and there is no `notranslate` meta. The cost is a real constraint on how we render text,
written down here because breaking it produces a hard crash, not a cosmetic bug.

## What a translator does to the DOM

Chrome (and Safari) translate a page by **replacing text nodes with their own `<font>` element wrappers**:

```text
rendered:     <p>hola <a>link</a> mundo</p>
translated:   <p><font>HELLO </font><a><font>LINK</font></a><font>WORLD</font></p>
```

Two properties matter:

1. **Text nodes are replaced.** Any text node React is holding a reference to may be detached at any moment.
2. **Elements are not moved.** An element React rendered stays a child of the same parent.

## The rule

> **Never render a bare text child as the SIBLING of an element.** Wrap each text run in an element
> (`<span>`), or let the text be the element's only child.

Why those two shapes are safe:

| Shape                         | React's update path                                            | Survives translation?                |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------ |
| `<p>{text}</p>` (text only)   | `setTextContent` on the `<p>`                                  | yes — clobbers the `<font>` wrappers |
| `<p><span>{a}</span><a/></p>` | removes/inserts the `<span>` / `<a>`                           | yes — both still children of `<p>`   |
| `<p>{a}<a/></p>` (mixed)      | `removeChild(p, textNode)` / `insertBefore(p, node, textNode)` | **no — `NotFoundError`**             |

The failure is not subtle: React throws
`NotFoundError: Failed to execute 'removeChild' on 'Node'` (or `insertBefore`), the error boundary in
`src/app/error.tsx` takes over, and the user sees "Something slipped". It fires on the next render that
touches those children — in the theater, that means **advancing to the next post**, which is how the bug
was first reported (a non-English collection at `/t/hghguy/bravas`).

### The grey area: several text children, no elements

`<span>#{tag}</span>` or `<span> · {count} posts · </span>` render as two or more sibling text nodes, and a
translator collapses them into one `<font>`. That is survivable but not free:

- **Updating** one of them is a `nodeValue` write on a node that is no longer in the tree — the change is
  silently lost (stale text) rather than throwing. Cosmetic, and the translated text was overwriting it
  anyway.
- **Removing or inserting** one throws, exactly as above. So the shape is only safe while the NUMBER of
  children is fixed — a conditional text child among text siblings (`{a}{cond ? ' · x' : ''}{b}`) changes
  the count and can crash.

Fixed-arity cases are left alone deliberately (wrapping every interpolation would be noise). If you add a
**conditional** text child next to other text children, wrap the runs.

## Where this bites in practice

Icon-plus-label buttons and metadata rows are the usual offenders — `<button><Download />Download</button>`
puts a bare label next to an `<svg>`. Post text is the other: `TheaterLinkedText`
(`src/components/theater/TheaterText.tsx`) splits a caption into text runs, `<a>` anchors and `<br>`
elements, so every run is wrapped in a `<span>` there deliberately. **Do not "simplify" those wrappers
away.**

## Verifying a change

The audit that finds offenders in a live page — run it in the console on any route:

```js
document.querySelectorAll('body *').forEach((el) => {
  if (el.closest('svg')) return
  const kids = [...el.childNodes]
  const bare = kids.filter((n) => n.nodeType === 3 && n.textContent.trim())
  const els = kids.filter((n) => n.nodeType === 1)
  if (bare.length && els.length)
    console.log('MIXED', el) // must be zero
  else if (bare.length > 1) console.log('multi-text', el) // fine while fixed-arity
})
```

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
is the fastest way to find a new offender. Note this simulation is _harsher_ than a real translator (it
rewrites every text node on the page, including ones Chrome would leave alone), so treat it as a strict
upper bound.
