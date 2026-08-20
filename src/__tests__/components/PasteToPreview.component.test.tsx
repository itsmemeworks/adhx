/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { PasteToPreview, navigateToAppPath } from '@/components/PasteToPreview'

function dispatchPaste(text: string, target: EventTarget = window) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: () => text },
    configurable: true,
  })
  Object.defineProperty(event, 'target', { value: target, configurable: true })
  window.dispatchEvent(event)
}

describe('PasteToPreview', () => {
  let assignSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignSpy },
      writable: true,
    })
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders no UI', () => {
    const { container } = render(<PasteToPreview />)
    expect(container).toBeEmptyDOMElement()
  })

  it('navigates to the preview path when a supported URL is pasted', () => {
    render(<PasteToPreview />)
    dispatchPaste('https://x.com/naval/status/2064012969239859490')

    expect(assignSpy).toHaveBeenCalledWith(
      new URL('/naval/status/2064012969239859490', window.location.origin).toString(),
    )
  })

  it('ignores a paste whose target is an input', () => {
    render(<PasteToPreview />)
    const input = document.createElement('input')
    document.body.appendChild(input)

    dispatchPaste('https://x.com/naval/status/123', input)

    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('ignores a paste while an input/textarea/contenteditable is focused', () => {
    render(<PasteToPreview />)
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()

    // target defaults to window here — it's the focused-element check that
    // must catch this, not the target check.
    dispatchPaste('https://x.com/naval/status/123')

    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('ignores plain text with no supported link', () => {
    render(<PasteToPreview />)
    dispatchPaste('just some ordinary text')

    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('cleans up the paste listener on unmount', () => {
    const { unmount } = render(<PasteToPreview />)
    unmount()
    dispatchPaste('https://x.com/naval/status/123')

    expect(assignSpy).not.toHaveBeenCalled()
  })
})

describe('navigateToAppPath', () => {
  let assignSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignSpy },
      writable: true,
    })
  })

  it('only navigates to same-origin, root-relative app paths', () => {
    navigateToAppPath('//evil.com/x')
    navigateToAppPath('https://evil.com/x')
    navigateToAppPath('javascript:alert(1)')
    expect(assignSpy).not.toHaveBeenCalled()

    navigateToAppPath('/alice/status/123')
    expect(assignSpy).toHaveBeenCalledWith(
      new URL('/alice/status/123', window.location.origin).toString(),
    )
  })
})
