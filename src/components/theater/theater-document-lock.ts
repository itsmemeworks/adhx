interface DocumentLockState {
  count: number
  htmlOverflow: string
  bodyOverflow: string
  htmlOverscrollBehavior: string
  bodyOverscrollBehavior: string
}

const documentLocks = new WeakMap<Document, DocumentLockState>()

/**
 * Keep the browser document stationary behind a full-viewport Theater while
 * preserving the Theater's nested article, text, album, and Queue scrollers.
 * Reference counting makes overlapping route-transition shells safe.
 */
export function acquireTheaterDocumentLock(document: Document): () => void {
  const existing = documentLocks.get(document)
  const html = document.documentElement
  const body = document.body

  if (existing) {
    existing.count += 1
  } else {
    documentLocks.set(document, {
      count: 1,
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscrollBehavior: html.style.overscrollBehavior,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
    })
  }

  html.style.overflow = 'hidden'
  body.style.overflow = 'hidden'
  html.style.overscrollBehavior = 'none'
  body.style.overscrollBehavior = 'none'

  let released = false
  return () => {
    if (released) return
    released = true

    const state = documentLocks.get(document)
    if (!state) return
    state.count -= 1
    if (state.count > 0) return

    html.style.overflow = state.htmlOverflow
    body.style.overflow = state.bodyOverflow
    html.style.overscrollBehavior = state.htmlOverscrollBehavior
    body.style.overscrollBehavior = state.bodyOverscrollBehavior
    documentLocks.delete(document)
  }
}
