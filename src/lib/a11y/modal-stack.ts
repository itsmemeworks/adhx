interface ElementState {
  inert: boolean
  inertAttribute: string | null
  ariaHidden: string | null
}

interface ModalEntry {
  id: symbol
  root: HTMLElement
  invokingElement: HTMLElement | null
  focusDefault: () => void
  onEscape: () => void
}

export interface ModalStackRegistration {
  isTopmost: () => boolean
  unregister: (options?: { restoreFocus?: boolean }) => void
}

const stack: ModalEntry[] = []
const originalElementStates = new Map<HTMLElement, ElementState>()
const isolatedElements = new Set<HTMLElement>()
let escapeListenerInstalled = false

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  const topmost = stack.at(-1)
  if (!topmost) return
  event.preventDefault()
  event.stopImmediatePropagation()
  topmost.onEscape()
}

function syncEscapeListener(): void {
  if (stack.length > 0 && !escapeListenerInstalled) {
    window.addEventListener('keydown', handleEscape, true)
    escapeListenerInstalled = true
  } else if (stack.length === 0 && escapeListenerInstalled) {
    window.removeEventListener('keydown', handleEscape, true)
    escapeListenerInstalled = false
  }
}

function restoreElement(element: HTMLElement, state: ElementState): void {
  if (state.inertAttribute === null) element.removeAttribute('inert')
  else element.setAttribute('inert', state.inertAttribute)
  element.inert = state.inert

  if (state.ariaHidden === null) element.removeAttribute('aria-hidden')
  else element.setAttribute('aria-hidden', state.ariaHidden)
}

function restoreCurrentIsolation(): void {
  for (const element of isolatedElements) {
    const state = originalElementStates.get(element)
    if (state) restoreElement(element, state)
  }
  isolatedElements.clear()
}

function isolateElement(element: HTMLElement): void {
  if (!originalElementStates.has(element)) {
    originalElementStates.set(element, {
      inert: element.inert,
      inertAttribute: element.getAttribute('inert'),
      ariaHidden: element.getAttribute('aria-hidden'),
    })
  }
  element.inert = true
  element.setAttribute('inert', '')
  element.setAttribute('aria-hidden', 'true')
  isolatedElements.add(element)
}

/**
 * Rebuild isolation from the current topmost modal. Restoring the previous
 * pass first is essential when a newly opened modal lived inside a branch
 * that the lower modal had made inert.
 */
function recomputeIsolation(): void {
  restoreCurrentIsolation()
  const topmost = stack.at(-1)
  if (!topmost) {
    originalElementStates.clear()
    return
  }

  let branch = topmost.root
  while (branch.parentElement) {
    const parent = branch.parentElement
    for (const sibling of Array.from(parent.children)) {
      if (sibling === branch || !(sibling instanceof HTMLElement)) continue
      isolateElement(sibling)
    }
    if (parent === document.body) break
    branch = parent
  }
}

function focusAfterTopmostClose(entry: ModalEntry): void {
  const nextTopmost = stack.at(-1)
  const invokingElement = entry.invokingElement
  if (
    invokingElement?.isConnected &&
    (!nextTopmost || nextTopmost.root.contains(invokingElement))
  ) {
    invokingElement.focus({ preventScroll: true })
    return
  }
  nextTopmost?.focusDefault()
}

export function registerModal({
  root,
  invokingElement,
  focusDefault,
  onEscape,
}: {
  root: HTMLElement
  invokingElement: HTMLElement | null
  focusDefault: () => void
  onEscape: () => void
}): ModalStackRegistration {
  const entry: ModalEntry = {
    id: Symbol('modal'),
    root,
    invokingElement,
    focusDefault,
    onEscape,
  }
  let registered = true
  stack.push(entry)
  syncEscapeListener()
  recomputeIsolation()

  return {
    isTopmost: () => registered && stack.at(-1)?.id === entry.id,
    unregister: ({ restoreFocus = true } = {}) => {
      if (!registered) return
      registered = false
      const index = stack.findIndex((candidate) => candidate.id === entry.id)
      if (index < 0) return
      const wasTopmost = index === stack.length - 1
      for (const higherEntry of stack.slice(index + 1)) {
        if (higherEntry.invokingElement && entry.root.contains(higherEntry.invokingElement)) {
          higherEntry.invokingElement = entry.invokingElement
        }
      }
      stack.splice(index, 1)
      syncEscapeListener()
      recomputeIsolation()
      if (wasTopmost && restoreFocus) focusAfterTopmostClose(entry)
    },
  }
}
