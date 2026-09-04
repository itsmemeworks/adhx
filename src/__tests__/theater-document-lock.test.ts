/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { acquireTheaterDocumentLock } from '@/components/theater/theater-document-lock'

describe('Theater document lock', () => {
  it('restores prior styles only after the final overlapping shell releases', () => {
    const lockedDocument = document.implementation.createHTMLDocument()
    const html = lockedDocument.documentElement
    const body = lockedDocument.body
    html.style.overflow = 'scroll'
    body.style.overflow = 'auto'
    html.style.overscrollBehavior = 'contain'
    body.style.overscrollBehavior = 'auto'

    const releaseFirst = acquireTheaterDocumentLock(lockedDocument)
    const releaseSecond = acquireTheaterDocumentLock(lockedDocument)

    releaseFirst()
    expect(html.style.overflow).toBe('hidden')
    expect(body.style.overflow).toBe('hidden')
    expect(html.style.overscrollBehavior).toBe('none')
    expect(body.style.overscrollBehavior).toBe('none')

    releaseSecond()
    expect(html.style.overflow).toBe('scroll')
    expect(body.style.overflow).toBe('auto')
    expect(html.style.overscrollBehavior).toBe('contain')
    expect(body.style.overscrollBehavior).toBe('auto')
  })

  it('makes each release callback idempotent', () => {
    const lockedDocument = document.implementation.createHTMLDocument()
    const html = lockedDocument.documentElement
    const releaseFirst = acquireTheaterDocumentLock(lockedDocument)
    const releaseSecond = acquireTheaterDocumentLock(lockedDocument)

    releaseFirst()
    releaseFirst()
    expect(html.style.overflow).toBe('hidden')

    releaseSecond()
    expect(html.style.overflow).toBe('')
  })
})
